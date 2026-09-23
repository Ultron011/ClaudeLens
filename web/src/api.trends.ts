// Client for /api/trends/* (server/src/trends.ts). Kept apart from api.ts so the two can evolve
// independently. Same error handling: non-2xx → ApiError with the server's `{error}` message.
import { ApiError, type AnalyticsModel } from './api.js';

export interface TrendScope {
  /** coalesced person key (account email or author) — same as /api/analytics */
  identity?: string;
  /** exact raw author string — same scope as /api/projects */
  author?: string;
  project?: string;
  from?: string;
  to?: string;
  /** only parser v7+ rows (costs before plugin 0.7 are ~5x inflated) */
  resynced?: boolean;
}

export interface EfficiencyPoint {
  period: string;
  sessions: number;
  messages: number;
  cost: number;
  tokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costPerMessage: number | null;
  tokensPerMessage: number | null;
  cacheHitRate: number | null;
}
export interface ModelPeriod {
  /** session messages allocated by this model's share of assistant turns */
  messages: number;
  cost: number;
  tokens: number;
  /** null when the rows had no per-model token breakdown (parser < v5) */
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
}
export interface Efficiency {
  tz: 'UTC';
  bucket: 'day' | 'week';
  attribution: 'session start';
  coverage: { sessions: number; resynced: number };
  points: EfficiencyPoint[];
  models: AnalyticsModel[];
  byModel: Record<string, Array<ModelPeriod | null>>;
}

export interface PeriodTotals {
  from: string;
  to: string;
  sessions: number;
  people: number;
  turns: number;
  userMessages: number;
  tokens: number;
  cost: number;
}
export interface Compare {
  current: PeriodTotals;
  previous: PeriodTotals;
}

export interface Activity {
  tz: string;
  weekStartsOn: 'monday';
  prompts: number;
  sessions: number;
  /** [isoDow-1 (Mon=0)][hour 0-23] prompt counts in `tz` */
  hours: number[][];
  calendar: { tz: 'UTC'; from: string; to: string; days: Array<{ day: string; messages: number; sessions: number }> };
}

export interface Profile {
  sessions: number;
  medianDurationMs: number | null;
  medianPrompts: number | null;
  autoSessions: number;
  autoShare: number | null;
  interrupts: number;
  interruptsPerSession: number | null;
  compactions: number;
  rateLimitHits: number;
  v7Sessions: number;
  lines: { added: number; removed: number; sessions: number };
  models: AnalyticsModel[];
  tools: Array<{ tool: string; uses: number }>;
  skills: Array<{ skill: string; uses: number }>;
}

export interface Sparklines {
  tz: 'UTC';
  by: 'author' | 'project';
  metric: string;
  days: string[];
  truncated: boolean;
  series: Array<{ key: string; values: number[]; total: number }>;
}

export interface FilesTouched {
  coverage: { sessions: number; covered: number };
  files: Array<{ path: string; sessions: number; reads: number; edits: number; writes: number }>;
}

async function get<T>(path: string, params: object, signal?: AbortSignal): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  const r = await fetch(`/api/trends/${path}?${q}`, { signal });
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

export const getEfficiency = (s: TrendScope, signal?: AbortSignal) => get<Efficiency>('efficiency', s, signal);
export const getCompare = (s: TrendScope, signal?: AbortSignal) => get<Compare>('compare', s, signal);
export const getProfile = (s: TrendScope, signal?: AbortSignal) => get<Profile>('profile', s, signal);
export const getFilesTouched = (s: TrendScope & { limit?: number }, signal?: AbortSignal) =>
  get<FilesTouched>('files', s, signal);
export const getSparklines = (
  s: TrendScope & { by: 'author' | 'project'; metric?: string; limit?: number },
  signal?: AbortSignal,
) => get<Sparklines>('sparklines', s, signal);
export const getActivity = (s: TrendScope & { tz?: string; weeks?: number }, signal?: AbortSignal) =>
  get<Activity>('activity', s, signal);

/** The viewer's IANA zone ("Asia/Kolkata"); the server validates it and buckets with AT TIME ZONE,
 *  which gets half-hour offsets (IST +5:30) and DST right — never shift hours client-side. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
