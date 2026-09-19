import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, SCHEMA, MIGRATIONS } from './db.js';
import type { IngestPayload } from '@claudelens/shared';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const INGEST_TOKEN = process.env.CLAUDELENS_TOKEN ?? '';

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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Opt-in ingest from the CLI.
app.post('/api/sessions', async (req, res) => {
  if (INGEST_TOKEN) {
    const auth = req.header('authorization') ?? '';
    if (auth !== `Bearer ${INGEST_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  }
  const body = req.body as IngestPayload;
  if (!body?.session?.sessionId || !body.author) {
    return res.status(400).json({ error: 'session and author are required' });
  }
  const s = body.session;
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
          permission_modes, parser_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (session_id, author) DO UPDATE SET
         title=EXCLUDED.title, project=EXCLUDED.project, git_branch=EXCLUDED.git_branch,
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
      ],
    );
    res.json({ id: rows[0].id, url: `/session/${rows[0].id}` });
  } catch (err) {
    console.error('ingest error:', err);
    res.status(500).json({ error: 'ingest failed' });
  }
});

// List / filter / search (no transcript body).
app.get('/api/sessions', async (req, res) => {
  const { author, project, tag, featured, q, sort, includeHidden, identity, autoMode, from, to } =
    req.query as Record<string, string>;
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    args.push(val);
    where.push(clause.replace('?', `$${args.length}`));
  };
  if (includeHidden !== 'true') where.push('hidden = false');
  if (author) add('author = ?', author);
  if (project) add('project = ?', project);
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
    where.push(`(title ILIKE ${p} OR note ILIKE ${p} OR author ILIKE ${p})`);
  }

  const orderBy =
    sort === 'cost'
      ? `(stats->>'estimatedCostUsd')::float DESC NULLS LAST`
      : sort === 'turns'
        ? `(stats->>'turns')::int DESC NULLS LAST`
        : sort === 'messages'
          ? `${USER_MESSAGES_EXPR} DESC NULLS LAST`
          : 'featured DESC, created_at DESC';

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  args.push(limit, offset);

  const sql = `SELECT id, session_id, title, author, project, git_branch, note, tags, featured, hidden,
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
    console.error('list error:', err);
    res.status(500).json({ error: 'list failed' });
  }
});

// One-endpoint analytics: three queries over one filtered scope, run concurrently so the daily/
// models/totals panels can never disagree. identity omitted = org-wide.
app.get('/api/analytics', async (req, res) => {
  const { identity, from, to } = req.query as Record<string, string>;
  const args: unknown[] = [identity ?? null, from ?? null, to ?? null];
  // $1 is referenced unconditionally (and cast, so Postgres can type it) even org-wide: a query
  // text that never mentions $1 while still binding it fails with "could not determine data type".
  const scopeWhere =
    `hidden = false AND ($1::text IS NULL OR ${IDENTITY_CLAUSE(1)})` +
    ` AND (started_at >= $2 OR $2 IS NULL) AND (started_at < $3 OR $3 IS NULL)`;
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
        `SELECT id, session_id, title, author, project, git_branch, note, tags, featured, hidden,
                stats, started_at, ended_at, created_at, account_email, account_display_name,
                org_name, used_auto_mode, permission_modes, parser_version
           FROM sessions
          WHERE ${scopeWhere}
          ORDER BY created_at DESC
          LIMIT 500`,
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
      sessions: sessionsQ.rows.map(summaryRow),
    });
  } catch (err) {
    console.error('analytics error:', err);
    res.status(500).json({ error: 'analytics failed' });
  }
});

// Extended model analytics: per-model token breakdown, tools, permission modes, team matrix.
// identity omitted = org-wide. Same from/to semantics as /api/analytics.
app.get('/api/model-analytics', async (req, res) => {
  const { identity, from, to } = req.query as Record<string, string>;
  const args: unknown[] = [identity ?? null, from ?? null, to ?? null];
  const scopeWhere =
    `hidden = false AND ($1::text IS NULL OR ${IDENTITY_CLAUSE(1)})` +
    ` AND (started_at >= $2 OR $2 IS NULL) AND (started_at < $3 OR $3 IS NULL)`;
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
        `WITH scope AS (SELECT stats FROM sessions WHERE ${scopeWhere})
         SELECT key AS tool, sum(value::int)::int AS uses
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
    console.error('model-analytics error:', err);
    res.status(500).json({ error: 'model-analytics failed' });
  }
});

// Aggregate stats for the value / leaderboard panel.
app.get('/api/stats', async (_req, res) => {
  try {
    const authors = await pool.query(`
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
      FROM sessions WHERE hidden = false GROUP BY author ORDER BY sessions DESC`);
    const skills = await pool.query(`
      SELECT skill, count(*)::int AS uses FROM sessions,
        LATERAL jsonb_array_elements_text(stats->'skills') AS skill
      WHERE hidden = false
      GROUP BY skill ORDER BY uses DESC LIMIT 25`);
    const tools = await pool.query(`
      SELECT key AS tool, sum(value::int)::int AS uses FROM sessions,
        LATERAL jsonb_each_text(stats->'toolUsage')
      WHERE hidden = false
      GROUP BY key ORDER BY uses DESC LIMIT 25`);
    const totals = await pool.query(`
      SELECT count(*)::int AS sessions,
             count(DISTINCT author)::int AS authors,
             round(sum((stats->>'estimatedCostUsd')::numeric), 2) AS cost
      FROM sessions WHERE hidden = false`);
    res.json({
      totals: totals.rows[0],
      authors: authors.rows,
      skills: skills.rows,
      tools: tools.rows,
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: 'stats failed' });
  }
});

// Full session incl. transcript.
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ ...summaryRow(r), authorEmail: r.author_email ?? undefined, turns: r.transcript });
  } catch (err) {
    console.error('get error:', err);
    res.status(500).json({ error: 'get failed' });
  }
});

// Curation: toggle featured / edit tags.
app.patch('/api/sessions/:id', async (req, res) => {
  const { featured, hidden, tags } = req.body as {
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
  if (Array.isArray(tags)) {
    args.push(tags);
    sets.push(`tags = $${args.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  args.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${args.length} RETURNING *`,
      args,
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(summaryRow(rows[0]));
  } catch (err) {
    console.error('patch error:', err);
    res.status(500).json({ error: 'update failed' });
  }
});

// Delete a single session. Writes a tombstone in the same transaction so the next Stop hook
// can't resurrect the row.
app.delete('/api/sessions/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT session_id, author FROM sessions WHERE id = $1', [
      req.params.id,
    ]);
    if (!found.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not found' });
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
    await client.query('COMMIT');
    res.json({ deleted: rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('delete error:', err);
    res.status(500).json({ error: 'delete failed' });
  } finally {
    client.release();
  }
});

// Delete every session for one author+project (a "project" on the dashboard). Same
// same-transaction tombstone. The '(no project)' sentinel is a route-boundary concept only —
// it must not leak into the deletions table as a literal string.
app.delete('/api/projects', async (req, res) => {
  const { author, project } = req.query as Record<string, string>;
  if (!author || !project) {
    return res.status(400).json({ error: 'author and project are required' });
  }
  const noProject = project === '(no project)';
  const projectVal = noProject ? null : project;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
    await client.query('COMMIT');
    res.json({ deleted: rowCount ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('delete project error:', err);
    res.status(500).json({ error: 'delete failed' });
  } finally {
    client.release();
  }
});

// Serve the built dashboard from the same origin as the API (production).
// The web app calls relative /api/* paths, so co-hosting means zero CORS/URL
// config for viewers. Falls back to index.html for client-side routing.
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(WEB_DIST, 'index.html'));
  });
  console.log(`serving dashboard from ${WEB_DIST}`);
}

const PORT = Number(process.env.PORT ?? 4000);

async function start() {
  await pool.query(SCHEMA); // ensure schema on boot (idempotent)
  await pool.query(MIGRATIONS);
  app.listen(PORT, () => console.log(`ClaudeLens server on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
