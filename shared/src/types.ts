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
}

export interface ToolCall {
  name: string;
  /** For Skill/Task/Agent calls, the skill or subagent identifier if present. */
  detail?: string;
}

/** Aggregated, learning-oriented metrics for one session. */
export interface SessionStats {
  turns: number;
  userTurns: number;
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
}

/** What the CLI POSTs to the server. */
export interface IngestPayload {
  session: ParsedSession;
  author: string;
  authorEmail?: string;
  note?: string; // author's "why this is worth sharing"
  tags?: string[];
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
}
