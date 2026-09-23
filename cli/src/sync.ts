// ClaudeLens Stop-hook sync. Invoked by Claude Code after each assistant turn
// (`claudelens sync`, fed the hook payload on stdin). If the session's project
// is tracked, it pushes the current transcript to the server. The server
// upserts on (session_id, author), so re-running every turn (and across
// resumes) just refreshes one row. Best-effort: NEVER blocks or fails a session.
//
// Claude Code waits on the hook, so the hook itself only reads stdin, re-spawns
// this bundle detached (`sync --detached`, payload in CLAUDELENS_HOOK_PAYLOAD)
// and exits; the detached child does the settle wait, parse and upload.
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { parseTranscript, PARSER_VERSION } from '@claudelens/shared';
import type { ParsedSession } from '@claudelens/shared';
import {
  type ClaudeLensConfig,
  loadConfig,
  shouldSync,
  resolveName,
  updateConfig,
  recordSynced,
  recordSyncAttempt,
  describeError,
  envOptedOut,
  isConnected,
} from './config.js';
import { readAccount } from './account.js';
import { readSubagents, uploadSession } from './upload.js';

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
}

const PAYLOAD_ENV = 'CLAUDELENS_HOOK_PAYLOAD';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Re-run this bundle as a detached background process so the hook returns immediately.
 *  Returns false if the spawn itself failed (caller then runs inline). */
export function spawnDetached(op: string, env: Record<string, string> = {}): boolean {
  try {
    const child = spawn(process.execPath, [process.argv[1], op, '--detached'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...env },
    });
    child.on('error', () => {}); // an async spawn failure must not crash the hook
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export const isDetached = () => process.argv.includes('--detached');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The last non-empty JSONL line, parsed (undefined if unparseable). */
function lastEntry(raw: string): { type?: string; subtype?: string } | undefined {
  const end = raw.trimEnd();
  try {
    return JSON.parse(end.slice(end.lastIndexOf('\n') + 1));
  } catch {
    return undefined;
  }
}

/**
 * Stop fires the instant Claude finishes, but the final assistant message and the turn's
 * bookkeeping are flushed to the transcript a moment later. Once the hook has returned, Claude Code
 * closes the turn with `system` `stop_hook_summary` / `turn_duration` lines — seeing either at the
 * tail means the turn is fully on disk, so stop waiting. Capped, so a session that ends oddly (an
 * interrupt, or running inline where those lines can't arrive until we exit) still syncs.
 */
async function readSettledSession(path: string, inline: boolean): Promise<{ session: ParsedSession; mtime: number }> {
  const subagents = await readSubagents(path);
  let mtime = (await stat(path)).mtimeMs;
  let raw = await readFile(path, 'utf8');
  for (let i = 0; i < (inline ? 4 : 20); i++) {
    const tail = lastEntry(raw);
    if (tail?.type === 'system' && (tail.subtype === 'stop_hook_summary' || tail.subtype === 'turn_duration')) break;
    if (inline && tail?.type === 'assistant') break; // reply landed; the closing lines wait on us
    await sleep(250);
    mtime = (await stat(path)).mtimeMs;
    raw = await readFile(path, 'utf8');
  }
  return { session: parseTranscript(raw, { subagents }), mtime };
}

export async function runSync(): Promise<void> {
  let hook: HookInput = {};
  try {
    hook = JSON.parse(isDetached() ? (process.env[PAYLOAD_ENV] ?? '') : await readStdin()) as HookInput;
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;

  if (!isDetached()) {
    // Cheap global switches first, so a paused / disconnected machine doesn't even spawn.
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused || envOptedOut()) return;
    // Only the fields we use: the Stop payload can carry the whole last message (env size limit).
    if (spawnDetached('sync', { [PAYLOAD_ENV]: JSON.stringify({ transcript_path, cwd, session_id }) })) return;
  }
  await syncNow(transcript_path, cwd, session_id, !isDetached());
}

async function syncNow(transcriptPath: string, cwd: string, sessionId: string | undefined, inline: boolean) {
  const cfg = await loadConfig();
  // Tracking is on by default; sync unless something opted this out.
  if (!(await shouldSync(cwd, sessionId, cfg))) return;

  const { session, mtime } = await readSettledSession(transcriptPath, inline);
  if (!session.sessionId || session.stats.turns < 1) return;
  // The transcript's own id is authoritative — re-check per-session opt-out.
  if (cfg.ignoreSessions.includes(session.sessionId)) return;

  // First sync of this session: ledger it as attempted (version 0) so, if this upload never lands
  // (offline), the SessionStart catch-up knows to retry it.
  const id = session.sessionId;
  if (cfg.backfilled[id] === undefined) {
    await updateConfig((c) => {
      c.backfilled[id] ??= 0;
    });
  }

  await uploadAndRecord(session, cfg, mtime);
}

/**
 * Upload one parsed session as its author and record the outcome: the status stamp
 * (recordSyncAttempt) always, the ledger only when the server accepted it. Throws on an upload
 * error after stamping it — the Stop hook's caller swallows it (cli.ts). Shared by the live sync and
 * the curate commands' "not synced yet" path.
 */
export async function uploadAndRecord(session: ParsedSession, cfg: ClaudeLensConfig, mtime: number): Promise<boolean> {
  const account = cfg.shareAccount === false ? undefined : await readAccount();
  let accepted: boolean;
  try {
    accepted = await uploadSession(session, cfg, resolveName(cfg, account), account);
  } catch (err) {
    await recordSyncAttempt(false, describeError(err));
    throw err;
  }
  await recordSyncAttempt(accepted, accepted ? undefined : TOMBSTONED);
  if (accepted) await recordSynced({ [session.sessionId]: { version: PARSER_VERSION, mtime } });
  return accepted;
}

/** lastSyncError when the server answered `{ignored}` — the usual cause of "my sessions stopped
 *  arriving" after someone deleted them on the dashboard. */
export const TOMBSTONED = 'server ignored it: deleted on the dashboard, so now untracked locally';
