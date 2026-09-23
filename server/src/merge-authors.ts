// Merge one author into another, and make it stick for future uploads.
//   node --import tsx src/merge-authors.ts <from> <to>            # dry run
//   node --import tsx src/merge-authors.ts <from> <to> --apply
// Moves sessions and delete-tombstones from <from> to <to> and records <from> as an alias of
// <to> in author_aliases (ingest rewrites it from then on). If a session exists under both
// names, the copy with the later ended_at wins.
import { pool } from './db.js';

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!from || !to || from === to) {
  console.error('usage: merge-authors.ts <from> <to> [--apply]');
  process.exit(2);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await client.query(
      `SELECT (SELECT count(*) FROM sessions WHERE author = $1)::int AS sessions,
              (SELECT count(*) FROM sessions a JOIN sessions b ON a.session_id = b.session_id
                WHERE a.author = $1 AND b.author = $2)::int AS overlap,
              (SELECT count(*) FROM deletions WHERE author = $1)::int AS tombstones`,
      [from, to],
    );
    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${from} → ${to}`, counts.rows[0]);

    // Overlapping sessions: drop the older copy so the rename can't hit UNIQUE(session_id, author).
    await client.query(
      `DELETE FROM sessions s USING sessions o
        WHERE s.session_id = o.session_id AND s.author = $1 AND o.author = $2
          AND coalesce(s.ended_at, s.created_at) <= coalesce(o.ended_at, o.created_at)`,
      [from, to],
    );
    await client.query(
      `DELETE FROM sessions s USING sessions o
        WHERE s.session_id = o.session_id AND s.author = $2 AND o.author = $1`,
      [from, to],
    );
    await client.query('UPDATE sessions SET author = $2 WHERE author = $1', [from, to]);

    await client.query(
      `INSERT INTO deletions (scope, author, session_id, project, no_project, created_at)
       SELECT scope, $2, session_id, project, no_project, created_at FROM deletions WHERE author = $1
       ON CONFLICT DO NOTHING`,
      [from, to],
    );
    await client.query('DELETE FROM deletions WHERE author = $1', [from]);

    await client.query(
      `INSERT INTO author_aliases (alias, canonical) VALUES ($1, $2)
       ON CONFLICT (alias) DO UPDATE SET canonical = EXCLUDED.canonical`,
      [from, to],
    );
    // Anything that pointed at <from> now points at <to> (no alias chains).
    await client.query('UPDATE author_aliases SET canonical = $2 WHERE canonical = $1', [from, to]);

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    const after = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE author = $1', [to]);
    console.log(apply ? `done — ${to} now has ${after.rows[0].n} sessions` : 'rolled back (pass --apply)');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
