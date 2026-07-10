// Test helper: publish a specific JSONL file without prompts.
// usage: tsx publish-noninteractive.ts <file> <author> <note> <tags,csv>
import { readFile } from 'node:fs/promises';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { IngestPayload } from '@claudelens/shared';

const [, , file, author, note, tags] = process.argv;
const SERVER = process.env.CLAUDELENS_SERVER ?? 'http://localhost:4000';

const raw = await readFile(file, 'utf8');
const session = parseTranscript(raw);
const { value, hits } = redactDeep(session.turns);
session.turns = value;

const payload: IngestPayload = {
  session,
  author,
  note,
  tags: tags ? tags.split(',').map((t) => t.trim()) : [],
};

const r = await fetch(`${SERVER}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
console.log('status', r.status, await r.text());
console.log('redaction hits:', hits);
console.log('parsed:', session.title, '| turns', session.stats.turns, '| skills', session.stats.skills, '| agents', session.stats.subagents, '| cost', session.stats.estimatedCostUsd);
