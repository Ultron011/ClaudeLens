// Shared types for ClaudeLens. These describe both the raw Claude Code JSONL
// shapes (loosely typed — the format evolves) and the normalized shapes we
// store and render.

/** A single content block inside an Anthropic message. */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | string;
  text?: string;
  thinking?: string;
  name?: string; // tool_use: tool name (Bash, Edit, Skill, Task, ...)
  input?: Record<string, unknown>; // tool_use input
  content?: unknown; // tool_result payload
  is_error?: boolean;
  id?: string; // tool_use: id a later tool_result points back to
  tool_use_id?: string; // tool_result: the tool_use it answers
}

/** Token accounting emitted by the API on assistant turns. */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** Cache writes split by TTL (priced 1.25× / 2× input). Absent on older transcripts. */
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
}

/** Open-ended on purpose: the binary's enum is
 *  ["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"] but it drifts between
 *  releases and "auto" has never appeared in a transcript we've seen. Never switch exhaustively. */
export type PermissionMode =
  | 'default' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk' | 'plan' | (string & {});

/** Who was signed in, read from ~/.claude.json → oauthAccount at SYNC time. Machine-global: the
 *  account active when the hook ran, not necessarily the one that produced every turn. */
export interface AccountIdentity {
  email?: string;
  displayName?: string;
  organizationName?: string;
}

/** activeMs is attributed, not measured — see parser.ts for the method and its ceiling. */
export interface ModelUsage {
  turns: number;
  totalTokens: number;
  costUsd: number;
  activeMs: number;
  /** false when activeMs came from the capped-gap fallback (no turn_duration lines). */
  measured: boolean;
  /** Per-model token breakdown — populated from parser v5+; zero on older sessions. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** One UTC calendar day of a session. Sessions span days (resumes), which is why this is
 *  per-session rather than a GROUP BY on started_at. */
export interface DailyStats {
  turns: number;
  userMessages: number;
  totalTokens: number;
  costUsd: number;
  activeMs: number;
}

/** One raw JSONL line. Only the fields we care about are typed. */
export interface RawEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  model?: string;
  aiTitle?: string;
  isSidechain?: boolean;
  subtype?: string;
  /** `type:"system"` lines' own text, e.g. a `local_command` line's `<command-name>` wrapper. */
  content?: unknown;
  durationMs?: number;
  permissionMode?: PermissionMode;
  /** Present when a user turn was injected rather than typed (e.g. `task-notification`). */
  origin?: { kind?: string };
  /** e.g. `typed`, `system`, `suggestion_accepted`. */
  promptSource?: string;
  isMeta?: boolean;
  /** Claude Code writes one assistant line per content block; the split lines share
   *  `message.id` (and `requestId`) and carry IDENTICAL usage — count it once. */
  requestId?: string;
  /** Claude-Code-generated assistant line (model `<synthetic>`), e.g. a rate-limit notice. */
  isApiErrorMessage?: boolean;
  /** Compaction summary injected as a `user` line — not something the human typed. */
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
  /** On a tool_result carrier: why the call was blocked (`user-rejected`, `automode-blocked`, …). */
  toolDenialKind?: string;
  /** `type:"attachment"` payload. Only `queued_command` is read (a prompt typed mid-turn). */
  attachment?: { type?: string; commandMode?: string; prompt?: unknown; origin?: { kind?: string } };
  /** `type:"cost-state"`: Claude Code's own running cost for one process run (`startTime`). */
  startTime?: number;
  totalCostUSD?: number;
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  /** Structured tool output Claude Code writes beside a tool_result. For AskUserQuestion:
   *  `{ questions, answers: {question: answer}, annotations: {question: {notes?, preview?}} }`. */
  toolUseResult?: unknown;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
    usage?: Usage;
  };
}

/** A normalized turn shown in the transcript viewer. */
export interface Turn {
  role: 'user' | 'assistant';
  timestamp?: string;
  model?: string;
  text: string; // concatenated text blocks (thinking excluded from body)
  thinking?: string; // concatenated thinking blocks
  toolCalls: ToolCall[];
  isSidechain?: boolean;
  permissionMode?: PermissionMode;
  /** User-role turn that no person typed (task notifications, agent messages, system prompts) —
   *  same test as the `userMessages` count. v9+; absent = unknown on older rows. */
  injected?: boolean;
}

export interface ToolCall {
  name: string;
  /** For Skill/Task/Agent calls, the skill or subagent identifier if present.
   *  `stats.skills`/`subagents` and the live server SQL depend on this exact meaning — unchanged. */
  detail?: string;
  /** Bounded, always-redacted one-line summary of the invocation's input. Purely additive. */
  args?: string;
  /** AskUserQuestion only: what Claude asked, and what the user picked (parser v6+). */
  questions?: AskedQuestion[];
  /** AskUserQuestion only: the user dismissed the prompt instead of answering. */
  declined?: boolean;
  /** The tool_result came back `is_error` (and wasn't a denial — see `denied`). Parser v7+. */
  error?: boolean;
  /** The call was blocked before running: Claude Code's `toolDenialKind` (`user-rejected`,
   *  `automode-blocked`, `permission-rule`, …). Parser v7+. */
  denied?: string;
}

/** One question from an AskUserQuestion call, joined with the user's reply from its tool_result. */
export interface AskedQuestion {
  question: string;
  header?: string;
  options: string[];
  multiSelect?: boolean;
  /** Claude Code's answer string: an option label, labels joined by ", " (multiSelect), or the
   *  user's own text when they chose "Other". Absent when unanswered. */
  answer?: string;
  /** Free-text note the user attached to their selection. */
  notes?: string;
}

/** Aggregated, learning-oriented metrics for one session. */
export interface SessionStats {
  turns: number;
  /** Genuine human-typed messages — excludes system-injected/meta user turns. See parser.ts. */
  userMessages: number;
  assistantTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  models: string[];
  /** tool name -> count */
  toolUsage: Record<string, number>;
  /** skills invoked via the Skill tool */
  skills: string[];
  /** subagents invoked via Task/Agent */
  subagents: string[];
  durationMs?: number;
  firstUserPrompt?: string;
  /** every permission mode observed, in first-seen order */
  permissionModes: PermissionMode[];
  usedAutoMode: boolean;
  /** model id -> usage/cost/active-time rollup */
  modelUsage: Record<string, ModelUsage>;
  /** UTC calendar day (YYYY-MM-DD) -> rollup for that day */
  daily: Record<string, DailyStats>;
  /** false when activeMs across modelUsage came from the capped-gap fallback */
  activeMsMeasured?: boolean;
  // ── parser v7+ (absent on older rows) ──
  /** tool name -> calls whose result was an error (denials excluded) */
  toolErrors?: Record<string, number>;
  /** toolDenialKind -> count */
  toolDenials?: Record<string, number>;
  /** subagent type -> usage from `<session>/subagents/agent-*.jsonl`. Already folded into the
   *  session's token/cost totals, modelUsage and daily; kept here for the per-agent split. */
  subagentUsage?: Record<string, SubagentUsage>;
  /** `[Request interrupted by user…]` lines — not counted as userMessages */
  interrupts?: number;
  /** `system` `compact_boundary` lines */
  compactions?: number;
  /** Claude-Code-synthesized API error lines (`isApiErrorMessage`) */
  apiErrors?: number;
  /** the subset of apiErrors that were session/weekly/usage-limit notices */
  rateLimitHits?: number;
  /** Claude Code's own accounting from `cost-state` lines (last per run, summed across runs).
   *  Absent when the transcript has none. */
  reported?: { costUsd: number; linesAdded: number; linesRemoved: number };
  // ── parser v9+ (absent on older rows) ──
  /** file path -> Read / Edit+MultiEdit+NotebookEdit / Write calls (main transcript + subagents).
   *  Relative to the session cwd when under it, else absolute; '/' separators; redacted; capped at
   *  the 200 most-touched paths. */
  files?: Record<string, FileTouches>;
  /** every distinct `gitBranch` seen on transcript lines, first-seen order */
  gitBranches?: string[];
  /** slash command the human ran (incl. the leading slash, e.g. "/model", "/claudelens:status")
   *  -> count, from Claude Code's `<command-name>` wrapper */
  slashCommands?: Record<string, number>;
}

export interface FileTouches {
  reads: number;
  edits: number;
  writes: number;
}

export interface SubagentUsage {
  runs: number;
  totalTokens: number;
  costUsd: number;
  toolCalls: number;
}

/** One subagent transcript to fold into its parent session (parseTranscript's 2nd arg). */
export interface SubagentTranscript {
  /** The sibling `agent-*.meta.json`. */
  meta?: { agentType?: string; description?: string; toolUseId?: string };
  jsonl: string;
}

export interface ParseOptions {
  subagents?: SubagentTranscript[];
}

/** The normalized, uploadable session document. */
export interface ParsedSession {
  sessionId: string;
  title: string;
  cwd?: string;
  project?: string; // basename of cwd
  gitBranch?: string;
  version?: string;
  startedAt?: string;
  endedAt?: string;
  stats: SessionStats;
  turns: Turn[];
  /** Parser code version that produced this session — the backfill ledger key so a future bump
   *  auto-re-syncs old sessions instead of skipping them forever. */
  parserVersion: number;
}

/** What the CLI POSTs to the server. */
export interface IngestPayload {
  session: ParsedSession;
  author: string;
  authorEmail?: string;
  note?: string; // author's "why this is worth sharing"
  tags?: string[];
  account?: AccountIdentity;
}

/** Row shape returned by the list endpoint (no full transcript). */
export interface SessionSummary {
  id: string;
  sessionId: string;
  title: string;
  author: string;
  project?: string;
  cwd?: string;
  gitBranch?: string;
  note?: string;
  tags: string[];
  featured: boolean;
  hidden?: boolean;
  stats: SessionStats;
  startedAt?: string;
  createdAt: string;
  accountEmail?: string;
  displayName?: string;
  orgName?: string;
  usedAutoMode?: boolean;
  permissionModes?: PermissionMode[];
  parserVersion?: number;
  endedAt?: string;
}
