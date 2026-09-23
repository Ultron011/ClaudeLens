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

test('summarizeToolArgs caps at 4000 chars', () => {
  const args = summarizeToolArgs('Bash', { command: 'x'.repeat(10000) });
  assert.ok(args && args.length <= 4000);
});

test('summarizeToolArgs keeps line breaks in multi-line commands', () => {
  const args = summarizeToolArgs('Bash', { command: 'cat <<EOF > f\r\nline one   \nline two\n\n\n\nEOF' });
  assert.equal(args, 'cat <<EOF > f\nline one\nline two\n\nEOF');
});

test('summarizeToolArgs lists every scalar MCP field, never a NEVER one', () => {
  const args = summarizeToolArgs('mcp__x__query', { sql: 'select 1', limit: 5, content: 'BODY', nested: { a: 1 } });
  assert.equal(args, 'sql=select 1\nlimit=5');
});

test('summarizeToolArgs redacts a secret that straddles the cap', () => {
  const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const args = summarizeToolArgs('Bash', { command: 'x'.repeat(3990) + ' ' + key });
  assert.ok(args && !args.includes('AKIA'));
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

test('an injected skill body is skipped by the firstUserPrompt title fallback', () => {
  const skillBody = line({
    message: {
      role: 'user',
      content:
        'Base directory for this skill: /home/soul/.claude/plugins/cache/claudelens/claudelens/0.5.0/skills/connect\n\nOne-time setup instructions the human never typed.',
    },
  });
  const realPrompt = line({ message: { role: 'user', content: 'actually fix the login bug' } });
  const { title, stats } = parseTranscript([skillBody, realPrompt].join('\n'));
  assert.equal(stats.firstUserPrompt, 'actually fix the login bug');
  assert.equal(title, 'actually fix the login bug');
});

test('AskUserQuestion answers and notes are joined onto the call from its tool_result', () => {
  const q1 = 'Which database?';
  const q2 = 'Which features?';
  const jsonl = [
    JSON.stringify({
      type: 'assistant', sessionId: 's', timestamp: '2026-07-09T10:00:00.000Z',
      message: { role: 'assistant', model: 'claude-opus-5-5', content: [{
        type: 'tool_use', id: 'toolu_1', name: 'AskUserQuestion',
        input: { questions: [
          { question: q1, header: 'DB', multiSelect: false,
            options: [{ label: 'Postgres', description: 'x' }, { label: 'SQLite', description: 'y' }] },
          { question: q2, header: 'Features', multiSelect: true,
            options: [{ label: 'Auth', description: 'x' }, { label: 'Billing', description: 'y' }] },
        ] },
      }] },
    }),
    JSON.stringify({
      type: 'user', sessionId: 's', timestamp: '2026-07-09T10:01:00.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'The user answered: …' }] },
      toolUseResult: {
        questions: [],
        answers: { [q1]: 'Postgres', [q2]: 'Auth, Billing' },
        annotations: { [q1]: { notes: 'we already run it in prod' } },
      },
    }),
    JSON.stringify({
      type: 'assistant', sessionId: 's', timestamp: '2026-07-09T10:02:00.000Z',
      message: { role: 'assistant', model: 'claude-opus-5-5', content: [{
        type: 'tool_use', id: 'toolu_2', name: 'AskUserQuestion',
        input: { questions: [{ question: q1, options: [{ label: 'Postgres' }] }] },
      }] },
    }),
    JSON.stringify({
      type: 'user', sessionId: 's', timestamp: '2026-07-09T10:03:00.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'rejected' }] },
    }),
  ].join('\n');
  const { turns } = parseTranscript(jsonl);
  const [first, second] = turns.map((t) => t.toolCalls[0]);
  assert.deepEqual(first.questions, [
    { question: q1, header: 'DB', options: ['Postgres', 'SQLite'], multiSelect: undefined,
      answer: 'Postgres', notes: 'we already run it in prod' },
    { question: q2, header: 'Features', options: ['Auth', 'Billing'], multiSelect: true,
      answer: 'Auth, Billing' },
  ]);
  assert.equal(first.declined, undefined);
  assert.equal(second.declined, true);
  assert.equal(second.questions?.[0].answer, undefined);
});

// ── parser v7 ──

const asst = (id: string, content: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'assistant', sessionId: 's', timestamp: '2026-07-09T10:00:00.000Z', requestId: `req_${id}`,
    message: {
      id, role: 'assistant', model: 'claude-sonnet-4-6', content,
      usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    },
    ...extra,
  });
const toolResult = (id: string, extra: Record<string, unknown> = {}, isError = false) =>
  line({ message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'x' }] }, ...extra });

test('one API message split across lines counts usage once and renders as one turn', () => {
  const jsonl = [
    line({ message: { role: 'user', content: 'go' } }),
    asst('msg_1', [{ type: 'thinking', thinking: 'hmm' }]),
    asst('msg_1', [{ type: 'text', text: 'Running it.' }]),
    asst('msg_1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
    toolResult('t1'), // a tool_result between the split lines must not break the merge
    asst('msg_1', [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/a' } }]),
    asst('msg_2', [{ type: 'text', text: 'Done.' }]),
  ].join('\n');
  const { stats, turns } = parseTranscript(jsonl);
  assert.equal(stats.totalTokens, 2 * 1110);
  assert.equal(stats.outputTokens, 200);
  assert.equal(stats.assistantTurns, 2);
  assert.equal(stats.turns, 3);
  assert.equal(stats.modelUsage['claude-sonnet-4-6'].turns, 2);
  assert.equal(stats.daily['2026-07-09'].turns, 3);
  assert.equal(turns[1].thinking, 'hmm');
  assert.equal(turns[1].text, 'Running it.');
  assert.deepEqual(turns[1].toolCalls.map((t) => t.name), ['Bash', 'Read']);
  assert.equal(stats.toolUsage.Bash, 1);
});

test('usage dedupe falls back to requestId when message.id is absent', () => {
  const noId = (text: string) => {
    const e = JSON.parse(asst('x', [{ type: 'text', text }]));
    delete e.message.id;
    return JSON.stringify(e);
  };
  const { stats } = parseTranscript([noId('a'), noId('b')].join('\n'));
  assert.equal(stats.totalTokens, 1110);
  assert.equal(stats.assistantTurns, 1);
});

test('subagent transcripts fold into totals and subagentUsage, not into turns', () => {
  const main = [
    line({ message: { role: 'user', content: 'research this' } }),
    asst('m1', [{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { subagent_type: 'Explore', description: 'look' } }]),
  ].join('\n');
  const sub = [
    JSON.stringify({ type: 'user', isSidechain: true, timestamp: '2026-07-10T01:00:00.000Z', message: { role: 'user', content: 'look' } }),
    JSON.stringify({
      type: 'assistant', isSidechain: true, timestamp: '2026-07-10T01:00:01.000Z',
      message: { id: 's1', model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id: 'x', name: 'Grep', input: { pattern: 'a' } }],
        usage: { input_tokens: 1_000_000, output_tokens: 0 } },
    }),
    JSON.stringify({
      type: 'assistant', isSidechain: true, timestamp: '2026-07-10T01:00:01.000Z',
      message: { id: 's1', model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id: 'y', name: 'Read', input: { file_path: '/b' } }],
        usage: { input_tokens: 1_000_000, output_tokens: 0 } },
    }),
  ].join('\n');
  const alone = parseTranscript(main);
  const { stats, turns } = parseTranscript(main, {
    subagents: [{ meta: { toolUseId: 'toolu_a' }, jsonl: sub }, { meta: { agentType: 'Explore' }, jsonl: '' }],
  });
  assert.equal(turns.length, alone.turns.length);
  assert.equal(stats.assistantTurns, 1);
  assert.equal(stats.totalTokens, alone.stats.totalTokens + 1_000_000);
  assert.equal(stats.modelUsage['claude-haiku-4-5'].totalTokens, 1_000_000);
  assert.equal(stats.modelUsage['claude-haiku-4-5'].turns, 0);
  assert.equal(stats.daily['2026-07-10'].totalTokens, 1_000_000);
  assert.ok(stats.models.includes('claude-haiku-4-5'));
  assert.deepEqual(stats.subagentUsage, { Explore: { runs: 2, totalTokens: 1_000_000, costUsd: 1, toolCalls: 2 } });
  assert.equal(stats.toolUsage.Grep, 1);
  assert.ok(Math.abs(stats.estimatedCostUsd - (alone.stats.estimatedCostUsd + 1)) < 0.0001);
});

test('interrupts, compaction summaries and synthetic API errors are not messages or turns', () => {
  const synthetic = (text: string, isApiErrorMessage?: boolean) =>
    JSON.stringify({
      type: 'assistant', sessionId: 's', timestamp: '2026-07-09T10:05:00.000Z', isApiErrorMessage,
      message: { id: crypto.randomUUID(), model: '<synthetic>', content: [{ type: 'text', text }], usage: { input_tokens: 0, output_tokens: 0 } },
    });
  const jsonl = [
    line({ isCompactSummary: true, isVisibleInTranscriptOnly: true,
      message: { role: 'user', content: 'This session is being continued from a previous conversation…' } }),
    line({ message: { role: 'user', content: 'real question' } }),
    line({ message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }),
    line({ message: { role: 'user', content: '[Request interrupted by user]' } }),
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' }),
    synthetic("You've hit your weekly limit · resets Sep 23", true),
    synthetic('There was an issue with the selected model', true),
    synthetic('No response requested.'),
  ].join('\n');
  const { stats, turns, title } = parseTranscript(jsonl);
  assert.equal(stats.userMessages, 1);
  assert.equal(turns.length, 1);
  assert.equal(title, 'real question');
  assert.equal(stats.interrupts, 2);
  assert.equal(stats.compactions, 1);
  assert.equal(stats.apiErrors, 2);
  assert.equal(stats.rateLimitHits, 1);
  assert.deepEqual(stats.models, []);
  assert.deepEqual(stats.modelUsage, {});
  assert.equal(stats.assistantTurns, 0);
});

test('tool_result errors and denials are joined onto their calls and counted', () => {
  const jsonl = [
    asst('m1', [
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'false' } },
      { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'rm -rf /' } },
      { type: 'tool_use', id: 't3', name: 'Read', input: { file_path: '/a' } },
    ]),
    toolResult('t1', {}, true),
    toolResult('t2', { toolDenialKind: 'automode-blocked' }, true),
    toolResult('t3'),
  ].join('\n');
  const { stats, turns } = parseTranscript(jsonl);
  const [t1, t2, t3] = turns[0].toolCalls;
  assert.equal(t1.error, true);
  assert.equal(t2.denied, 'automode-blocked');
  assert.equal(t2.error, undefined);
  assert.equal(t3.error, undefined);
  assert.equal(t3.denied, undefined);
  assert.deepEqual(stats.toolErrors, { Bash: 1 });
  assert.deepEqual(stats.toolDenials, { 'automode-blocked': 1 });
  assert.equal(t1.detail, undefined); // detail semantics unchanged
});

test('a queued prompt counts as a user turn only when it is never replayed as a user line', () => {
  const queued = (prompt: string) =>
    JSON.stringify({
      type: 'attachment', sessionId: 's', timestamp: '2026-07-09T10:01:00.000Z',
      attachment: { type: 'queued_command', commandMode: 'prompt', prompt, origin: { kind: 'human' } },
    });
  const jsonl = [
    line({ message: { role: 'user', content: 'first' } }),
    queued('also check the footer'),
    queued('and the header'),
    JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', commandMode: 'task-notification', prompt: '<task-notification/>' } }),
    line({ timestamp: '2026-07-09T10:02:00.000Z', message: { role: 'user', content: 'and the header' } }),
  ].join('\n');
  const { stats, turns } = parseTranscript(jsonl);
  assert.equal(stats.userMessages, 3);
  assert.deepEqual(turns.map((t) => t.text), ['first', 'also check the footer', 'and the header']);
  assert.equal(stats.daily['2026-07-09'].userMessages, 3);
});

test('cost-state: last line per run, summed across runs', () => {
  const cs = (startTime: number, totalCostUSD: number, added: number) =>
    JSON.stringify({ type: 'cost-state', startTime, totalCostUSD, totalLinesAdded: added, totalLinesRemoved: 1, modelUsage: {} });
  const { stats } = parseTranscript([line({}), cs(1, 0.5, 3), cs(1, 1.25, 10), cs(2, 2, 5)].join('\n'));
  assert.deepEqual(stats.reported, { costUsd: 3.25, linesAdded: 15, linesRemoved: 2 });
  assert.equal(parseTranscript(line({})).stats.reported, undefined);
});
