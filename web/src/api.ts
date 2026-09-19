import type { ParsedSession, SessionSummary } from '@claudelens/shared';

export interface SessionDetail extends SessionSummary {
  authorEmail?: string;
  turns: ParsedSession['turns'];
}

export interface AuthorSummary {
  author: string;
  /** coalesce(account_email, author) — the stable grouping key. Prefer this over `author` in
   *  links, since one person can have several `author` strings (git config varies per repo). */
  identity: string;
  /** Most recent account display name, else the author string. What to show a human. */
  label: string;
  orgName: string | null;
  sessions: number;
  projects: number;
  featured: number;
  cost: string | null;
  turns: number;
  /** Human-sent messages — coalesced with the legacy `userTurns` field server-side. */
  userMessages: number;
  tokens: string | null;
  autoSessions: number;
}

export interface OrgStats {
  totals: { sessions: number; authors: number; cost: string | null };
  authors: AuthorSummary[];
  skills: Array<{ skill: string; uses: number }>;
  tools: Array<{ tool: string; uses: number }>;
}

/** §2b response shape for GET /api/analytics. `daily.sessions` counts sessions *active* that
 *  day, not exclusively — it won't sum to `totals.sessions`. */
export interface AnalyticsTotals {
  sessions: number;
  turns: number;
  userMessages: number;
  tokens: number;
  cost: string | null;
}
export interface AnalyticsDaily {
  day: string;
  sessions: number;
  turns: number;
  userMessages: number;
  tokens: number;
  cost: string | null;
}
export interface AnalyticsModel {
  model: string;
  sessions: number;
  turns: number;
  activeMs: number;
  tokens: number;
  cost: string | null;
  measured: boolean;
}
export interface Analytics {
  tz: 'UTC';
  totals: AnalyticsTotals;
  daily: AnalyticsDaily[];
  models: AnalyticsModel[];
  sessions: SessionSummary[];
}

export interface ModelDetail {
  model: string;
  sessions: number;
  turns: number;
  activeMs: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: string | null;
  measured: boolean;
  avgSessionDurationMs: number | null;
}

export interface AuthorModelRow {
  identity: string;
  label: string;
  model: string;
  sessions: number;
}

export interface ModelAnalyticsTotals {
  sessions: number;
  turns: number;
  tokens: number;
  cost: string | null;
}

export interface ModelAnalytics {
  tz: 'UTC';
  totals: ModelAnalyticsTotals;
  models: ModelDetail[];
  tools: Array<{ tool: string; uses: number }>;
  permissionModes: Array<{ mode: string; sessions: number }>;
  authorModels: AuthorModelRow[];
}

export interface ListSessionsParams {
  author?: string;
  project?: string;
  identity?: string;
  autoMode?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

function qs(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  return q.toString();
}

/** Bare array response — the server keeps that shape, there is no envelope. */
export function listSessions(
  params: ListSessionsParams = {},
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  return get(`/api/sessions?${qs(params)}`, signal);
}

export const getSession = (id: string, signal?: AbortSignal) =>
  get<SessionDetail>(`/api/sessions/${id}`, signal);

export function getModelAnalytics(
  identity?: string,
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<ModelAnalytics> {
  return get(`/api/model-analytics?${qs({ identity, from, to })}`, signal);
}
export const getStats = (signal?: AbortSignal) => get<OrgStats>('/api/stats', signal);

/** Omit `identity` for org-wide analytics. */
export function getAnalytics(
  identity?: string,
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<Analytics> {
  return get(`/api/analytics?${qs({ identity, from, to })}`, signal);
}

export async function patchSession(
  id: string,
  body: { featured?: boolean; hidden?: boolean; tags?: string[] },
): Promise<SessionSummary> {
  const r = await fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteSession(id: string): Promise<void> {
  const r = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteProject(author: string, project: string): Promise<number> {
  const q = new URLSearchParams({ author, project });
  const r = await fetch(`/api/projects?${q}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  const { deleted } = (await r.json()) as { deleted: number };
  return deleted;
}
