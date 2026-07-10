import { pool, SCHEMA } from './db.js';

async function main() {
  await pool.query(SCHEMA);
  console.log('✔ ClaudeLens schema applied');
  await pool.end();
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
