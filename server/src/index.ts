import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, SCHEMA } from './db.js';
import type { IngestPayload } from '@claudelens/shared';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const INGEST_TOKEN = process.env.CLAUDELENS_TOKEN ?? '';

// --- helpers ---------------------------------------------------------------

function summaryRow(r: any) {
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
    stats: r.stats,
    startedAt: r.started_at ?? undefined,
    createdAt: r.created_at,
  };
}

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
    const { rows } = await pool.query(
      `INSERT INTO sessions
         (session_id, title, author, author_email, project, git_branch, note, tags, stats, transcript, started_at, ended_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (session_id, author) DO UPDATE SET
         title=EXCLUDED.title, project=EXCLUDED.project, git_branch=EXCLUDED.git_branch,
         note=COALESCE(EXCLUDED.note, sessions.note),
         tags=CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE sessions.tags END,
         stats=EXCLUDED.stats,
         transcript=EXCLUDED.transcript, started_at=EXCLUDED.started_at, ended_at=EXCLUDED.ended_at,
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
  const { author, project, tag, featured, q, sort, includeHidden } = req.query as Record<
    string,
    string
  >;
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
        : 'featured DESC, created_at DESC';

  const sql = `SELECT id, session_id, title, author, project, note, tags, featured, hidden, stats, started_at, created_at
               FROM sessions
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${orderBy}
               LIMIT 200`;
  try {
    const { rows } = await pool.query(sql, args);
    res.json(rows.map(summaryRow));
  } catch (err) {
    console.error('list error:', err);
    res.status(500).json({ error: 'list failed' });
  }
});

// Aggregate stats for the value / leaderboard panel.
app.get('/api/stats', async (_req, res) => {
  try {
    const authors = await pool.query(`
      SELECT author,
             count(*)::int AS sessions,
             count(DISTINCT project)::int AS projects,
             count(*) FILTER (WHERE featured)::int AS featured,
             round(sum((stats->>'estimatedCostUsd')::numeric), 2) AS cost,
             sum((stats->>'turns')::int)::int AS turns
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

// Delete a single session.
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM sessions WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: rowCount });
  } catch (err) {
    console.error('delete error:', err);
    res.status(500).json({ error: 'delete failed' });
  }
});

// Delete every session for one author+project (a "project" on the dashboard).
app.delete('/api/projects', async (req, res) => {
  const { author, project } = req.query as Record<string, string>;
  if (!author || !project) {
    return res.status(400).json({ error: 'author and project are required' });
  }
  // The dashboard groups project-less sessions under "(no project)".
  const noProject = project === '(no project)';
  try {
    const { rowCount } = await pool.query(
      noProject
        ? 'DELETE FROM sessions WHERE author = $1 AND project IS NULL'
        : 'DELETE FROM sessions WHERE author = $1 AND project = $2',
      noProject ? [author] : [author, project],
    );
    res.json({ deleted: rowCount ?? 0 });
  } catch (err) {
    console.error('delete project error:', err);
    res.status(500).json({ error: 'delete failed' });
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
  app.listen(PORT, () => console.log(`ClaudeLens server on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
