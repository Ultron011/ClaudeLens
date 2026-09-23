// Historical backfill: bulk-sync sessions from <claude config dir>/projects that existed
// before ClaudeLens was installed (or predate the Stop hook ever firing).
// Three entry points:
//   `list-projects`   — enumerate what's on disk so the agent can present a
//                        numbered pick-list to the user in chat.
//   `sync-history`    — upload the chosen project(s) (CLI op, /claudelens:sync-history).
//   `backfillProject` — upload ONE project by cwd, reused by connect (current
//                        project only) and track-project (re-enabling backs up
//                        its history automatically).
//   `catchup`         — SessionStart hook: re-upload (≤25) already-ledgered
//                        sessions that a parser bump or an unsynced tail left stale.
// All of them reuse the exact same parse + upsert path as the live Stop-hook
// sync (upload.ts), so a backfilled session is indistinguishable from a live one.
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { PARSER_VERSION } from '@claudelens/shared';
import type { AccountIdentity } from '@claudelens/shared';
import {
  type ClaudeLensConfig,
  loadConfig,
  shouldSync,
  resolveName,
  isConnected,
  recordSynced,
  envOptedOut,
  projectsDir,
  recordSyncAttempt,
  describeError,
} from './config.js';
import { readAccount } from './account.js';
import { parseSessionFile, uploadSession } from './upload.js';
import { isDetached, spawnDetached } from './sync.js';

// $CLAUDE_CONFIG_DIR/projects (default ~/.claude/projects) — the ACTIVE profile only. Each
// profile's own SessionStart / sync-history covers its own transcripts.
const PROJECTS_DIR = projectsDir();

interface ProjectEntry {
  index: number;
  /** Encoded folder name under the projects dir (the identifier sync-history takes). */
  dir: string;
  cwd?: string;
  sessions: number;
  synced: number;
  lastActivity?: string;
}

export interface BackfillResult {
  scanned: number;
  synced: number;
  skipped: number;
  failed: number;
  /** Previously-synced sessions re-uploaded because PARSER_VERSION advanced. */
  upgraded: number;
  /** Uploads attempted / the last failure's reason, for the status line (recordSyncAttempt). */
  attempted?: number;
  lastError?: string;
}

async function jsonlFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
}

/** Cheap peek at a transcript for cwd + sessionId, without a full parse. */
async function peek(path: string): Promise<{ cwd?: string; sessionId?: string }> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return {};
  }
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let scanned = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (++scanned > 80) break;
    try {
      const e = JSON.parse(line) as { cwd?: string; sessionId?: string };
      cwd ??= e.cwd;
      sessionId ??= e.sessionId;
    } catch {
      /* skip malformed line */
    }
    if (cwd && sessionId) break;
  }
  return { cwd, sessionId };
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const cfg = await loadConfig();
  let dirNames: string[];
  try {
    dirNames = (await readdir(PROJECTS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const entries: ProjectEntry[] = [];
  for (const dir of dirNames) {
    const full = join(PROJECTS_DIR, dir);
    const files = await jsonlFiles(full);
    if (!files.length) continue;

    let cwd: string | undefined;
    let synced = 0;
    let lastMtime = 0;
    for (const f of files) {
      const path = join(full, f);
      const [{ cwd: fileCwd, sessionId }, st] = await Promise.all([peek(path), stat(path)]);
      cwd ??= fileCwd;
      const version = sessionId ? cfg.backfilled[sessionId] : undefined;
      if (version !== undefined && version >= PARSER_VERSION) synced++;
      if (st.mtimeMs > lastMtime) lastMtime = st.mtimeMs;
    }

    entries.push({
      index: entries.length + 1,
      dir,
      cwd,
      sessions: files.length,
      synced,
      lastActivity: lastMtime ? new Date(lastMtime).toISOString() : undefined,
    });
  }
  return entries;
}

export async function runListProjects(): Promise<void> {
  const cfg = await loadConfig();
  if (!isConnected(cfg)) {
    console.log('Not connected. Run /claudelens:connect <server-url> <token> <name> first.');
    return;
  }
  const entries = await listProjects();
  if (!entries.length) {
    console.log(`No project history found under ${PROJECTS_DIR}.`);
    return;
  }
  console.log(JSON.stringify(entries, null, 2));
}

/** Resolve the user's selection (indices, encoded dir names, or cwd paths) to dir names. */
function selectDirs(all: ProjectEntry[]): string[] {
  const rest = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  if (process.argv.slice(3).includes('--all')) return all.map((e) => e.dir);

  const out: string[] = [];
  for (const arg of rest) {
    const n = Number(arg);
    const byIndex = Number.isInteger(n) ? all.find((e) => e.index === n) : undefined;
    const byDir = all.find((e) => e.dir === arg);
    const byCwd = all.find((e) => e.cwd === arg);
    const match = byIndex ?? byDir ?? byCwd;
    if (match) out.push(match.dir);
  }
  return [...new Set(out)];
}

/** Map a cwd to its `<projects dir>/<encoded>` dir by reusing listProjects'
 *  peek()-based cwd match — never reimplement Claude Code's path encoding. */
async function findProjectDir(cwd: string): Promise<string | undefined> {
  const target = resolve(cwd);
  const entries = await listProjects();
  return entries.find((e) => e.cwd && resolve(e.cwd) === target)?.dir;
}

/** Session id -> ledger update, flushed to the config with a merge (never a whole-config save). */
type Done = Record<string, { version: number; mtime: number }>;

/** True when the ledger says this file was uploaded by the current parser and hasn't grown since. */
function isCurrent(cfg: ClaudeLensConfig, sessionId: string, mtime: number): boolean {
  const version = cfg.backfilled[sessionId];
  const syncedMtime = cfg.backfilledMtime[sessionId];
  return version !== undefined && version >= PARSER_VERSION && (syncedMtime === undefined || mtime <= syncedMtime);
}

async function backfillOne(
  path: string,
  cfg: ClaudeLensConfig,
  author: string,
  account: AccountIdentity | undefined,
  force: boolean,
  result: BackfillResult,
  done: Done,
): Promise<void> {
  try {
    const { mtimeMs } = await stat(path);
    const session = await parseSessionFile(path);
    if (!session.sessionId || session.sessionId === 'unknown' || session.stats.turns < 1) return;

    const priorVersion = cfg.backfilled[session.sessionId];
    if (!force && isCurrent(cfg, session.sessionId, mtimeMs)) {
      result.skipped++;
      return;
    }
    if (session.cwd && !(await shouldSync(session.cwd, session.sessionId, cfg))) {
      result.skipped++;
      return;
    }

    result.attempted = (result.attempted ?? 0) + 1;
    if (!(await uploadSession(session, cfg, author, account))) {
      result.skipped++; // tombstoned server-side; now in the local opt-out lists
      return;
    }

    if (priorVersion !== undefined && priorVersion < PARSER_VERSION) result.upgraded++;
    done[session.sessionId] = { version: PARSER_VERSION, mtime: mtimeMs };
    result.synced++;
  } catch (err) {
    result.failed++;
    result.lastError = describeError(err);
    if (process.env.CLAUDELENS_DEBUG) console.error(`[claudelens sync-history] ${path}:`, err);
  }
}

/** Upload `files` with bounded concurrency, then merge their ledger entries into the config. */
async function uploadFiles(
  files: string[],
  cfg: ClaudeLensConfig,
  opts: { force?: boolean; concurrency?: number },
  result: BackfillResult,
): Promise<void> {
  const account = cfg.shareAccount === false ? undefined : await readAccount();
  const author = resolveName(cfg, account);
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const done: Done = {};
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      await backfillOne(files[next++], cfg, author, account, opts.force ?? false, result, done);
    }
  };
  const failedBefore = result.failed;
  const attemptedBefore = result.attempted ?? 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  await recordSynced(done);
  // One status stamp per batch, not per file: concurrent workers share this process's config
  // tmp-file name, so per-upload writes here would race each other.
  if ((result.attempted ?? 0) > attemptedBefore || result.failed > failedBefore) {
    const failed = result.failed - failedBefore;
    await recordSyncAttempt(failed === 0, failed ? `${failed} of ${files.length} failed: ${result.lastError}` : undefined);
  }
}

/** Upload every session under the given `<projects dir>` dir names. Bounded
 *  concurrency so hundreds of sessions don't upload one at a time. */
export async function backfillDirs(dirs: string[], opts: { force?: boolean; concurrency?: number } = {}): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };

  for (const dir of dirs) {
    // Reloaded per project: a pause/untrack made while a long backfill runs takes effect at the
    // next project, and the ledger merge (recordSynced) never overwrites it.
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused) break;
    const full = join(PROJECTS_DIR, dir);
    const files = (await jsonlFiles(full)).map((f) => join(full, f));
    result.scanned += files.length;
    await uploadFiles(files, cfg, opts, result); // persists progress per project
  }
  return result;
}

const CATCHUP_CAP = 25;

/**
 * SessionStart catch-up. Re-uploads sessions the ledger already knows (so it never uploads history
 * the user didn't opt into) that are stale: uploaded by an older PARSER_VERSION, attempted but never
 * landed (version 0 — offline), or whose file grew after the last upload (lines written after the
 * final Stop hook, e.g. its turn_duration / cost-state). Newest first, capped per run; the rest
 * follow on later session starts. Same shouldSync gate + tombstone handling as backfill.
 */
export async function catchUp(): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  const cfg = await loadConfig();
  if (!isConnected(cfg) || cfg.paused || envOptedOut()) return result;

  let dirNames: string[];
  try {
    dirNames = (await readdir(PROJECTS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return result;
  }
  const stale: { path: string; mtime: number }[] = [];
  for (const dir of dirNames) {
    for (const f of await jsonlFiles(join(PROJECTS_DIR, dir))) {
      const id = basename(f, '.jsonl'); // Claude Code names the file after the session id
      if (cfg.backfilled[id] === undefined || cfg.ignoreSessions.includes(id)) continue;
      const path = join(PROJECTS_DIR, dir, f);
      try {
        const { mtimeMs } = await stat(path);
        if (!isCurrent(cfg, id, mtimeMs)) stale.push({ path, mtime: mtimeMs });
      } catch {
        /* vanished between readdir and stat */
      }
    }
  }
  stale.sort((a, b) => b.mtime - a.mtime);
  const batch = stale.slice(0, CATCHUP_CAP).map((s) => s.path);
  result.scanned = batch.length;
  if (batch.length) await uploadFiles(batch, cfg, {}, result);
  return result;
}

/** SessionStart hook entry: return to Claude Code at once, do the catch-up detached. */
export async function runCatchUp(): Promise<void> {
  if (!isDetached()) {
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused || envOptedOut()) return;
    if (spawnDetached('catchup')) return;
  }
  await catchUp();
}

/** Upload the history for ONE project, identified by its cwd. A no-op (zero
 *  result) if that cwd has no transcripts on disk. */
export async function backfillProject(cwd: string, opts: { force?: boolean; concurrency?: number } = {}): Promise<BackfillResult> {
  const dir = await findProjectDir(cwd);
  if (!dir) return { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  return backfillDirs([dir], opts);
}

export async function runSyncHistory(): Promise<void> {
  const cfg = await loadConfig();
  if (!isConnected(cfg)) {
    console.log('Not connected. Run /claudelens:connect <server-url> <token> <name> first.');
    return;
  }
  const force = process.argv.slice(3).includes('--force');
  const all = await listProjects();
  const dirs = selectDirs(all);
  if (!dirs.length) {
    console.log('No matching projects selected. Pass indices or dir names from list-projects, or --all.');
    return;
  }

  const { synced, skipped, failed, upgraded } = await backfillDirs(dirs, { force });
  console.log(
    `✔ Synced ${synced} session(s) (${upgraded} upgraded). Skipped ${skipped} (already synced or excluded). Failed ${failed}.`,
  );
}
