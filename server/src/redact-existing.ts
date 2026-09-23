// One-off: apply the server-side redaction backstop to rows ingested before it existed.
//   node --import tsx src/redact-existing.ts          # dry run: counts only
//   node --import tsx src/redact-existing.ts --apply  # writes
// Idempotent — redacted text contains no secret patterns, so a second run changes nothing.
import { pool } from './db.js';
import { redactDeep, redactText } from '@claudelens/shared';

const apply = process.argv.includes('--apply');
const BATCH = 50;

async function main() {
  let lastId = '00000000-0000-0000-0000-000000000000';
  let scanned = 0;
  let changed = 0;
  const hits: Record<string, number> = {};
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, title, stats, transcript FROM sessions WHERE id > $1 ORDER BY id LIMIT ${BATCH}`,
      [lastId],
    );
    if (!rows.length) break;
    for (const r of rows) {
      scanned++;
      lastId = r.id;
      const t = redactDeep(r.transcript);
      const title = redactText(r.title ?? '');
      const fup = r.stats?.firstUserPrompt ? redactText(r.stats.firstUserPrompt) : undefined;
      const all = [t.hits, title.hits, fup?.hits ?? {}];
      const n = all.reduce((sum, h) => sum + Object.values(h).reduce((a, b) => a + b, 0), 0);
      if (!n) continue;
      changed++;
      for (const h of all) for (const [k, v] of Object.entries(h)) hits[k] = (hits[k] ?? 0) + v;
      if (!apply) continue;
      const stats = fup ? { ...r.stats, firstUserPrompt: fup.text } : r.stats;
      await pool.query('UPDATE sessions SET transcript = $2, title = $3, stats = $4 WHERE id = $1', [
        r.id,
        JSON.stringify(t.value),
        title.text,
        JSON.stringify(stats),
      ]);
    }
  }
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: scanned ${scanned}, rows with secrets ${changed}`);
  console.log('hits by rule:', hits);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
