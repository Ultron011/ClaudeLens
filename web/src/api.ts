import type { ParsedSession, SessionSummary } from '@claudelens/shared';

export interface SessionDetail extends SessionSummary {
  authorEmail?: string;
  turns: ParsedSession['turns'];
}

export interface AuthorSummary {
  author: string;
  sessions: number;
  projects: number;
  featured: number;
  cost: string | null;
  turns: number;
}

export interface OrgStats {
  totals: { sessions: number; authors: number; cost: string | null };
  authors: AuthorSummary[];
  skills: Array<{ skill: string; uses: number }>;
  tools: Array<{ tool: string; uses: number }>;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export function listSessions(params: Record<string, string>): Promise<SessionSummary[]> {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return get(`/api/sessions?${q}`);
}

export const getSession = (id: string) => get<SessionDetail>(`/api/sessions/${id}`);
export const getStats = () => get<OrgStats>('/api/stats');

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
