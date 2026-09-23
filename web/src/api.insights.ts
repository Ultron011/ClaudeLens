// Fetchers + response types for /api/insights/* (decision log, tool reliability, agents & skills).
// Kept apart from api.ts so the insights pages own their surface. Same error contract: a failed
// call throws ApiError carrying the server's `{error}` message.
import { ApiError } from './api.js';

/** Scope shared by every insights endpoint (same semantics as /api/analytics). */
export interface InsightScope {
  identity?: string;
  project?: string;
  from?: string;
  to?: string;
}

async function get<T>(path: string, params: object, signal?: AbortSignal): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  const r = await fetch(`${path}?${q}`, { signal });
  if (!r.ok) {
    let msg = r.statusText || `HTTP ${r.status}`;
    try {
      const body = (await r.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // non-JSON error body — keep the status text
    }
    if (r.status === 429) msg = 'Too many requests — slow down and try again in a moment';
    throw new ApiError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type PickKind = 'recommended' | 'option' | 'custom' | 'unanswered';

export interface DecisionQuestion {
  question: string;
  header?: string;
  options: string[];
  multiSelect?: boolean;
  answer?: string;
  notes?: string;
  /** Option labels the answer resolved to (exact label, or ", "-joined multi-select picks). */
  picked: string[];
  /** Whatever part of the answer matched no option — the user's own "Other" text. */
  custom?: string;
  pick: PickKind;
  /** One of the options carried a "(Recommended)" label. */
  offeredRecommended: boolean;
}

export interface Decision {
  id: string;
  /** sessions.id — link as `/session/<sessionId>#t-<turnIndex>`. */
  sessionId: string;
  title: string;
  author: string;
  identity: string;
  label: string;
  project: string | null;
  turnIndex: number;
  timestamp: string | null;
  dismissed: boolean;
  denied: string | null;
  questions: DecisionQuestion[];
}

export interface DecisionStats {
  calls: number;
  questions: number;
  answered: number;
  dismissed: number;
  withNotes: number;
  recommended: number;
  option: number;
  custom: number;
  offeredRecommended: number;
  pickedWhenOffered: number;
}

export interface DecisionsResponse {
  coverage: { calls: number; withData: number };
  stats: DecisionStats;
  projects: Array<{ project: string; decisions: number }>;
  total: number;
  items: Decision[];
  hasMore: boolean;
}

export const getDecisions = (
  scope: InsightScope & { q?: string; notes?: boolean; limit?: number; offset?: number },
  signal?: AbortSignal,
) => get<DecisionsResponse>('/api/insights/decisions', scope, signal);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolRow {
  tool: string;
  /** MCP server for `mcp__<server>__<tool>` names, else null. */
  server: string | null;
  uses: number;
  sessions: number;
  /** Uses inside sessions that carry failure data (parser v7+) — the failure-rate denominator. */
  trackedUses: number;
  errors: number;
  failureRate: number | null;
  denials: number;
  denialKinds: Record<string, number>;
}

export interface McpServerRow {
  server: string;
  tools: number;
  uses: number;
  trackedUses: number;
  errors: number;
  denials: number;
  failureRate: number | null;
}

export interface ToolsResponse {
  coverage: { sessions: number; tracked: number; trackedSince: string | null };
  totals: { uses: number; trackedUses: number; errors: number; denials: number; failureRate: number | null };
  tools: ToolRow[];
  mcpServers: McpServerRow[];
  denials: Array<{ kind: string; count: number; sessions: number }>;
  weekly: Array<{ week: string; uses: number; errors: number; failureRate: number | null }>;
  trendTools: string[];
  weeklyByTool: Array<{ week: string; tool: string; uses: number; errors: number; failureRate: number | null }>;
}

export const getToolInsights = (scope: InsightScope, signal?: AbortSignal) =>
  get<ToolsResponse>('/api/insights/tools', scope, signal);

// ---------------------------------------------------------------------------
// Agents & skills
// ---------------------------------------------------------------------------

export interface PersonUse {
  identity: string;
  label: string;
  author: string;
  uses: number;
}

export interface SubagentRow {
  type: string;
  /** Agent/Task calls in the main transcript. */
  runs: number;
  sessions: number;
  people: PersonUse[];
  /** From stats.subagentUsage (parser v7+ only). */
  trackedRuns: number;
  tokens: number;
  cost: number;
  toolCalls: number;
  lastUsed: string | null;
}

export interface SkillRow {
  skill: string;
  uses: number;
  sessions: number;
  people: PersonUse[];
  lastUsed: string | null;
}

export interface AgentsResponse {
  coverage: { sessions: number; tracked: number };
  subagents: SubagentRow[];
  skills: SkillRow[];
  skillWeekly: Array<{ week: string; skill: string; uses: number }>;
  people: Array<{ identity: string; label: string; author: string }>;
}

export const getAgentInsights = (scope: InsightScope, signal?: AbortSignal) =>
  get<AgentsResponse>('/api/insights/agents', scope, signal);
