// Cost/efficiency trends, activity heatmap, person profile, sparklines.
// Routes are registered from index.ts before the /api 404 catch-all. Use the helpers in
// ./helpers.js (queryStrings/dateParam/sendError/analyticsScope/IDENTITY_CLAUSE…) so validation,
// scoping and error shapes match the rest of the API.
//
// Every route here is read-only and scoped exactly like /api/analytics ($1 identity, $2 from,
// $3 to, $4 project — see analyticsScope), plus an optional exact `author` ($5) where a page is
// keyed by the raw author string (UserPage's /api/projects scope).
import type express from 'express';
import type pg from 'pg';
import { pool } from './db.js';
import {
  BadRequest,
  queryStrings,
  dateParam,
  sendError,
  analyticsScope,
  NO_PROJECT,
  USER_MESSAGES_EXPR,
} from './helpers.js';

// --- small in-memory TTL cache ---------------------------------------------------------------
// Keyed by route + validated params. 60 s is short enough that a fresh sync shows up within a
// minute, long enough that a page's parallel panels and quick re-visits don't re-run the scans.
const TTL_MS = 60_000;
const MAX_ENTRIES = 300;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}

// --- queries without JIT ------------------------------------------------------------------------
// Every LATERAL jsonb_each() is estimated at 100 rows per session, so these plans cross
// jit_above_cost and Postgres spends ~1 s JIT-compiling a query that executes in ~20 ms (measured
// on the dev copy: 1.1 s -> 25 ms). SET LOCAL scopes the change to one transaction, so the pooled
// connection goes back unchanged.
async function q<R extends Record<string, any> = any>(sql: string, args: unknown[] = []): Promise<pg.QueryResult<R>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL jit = off');
    const r = await client.query<R>(sql, args);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- scope ------------------------------------------------------------------------------------
interface Scope {
  args: unknown[];
  where: string;
  qs: Record<string, string | undefined>;
  from?: string;
  to?: string;
}

/** analyticsScope + optional exact `author` ($5) + optional `resynced=true` (parser v7+ only —
 *  rows synced before plugin 0.7 carry ~5x inflated costs and double-counted split messages). */
function trendScope(req: express.Request): Scope {
  const qs = queryStrings(req.query);
  const { args, scopeWhere } = analyticsScope(req);
  if (qs.author !== undefined && (!qs.author || qs.author.length > 200)) throw new BadRequest('bad "author"');
  if (qs.resynced !== undefined && qs.resynced !== 'true' && qs.resynced !== 'false')
    throw new BadRequest('"resynced" must be true or false');
  args.push(qs.author ?? null);
  const where =
    `${scopeWhere} AND ($5::text IS NULL OR author = $5)` +
    (qs.resynced === 'true' ? ' AND parser_version >= 7' : '');
  return { args, where, qs, from: dateParam('from', qs.from), to: dateParam('to', qs.to) };
}

const keyOf = (route: string, qs: Record<string, string | undefined>, extra: string[] = []) =>
  JSON.stringify([route, ...['identity', 'from', 'to', 'project', 'author', 'resynced', ...extra].map((k) => qs[k] ?? null)]);

const num = (v: unknown) => Number(v ?? 0) || 0;

// --- time helpers (all UTC, text keys — never ::date through node-postgres, gotchas #2) --------
const DAY_MS = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
function weekKey(t: number) {
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return dayKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY_MS);
}
/** Dense list of period keys between two instants (inclusive). */
function periodKeys(fromMs: number, toMs: number, bucket: 'day' | 'week'): string[] {
  const out: string[] = [];
  const step = bucket === 'day' ? DAY_MS : 7 * DAY_MS;
  let t = Date.parse((bucket === 'day' ? dayKey(fromMs) : weekKey(fromMs)) + 'T00:00:00Z');
  for (; t <= toMs && out.length < 1000; t += step) out.push(dayKey(t));
  return out;
}

// --- timezones --------------------------------------------------------------------------------
// pg_timezone_names takes ~0.5 s to materialise on this box, so load it once per process.
let tzSet: Promise<Set<string>> | null = null;
function validTimezones() {
  tzSet ??= pool
    .query<{ name: string }>('SELECT name FROM pg_timezone_names')
    .then((r) => new Set(r.rows.map((x) => x.name)))
    .catch((e) => {
      tzSet = null;
      throw e;
    });
  return tzSet;
}
async function tzParam(v: string | undefined): Promise<string> {
  if (!v) return 'UTC';
  if (v.length > 64 || !(await validTimezones()).has(v)) throw new BadRequest('"tz" must be an IANA timezone name');
  return v;
}

// --- per-session prompt memo ------------------------------------------------------------------
// Prompt timestamps live only in the transcript, and de-TOASTing every transcript in a 90-day
// scope costs ~0.7 s on the prod-sized dev copy. Instead memoise each session's prompt instants
// (and interrupt count) keyed by (id, updated_at): after the first request only sessions that
// re-synced since are re-read, and the tz bucketing itself runs over an unnest()ed array.
//
// "Prompt" = a non-sidechain user turn that isn't an injected skill body, an interrupt marker or
// a compaction summary. Older rows (pre-v7) still carry "[Request interrupted…" as user turns,
// which is why interrupts are counted here too — stats.interrupts only exists from v7.
// Applied to the already-extracted non-sidechain user turns (USER_TURNS_PATH), so the transcript
// is de-TOASTed once per session rather than once per path expression (halved the cold fill).
const USER_TURNS_PATH = '$[*] ? (@.role == "user" && !(@.isSidechain == true))';
const PROMPT_PATH =
  '$[*] ? (!(@.text starts with "Base directory for this skill:")' +
  ' && !(@.text starts with "[Request interrupted")' +
  ' && !(@.text starts with "This session is being continued")).timestamp';
const INTERRUPT_PATH = '$[*] ? (@.text starts with "[Request interrupted")';

interface Memo {
  u: string;
  prompts: number[];
  interrupts: number;
}
const memo = new Map<string, Memo>();
const MEMO_MAX = 60_000;
let filling: Promise<void> = Promise.resolve();

/** Returns memo entries for every session in scope, reading transcripts only for misses. Fills
 *  are serialised so two panels loading at once don't both scan the same cold transcripts. */
async function promptsFor(scope: Scope): Promise<Memo[]> {
  const { rows } = await q<{ id: string; u: string }>(
    `SELECT id, updated_at::text AS u FROM sessions WHERE ${scope.where}`,
    scope.args,
  );
  const run = filling.then(async () => {
    const missing = rows.filter((r) => memo.get(r.id)?.u !== r.u).map((r) => r.id);
    if (!missing.length) return;
    if (memo.size + missing.length > MEMO_MAX) memo.clear();
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      const res = await q<{ id: string; u: string; prompts: (string | null)[] | null; interrupts: number }>(
        // OFFSET 0 keeps the subquery from being flattened, which would re-inline (and re-detoast)
        // `ut` once per outer expression.
        `SELECT id, u,
                ARRAY(SELECT jsonb_path_query(ut, '${PROMPT_PATH}') #>> '{}') AS prompts,
                jsonb_array_length(jsonb_path_query_array(ut, '${INTERRUPT_PATH}'))::int AS interrupts
           FROM (SELECT id, updated_at::text AS u,
                        jsonb_path_query_array(transcript, '${USER_TURNS_PATH}') AS ut
                   FROM sessions WHERE id = ANY($1::uuid[]) OFFSET 0) x`,
        [chunk],
      );
      for (const r of res.rows) {
        const prompts = (r.prompts ?? []).map((s) => (s ? Date.parse(s) : NaN)).filter((n) => Number.isFinite(n));
        memo.set(r.id, { u: r.u, prompts, interrupts: r.interrupts });
      }
    }
  });
  filling = run.catch(() => {});
  await run;
  return rows.map((r) => memo.get(r.id)).filter((m): m is Memo => !!m);
}

// --- routes -----------------------------------------------------------------------------------
export function registerTrends(app: express.Express) {
  // Warm the timezone list off the request path (one ~0.5 s catalog read per process).
  validTimezones().catch(() => {});

  /** Efficiency series: cost per human message, cache hit rate, tokens per message — overall and
   *  per model. Sessions are attributed to the period of their start (UTC). */
  app.get('/api/trends/efficiency', async (req, res) => {
    let scope: Scope, bucket: 'day' | 'week';
    try {
      scope = trendScope(req);
      const b = scope.qs.bucket ?? 'auto';
      if (!['auto', 'day', 'week'].includes(b)) throw new BadRequest('"bucket" must be auto, day or week');
      const span = scope.from ? Date.parse(scope.to ?? new Date().toISOString()) - Date.parse(scope.from) : Infinity;
      bucket = b === 'auto' ? (span <= 31 * DAY_MS ? 'day' : 'week') : (b as 'day' | 'week');
    } catch (err) {
      return sendError(res, 'trends efficiency', err);
    }
    const periodExpr =
      bucket === 'day'
        ? `to_char(coalesce(started_at, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
        : `to_char(date_trunc('week', coalesce(started_at, created_at) AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
    try {
      const out = await cached(keyOf('efficiency', scope.qs, ['bucket']) + bucket, async () => {
        const [periodsQ, modelsQ, byModelQ, coverageQ] = await Promise.all([
          q(
            `SELECT ${periodExpr} AS period,
                    count(*)::int AS sessions,
                    sum(${USER_MESSAGES_EXPR})::int AS messages,
                    round(sum((stats->>'estimatedCostUsd')::numeric), 4) AS cost,
                    sum((stats->>'totalTokens')::bigint)::bigint AS tokens,
                    sum(coalesce((stats->>'inputTokens')::bigint, 0))::bigint AS "inputTokens",
                    sum(coalesce((stats->>'cacheReadTokens')::bigint, 0))::bigint AS "cacheReadTokens",
                    sum(coalesce((stats->>'cacheCreationTokens')::bigint, 0))::bigint AS "cacheCreationTokens"
               FROM sessions WHERE ${scope.where}
              GROUP BY 1 ORDER BY 1`,
            scope.args,
          ),
          // Same row shape as /api/analytics `models`, so the client can run foldModels() on it.
          q(
            `WITH scope AS (SELECT stats FROM sessions WHERE ${scope.where})
             SELECT kv.key AS model, count(*)::int AS sessions,
                    sum((kv.value->>'turns')::int)::int AS turns,
                    sum((kv.value->>'activeMs')::bigint)::bigint AS "activeMs",
                    sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                    round(sum((kv.value->>'costUsd')::numeric), 4) AS cost,
                    bool_and((kv.value->>'measured')::boolean) AS measured
               FROM scope, LATERAL jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) kv
              GROUP BY 1 ORDER BY tokens DESC NULLS LAST`,
            scope.args,
          ),
          // Per (period, model). Human messages are session-level, so each model is allocated the
          // session's messages in proportion to its share of assistant turns. Token breakdowns
          // on modelUsage exist from parser v5; older rows report hasBreakdown = false.
          q(
            `WITH scope AS (SELECT ${periodExpr} AS period, stats, ${USER_MESSAGES_EXPR} AS msgs,
                                   (SELECT sum((v->>'turns')::numeric) FROM jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) AS e(k, v)) AS tturns
                              FROM sessions WHERE ${scope.where})
             SELECT period, kv.key AS model,
                    round(sum(CASE WHEN tturns > 0 THEN msgs * (kv.value->>'turns')::numeric / tturns ELSE 0 END), 3) AS messages,
                    round(sum((kv.value->>'costUsd')::numeric), 4) AS cost,
                    sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                    sum((kv.value->>'inputTokens')::bigint)::bigint AS "inputTokens",
                    sum((kv.value->>'cacheReadTokens')::bigint)::bigint AS "cacheReadTokens",
                    sum((kv.value->>'cacheCreationTokens')::bigint)::bigint AS "cacheCreationTokens"
               FROM scope, LATERAL jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) kv
              GROUP BY 1, 2 ORDER BY 1, 2`,
            scope.args,
          ),
          q(
            `SELECT count(*)::int AS sessions, count(*) FILTER (WHERE parser_version >= 7)::int AS resynced,
                    min(coalesce(started_at, created_at)) AS first
               FROM sessions WHERE ${scope.where}`,
            scope.args,
          ),
        ]);

        const cov = coverageQ.rows[0];
        const fromMs = scope.from ? Date.parse(scope.from) : cov.first ? new Date(cov.first).getTime() : Date.now();
        const toMs = scope.to ? Date.parse(scope.to) : Date.now();
        const keys = periodKeys(fromMs, toMs, bucket);
        const byPeriod = new Map(periodsQ.rows.map((r) => [r.period, r]));

        const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
        const derive = (r: { messages: number; cost: number; tokens: number; inputTokens: number; cacheReadTokens: number; cacheCreationTokens: number } | null) =>
          r
            ? {
                costPerMessage: ratio(r.cost, r.messages),
                tokensPerMessage: ratio(r.tokens, r.messages),
                cacheHitRate: ratio(r.cacheReadTokens, r.inputTokens + r.cacheReadTokens + r.cacheCreationTokens),
              }
            : { costPerMessage: null, tokensPerMessage: null, cacheHitRate: null };

        const points = keys.map((period) => {
          const r = byPeriod.get(period);
          const raw = r
            ? {
                sessions: r.sessions,
                messages: num(r.messages),
                cost: num(r.cost),
                tokens: num(r.tokens),
                inputTokens: num(r.inputTokens),
                cacheReadTokens: num(r.cacheReadTokens),
                cacheCreationTokens: num(r.cacheCreationTokens),
              }
            : null;
          return { period, ...(raw ?? { sessions: 0, messages: 0, cost: 0, tokens: 0, inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }), ...derive(raw) };
        });

        // byModel: model -> dense raw components per period (the client sums "Other" itself).
        const byModel: Record<string, Array<{ messages: number; cost: number; tokens: number; inputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null } | null>> = {};
        const idx = new Map(keys.map((k, i) => [k, i]));
        for (const r of byModelQ.rows) {
          const i = idx.get(r.period);
          if (i === undefined) continue;
          const arr = (byModel[r.model] ??= keys.map(() => null));
          const hasBreakdown = r.inputTokens !== null && r.cacheReadTokens !== null;
          arr[i] = {
            messages: num(r.messages),
            cost: num(r.cost),
            tokens: num(r.tokens),
            inputTokens: hasBreakdown ? num(r.inputTokens) : null,
            cacheReadTokens: hasBreakdown ? num(r.cacheReadTokens) : null,
            cacheCreationTokens: hasBreakdown ? num(r.cacheCreationTokens) : null,
          };
        }
        return {
          tz: 'UTC',
          bucket,
          attribution: 'session start',
          coverage: { sessions: cov.sessions, resynced: cov.resynced },
          points,
          models: modelsQ.rows,
          byModel,
        };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends efficiency', err);
    }
  });

  /** This period vs the previous period of equal length (for KPI delta badges). */
  app.get('/api/trends/compare', async (req, res) => {
    let scope: Scope, prevArgs: unknown[], prevFrom: string;
    try {
      scope = trendScope(req);
      if (!scope.from || !scope.to) throw new BadRequest('"from" and "to" are required');
      const f = Date.parse(scope.from);
      const t = Date.parse(scope.to);
      if (t <= f) throw new BadRequest('"to" must be after "from"');
      prevFrom = new Date(f - (t - f)).toISOString();
      prevArgs = [...scope.args];
      prevArgs[1] = prevFrom;
      prevArgs[2] = new Date(f).toISOString();
    } catch (err) {
      return sendError(res, 'trends compare', err);
    }
    const sql = `SELECT count(*)::int AS sessions,
                        count(DISTINCT author)::int AS people,
                        coalesce(sum((stats->>'turns')::int), 0)::int AS turns,
                        coalesce(sum(${USER_MESSAGES_EXPR}), 0)::int AS "userMessages",
                        coalesce(sum((stats->>'totalTokens')::bigint), 0)::bigint AS tokens,
                        coalesce(round(sum((stats->>'estimatedCostUsd')::numeric), 4), 0) AS cost
                   FROM sessions WHERE ${scope.where}`;
    try {
      const out = await cached(keyOf('compare', scope.qs), async () => {
        const [cur, prev] = await Promise.all([q(sql, scope.args), q(sql, prevArgs)]);
        const norm = (r: Record<string, unknown>) => ({
          sessions: num(r.sessions),
          people: num(r.people),
          turns: num(r.turns),
          userMessages: num(r.userMessages),
          tokens: num(r.tokens),
          cost: num(r.cost),
        });
        return {
          current: { from: scope.from, to: scope.to, ...norm(cur.rows[0]) },
          previous: { from: prevFrom, to: scope.from, ...norm(prev.rows[0]) },
        };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends compare', err);
    }
  });

  /** Hour-of-week prompt heatmap in the viewer's timezone + a UTC daily calendar. */
  app.get('/api/trends/activity', async (req, res) => {
    let scope: Scope, tz: string, weeks: number;
    try {
      scope = trendScope(req);
      tz = await tzParam(scope.qs.tz);
      weeks = scope.qs.weeks ? Number(scope.qs.weeks) : 26;
      if (!Number.isInteger(weeks) || weeks < 4 || weeks > 53) throw new BadRequest('"weeks" must be 4–53');
    } catch (err) {
      return sendError(res, 'trends activity', err);
    }
    try {
      const out = await cached(keyOf('activity', scope.qs, ['tz', 'weeks']), async () => {
        // Calendar: its own window (N weeks ending at `to`), independent of `from`, from the
        // parser's UTC `daily` buckets — the same numbers as every "Messages per day" chart.
        const calTo = scope.to ? Date.parse(scope.to) : Date.now();
        const calFrom = Date.parse(weekKey(calTo - (weeks - 1) * 7 * DAY_MS) + 'T00:00:00Z');
        const calArgs = [...scope.args];
        calArgs[1] = new Date(calFrom - 7 * DAY_MS).toISOString(); // sessions that started a bit earlier
        calArgs[2] = new Date(calTo).toISOString();
        const calFromKey = dayKey(calFrom);
        const calToKey = dayKey(calTo);
        const calendarP = q(
          `WITH scope AS (SELECT stats FROM sessions WHERE ${scope.where})
           SELECT kv.key AS day, count(*)::int AS sessions,
                  sum(coalesce((kv.value->>'userMessages')::int, 0))::int AS messages
             FROM scope, LATERAL jsonb_each(coalesce(stats->'daily','{}'::jsonb)) kv
            WHERE kv.key >= $6 AND kv.key <= $7
            GROUP BY 1 ORDER BY 1`,
          [...calArgs, calFromKey, calToKey],
        );

        const memos = await promptsFor(scope);
        const fromMs = scope.from ? Date.parse(scope.from) : -Infinity;
        const toMs = scope.to ? Date.parse(scope.to) : Infinity;
        const instants: number[] = [];
        for (const m of memos) for (const t of m.prompts) if (t >= fromMs && t < toMs) instants.push(t);
        // tz bucketing in SQL: AT TIME ZONE handles half-hour offsets (IST +5:30) and DST.
        const hoursQ = instants.length
          ? await q(
              `SELECT (extract(isodow FROM t AT TIME ZONE $2)::int - 1) AS d,
                      extract(hour FROM t AT TIME ZONE $2)::int AS h, count(*)::int AS n
                 FROM unnest($1::float8[]) ms, LATERAL to_timestamp(ms / 1000.0) t
                GROUP BY 1, 2`,
              [instants, tz],
            )
          : { rows: [] as Array<{ d: number; h: number; n: number }> };
        const hours = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
        for (const r of hoursQ.rows) hours[r.d][r.h] = r.n;

        const calendar = await calendarP;
        return {
          tz,
          weekStartsOn: 'monday',
          prompts: instants.length,
          sessions: memos.length,
          hours,
          calendar: {
            tz: 'UTC',
            from: calFromKey,
            to: calToKey,
            days: calendar.rows.map((r) => ({ day: r.day, messages: num(r.messages), sessions: num(r.sessions) })),
          },
        };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends activity', err);
    }
  });

  /** One person's working profile. `identity` or `author` required. */
  app.get('/api/trends/profile', async (req, res) => {
    let scope: Scope;
    try {
      scope = trendScope(req);
      if (!scope.qs.identity && !scope.qs.author) throw new BadRequest('"identity" or "author" is required');
    } catch (err) {
      return sendError(res, 'trends profile', err);
    }
    try {
      const out = await cached(keyOf('profile', scope.qs), async () => {
        const [baseQ, modelsQ, toolsQ, skillsQ, memos] = await Promise.all([
          q(
            `SELECT count(*)::int AS sessions,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY (stats->>'durationMs')::float8)
                      FILTER (WHERE (stats->>'durationMs')::float8 > 0) AS "medianDurationMs",
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY ${USER_MESSAGES_EXPR}) AS "medianPrompts",
                    count(*) FILTER (WHERE used_auto_mode OR (stats->>'usedAutoMode')::boolean)::int AS "autoSessions",
                    coalesce(sum((stats->>'compactions')::int), 0)::int AS compactions,
                    coalesce(sum((stats->>'rateLimitHits')::int), 0)::int AS "rateLimitHits",
                    count(*) FILTER (WHERE parser_version >= 7)::int AS "v7Sessions",
                    count(*) FILTER (WHERE stats ? 'reported')::int AS "reportedSessions",
                    coalesce(sum((stats->'reported'->>'linesAdded')::bigint), 0)::bigint AS "linesAdded",
                    coalesce(sum((stats->'reported'->>'linesRemoved')::bigint), 0)::bigint AS "linesRemoved"
               FROM sessions WHERE ${scope.where}`,
            scope.args,
          ),
          q(
            `WITH scope AS (SELECT stats FROM sessions WHERE ${scope.where})
             SELECT kv.key AS model, count(*)::int AS sessions,
                    sum((kv.value->>'turns')::int)::int AS turns,
                    sum((kv.value->>'activeMs')::bigint)::bigint AS "activeMs",
                    sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                    round(sum((kv.value->>'costUsd')::numeric), 4) AS cost,
                    bool_and((kv.value->>'measured')::boolean) AS measured
               FROM scope, LATERAL jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) kv
              GROUP BY 1 ORDER BY tokens DESC NULLS LAST`,
            scope.args,
          ),
          q(
            `SELECT key AS tool, sum(value::int)::int AS uses
               FROM sessions, LATERAL jsonb_each_text(coalesce(stats->'toolUsage','{}'::jsonb))
              WHERE ${scope.where}
              GROUP BY key ORDER BY uses DESC LIMIT 8`,
            scope.args,
          ),
          q(
            `SELECT sk AS skill, count(*)::int AS uses
               FROM sessions, LATERAL jsonb_array_elements_text(coalesce(stats->'skills','[]'::jsonb)) sk
              WHERE ${scope.where}
              GROUP BY sk ORDER BY uses DESC LIMIT 8`,
            scope.args,
          ),
          promptsFor(scope),
        ]);
        const b = baseQ.rows[0];
        const sessions = num(b.sessions);
        const interrupts = memos.reduce((n, m) => n + m.interrupts, 0);
        return {
          sessions,
          medianDurationMs: b.medianDurationMs == null ? null : Math.round(num(b.medianDurationMs)),
          medianPrompts: b.medianPrompts == null ? null : num(b.medianPrompts),
          autoSessions: num(b.autoSessions),
          autoShare: sessions ? num(b.autoSessions) / sessions : null,
          interrupts,
          interruptsPerSession: sessions ? interrupts / sessions : null,
          compactions: num(b.compactions),
          rateLimitHits: num(b.rateLimitHits),
          v7Sessions: num(b.v7Sessions),
          lines: {
            added: num(b.linesAdded),
            removed: num(b.linesRemoved),
            sessions: num(b.reportedSessions),
          },
          models: modelsQ.rows,
          tools: toolsQ.rows,
          skills: skillsQ.rows,
        };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends profile', err);
    }
  });

  /** Per-entity daily series in one request (no N+1): by=author (org People table) or
   *  by=project (one person's projects). UTC `daily` buckets; at most the last 90 days of range. */
  app.get('/api/trends/sparklines', async (req, res) => {
    let scope: Scope, by: 'author' | 'project', metric: 'messages' | 'sessions' | 'cost' | 'tokens';
    let keys: string[], limit: number;
    try {
      scope = trendScope(req);
      const b = scope.qs.by ?? 'author';
      if (b !== 'author' && b !== 'project') throw new BadRequest('"by" must be author or project');
      by = b;
      const m = scope.qs.metric ?? 'messages';
      if (!['messages', 'sessions', 'cost', 'tokens'].includes(m)) throw new BadRequest('"metric" must be messages, sessions, cost or tokens');
      metric = m as typeof metric;
      const toMs = scope.to ? Date.parse(scope.to) : Date.now();
      const fromMs = Math.max(scope.from ? Date.parse(scope.from) : toMs - 29 * DAY_MS, toMs - 89 * DAY_MS);
      keys = periodKeys(fromMs, toMs, 'day');
      limit = scope.qs.limit ? Number(scope.qs.limit) : 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new BadRequest('"limit" must be 1–500');
    } catch (err) {
      return sendError(res, 'trends sparklines', err);
    }
    const groupExpr = by === 'author' ? 'author' : `coalesce(project, '${NO_PROJECT}')`;
    const valueExpr =
      metric === 'messages'
        ? `sum(coalesce((kv.value->>'userMessages')::int, 0))`
        : metric === 'sessions'
          ? 'count(*)'
          : metric === 'cost'
            ? `round(sum((kv.value->>'costUsd')::numeric), 4)`
            : `sum((kv.value->>'totalTokens')::bigint)`;
    try {
      const out = await cached(keyOf('sparklines', scope.qs, ['by', 'metric', 'limit']), async () => {
        const { rows } = await q(
          `WITH scope AS (SELECT ${groupExpr} AS k, stats FROM sessions WHERE ${scope.where})
           SELECT k, kv.key AS day, ${valueExpr} AS v
             FROM scope, LATERAL jsonb_each(coalesce(stats->'daily','{}'::jsonb)) kv
            WHERE kv.key >= $6 AND kv.key <= $7
            GROUP BY 1, 2`,
          [...scope.args, keys[0], keys[keys.length - 1]],
        );
        const idx = new Map(keys.map((k, i) => [k, i]));
        const series = new Map<string, number[]>();
        for (const r of rows) {
          const i = idx.get(r.day);
          if (i === undefined) continue;
          const arr = series.get(r.k) ?? keys.map(() => 0);
          arr[i] = num(r.v);
          series.set(r.k, arr);
        }
        // Heaviest entities first; one prolific author can have hundreds of projects.
        const all = [...series]
          .map(([key, values]) => ({ key, values, total: values.reduce((a, b) => a + b, 0) }))
          .sort((a, b) => b.total - a.total);
        return { tz: 'UTC', by, metric, days: keys, truncated: all.length > limit, series: all.slice(0, limit) };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends sparklines', err);
    }
  });

  /** Files touched most, from stats.files (parser v9+). */
  app.get('/api/trends/files', async (req, res) => {
    let scope: Scope, limit: number;
    try {
      scope = trendScope(req);
      limit = Math.min(Math.max(Number(scope.qs.limit) || 15, 1), 100);
    } catch (err) {
      return sendError(res, 'trends files', err);
    }
    try {
      const out = await cached(keyOf('files', scope.qs, ['limit']), async () => {
        const [filesQ, covQ] = await Promise.all([
          q(
            `SELECT kv.key AS path, count(*)::int AS sessions,
                    coalesce(sum((kv.value->>'reads')::int), 0)::int AS reads,
                    coalesce(sum((kv.value->>'edits')::int), 0)::int AS edits,
                    coalesce(sum((kv.value->>'writes')::int), 0)::int AS writes
               FROM sessions, LATERAL jsonb_each(CASE WHEN jsonb_typeof(stats->'files') = 'object'
                                                      THEN stats->'files' ELSE '{}'::jsonb END) kv
              WHERE ${scope.where}
              GROUP BY 1
              ORDER BY (coalesce(sum((kv.value->>'edits')::int), 0) + coalesce(sum((kv.value->>'writes')::int), 0)) DESC,
                       reads DESC, path
              LIMIT ${limit}`,
            scope.args,
          ),
          q(
            `SELECT count(*)::int AS sessions, count(*) FILTER (WHERE stats ? 'files')::int AS covered
               FROM sessions WHERE ${scope.where}`,
            scope.args,
          ),
        ]);
        return { coverage: covQ.rows[0], files: filesQ.rows };
      });
      res.json(out);
    } catch (err) {
      sendError(res, 'trends files', err);
    }
  });
}
