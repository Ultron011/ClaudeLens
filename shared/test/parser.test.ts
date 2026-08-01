import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTranscript, summarizeToolArgs } from '../src/parser.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, 'fixture.jsonl'), 'utf8');

// A single-line JSONL transcript that isolates one field of isGenuineHumanTurn at a time,
// so each exclusion test fails on its own if (and only if) its clause is removed from the parser —
// independent of the shared fixture's turn count.
const line = (extra: Record<string, unknown>) =>
  JSON.stringify({
    type: 'user',
    sessionId: 's',
    timestamp: '2026-07-09T10:00:00.000Z',
    message: { role: 'user', content: 'hello' },
    ...extra,
  });

test('daily totalTokens sum equals stats.totalTokens', () => {
  const { stats } = parseTranscript(fixture);
  const sum = Object.values(stats.daily).reduce((a, d) => a + d.totalTokens, 0);
  assert.equal(sum, stats.totalTokens);
});

test('sum of per-model cost is within 0.001 of estimatedCostUsd', () => {
  const { stats } = parseTranscript(fixture);
  const sum = Object.values(stats.modelUsage).reduce((a, m) => a + m.costUsd, 0);
  assert.ok(Math.abs(sum - stats.estimatedCostUsd) < 0.001, `${sum} vs ${stats.estimatedCostUsd}`);
});

// fixture.jsonl is SYNTHETIC on purpose: a real transcript would publish the author's session
// content to everyone who clones this repo, and a hand-built one lets us assert exact values and
// deliberately cover the edge cases (mode change, multi-day span, turn_duration, secret in a
// command, a NEVER field) instead of hoping a captured session happens to contain them.
test('permission-mode side-channel lines are captured in order', () => {
  const { stats } = parseTranscript(fixture);
  assert.deepEqual(stats.permissionModes, ['default', 'acceptEdits']);
  assert.equal(stats.usedAutoMode, false);
});

test('per-turn permissionMode carries forward from the last human prompt', () => {
  const { turns } = parseTranscript(fixture);
  assert.equal(turns[0].permissionMode, 'default');
  assert.equal(turns.at(-1)!.permissionMode, 'acceptEdits');
});

test('a session spanning midnight produces one daily bucket per UTC day', () => {
  const { stats } = parseTranscript(fixture);
  assert.deepEqual(Object.keys(stats.daily).sort(), ['2026-07-09', '2026-07-10']);
});

test('turn_duration lines drive activeMs and mark it measured', () => {
  const { stats } = parseTranscript(fixture);
  assert.equal(stats.activeMsMeasured, true);
  const total = Object.values(stats.modelUsage).reduce((a, m) => a + m.activeMs, 0);
  assert.equal(total, 10_000); // 6000 + 4000 from the two turn_duration lines
});

test('both models are tracked separately', () => {
  const { stats } = parseTranscript(fixture);
  assert.deepEqual(Object.keys(stats.modelUsage).sort(), ['claude-opus-4-8', 'claude-sonnet-5']);
});

test('a secret inside a real transcript command is redacted in ToolCall.args', () => {
  const { turns } = parseTranscript(fixture);
  const all = turns.flatMap((t) => t.toolCalls);
  const bash = all.find((c) => c.name === 'Bash');
  assert.ok(bash?.args, 'Bash call should have args');
  assert.ok(!bash.args.includes('SECRETVALUE'), `leaked: ${bash.args}`);
  // Write's `content` field is a NEVER field — its secret must never reach args either.
  const write = all.find((c) => c.name === 'Write');
  assert.ok(write?.args?.includes('health.ts'), 'Write args should be the file path');
  assert.ok(!write.args.includes('ANOTHER-SECRET'), `leaked: ${write.args}`);
  // No tool call anywhere may carry a NEVER-field value.
  for (const c of all) assert.ok(!c.args?.includes('never summarized'), `leaked todos: ${c.args}`);
});

test('args are populated for the tools that motivated this feature', () => {
  const { turns } = parseTranscript(fixture);
  const byName = new Map(turns.flatMap((t) => t.toolCalls).map((c) => [c.name, c.args]));
  assert.equal(byName.get('ToolSearch'), 'select:WebFetch,Monitor');
  assert.equal(byName.get('WebFetch'), 'https://docs.claude.com/en/docs/claude-code/hooks');
  assert.equal(byName.get('Read'), '/tmp/fixture-project/server/src/index.ts');
  assert.equal(byName.get('TodoWrite'), undefined); // explicit opt-out
});

test('detail semantics are unchanged — skills and subagents still populate', () => {
  const { stats } = parseTranscript(fixture);
  assert.deepEqual(stats.skills, ['claudelens:status']);
  assert.deepEqual(stats.subagents, ['Explore']);
});

test('summarizeToolArgs never leaks a NEVER field', () => {
  const args = summarizeToolArgs('Write', { file_path: 'a', content: 'SECRET' });
  assert.ok(args && !args.includes('SECRET'));
});

test('summarizeToolArgs caps at 300 chars', () => {
  const args = summarizeToolArgs('Bash', { command: 'x'.repeat(1000) });
  assert.ok(args && args.length <= 300);
});

test('summarizeToolArgs redacts a secret in a Bash command', () => {
  const args = summarizeToolArgs('Bash', { command: 'curl -H "Authorization: sk-ant-abcdefghijklmnopqrstuvwxyz"' });
  assert.ok(args && !args.includes('sk-ant-abcdefghijklmnopqrstuvwxyz'));
});

test('userMessages is tightened, well below inflated turns', () => {
  const { stats } = parseTranscript(fixture);
  assert.ok(stats.userMessages < stats.turns, `${stats.userMessages} vs ${stats.turns}`);
});

test('a task-notification origin user line is excluded from userMessages', () => {
  const { turns, stats } = parseTranscript(line({ origin: { kind: 'task-notification' } }));
  assert.ok(turns.some((t) => t.text === 'hello'), 'notification turn should still render in the transcript');
  assert.equal(stats.userMessages, 0);
});

test('a promptSource:"system" user line is excluded from userMessages', () => {
  const { stats } = parseTranscript(line({ promptSource: 'system' }));
  assert.equal(stats.userMessages, 0);
});

test('promptSource:"suggestion_accepted" IS counted — the human accepted it', () => {
  const { stats } = parseTranscript(line({ promptSource: 'suggestion_accepted' }));
  assert.equal(stats.userMessages, 1);
});

test('an isMeta:true user line is excluded from userMessages', () => {
  const { stats } = parseTranscript(line({ isMeta: true }));
  assert.equal(stats.userMessages, 0);
});

test('sum of daily userMessages equals stats.userMessages', () => {
  const { stats } = parseTranscript(fixture);
  const sum = Object.values(stats.daily).reduce((a, d) => a + d.userMessages, 0);
  assert.equal(sum, stats.userMessages);
});
