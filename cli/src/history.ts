// Historical backfill: bulk-sync sessions from ~/.claude/projects that existed
// before ClaudeLens was installed (or predate the Stop hook ever firing).
// Three entry points:
//   `list-projects`   — enumerate what's on disk so the agent can present a
//                        numbered pick-list to the user in chat.
//   `sync-history`    — upload the chosen project(s) (CLI op, /claudelens:sync-history).
//   `backfillProject` — upload ONE project by cwd, reused by connect (current
//                        project only) and track-project (re-enabling backs up
//                        its history automatically).
// All three reuse the exact same parse + upsert path as the live Stop-hook
// sync, so a backfilled session is indistinguishable from a live one.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseTranscript, redactDeep, PARSER_VERSION } from '@claudelens/shared';
import type { AccountIdentity, IngestPayload } from '@claudelens/shared';
import { type ClaudeLensConfig, loadConfig, saveConfig, shouldSync, resolveName, isConnected } from './config.js';
import { readAccount } from './account.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface ProjectEntry {
  index: number;
  /** Encoded folder name under ~/.claude/projects (the identifier sync-history takes). */
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
    console.log('No project history found under ~/.claude/projects.');
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

/** Map a cwd to its `~/.claude/projects/<encoded>` dir by reusing listProjects'
 *  peek()-based cwd match — never reimplement Claude Code's path encoding. */
async function findProjectDir(cwd: string): Promise<string | undefined> {
  const target = resolve(cwd);
  const entries = await listProjects();
  return entries.find((e) => e.cwd && resolve(e.cwd) === target)?.dir;
}

async function backfillOne(
  path: string,
  cfg: ClaudeLensConfig,
  author: string,
  account: AccountIdentity | undefined,
  force: boolean,
  result: BackfillResult,
): Promise<void> {
  try {
    const session = parseTranscript(await readFile(path, 'utf8'));
    if (!session.sessionId || session.sessionId === 'unknown' || session.stats.turns < 1) return;

    const priorVersion = cfg.backfilled[session.sessionId];
    const alreadyCurrent = priorVersion !== undefined && priorVersion >= PARSER_VERSION;
    if (!force && alreadyCurrent) {
      result.skipped++;
      return;
    }
    if (session.cwd && !(await shouldSync(session.cwd, session.sessionId, cfg))) {
      result.skipped++;
      return;
    }

    if (cfg.redact) {
      session.turns = redactDeep(session.turns).value;
      if (session.stats.firstUserPrompt) {
        session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
      }
    }

    const payload: IngestPayload = { session, author, account };
    const res = await fetch(`${cfg.server}/api/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`server responded ${res.status}`);

    if (priorVersion !== undefined && priorVersion < PARSER_VERSION) result.upgraded++;
    cfg.backfilled[session.sessionId] = PARSER_VERSION;
    result.synced++;
  } catch (err) {
    result.failed++;
    if (process.env.CLAUDELENS_DEBUG) console.error(`[claudelens sync-history] ${path}:`, err);
  }
}

/** Upload every session under the given `~/.claude/projects` dir names. Bounded
 *  concurrency so hundreds of sessions don't upload one at a time. */
export async function backfillDirs(dirs: string[], opts: { force?: boolean; concurrency?: number } = {}): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  const cfg = await loadConfig();
  if (!isConnected(cfg)) return result;

  const account = cfg.shareAccount === false ? undefined : await readAccount();
  const author = resolveName(cfg, account);
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  for (const dir of dirs) {
    const full = join(PROJECTS_DIR, dir);
    const files = (await jsonlFiles(full)).map((f) => join(full, f));
    result.scanned += files.length;

    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        await backfillOne(files[next++], cfg, author, account, opts.force ?? false, result);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
    await saveConfig(cfg); // persist progress per project so an interruption doesn't re-upload everything
  }
  return result;
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
