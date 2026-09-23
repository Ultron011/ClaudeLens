// Shared HTTP/SQL helpers for every route module (index.ts, insights.ts, trends.ts).
import type express from 'express';
import type pg from 'pg';
import { pool } from './db.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BadRequest extends Error {}

/** Query params as plain strings. `?a=1&a=2` / `?a[]=1` arrive as arrays or objects — reject them
 *  rather than letting a non-string reach SQL and surface as a 500. */
export function queryStrings(q: Record<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (typeof v !== 'string') throw new BadRequest(`query param "${k}" must be a single value`);
    out[k] = v;
  }
  return out;
}

/** An ISO-ish date for from/to; Postgres would otherwise throw on garbage and we'd 500. */
export function dateParam(name: string, v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (Number.isNaN(Date.parse(v))) throw new BadRequest(`"${name}" must be an ISO date`);
  return v;
}

export function sendError(res: express.Response, label: string, err: unknown) {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  console.error(`${label} error:`, err);
  res.status(500).json({ error: `${label} failed` });
}

/** The dashboard's "(no project)" group is a route-boundary sentinel for project IS NULL. */
export const NO_PROJECT = '(no project)';


export function summaryRow(r: any) {
  const stats = {
    ...r.stats,
    permissionModes: r.stats?.permissionModes ?? [],
    usedAutoMode: r.stats?.usedAutoMode ?? false,
    modelUsage: r.stats?.modelUsage ?? {},
    daily: r.stats?.daily ?? {},
    // Legacy rows (parser_version 0-2) have `userTurns`, not `userMessages`. Without this
    // fallback every old session would show 0 messages — worse than the inflated `turns`.
    userMessages: r.stats?.userMessages ?? r.stats?.userTurns ?? 0,
  };
  return {
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    author: r.author,
    project: r.project ?? undefined,
    cwd: r.cwd ?? undefined,
    gitBranch: r.git_branch ?? undefined,
    note: r.note ?? undefined,
    tags: r.tags ?? [],
    featured: r.featured,
    hidden: r.hidden,
    stats,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    createdAt: r.created_at,
    accountEmail: r.account_email ?? undefined,
    displayName: r.account_display_name ?? undefined,
    orgName: r.org_name ?? undefined,
    usedAutoMode: r.used_auto_mode ?? undefined,
    permissionModes: r.permission_modes ?? undefined,
    parserVersion: r.parser_version ?? undefined,
  };
}

// coalesce(account_email, author) = identity — old rows still group by author alone.
//
// The trailing `OR author = $n` is load-bearing, not redundant: `/api/stats` reports an author's
// `identity` as their account *email* once one is known, but the UI routes people by display
// name (`/u/:author`, `/analytics/u/:author`) because that's what reads in a URL and a crumb.
// Without this branch, `?identity=Saurabh` matched zero rows the moment that person had an
// account email, and the whole per-person analytics page rendered as zeros with no error.
// Accepting either key keeps both the email and the display name working as a scope.
export const IDENTITY_CLAUSE = (n: number) =>
  `(account_email = $${n} OR (account_email IS NULL AND author = $${n}) OR author = $${n})`;

// Genuine human messages, with the userTurns fallback for parser_version 0-2 rows.
export const USER_MESSAGES_EXPR =
  `coalesce((stats->>'userMessages')::int, (stats->>'userTurns')::int, 0)`;


/** ORDER BY for a `sort` param: cost|turns|messages|tokens|recent|featured, `_asc` suffix flips.
 *  Only these literals are ever interpolated — the param itself never reaches SQL. */
export function orderFor(sort: string | undefined): string {
  const DIR = (d: string) => (sort?.endsWith('_asc') ? d.replace('DESC', 'ASC') : d);
  const key = sort?.replace(/_asc$/, '');
  return (
    key === 'cost'
      ? DIR(`(stats->>'estimatedCostUsd')::float DESC NULLS LAST`)
      : key === 'turns'
        ? DIR(`(stats->>'turns')::int DESC NULLS LAST`)
        : key === 'messages'
          ? DIR(`${USER_MESSAGES_EXPR} DESC NULLS LAST`)
          : key === 'tokens'
            ? DIR(`(stats->>'totalTokens')::bigint DESC NULLS LAST`)
            : key === 'featured'
              ? 'featured DESC, started_at DESC NULLS LAST, created_at DESC'
              : DIR('started_at DESC NULLS LAST') + ', created_at DESC');
}

// One-endpoint analytics: three queries over one filtered scope, run concurrently so the daily/
// models/totals panels can never disagree. identity omitted = org-wide.
/** Shared scope for the analytics endpoints: $1 identity, $2 from, $3 to, $4 project.
 *  Every param is referenced unconditionally (and cast, so Postgres can type it) even when null:
 *  a query text that never mentions a bound $n fails with "could not determine data type". */
export function analyticsScope(req: express.Request): { args: unknown[]; scopeWhere: string } {
  const qs = queryStrings(req.query);
  const project = qs.project;
  const args: unknown[] = [
    qs.identity ?? null,
    dateParam('from', qs.from) ?? null,
    dateParam('to', qs.to) ?? null,
    project ?? null,
  ];
  const scopeWhere =
    `hidden = false AND ($1::text IS NULL OR ${IDENTITY_CLAUSE(1)})` +
    ` AND (started_at >= $2::timestamptz OR $2::timestamptz IS NULL)` +
    ` AND (started_at < $3::timestamptz OR $3::timestamptz IS NULL)` +
    ` AND ($4::text IS NULL OR project = $4 OR ($4 = '${NO_PROJECT}' AND project IS NULL))`;
  return { args, scopeWhere };
}


/** BEGIN → fn → COMMIT (fn returns true) or ROLLBACK. Every await is inside the try — a failed
 *  pool.connect() or ROLLBACK on a dead connection must answer 500, not become an unhandled
 *  rejection that kills the process. */
export async function inTransaction(
  res: express.Response,
  label: string,
  fn: (client: import('pg').PoolClient) => Promise<boolean>,
) {
  let client: import('pg').PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query((await fn(client)) ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    if (!res.headersSent) sendError(res, label, err);
    else console.error(`${label} error after response:`, err);
  } finally {
    client?.release();
  }
}

// Delete every session for one author+project (a "project" on the dashboard). Same
// same-transaction tombstone. The '(no project)' sentinel is a route-boundary concept only —
// it must not leak into the deletions table as a literal string.
