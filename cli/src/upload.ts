// The one upload path shared by the Stop-hook sync, backfill and the SessionStart catch-up:
// read a transcript (+ its subagent transcripts), redact, POST, honor a server tombstone.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { AccountIdentity, IngestPayload, ParsedSession, SubagentTranscript } from '@claudelens/shared';
import { type ClaudeLensConfig, updateConfig } from './config.js';

const UPLOAD_TIMEOUT_MS = 15_000;

/** Subagent transcripts Claude Code writes beside a session:
 *  `<projectDir>/<sessionId>/subagents/agent-*.jsonl` + `agent-*.meta.json`. Missing dir → []. */
export async function readSubagents(transcriptPath: string): Promise<SubagentTranscript[]> {
  const dir = join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  let names: string[];
  try {
    names = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const out: SubagentTranscript[] = [];
  for (const f of names) {
    try {
      const jsonl = await readFile(join(dir, f), 'utf8');
      let meta: SubagentTranscript['meta'];
      try {
        meta = JSON.parse(await readFile(join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
      } catch {
        /* no / unreadable meta — the parser falls back to 'unknown' */
      }
      out.push({ meta, jsonl });
    } catch {
      /* unreadable subagent file — skip it, never fail the parent session */
    }
  }
  return out;
}

export async function parseSessionFile(path: string): Promise<ParsedSession> {
  const [jsonl, subagents] = await Promise.all([readFile(path, 'utf8'), readSubagents(path)]);
  return parseTranscript(jsonl, { subagents });
}

/**
 * Redact (when cfg.redact) and POST one parsed session. Resolves true when the server accepted it
 * (including `stale: true` — it already holds a newer copy). A tombstoned session/project comes back
 * `200 {ignored, untrack}`; that is recorded in the local opt-out lists and resolves false.
 */
/** Transient-status retries per upload (backoff 0.5s → 8s). */
const RETRIES = 5;

export async function uploadSession(
  session: ParsedSession,
  cfg: ClaudeLensConfig,
  author: string,
  account: AccountIdentity | undefined,
): Promise<boolean> {
  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    session.title = redactDeep(session.title).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }

  const payload: IngestPayload = { session, author, account };
  const body = JSON.stringify(payload);
  // 429/503 are transient (nginx rate limit during a bulk backfill, a deploy restart): back off
  // and retry instead of counting the session as failed. Before this, a sync-history run lost a
  // quarter of its uploads to the rate limit.
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${cfg.server}/api/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if ((res.status !== 429 && res.status !== 503) || attempt >= RETRIES) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt + Math.random() * 250;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 10_000)));
  }
  if (!res.ok) throw new Error(`server responded ${res.status}`);

  // A deleted session/project is tombstoned server-side; the server tells us
  // here instead of a 4xx (fire-and-forget hook) so we stop re-uploading it.
  const reply = (await res.json().catch(() => undefined)) as
    | { ignored?: boolean; untrack?: { sessionId?: string; cwd?: string } }
    | undefined;
  if (reply?.ignored) {
    const { sessionId, cwd } = reply.untrack ?? {};
    if (sessionId || cwd) {
      await updateConfig((c) => {
        if (sessionId && !c.ignoreSessions.includes(sessionId)) c.ignoreSessions.push(sessionId);
        else if (cwd && !c.ignoreProjects.includes(cwd)) c.ignoreProjects.push(cwd);
      });
    }
    return false;
  }
  return true;
}
