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
}

/** Token accounting emitted by the API on assistant turns. */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
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
  durationMs?: number;
  permissionMode?: PermissionMode;
  /** Present when a user turn was injected rather than typed (e.g. `task-notification`). */
  origin?: { kind?: string };
  /** e.g. `typed`, `system`, `suggestion_accepted`. */
  promptSource?: string;
  isMeta?: boolean;
  message?: {
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
}

export interface ToolCall {
  name: string;
  /** For Skill/Task/Agent calls, the skill or subagent identifier if present.
   *  `stats.skills`/`subagents` and the live server SQL depend on this exact meaning — unchanged. */
  detail?: string;
  /** Bounded, always-redacted one-line summary of the invocation's input. Purely additive. */
  args?: string;
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
