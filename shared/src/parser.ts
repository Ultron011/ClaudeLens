// Parse a Claude Code JSONL transcript into a normalized ParsedSession with
// learning-oriented stats. Tolerant of unknown line types and format drift.
import type {
  AskedQuestion,
  ContentBlock,
  DailyStats,
  ModelUsage,
  ParseOptions,
  ParsedSession,
  PermissionMode,
  RawEntry,
  SessionStats,
  SubagentUsage,
  ToolCall,
  Turn,
} from './types.js';
import { costForUsage } from './pricing.js';
import { redactText } from './redact.js';

/** Backfill ledger key: bump this when the parser's output shape changes so old sessions
 *  auto-re-sync instead of being skipped forever. */
export const PARSER_VERSION = 8;

/** Tool input kept per call. Large enough for real multi-line commands (heredocs, scripts) — the
 *  dashboard shows the first line and expands to the rest — while file bodies stay excluded by
 *  NEVER below. Was 300 with whitespace flattened, which made "expand" show a truncated blob. */
const ARG_CAP = 4000;

/** The one-or-two input fields that identify an invocation. `[]` = explicit opt-out.
 *  Unlisted tools fall through to the generic first-string rule. */
const ARG_FIELDS: Record<string, string[]> = {
  Bash: ['command'],
  BashOutput: ['bash_id'],
  KillShell: ['shell_id'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  ToolSearch: ['query'],
  Read: ['file_path'],
  Write: ['file_path'],
  Edit: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path', 'file_path'],
  Glob: ['pattern', 'path'],
  Grep: ['pattern', 'path'],
  Task: ['subagent_type', 'description'],
  Agent: ['subagent_type', 'description'],
  Skill: ['skill', 'args'],
  TodoWrite: [],
  ExitPlanMode: [],
};

/** Fields that are (or can be) file bodies, diffs, or whole prompts. Never summarized, not even
 *  under the generic rule. */
const NEVER =
  /^(content|contents|new_string|old_string|file_text|body|prompt|text|patch|diff|edits|todos|snippet|replace_all)$/i;

/** Bounded, single-line, ALWAYS-redacted summary of a tool invocation. Redaction is unconditional
 *  here (not gated on cfg.redact) because these strings are command lines — the single most likely
 *  place for a secret. */
export function summarizeToolArgs(
  name: string,
  input?: Record<string, unknown>,
): string | undefined {
  if (!input) return undefined;
  const fields = ARG_FIELDS[name];
  const parts: string[] = [];
  if (fields) {
    // Known tool: emit the bare value. The tool name already says what the field is, so
    // "Bash · cat foo" beats "Bash · command=cat foo" — the point is to read the command.
    for (const f of fields) {
      const v = input[f];
      if (v === undefined || v === null) continue;
      parts.push(String(v));
    }
  } else {
    // Unknown / MCP tool: every scalar field as `key=value`, one per line — nothing else tells
    // you what a value means. The first one is what the collapsed row shows.
    for (const [k, v] of Object.entries(input)) {
      if (NEVER.test(k)) continue;
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
      parts.push(`${k}=${v}`);
    }
  }
  if (!parts.length) return undefined;
  // Known tools join their 1-2 fields on one line ("pattern path"); MCP fields get a line each.
  // Line breaks inside a value are kept — a heredoc should expand as the script it is.
  let joined = parts
    .join(fields ? ' ' : '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!joined) return undefined;
  // Redact BEFORE truncating: a cut through the middle of a secret could dodge its pattern.
  joined = redactText(joined).text;
  if (joined.length > ARG_CAP) joined = joined.slice(0, ARG_CAP - 1) + '…';
  return joined;
}

function asBlocks(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content;
}

/** Pull a human-meaningful identifier from a Skill/Task/Agent tool call. */
function toolDetail(name: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  if (name === 'Skill') return (input.skill as string) ?? (input.command as string);
  if (name === 'Task' || name === 'Agent')
    return (input.subagent_type as string) ?? (input.description as string);
  return undefined;
}

// Claude Code injects content into user turns that the human never typed:
// system reminders, slash-command wrappers, hook output, pasted command stdout,
// and a "Caveat:" advisory. We strip all of it so the transcript shows only
// what the user actually said.
// Tag names Claude Code injects: system reminders, hook output, every
// `command-*` / `local-command-*` wrapper, and `bash-*` stdio blocks.
const INJECTED_TAG_NAME =
  '(?:system-reminder|user-prompt-submit-hook|(?:local-)?command-[a-z-]+|bash-[a-z-]+)';
const INJECTED_BLOCK = new RegExp(`<(${INJECTED_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, 'g');
// Same tags but self-closing / empty, plus stray unclosed openers or closers.
const INJECTED_TAG = new RegExp(`</?${INJECTED_TAG_NAME}\\b[^>]*>`, 'g');
const CAVEAT =
  /Caveat:\s*The messages below were generated by the user while running local commands\.[\s\S]*?(?:\n\n|$)/g;
// Claude Code injects a whole skill's markdown body as a plain (untagged) user turn right after
// the <command-args> wrapper when a slash-command skill runs. Unlike the tagged scaffolding above,
// this one isn't wrapped in a recognizable tag — only this fixed preamble marks it as injected
// rather than typed, so it's excluded from firstUserPrompt (title fallback) by name, not stripped.
const SKILL_BODY_PREFIX = /^Base directory for this skill:\s*\S+/;

/** Strip Claude-Code-injected scaffolding from a user turn's text. */
function cleanUserText(text: string): string {
  return text
    .replace(INJECTED_BLOCK, '')
    .replace(CAVEAT, '')
    .replace(INJECTED_TAG, '')
    .trim();
}

/** The questions half of an AskUserQuestion call; answers are filled in by applyAnswers(). */
function askedQuestions(input?: Record<string, unknown>): AskedQuestion[] | undefined {
  if (!Array.isArray(input?.questions)) return undefined;
  const out: AskedQuestion[] = [];
  for (const q of input.questions as Record<string, unknown>[]) {
    if (typeof q?.question !== 'string') continue;
    out.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : undefined,
      options: Array.isArray(q.options)
        ? (q.options as { label?: unknown }[])
            .map((o) => (typeof o?.label === 'string' ? o.label : ''))
            .filter(Boolean)
        : [],
      multiSelect: q.multiSelect === true || undefined,
    });
  }
  return out.length ? out : undefined;
}

/** Join the user's reply onto the call it answers. Both maps are keyed by question text. */
function applyAnswers(tc: ToolCall, result: unknown, isError?: boolean) {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
  const answers = r?.answers as Record<string, unknown> | undefined;
  const notes = r?.annotations as Record<string, { notes?: unknown } | undefined> | undefined;
  if (!answers || typeof answers !== 'object') {
    if (isError) tc.declined = true;
    return;
  }
  for (const q of tc.questions ?? []) {
    const a = answers[q.question];
    if (typeof a === 'string' && a) q.answer = a;
    const n = notes?.[q.question]?.notes;
    if (typeof n === 'string' && n.trim()) q.notes = n.trim();
  }
}

function basename(p?: string): string | undefined {
  if (!p) return undefined;
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || undefined;
}

function parseLines(jsonl: string): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const line of jsonl.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t) as RawEntry);
    } catch {
      // skip malformed lines rather than failing the whole session
    }
  }
  return entries;
}

/** Text of a user line / queued prompt, whether content is a string or blocks. */
function plainText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as ContentBlock[])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n\n');
}

const INTERRUPT = /^\[Request interrupted by user/;
const LIMIT_NOTICE = /\b(session|weekly|usage) limit\b/i;

/** Claude-Code-generated assistant lines: API error notices and "No response requested." fillers.
 *  Not model output — no usage, no model, no turn. */
const isSynthetic = (e: RawEntry, model?: string): boolean =>
  model === '<synthetic>' || e.isApiErrorMessage === true;

export function parseTranscript(jsonl: string, opts: ParseOptions = {}): ParsedSession {
  const entries = parseLines(jsonl);

  const turns: Turn[] = [];
  const toolUsage: Record<string, number> = {};
  const toolErrors: Record<string, number> = {};
  const toolDenials: Record<string, number> = {};
  const skills = new Set<string>();
  const subagents = new Set<string>();
  const models = new Set<string>();
  const modelUsage: Record<string, ModelUsage> = {};
  const daily: Record<string, DailyStats> = {};
  // Every tool call by tool_use id, awaiting its tool_result (which arrives in a later user line).
  const callsById = new Map<string, ToolCall>();
  // Task/Agent tool_use id -> subagent type, to name a subagent transcript lacking meta.agentType.
  const agentTypeById = new Map<string, string>();
  // One API message is written as one assistant line PER content block, all sharing message.id
  // and carrying the same usage. Usage is counted once per id; the lines merge into one Turn.
  const seenUsage = new Set<string>();
  const turnByMessage = new Map<string, Turn>();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let estimatedCostUsd = 0;
  let interrupts = 0;
  let compactions = 0;
  let apiErrors = 0;
  let rateLimitHits = 0;
  // cost-state is cumulative within one process run (keyed by startTime); runs are independent.
  const costRuns = new Map<number, { costUsd: number; linesAdded: number; linesRemoved: number }>();

  let sessionId = '';
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let version: string | undefined;
  let title = '';
  let firstUserPrompt: string | undefined;
  const timestamps: string[] = [];

  const ensureModel = (m: string): ModelUsage =>
    (modelUsage[m] ??= { turns: 0, totalTokens: 0, costUsd: 0, activeMs: 0, measured: true, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const ensureDay = (d: string): DailyStats =>
    (daily[d] ??= { turns: 0, userMessages: 0, totalTokens: 0, costUsd: 0, activeMs: 0 });

  /** Fold one API message's usage into session totals, modelUsage and daily. Returns what it added.
   *  Shared by the main transcript and subagent transcripts. */
  const addUsage = (e: RawEntry, model: string | undefined): { tokens: number; cost: number } => {
    const u = e.message?.usage;
    const key = e.message?.id ?? e.requestId;
    if (!u || (key && seenUsage.has(key))) return { tokens: 0, cost: 0 };
    if (key) seenUsage.add(key);
    const tokens =
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    const cost = costForUsage(model, u);
    inputTokens += u.input_tokens ?? 0;
    outputTokens += u.output_tokens ?? 0;
    cacheReadTokens += u.cache_read_input_tokens ?? 0;
    cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    estimatedCostUsd += cost;

    const mu = ensureModel(model ?? '(unknown)');
    mu.totalTokens += tokens;
    mu.costUsd += cost;
    mu.inputTokens += u.input_tokens ?? 0;
    mu.outputTokens += u.output_tokens ?? 0;
    mu.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    mu.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    const day = e.timestamp?.slice(0, 10);
    if (day) ensureDay(day).totalTokens += tokens;
    if (day) ensureDay(day).costUsd += cost;
    return { tokens, cost };
  };

  // A `type:"user"` line isn't always something a person typed: Claude Code also injects
  // task-notification-style origins, `promptSource:"system"` prompts, and meta lines. All three
  // are excluded from `userMessages`; `suggestion_accepted` stays IN — the human did accept it.
  const isGenuineHumanTurn = (e: RawEntry): boolean =>
    !(e.origin?.kind && e.origin.kind !== 'human') &&
    e.promptSource !== 'system' &&
    e.isMeta !== true;
  let userMessages = 0;

  // A prompt typed while Claude is mid-turn is logged as a `queued_command` attachment. Usually it
  // is ALSO replayed later as a normal `user` line; only when it never is does the attachment
  // stand in for it. Pre-scan so that check is a lookup, not a rescan per attachment.
  const userTextsAfter: { index: number; text: string }[] = [];
  entries.forEach((e, index) => {
    if (e.type === 'user' && e.message) userTextsAfter.push({ index, text: plainText(e.message.content) });
  });
  const replayedLater = (index: number, prompt: string): boolean =>
    userTextsAfter.some((u) => u.index > index && u.text.includes(prompt));

  // Permission-mode timeline. `permission-mode` lines carry no timestamp, so file order is the
  // only signal — a `user` line's own `permissionMode` (set only on a human-typed prompt) is the
  // authoritative per-turn sample; the dedicated lines just seed state at session start/resume.
  let currentMode: PermissionMode | undefined;
  const modeOrder: PermissionMode[] = [];
  const noteMode = (m: PermissionMode) => {
    currentMode = m;
    if (!modeOrder.includes(m)) modeOrder.push(m);
  };

  // ponytail: a turn_duration is credited whole to the most recent assistant turn's model. A turn
  // that switched models mid-flight misattributes; split by output-token weight if that ever matters.
  const GAP_CAP_MS = 5 * 60 * 1000;
  let sawTurnDuration = false;
  let lastAssistant: { model: string; day?: string } | undefined;
  const addActive = (ms: number) => {
    sawTurnDuration = true;
    if (!lastAssistant) return;
    ensureModel(lastAssistant.model).activeMs += ms;
    if (lastAssistant.day) ensureDay(lastAssistant.day).activeMs += ms;
  };

  const pushUserTurn = (e: RawEntry, text: string, toolCalls: ToolCall[] = []) => {
    const day = e.timestamp?.slice(0, 10);
    if (day) ensureDay(day).turns += 1;
    if (isGenuineHumanTurn(e)) {
      userMessages += 1;
      if (day) ensureDay(day).userMessages += 1;
    }
    turns.push({
      role: 'user',
      timestamp: e.timestamp,
      text,
      toolCalls,
      isSidechain: e.isSidechain,
      permissionMode: currentMode,
    });
  };

  for (const [index, e] of entries.entries()) {
    if (e.sessionId && !sessionId) sessionId = e.sessionId;
    if (e.cwd && !cwd) cwd = e.cwd;
    if (e.gitBranch && !gitBranch) gitBranch = e.gitBranch;
    if (e.version && !version) version = e.version;
    if (e.type === 'ai-title' && e.aiTitle) title = e.aiTitle;

    // Side channels: state lines Claude Code writes between turns. Not conversation turns, so
    // they never reach `turns` — read for metadata, then skipped by the guard below.
    if (e.type === 'permission-mode') {
      if (e.permissionMode) noteMode(e.permissionMode);
      continue;
    }
    if (e.type === 'system') {
      if (e.subtype === 'turn_duration' && typeof e.durationMs === 'number') addActive(e.durationMs);
      if (e.subtype === 'compact_boundary') compactions++;
      continue;
    }
    if (e.type === 'cost-state') {
      if (typeof e.totalCostUSD === 'number') {
        costRuns.set(e.startTime ?? 0, {
          costUsd: e.totalCostUSD,
          linesAdded: e.totalLinesAdded ?? 0,
          linesRemoved: e.totalLinesRemoved ?? 0,
        });
      }
      continue;
    }
    if (e.type === 'attachment') {
      const a = e.attachment;
      if (a?.type === 'queued_command' && a.commandMode === 'prompt' && a.origin?.kind === 'human') {
        const raw = plainText(a.prompt).trim();
        const text = cleanUserText(raw);
        if (text && !replayedLater(index, raw)) {
          if (e.timestamp) timestamps.push(e.timestamp);
          if (!firstUserPrompt && !SKILL_BODY_PREFIX.test(text)) firstUserPrompt = text;
          pushUserTurn(e, text);
        }
      }
      continue;
    }
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    const msg = e.message;
    if (!msg) continue;

    // Compaction summaries are written as `user` lines but were never typed — drop them outright.
    if (e.type === 'user' && (e.isCompactSummary || e.isVisibleInTranscriptOnly)) continue;

    const model = msg.model ?? e.model;
    if (e.type === 'assistant' && isSynthetic(e, model)) {
      if (e.isApiErrorMessage) {
        apiErrors++;
        if (LIMIT_NOTICE.test(plainText(msg.content))) rateLimitHits++;
      }
      continue;
    }

    if (e.type === 'user' && e.permissionMode) noteMode(e.permissionMode);

    const blocks = asBlocks(msg.content);
    if (model) models.add(model);
    if (e.timestamp) timestamps.push(e.timestamp);
    const day = e.timestamp?.slice(0, 10);

    // token accounting (assistant turns carry usage) — once per API message, not per line
    if (e.type === 'assistant') addUsage(e, model);

    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const b of blocks) {
      if (b.type === 'text' && b.text) textParts.push(b.text);
      else if (b.type === 'thinking' && b.thinking) thinkingParts.push(b.thinking);
      else if (b.type === 'tool_use' && b.name) {
        toolUsage[b.name] = (toolUsage[b.name] ?? 0) + 1;
        const detail = toolDetail(b.name, b.input);
        if (b.name === 'Skill' && detail) skills.add(detail);
        if ((b.name === 'Task' || b.name === 'Agent') && detail) {
          subagents.add(detail);
          if (b.id) agentTypeById.set(b.id, detail);
        }
        const tc: ToolCall = { name: b.name, detail, args: summarizeToolArgs(b.name, b.input) };
        if (b.name === 'AskUserQuestion') tc.questions = askedQuestions(b.input);
        if (b.id) callsById.set(b.id, tc);
        toolCalls.push(tc);
      } else if (b.type === 'tool_result' && b.tool_use_id && callsById.has(b.tool_use_id)) {
        const tc = callsById.get(b.tool_use_id)!;
        callsById.delete(b.tool_use_id);
        if (tc.name === 'AskUserQuestion') applyAnswers(tc, e.toolUseResult, b.is_error);
        // A denial also comes back is_error; it's recorded as the denial, not as a tool failure.
        if (e.toolDenialKind) {
          tc.denied = e.toolDenialKind;
          toolDenials[e.toolDenialKind] = (toolDenials[e.toolDenialKind] ?? 0) + 1;
        } else if (b.is_error) {
          tc.error = true;
          toolErrors[tc.name] = (toolErrors[tc.name] ?? 0) + 1;
        }
      }
      // tool_result blocks (in user turns) are otherwise omitted from the rendered body
    }

    const rawText = textParts.join('\n\n').trim();
    // Strip injected scaffolding from user turns; keep assistant text verbatim.
    const text = e.type === 'user' ? cleanUserText(rawText) : rawText;

    if (e.type === 'user') {
      // "[Request interrupted by user…]" is Claude Code's marker, not a message: count, don't render.
      if (INTERRUPT.test(text)) {
        interrupts++;
        continue;
      }
      // capture the first real thing the user actually typed — skip injected skill bodies, which
      // read as documentation, not something worth showing as a session title.
      if (!firstUserPrompt && text && !SKILL_BODY_PREFIX.test(text)) firstUserPrompt = text;
      // skip empty turns: pure tool_result carriers, or nothing but injected system content.
      if (!text && !toolCalls.length) continue;
      pushUserTurn(e, text, toolCalls);
      continue;
    }

    const assistantModel = model ?? '(unknown)';
    lastAssistant = { model: assistantModel, day };
    if (!text && !thinkingParts.length && !toolCalls.length) continue;

    // Later content blocks of an API message already on screen: append to its Turn.
    const msgKey = msg.id ?? e.requestId;
    const prior = msgKey ? turnByMessage.get(msgKey) : undefined;
    if (prior) {
      if (text) prior.text = prior.text ? `${prior.text}\n\n${text}` : text;
      if (thinkingParts.length) {
        const th = thinkingParts.join('\n\n');
        prior.thinking = prior.thinking ? `${prior.thinking}\n\n${th}` : th;
      }
      prior.toolCalls.push(...toolCalls);
      continue;
    }

    if (day) ensureDay(day).turns += 1;
    ensureModel(assistantModel).turns += 1;
    const turn: Turn = {
      role: 'assistant',
      timestamp: e.timestamp,
      model,
      text,
      thinking: thinkingParts.length ? thinkingParts.join('\n\n') : undefined,
      toolCalls,
      isSidechain: e.isSidechain,
      permissionMode: currentMode,
    };
    if (msgKey) turnByMessage.set(msgKey, turn);
    turns.push(turn);
  }

  // Subagent transcripts (`<session>/subagents/agent-*.jsonl`): their API spend is part of this
  // session's cost, so it folds into totals/modelUsage/daily. Their turns are NOT added to
  // `turns` (payload size) and don't count toward turns/assistantTurns/modelUsage.turns.
  const subagentUsage: Record<string, SubagentUsage> = {};
  for (const sub of opts.subagents ?? []) {
    const type =
      sub.meta?.agentType ??
      (sub.meta?.toolUseId ? agentTypeById.get(sub.meta.toolUseId) : undefined) ??
      'unknown';
    const su = (subagentUsage[type] ??= { runs: 0, totalTokens: 0, costUsd: 0, toolCalls: 0 });
    su.runs += 1;
    for (const e of parseLines(sub.jsonl)) {
      if (e.type !== 'assistant' || !e.message) continue;
      const model = e.message.model ?? e.model;
      if (isSynthetic(e, model)) continue;
      if (model) models.add(model);
      const added = addUsage(e, model);
      su.totalTokens += added.tokens;
      su.costUsd += added.cost;
      for (const b of asBlocks(e.message.content)) {
        if (b.type !== 'tool_use' || !b.name) continue;
        toolUsage[b.name] = (toolUsage[b.name] ?? 0) + 1;
        su.toolCalls += 1;
      }
    }
  }
  for (const su of Object.values(subagentUsage)) su.costUsd = Math.round(su.costUsd * 10000) / 10000;

  // Fallback active-time: only when no turn_duration line existed anywhere in the transcript
  // (older Claude Code versions). Never mixed with measured data, so a session's numbers stay
  // internally consistent. This measures *latency* between turns, not real work time, and is
  // systematically smaller than turn_duration — never chart measured and fallback sessions in one
  // series without the `measured` flag.
  const activeMsMeasured = sawTurnDuration;
  if (!sawTurnDuration) {
    let prevTs: number | undefined;
    for (const t of turns) {
      const ts = t.timestamp ? new Date(t.timestamp).getTime() : undefined;
      if (t.role === 'assistant' && ts !== undefined) {
        const gap = prevTs !== undefined ? Math.min(Math.max(ts - prevTs, 0), GAP_CAP_MS) : 0;
        ensureModel(t.model ?? '(unknown)').activeMs += gap;
        const day = t.timestamp?.slice(0, 10);
        if (day) ensureDay(day).activeMs += gap;
      }
      if (ts !== undefined) prevTs = ts;
    }
    // Never mixed with measured data (invariant above), so every model in this session is fallback.
    for (const mu of Object.values(modelUsage)) mu.measured = false;
  }

  timestamps.sort();
  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];
  const durationMs =
    startedAt && endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : undefined;

  const assistantTurns = turns.filter((t) => t.role === 'assistant').length;

  let reported: SessionStats['reported'];
  if (costRuns.size) {
    reported = { costUsd: 0, linesAdded: 0, linesRemoved: 0 };
    for (const r of costRuns.values()) {
      reported.costUsd += r.costUsd;
      reported.linesAdded += r.linesAdded;
      reported.linesRemoved += r.linesRemoved;
    }
    reported.costUsd = Math.round(reported.costUsd * 10000) / 10000;
  }

  const stats: SessionStats = {
    turns: turns.length,
    userMessages,
    assistantTurns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    models: [...models],
    toolUsage,
    skills: [...skills],
    subagents: [...subagents],
    durationMs,
    firstUserPrompt: firstUserPrompt?.slice(0, 500),
    permissionModes: modeOrder,
    usedAutoMode: modeOrder.includes('auto'),
    modelUsage,
    daily,
    activeMsMeasured,
    toolErrors,
    toolDenials,
    subagentUsage,
    interrupts,
    compactions,
    apiErrors,
    rateLimitHits,
    reported,
  };

  if (!title) title = firstUserPrompt?.slice(0, 80) || `Session ${sessionId.slice(0, 8)}`;

  return {
    sessionId: sessionId || 'unknown',
    title,
    cwd,
    project: basename(cwd),
    gitBranch,
    version,
    startedAt,
    endedAt,
    stats,
    turns,
    parserVersion: PARSER_VERSION,
  };
}
