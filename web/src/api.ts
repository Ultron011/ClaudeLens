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
  sessionsHasMore: boolean;
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
  /** errors: failed tool_results (parser v7+ sessions only — a floor until older rows re-sync). */
  tools: Array<{ tool: string; uses: number; errors: number }>;
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
  /** Matches title, note, author and project (substring). */
  q?: string;
  /** Also word-match `q` inside transcripts (server GIN index). */
  inTranscript?: boolean;
  featured?: boolean;
  includeHidden?: boolean;
  /** cost | turns | messages | tokens | recent | featured, optional `_asc` suffix. */
  sort?: string;
}

/** One person's projects, aggregated server-side (GET /api/projects). */
export interface ProjectRollup {
  project: string;
  sessions: number;
  turns: number;
  messages: number;
  tokens: string | number;
  cost: string | null;
  lastActivity?: string;
  skills: string[];
}
export interface ProjectsResponse {
  totals: {
    sessions: number;
    projects: number;
    turns: number;
    messages: number;
    tokens: string | number;
    cost: string | null;
  };
  projects: ProjectRollup[];
  skills: Array<{ skill: string; uses: number }>;
}

/** A failed API call with its HTTP status and the server's `{error}` message, so pages can say
 *  "this session was deleted" instead of printing a raw `404 {"error":…}`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function check(r: Response): Promise<Response> {
  if (r.ok) return r;
  let msg = r.statusText || `HTTP ${r.status}`;
  try {
    const body = (await r.json()) as { error?: string };
    if (body?.error) msg = body.error;
  } catch {
    // non-JSON error body (proxy page, etc.) — keep the status text
  }
  if (r.status === 429) msg = 'Too many requests — slow down and try again in a moment';
  throw new ApiError(r.status, msg);
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await check(await fetch(url, { signal }));
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
  opts?: { limit?: number; offset?: number; sort?: string; project?: string },
): Promise<Analytics> {
  return get(
    `/api/analytics?${qs({
      identity,
      from,
      to,
      project: opts?.project,
      sessionLimit: opts?.limit,
      sessionOffset: opts?.offset,
      sessionSort: opts?.sort,
    })}`,
    signal,
  );
}

export function getProjects(
  author: string,
  from?: string,
  to?: string,
  signal?: AbortSignal,
): Promise<ProjectsResponse> {
  return get(`/api/projects?${qs({ author, from, to })}`, signal);
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
  await check(r);
  return r.json();
}

export async function deleteSession(id: string): Promise<void> {
  await check(await fetch(`/api/sessions/${id}`, { method: 'DELETE' }));
}

export async function deleteProject(author: string, project: string): Promise<number> {
  const q = new URLSearchParams({ author, project });
  const r = await check(await fetch(`/api/projects?${q}`, { method: 'DELETE' }));
  const { deleted } = (await r.json()) as { deleted: number };
  return deleted;
}
