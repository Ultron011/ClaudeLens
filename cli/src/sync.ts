// ClaudeLens Stop-hook sync. Invoked by Claude Code after each assistant turn
// (`claudelens sync`, fed the hook payload on stdin). If the session's project
// is tracked, it pushes the current transcript to the server. The server
// upserts on (session_id, author), so re-running every turn (and across
// resumes) just refreshes one row. Best-effort: NEVER blocks or fails a session.
import { readFile } from 'node:fs/promises';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { IngestPayload, ParsedSession } from '@claudelens/shared';
import { loadConfig, shouldTrack } from './config.js';

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stop fires the instant Claude finishes, but the final assistant message is
 * flushed to the transcript a moment later (after a burst of system /
 * file-history entries). Reading immediately would miss the reply, so we poll
 * briefly until the transcript ends with an assistant turn — capping the wait
 * so a session that legitimately ends on the user (e.g. an interrupt) still
 * syncs promptly.
 */
async function readSettledSession(path: string): Promise<ParsedSession> {
  let session = parseTranscript(await readFile(path, 'utf8'));
  for (let i = 0; i < 10; i++) {
    const last = session.turns[session.turns.length - 1];
    if (last && last.role === 'assistant') break; // reply landed
    await sleep(250);
    session = parseTranscript(await readFile(path, 'utf8'));
  }
  return session;
}

export async function runSync(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) return; // not set up — run `claudelens setup` first

  const raw = await readStdin();
  let hook: HookInput = {};
  try {
    hook = JSON.parse(raw) as HookInput;
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;

  if (!(await shouldTrack(cwd, session_id ?? '', cfg))) return; // explicitly opted out

  const session = await readSettledSession(transcript_path);
  if (!session.sessionId || session.stats.turns < 1) return;

  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }

  const payload: IngestPayload = { session, author: cfg.name };

  await fetch(`${cfg.server}/api/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}
