import express, { type RequestHandler } from 'express';
import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, SCHEMA, MIGRATIONS } from './db.js';
import { redactDeep, redactText, type IngestPayload } from '@claudelens/shared';

const app = express();
app.disable('x-powered-by');
// Behind nginx: trust one hop so req.ip is the client, not 127.0.0.1.
app.set('trust proxy', 1);
// No CORS middleware: the dashboard is served from this same origin, and the CLI isn't a browser.

const INGEST_TOKEN = process.env.CLAUDELENS_TOKEN ?? '';

// Web build directory, served below. Read here too so the CSP can hash its inline theme script.
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

/** CSP hashes for index.html's inline <script>s (the pre-paint theme resolver). Hashing beats
 *  'unsafe-inline': an injected script in transcript-derived content still can't run. */
function inlineScriptHashes(): string[] {
  const html = join(WEB_DIST, 'index.html');
  if (!existsSync(html)) return [];
  const out: string[] = [];
  for (const m of readFileSync(html, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    out.push(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  return out;
}
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${inlineScriptHashes().join(' ')}`.trim(),
  // React `style={{…}}` props compile to inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // One access line per API call; static assets and health probes would drown it.
  if (req.path.startsWith('/api/') && req.path !== '/api/health') {
    const t0 = Date.now();
    res.on('finish', () =>
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.originalUrl.slice(0, 200)} ${res.statusCode} ${Date.now() - t0}ms ${req.ip}`,
      ),
    );
  }
  next();
});

// Constant-time compare so the ingest token can't be recovered by timing.
function tokenOk(header: string | undefined): boolean {
  const want = Buffer.from(`Bearer ${INGEST_TOKEN}`);
  const got = Buffer.from(header ?? '');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Token gate that runs BEFORE the 25 MB body parse, so an anonymous client can't make the
 *  server buffer and parse a huge body. */
const requireIngestToken: RequestHandler = (req, res, next) => {
  if (INGEST_TOKEN && !tokenOk(req.header('authorization'))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};

// Everything except ingest gets a small body limit.
const smallJson = express.json({ limit: '100kb' });
const ingestJson = express.json({ limit: '25mb' });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class BadRequest extends Error {}

/** Query params as plain strings. `?a=1&a=2` / `?a[]=1` arrive as arrays or objects — reject them
 *  rather than letting a non-string reach SQL and surface as a 500. */
function queryStrings(q: Record<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (typeof v !== 'string') throw new BadRequest(`query param "${k}" must be a single value`);
    out[k] = v;
  }
  return out;
}

/** An ISO-ish date for from/to; Postgres would otherwise throw on garbage and we'd 500. */
function dateParam(name: string, v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (Number.isNaN(Date.parse(v))) throw new BadRequest(`"${name}" must be an ISO date`);
  return v;
}

function sendError(res: express.Response, label: string, err: unknown) {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(`${label} error:`, err);
  res.status(500).json({ error: `${label} failed` });
}

/** The dashboard's "(no project)" group is a route-boundary sentinel for project IS NULL. */
const NO_PROJECT = '(no project)';

// --- helpers ---------------------------------------------------------------

function summaryRow(r: any) {
  const stats = {
    ...r.stats,
    permissionModes: r.stats?.permissionModes ?? [],
    usedAutoMode: r.stats?.usedAutoMode ?? false,
    modelUsage: r.stats?.modelUsage ?? {},
    daily: r.stats?.daily ?? {},
    // Legacy rows (parser_version 0-2) have `userTurns`, not `userMessages`. Without this
    // fallback every old session would show 0 messages — worse than the inflated `turns`.
    userMessages: r.stats?.userMessages ?? r.stats?.userTurns ?? 0,
  };
  return {
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    author: r.author,
    project: r.project ?? undefined,
    cwd: r.cwd ?? undefined,
    gitBranch: r.git_branch ?? undefined,
    note: r.note ?? undefined,
    tags: r.tags ?? [],
    featured: r.featured,
    hidden: r.hidden,
    stats,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    createdAt: r.created_at,
    accountEmail: r.account_email ?? undefined,
    displayName: r.account_display_name ?? undefined,
    orgName: r.org_name ?? undefined,
    usedAutoMode: r.used_auto_mode ?? undefined,
    permissionModes: r.permission_modes ?? undefined,
    parserVersion: r.parser_version ?? undefined,
  };
}

// coalesce(account_email, author) = identity — old rows still group by author alone.
//
// The trailing `OR author = $n` is load-bearing, not redundant: `/api/stats` reports an author's
// `identity` as their account *email* once one is known, but the UI routes people by display
// name (`/u/:author`, `/analytics/u/:author`) because that's what reads in a URL and a crumb.
// Without this branch, `?identity=Saurabh` matched zero rows the moment that person had an
// account email, and the whole per-person analytics page rendered as zeros with no error.
// Accepting either key keeps both the email and the display name working as a scope.
const IDENTITY_CLAUSE = (n: number) =>
  `(account_email = $${n} OR (account_email IS NULL AND author = $${n}) OR author = $${n})`;

// Genuine human messages, with the userTurns fallback for parser_version 0-2 rows.
const USER_MESSAGES_EXPR =
  `coalesce((stats->>'userMessages')::int, (stats->>'userTurns')::int, 0)`;

// --- routes ----------------------------------------------------------------

/** The author a session should be stored under. An explicit alias (author_aliases) wins; a name
 *  never seen before that matches an existing author case-insensitively joins that author, so a
 *  reconnect as "SAURABH" doesn't split one person into two rows on the dashboard. */
async function canonicalAuthor(author: string): Promise<string> {
  const alias = await pool.query('SELECT canonical FROM author_aliases WHERE alias = $1', [author]);
  if (alias.rows.length) return alias.rows[0].canonical;
  const known = await pool.query(
    `SELECT author, (author = $1) AS exact FROM sessions WHERE lower(author) = lower($1)
      GROUP BY author ORDER BY exact DESC, count(*) DESC LIMIT 1`,
    [author],
  );
  return known.rows[0]?.author ?? author;
}

// Deep health: a wedged pool or a lost DB must fail the probe, not report green.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('health error:', err);
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

// Opt-in ingest from the CLI.
app.post('/api/sessions', requireIngestToken, ingestJson, async (req, res) => {
  const body = req.body as IngestPayload;
  if (
    !body?.session?.sessionId ||
    typeof body.session.sessionId !== 'string' ||
    !body.author ||
    typeof body.author !== 'string' ||
    typeof body.session.stats !== 'object' ||
    !Array.isArray(body.session.turns)
  ) {
    return res.status(400).json({ error: 'session (with stats and turns) and author are required' });
  }
  const s = body.session;
  try {
    body.author = await canonicalAuthor(body.author);
  } catch (err) {
    return sendError(res, 'ingest', err);
  }
  // Server-side redaction backstop: clients may run with redaction off (or an old plugin), and the
  // dashboard is readable by the whole team, so secrets are scrubbed here regardless.
  s.turns = redactDeep(s.turns).value;
  s.title = redactText(String(s.title ?? '')).text;
  if (s.stats.firstUserPrompt) s.stats.firstUserPrompt = redactText(s.stats.firstUserPrompt).text;
  try {
    // Tombstone gate: a prior delete of this session or its project must stick. The Stop hook is
    // fire-and-forget, so this is always a 200 — a 4xx would just be swallowed.
    const tomb = await pool.query(
      `SELECT scope FROM deletions
        WHERE author = $2 AND ((scope='session' AND session_id = $1)
           OR (scope='project' AND ((no_project AND $3::text IS NULL) OR project = $3)))
        LIMIT 1`,
      [s.sessionId, body.author, s.project ?? null],
    );
    if (tomb.rows.length) {
      const scope = tomb.rows[0].scope as 'session' | 'project';
      return res.json({
        ignored: true,
        untrack:
          scope === 'session' ? { sessionId: s.sessionId } : { cwd: s.cwd ?? s.project },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO sessions
         (session_id, title, author, author_email, project, git_branch, note, tags, stats, transcript,
          started_at, ended_at, account_email, account_display_name, org_name, used_auto_mode,
          permission_modes, parser_version, cwd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (session_id, author) DO UPDATE SET
         title=EXCLUDED.title, project=EXCLUDED.project, cwd=EXCLUDED.cwd, git_branch=EXCLUDED.git_branch,
         note=COALESCE(EXCLUDED.note, sessions.note),
         tags=CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE sessions.tags END,
         stats=EXCLUDED.stats,
         transcript=EXCLUDED.transcript, started_at=EXCLUDED.started_at, ended_at=EXCLUDED.ended_at,
         account_email=COALESCE(EXCLUDED.account_email, sessions.account_email),
         account_display_name=COALESCE(EXCLUDED.account_display_name, sessions.account_display_name),
         org_name=COALESCE(EXCLUDED.org_name, sessions.org_name),
         used_auto_mode=EXCLUDED.used_auto_mode OR sessions.used_auto_mode,
         permission_modes=EXCLUDED.permission_modes,
         parser_version=GREATEST(EXCLUDED.parser_version, sessions.parser_version),
         updated_at=now()
       -- Never let an older parser or an out-of-order (delayed) upload overwrite newer data.
       WHERE EXCLUDED.parser_version >= sessions.parser_version
         AND (sessions.ended_at IS NULL OR EXCLUDED.ended_at IS NULL
              OR EXCLUDED.ended_at >= sessions.ended_at)
       RETURNING id`,
      [
        s.sessionId,
        s.title,
        body.author,
        body.authorEmail ?? null,
        s.project ?? null,
        s.gitBranch ?? null,
        body.note ?? null,
        body.tags ?? [],
        JSON.stringify(s.stats),
        JSON.stringify(s.turns),
        s.startedAt ?? null,
        s.endedAt ?? null,
        body.account?.email ?? null,
        body.account?.displayName ?? null,
        body.account?.organizationName ?? null,
        s.stats?.usedAutoMode ?? false,
        s.stats?.permissionModes ?? [],
        s.parserVersion ?? 0,
        s.cwd ?? null,
      ],
    );
    if (rows.length) return res.json({ id: rows[0].id, url: `/session/${rows[0].id}` });
    // The WHERE guard skipped a stale update. Still a success for the client — the row exists.
    const existing = await pool.query('SELECT id FROM sessions WHERE session_id = $1 AND author = $2', [
      s.sessionId,
      body.author,
    ]);
    const id = existing.rows[0]?.id;
    res.json({ id, url: id ? `/session/${id}` : undefined, stale: true });
  } catch (err) {
    sendError(res, 'ingest', err);
  }
});

// List / filter / search (no transcript body).
app.get('/api/sessions', async (req, res) => {
  let where: string[] = [];
  let orderBy: string;
  const args: unknown[] = [];
  try {
    const qs = queryStrings(req.query);
    const { author, project, tag, featured, q, sort, includeHidden, identity, autoMode, inTranscript } = qs;
    const from = dateParam('from', qs.from);
    const to = dateParam('to', qs.to);
    ({ where, orderBy } = buildListFilter(args, {
      author, project, tag, featured, q, sort, includeHidden, identity, autoMode, from, to, inTranscript,
    }));
  } catch (err) {
    return sendError(res, 'list', err);
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  args.push(limit, offset);

  const sql = `SELECT id, session_id, title, author, project, cwd, git_branch, note, tags, featured, hidden,
                      stats, started_at, ended_at, created_at, account_email, account_display_name,
                      org_name, used_auto_mode, permission_modes, parser_version
               FROM sessions
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${orderBy}
               LIMIT $${args.length - 1} OFFSET $${args.length}`;
  try {
    const { rows } = await pool.query(sql, args);
    res.json(rows.map(summaryRow));
  } catch (err) {
    sendError(res, 'list', err);
  }
});

function buildListFilter(
  args: unknown[],
  f: Record<string, string | undefined>,
): { where: string[]; orderBy: string } {
  const { author, project, tag, featured, q, sort, includeHidden, identity, autoMode, from, to, inTranscript } = f;
  const where: string[] = [];
  const add = (clause: string, val: unknown) => {
    args.push(val);
    where.push(clause.replace('?', `$${args.length}`));
  };
  if (includeHidden !== 'true') where.push('hidden = false');
  if (author) add('author = ?', author);
  if (project === NO_PROJECT) where.push('project IS NULL');
  else if (project) add('project = ?', project);
  if (tag) add('? = ANY(tags)', tag);
  if (featured === 'true') where.push('featured = true');
  if (identity) {
    args.push(identity);
    where.push(IDENTITY_CLAUSE(args.length));
  }
  if (autoMode === 'true') where.push('used_auto_mode = true');
  if (from) add('started_at >= ?', from);
  if (to) add('started_at < ?', to);
  if (q) {
    args.push(`%${q}%`);
    const p = `$${args.length}`;
    const fields = `title ILIKE ${p} OR note ILIKE ${p} OR author ILIKE ${p} OR project ILIKE ${p}`;
    if (inTranscript === 'true') {
      // Word match via the search_tsv GIN index (see db.ts), not substring — ILIKE over the
      // transcript itself would de-TOAST every row.
      args.push(q);
      where.push(`(${fields} OR search_tsv @@ websearch_to_tsquery('simple', $${args.length}))`);
    } else {
      where.push(`(${fields})`);
    }
  }

  return { where, orderBy: orderFor(sort) };
}

/** ORDER BY for a `sort` param: cost|turns|messages|tokens|recent|featured, `_asc` suffix flips.
 *  Only these literals are ever interpolated — the param itself never reaches SQL. */
function orderFor(sort: string | undefined): string {
  const DIR = (d: string) => (sort?.endsWith('_asc') ? d.replace('DESC', 'ASC') : d);
  const key = sort?.replace(/_asc$/, '');
  return (
    key === 'cost'
      ? DIR(`(stats->>'estimatedCostUsd')::float DESC NULLS LAST`)
      : key === 'turns'
        ? DIR(`(stats->>'turns')::int DESC NULLS LAST`)
        : key === 'messages'
          ? DIR(`${USER_MESSAGES_EXPR} DESC NULLS LAST`)
          : key === 'tokens'
            ? DIR(`(stats->>'totalTokens')::bigint DESC NULLS LAST`)
            : key === 'featured'
              ? 'featured DESC, started_at DESC NULLS LAST, created_at DESC'
              : DIR('started_at DESC NULLS LAST') + ', created_at DESC');
}

// One-endpoint analytics: three queries over one filtered scope, run concurrently so the daily/
// models/totals panels can never disagree. identity omitted = org-wide.
/** Shared scope for the analytics endpoints: $1 identity, $2 from, $3 to, $4 project.
 *  Every param is referenced unconditionally (and cast, so Postgres can type it) even when null:
 *  a query text that never mentions a bound $n fails with "could not determine data type". */
function analyticsScope(req: express.Request): { args: unknown[]; scopeWhere: string } {
  const qs = queryStrings(req.query);
  const project = qs.project;
  const args: unknown[] = [
    qs.identity ?? null,
    dateParam('from', qs.from) ?? null,
    dateParam('to', qs.to) ?? null,
    project ?? null,
  ];
  const scopeWhere =
    `hidden = false AND ($1::text IS NULL OR ${IDENTITY_CLAUSE(1)})` +
    ` AND (started_at >= $2::timestamptz OR $2::timestamptz IS NULL)` +
    ` AND (started_at < $3::timestamptz OR $3::timestamptz IS NULL)` +
    ` AND ($4::text IS NULL OR project = $4 OR ($4 = '${NO_PROJECT}' AND project IS NULL))`;
  return { args, scopeWhere };
}

app.get('/api/analytics', async (req, res) => {
  let args: unknown[], scopeWhere: string;
  try {
    ({ args, scopeWhere } = analyticsScope(req));
  } catch (err) {
    return sendError(res, 'analytics', err);
  }
  const sessionLimit = Math.min(Math.max(Number(req.query.sessionLimit) || 10, 1), 100);
  const sessionOffset = Math.max(Number(req.query.sessionOffset) || 0, 0);
  const sessionOrder = orderFor(typeof req.query.sessionSort === 'string' ? req.query.sessionSort : undefined);
  try {
    const [totalsQ, dailyQ, modelsQ, sessionsQ] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS sessions,
                sum((stats->>'turns')::int)::int AS turns,
                sum(${USER_MESSAGES_EXPR})::int AS "userMessages",
                sum((stats->>'totalTokens')::bigint)::bigint AS tokens,
                round(sum((stats->>'estimatedCostUsd')::numeric), 4) AS cost
           FROM sessions WHERE ${scopeWhere}`,
        args,
      ),
      pool.query(
        `WITH scope AS (SELECT stats FROM sessions WHERE ${scopeWhere})
         SELECT kv.key AS day, count(*)::int AS sessions,
                sum((kv.value->>'turns')::int)::int AS turns,
                sum(coalesce((kv.value->>'userMessages')::int, 0))::int AS "userMessages",
                sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                round(sum((kv.value->>'costUsd')::numeric), 4) AS cost
           FROM scope, LATERAL jsonb_each(coalesce(stats->'daily','{}'::jsonb)) kv
          GROUP BY day ORDER BY day`,
        args,
      ),
      pool.query(
        `WITH scope AS (SELECT stats FROM sessions WHERE ${scopeWhere})
         SELECT kv.key AS model, count(*)::int AS sessions,
                sum((kv.value->>'turns')::int)::int AS turns,
                sum((kv.value->>'activeMs')::bigint)::bigint AS "activeMs",
                sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                round(sum((kv.value->>'costUsd')::numeric), 4) AS cost,
                bool_and((kv.value->>'measured')::boolean) AS measured
           FROM scope, LATERAL jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) kv
          GROUP BY 1 ORDER BY "activeMs" DESC NULLS LAST`,
        args,
      ),
      pool.query(
        `SELECT id, session_id, title, author, project, cwd, git_branch, note, tags, featured, hidden,
                stats, started_at, ended_at, created_at, account_email, account_display_name,
                org_name, used_auto_mode, permission_modes, parser_version
           FROM sessions
          WHERE ${scopeWhere}
          ORDER BY ${sessionOrder}
          LIMIT ${sessionLimit + 1} OFFSET ${sessionOffset}`,
        args,
      ),
    ]);
    // daily[].sessions counts a session on every day it was active (resumes span days), so it
    // won't sum to totals.sessions — that's activity, not a partition.
    res.json({
      tz: 'UTC',
      totals: totalsQ.rows[0],
      daily: dailyQ.rows,
      models: modelsQ.rows,
      sessions: sessionsQ.rows.slice(0, sessionLimit).map(summaryRow),
      sessionsHasMore: sessionsQ.rows.length > sessionLimit,
    });
  } catch (err) {
    sendError(res, 'analytics', err);
  }
});

// Extended model analytics: per-model token breakdown, tools, permission modes, team matrix.
// identity omitted = org-wide. Same from/to semantics as /api/analytics.
app.get('/api/model-analytics', async (req, res) => {
  let args: unknown[], scopeWhere: string;
  try {
    ({ args, scopeWhere } = analyticsScope(req));
  } catch (err) {
    return sendError(res, 'model-analytics', err);
  }
  try {
    const [modelsQ, toolsQ, modesQ, authorModelsQ, totalsQ] = await Promise.all([
      pool.query(
        `WITH scope AS (SELECT stats, started_at, ended_at FROM sessions WHERE ${scopeWhere})
         SELECT kv.key AS model,
                count(*)::int AS sessions,
                sum((kv.value->>'turns')::int)::int AS turns,
                sum((kv.value->>'activeMs')::bigint)::bigint AS "activeMs",
                sum((kv.value->>'totalTokens')::bigint)::bigint AS tokens,
                sum(coalesce((kv.value->>'inputTokens')::bigint, 0))::bigint AS "inputTokens",
                sum(coalesce((kv.value->>'outputTokens')::bigint, 0))::bigint AS "outputTokens",
                sum(coalesce((kv.value->>'cacheReadTokens')::bigint, 0))::bigint AS "cacheReadTokens",
                sum(coalesce((kv.value->>'cacheCreationTokens')::bigint, 0))::bigint AS "cacheCreationTokens",
                round(sum((kv.value->>'costUsd')::numeric), 4) AS cost,
                bool_and((kv.value->>'measured')::boolean) AS measured,
                round(avg(EXTRACT(EPOCH FROM (scope.ended_at - scope.started_at)) * 1000))::bigint AS "avgSessionDurationMs"
           FROM scope, LATERAL jsonb_each(coalesce(stats->'modelUsage','{}'::jsonb)) kv
          GROUP BY 1 ORDER BY "activeMs" DESC NULLS LAST`,
        args,
      ),
      pool.query(
        // errors come from stats.toolErrors (parser v7+); older sessions contribute 0, so the rate
        // is a floor until they re-sync.
        `WITH scope AS (SELECT stats FROM sessions WHERE ${scopeWhere})
         SELECT key AS tool, sum(value::int)::int AS uses,
                sum(coalesce((stats->'toolErrors'->>key)::int, 0))::int AS errors
           FROM scope, LATERAL jsonb_each_text(stats->'toolUsage')
          GROUP BY key ORDER BY uses DESC LIMIT 30`,
        args,
      ),
      pool.query(
        `SELECT mode, count(*)::int AS sessions
           FROM sessions, LATERAL unnest(permission_modes) AS mode
          WHERE ${scopeWhere} AND mode IS NOT NULL
          GROUP BY mode ORDER BY sessions DESC`,
        args,
      ),
      // Use stats->'models' (string array, present on ALL sessions) so every author appears,
      // not stats->'modelUsage' (only populated for parser_version >= 5 sessions).
      pool.query(
        `WITH scope AS (
           SELECT stats,
                  author AS identity,
                  author AS label
             FROM sessions WHERE ${scopeWhere}
         )
         SELECT scope.identity, scope.label, model,
                count(*)::int AS sessions
           FROM scope, LATERAL jsonb_array_elements_text(coalesce(stats->'models','[]'::jsonb)) AS model
          GROUP BY 1, 2, 3 ORDER BY 1, sessions DESC`,
        args,
      ),
      pool.query(
        `SELECT count(*)::int AS sessions,
                sum((stats->>'turns')::int)::int AS turns,
                sum((stats->>'totalTokens')::bigint)::bigint AS tokens,
                round(sum((stats->>'estimatedCostUsd')::numeric), 4) AS cost
           FROM sessions WHERE ${scopeWhere}`,
        args,
      ),
    ]);
    res.json({
      tz: 'UTC',
      totals: totalsQ.rows[0],
      models: modelsQ.rows,
      tools: toolsQ.rows,
      permissionModes: modesQ.rows,
      authorModels: authorModelsQ.rows,
    });
  } catch (err) {
    sendError(res, 'model-analytics', err);
  }
});

// Aggregate stats for the value / leaderboard panel.
app.get('/api/stats', async (_req, res) => {
  try {
    const [authors, skills, tools, totals] = await Promise.all([
      pool.query(`
      SELECT author,
             author AS label,
             coalesce(
               (array_agg(account_email ORDER BY updated_at DESC) FILTER (WHERE account_email IS NOT NULL))[1],
               author
             ) AS identity,
             (array_agg(org_name ORDER BY updated_at DESC) FILTER (WHERE org_name IS NOT NULL))[1] AS "orgName",
             count(*)::int AS sessions,
             count(DISTINCT project)::int AS projects,
             count(*) FILTER (WHERE featured)::int AS featured,
             count(*) FILTER (WHERE used_auto_mode)::int AS "autoSessions",
             round(sum((stats->>'estimatedCostUsd')::numeric), 2) AS cost,
             sum((stats->>'turns')::int)::int AS turns,
             sum(${USER_MESSAGES_EXPR})::int AS "userMessages",
             sum((stats->>'totalTokens')::bigint)::bigint AS tokens
      FROM sessions WHERE hidden = false GROUP BY author ORDER BY sessions DESC`),
      pool.query(`
      SELECT skill, count(*)::int AS uses FROM sessions,
        LATERAL jsonb_array_elements_text(stats->'skills') AS skill
      WHERE hidden = false
      GROUP BY skill ORDER BY uses DESC LIMIT 25`),
      pool.query(`
      SELECT key AS tool, sum(value::int)::int AS uses FROM sessions,
        LATERAL jsonb_each_text(stats->'toolUsage')
      WHERE hidden = false
      GROUP BY key ORDER BY uses DESC LIMIT 25`),
      pool.query(`
      SELECT count(*)::int AS sessions,
             count(DISTINCT author)::int AS authors,
             round(sum((stats->>'estimatedCostUsd')::numeric), 2) AS cost
      FROM sessions WHERE hidden = false`),
    ]);
    res.json({
      totals: totals.rows[0],
      authors: authors.rows,
      skills: skills.rows,
      tools: tools.rows,
    });
  } catch (err) {
    sendError(res, 'stats', err);
  }
});

// Full session incl. transcript.
app.get('/api/sessions/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'not found' });
  try {
    const { rows } = await pool.query(
      `SELECT id, session_id, title, author, author_email, project, cwd, git_branch, note, tags, featured,
              hidden, stats, transcript, started_at, ended_at, created_at, account_email,
              account_display_name, org_name, used_auto_mode, permission_modes, parser_version
         FROM sessions WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ ...summaryRow(r), authorEmail: r.author_email ?? undefined, turns: r.transcript });
  } catch (err) {
    sendError(res, 'get', err);
  }
});

// Curation: toggle featured / edit tags.
app.patch('/api/sessions/:id', smallJson, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { featured, hidden, tags } = (req.body ?? {}) as {
    featured?: boolean;
    hidden?: boolean;
    tags?: string[];
  };
  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof featured === 'boolean') {
    args.push(featured);
    sets.push(`featured = $${args.length}`);
  }
  if (typeof hidden === 'boolean') {
    args.push(hidden);
    sets.push(`hidden = $${args.length}`);
  }
  if (tags !== undefined) {
    if (
      !Array.isArray(tags) ||
      tags.length > 20 ||
      tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 50)
    ) {
      return res.status(400).json({ error: 'tags must be up to 20 non-empty strings of ≤50 chars' });
    }
    args.push(tags.map((t) => t.trim()));
    sets.push(`tags = $${args.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  args.push(req.params.id);
  try {
    const { rows } = await pool.query(
      // Explicit columns: RETURNING * would de-TOAST the whole transcript just to drop it.
      `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${args.length}
       RETURNING id, session_id, title, author, project, cwd, git_branch, note, tags, featured, hidden,
                 stats, started_at, ended_at, created_at, account_email, account_display_name,
                 org_name, used_auto_mode, permission_modes, parser_version`,
      args,
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(summaryRow(rows[0]));
  } catch (err) {
    sendError(res, 'update', err);
  }
});

// Delete a single session. Writes a tombstone in the same transaction so the next Stop hook
// can't resurrect the row.
app.delete('/api/sessions/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'not found' });
  await inTransaction(res, 'delete', async (client) => {
    const found = await client.query('SELECT session_id, author FROM sessions WHERE id = $1', [
      req.params.id,
    ]);
    if (!found.rows.length) {
      res.status(404).json({ error: 'not found' });
      return false;
    }
    const { session_id, author } = found.rows[0];
    await client.query(
      `INSERT INTO deletions (scope, author, session_id) VALUES ('session', $1, $2)
       ON CONFLICT DO NOTHING`,
      [author, session_id],
    );
    const { rowCount } = await client.query('DELETE FROM sessions WHERE id = $1', [
      req.params.id,
    ]);
    res.json({ deleted: rowCount });
    return true;
  });
});

/** BEGIN → fn → COMMIT (fn returns true) or ROLLBACK. Every await is inside the try — a failed
 *  pool.connect() or ROLLBACK on a dead connection must answer 500, not become an unhandled
 *  rejection that kills the process. */
async function inTransaction(
  res: express.Response,
  label: string,
  fn: (client: import('pg').PoolClient) => Promise<boolean>,
) {
  let client: import('pg').PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query((await fn(client)) ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    if (!res.headersSent) sendError(res, label, err);
    else console.error(`${label} error after response:`, err);
  } finally {
    client?.release();
  }
}

// Delete every session for one author+project (a "project" on the dashboard). Same
// same-transaction tombstone. The '(no project)' sentinel is a route-boundary concept only —
// it must not leak into the deletions table as a literal string.
app.delete('/api/projects', async (req, res) => {
  const { author, project } = req.query;
  if (typeof author !== 'string' || typeof project !== 'string' || !author || !project) {
    return res.status(400).json({ error: 'author and project are required' });
  }
  const noProject = project === NO_PROJECT;
  const projectVal = noProject ? null : project;
  await inTransaction(res, 'delete project', async (client) => {
    await client.query(
      `INSERT INTO deletions (scope, author, project, no_project) VALUES ('project', $1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [author, projectVal, noProject],
    );
    const { rowCount } = await client.query(
      noProject
        ? 'DELETE FROM sessions WHERE author = $1 AND project IS NULL'
        : 'DELETE FROM sessions WHERE author = $1 AND project = $2',
      noProject ? [author] : [author, projectVal],
    );
    res.json({ deleted: rowCount ?? 0 });
    return true;
  });
});

// One person's projects, aggregated server-side (the page used to fold ≤500 fetched rows, which
// silently understated heavy users). Same author/from/to semantics as GET /api/sessions.
app.get('/api/projects', async (req, res) => {
  let args: unknown[];
  try {
    const qs = queryStrings(req.query);
    if (!qs.author) throw new BadRequest('author is required');
    args = [qs.author, dateParam('from', qs.from) ?? null, dateParam('to', qs.to) ?? null];
  } catch (err) {
    return sendError(res, 'projects', err);
  }
  const scope =
    `hidden = false AND author = $1` +
    ` AND (started_at >= $2::timestamptz OR $2::timestamptz IS NULL)` +
    ` AND (started_at < $3::timestamptz OR $3::timestamptz IS NULL)`;
  try {
    const [projectsQ, totalsQ, skillsQ] = await Promise.all([
      pool.query(
        // Skills are aggregated in their own CTE: joining them row-per-skill into the sums
        // would multiply every total by the session's skill count.
        `WITH scope AS (SELECT coalesce(project, '${NO_PROJECT}') AS project, stats, started_at, created_at
                          FROM sessions WHERE ${scope}),
              agg AS (SELECT project,
                             count(*)::int AS sessions,
                             sum((stats->>'turns')::int)::int AS turns,
                             sum(${USER_MESSAGES_EXPR})::int AS messages,
                             sum((stats->>'totalTokens')::bigint)::bigint AS tokens,
                             round(sum((stats->>'estimatedCostUsd')::numeric), 4) AS cost,
                             max(coalesce(started_at, created_at)) AS "lastActivity"
                        FROM scope GROUP BY project),
              sk AS (SELECT project, array_agg(DISTINCT s) AS skills
                       FROM scope, LATERAL jsonb_array_elements_text(coalesce(stats->'skills','[]'::jsonb)) s
                      GROUP BY project)
         SELECT agg.*, coalesce(sk.skills, '{}') AS skills
           FROM agg LEFT JOIN sk USING (project)
          ORDER BY sessions DESC, "lastActivity" DESC`,
        args,
      ),
      pool.query(
        `SELECT count(*)::int AS sessions,
                count(DISTINCT coalesce(project, '${NO_PROJECT}'))::int AS projects,
                coalesce(sum((stats->>'turns')::int), 0)::int AS turns,
                coalesce(sum(${USER_MESSAGES_EXPR}), 0)::int AS messages,
                coalesce(sum((stats->>'totalTokens')::bigint), 0)::bigint AS tokens,
                coalesce(round(sum((stats->>'estimatedCostUsd')::numeric), 4), 0) AS cost
           FROM sessions WHERE ${scope}`,
        args,
      ),
      pool.query(
        `SELECT sk AS skill, count(*)::int AS uses
           FROM sessions, LATERAL jsonb_array_elements_text(coalesce(stats->'skills','[]'::jsonb)) sk
          WHERE ${scope}
          GROUP BY sk ORDER BY uses DESC LIMIT 25`,
        args,
      ),
    ]);
    res.json({ totals: totalsQ.rows[0], projects: projectsQ.rows, skills: skillsQ.rows });
  } catch (err) {
    sendError(res, 'projects', err);
  }
});

// Unknown /api/* → JSON 404 instead of falling through to the SPA's index.html.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Serve the built dashboard from the same origin as the API (production).
// The web app calls relative /api/* paths, so co-hosting means zero CORS/URL
// config for viewers. Falls back to index.html for client-side routing.
if (existsSync(WEB_DIST)) {
  // Vite fingerprints /assets/*, so those can be cached forever; index.html must always revalidate.
  app.use(
    express.static(WEB_DIST, {
      setHeaders: (res, path) => {
        if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(WEB_DIST, 'index.html'));
  });
  console.log(`serving dashboard from ${WEB_DIST}`);
}

const PORT = Number(process.env.PORT ?? 4000);

// Log instead of dying silently; unhandled rejections still indicate a bug worth seeing.
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));

async function start() {
  // Migrations get their own connection with the pool's statement_timeout lifted: a table
  // rewrite (e.g. adding search_tsv, ~40 s on prod) would otherwise be cancelled mid-boot and
  // leave the server crash-looping.
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 0');
    await client.query(SCHEMA); // ensure schema on boot (idempotent)
    await client.query(MIGRATIONS);
  } finally {
    client.release(true); // discard: don't return a no-timeout session to the pool
  }
  const server = app.listen(PORT, () => console.log(`ClaudeLens server on http://localhost:${PORT}`));
  // Graceful stop on deploy: finish in-flight ingests, then close the pool.
  const shutdown = (sig: string) => {
    console.log(`${sig}: draining`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
