// ClaudeLens config + the "should this sync?" switch.
//
// There is NO interactive setup and NO terminal CLI. A teammate installs the
// plugin and runs `/claudelens:connect <server> <token>` once; from then on
// every session in every project syncs automatically via the Stop hook —
// UNLESS a switch says otherwise. All switches are checked BEFORE any upload,
// so flipping one guarantees nothing for that scope ever leaves the machine:
//   • paused           global kill-switch                      (/claudelens:pause)
//   • ignoreProjects   projects excluded for this developer     (/claudelens:untrack-project)
//   • ignoreSessions   individual sessions excluded             (/claudelens:untrack)
//   • a committed `.claudelens` file           excludes a repo for the WHOLE team
//   • DO_NOT_TRACK / CLAUDELENS_DISABLE env    honored as a global opt-out
//
// backfilled maps session id -> the PARSER_VERSION that last uploaded it (0 = a
// live sync started but never succeeded), and backfilledMtime -> the transcript's
// mtime at that upload. Both the Stop hook and backfill write them; the
// SessionStart catch-up (history.ts) re-uploads any ledgered session whose
// version is behind or whose file has grown since — the server itself dedups
// on (session_id, author) regardless.
//
// Writes are read-modify-write merges (updateConfig): each caller reloads the
// file and changes only its own keys, so a long backfill can't clobber an
// untrack/pause made while it ran.
//
// Config lives at ~/.claude/claudelens.json (survives plugin updates). Nothing
// syncs until `server` is set — connecting is the enablement step.
//
// Multiple Claude Code profiles: everything read FROM Claude Code (projects/, plugins/,
// .claude.json) follows CLAUDE_CONFIG_DIR — see claudeConfigDir(). This file deliberately does
// NOT: it stays at ~/.claude/claudelens.json whatever profile is active, so one connect (and one
// pause / untrack list / ledger) covers every profile on the machine. Session ids are UUIDs, so
// profiles sharing one ledger can't collide.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep, dirname, parse as parsePath } from 'node:path';
import type { AccountIdentity } from '@claudelens/shared';

export const CONFIG_PATH = join(homedir(), '.claude', 'claudelens.json');

/** Claude Code's own data dir for the ACTIVE profile: $CLAUDE_CONFIG_DIR, else ~/.claude. The
 *  hooks and skills inherit Claude Code's env, so this is the profile that ran them. */
export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude');
}

/** Where Claude Code writes transcripts: `<config dir>/projects/<encoded cwd>/<session>.jsonl`. */
export function projectsDir(): string {
  return join(claudeConfigDir(), 'projects');
}

/** Filename of the committed, team-shared repo exclusion marker. */
export const REPO_MARKER = '.claudelens';

export interface ClaudeLensConfig {
  /** Display name — the contributor identity. Auto-derived if unset. */
  name?: string;
  /** Ingest target. Until this is set, nothing syncs. */
  server?: string;
  /** Shared bearer token for the ingest endpoint. */
  token?: string;
  /** Projects this developer has excluded from tracking. */
  ignoreProjects: string[];
  /** Session ids to skip even inside a tracked project. */
  ignoreSessions: string[];
  /** Global kill-switch — when true, nothing syncs. */
  paused: boolean;
  /** Run secret redaction before upload. Default true; only an explicit `false` turns it off. */
  redact: boolean;
  /** Session id -> the PARSER_VERSION that last uploaded it (0 = attempted, never succeeded).
   *  Lets a parser bump auto-re-sync old sessions instead of skipping them forever. */
  backfilled: Record<string, number>;
  /** Session id -> transcript mtimeMs at its last successful upload. A newer file means an
   *  unsynced tail (offline, or lines written after the final Stop hook). */
  backfilledMtime: Record<string, number>;
  /** Attach the signed-in account (email/org/etc.) to syncs. Default true; set
   *  false to opt out of sharing identity while still syncing transcripts. */
  shareAccount?: boolean;
  /** The last upload attempt (live sync, backfill batch, catch-up, curate) — for /claudelens:status,
   *  so "my sessions stopped arriving" is one command to diagnose. ISO time. */
  lastSyncAt?: string;
  lastSyncOk?: boolean;
  /** Why the last attempt failed (absent when it succeeded). */
  lastSyncError?: string;
}

const EMPTY: ClaudeLensConfig = {
  ignoreProjects: [],
  ignoreSessions: [],
  paused: false,
  redact: true,
  backfilled: {},
  backfilledMtime: {},
};

/** Old shape had `backfilledSessions: string[]`; ids migrate to version 0 so
 *  they re-sync exactly once against the current PARSER_VERSION and settle. */
function migrateBackfilled(parsed: Partial<ClaudeLensConfig> & { backfilledSessions?: string[] }): Record<string, number> {
  if (parsed.backfilled) return parsed.backfilled;
  if (parsed.backfilledSessions) return Object.fromEntries(parsed.backfilledSessions.map((id) => [id, 0]));
  return {};
}

type RawConfig = Partial<ClaudeLensConfig> & { backfilledSessions?: string[] };

/** The file's JSON as-is. Missing file → `{}`; an unreadable/corrupt one throws, so a writer never
 *  replaces a config it couldn't read with an empty one. */
async function readRaw(): Promise<RawConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  return JSON.parse(raw) as RawConfig;
}

function normalize(parsed: RawConfig): ClaudeLensConfig {
  return {
    name: parsed.name,
    server: parsed.server,
    token: parsed.token,
    ignoreProjects: parsed.ignoreProjects ?? [],
    ignoreSessions: parsed.ignoreSessions ?? [],
    paused: parsed.paused ?? false,
    redact: parsed.redact ?? true,
    backfilled: migrateBackfilled(parsed),
    backfilledMtime: parsed.backfilledMtime ?? {},
    shareAccount: parsed.shareAccount,
    lastSyncAt: parsed.lastSyncAt,
    lastSyncOk: parsed.lastSyncOk,
    lastSyncError: parsed.lastSyncError,
  };
}

export async function loadConfig(): Promise<ClaudeLensConfig> {
  let cfg: ClaudeLensConfig;
  try {
    cfg = normalize(await readRaw());
  } catch {
    cfg = { ...EMPTY, backfilled: {}, backfilledMtime: {} };
  }
  // No server in the file — fall back to env so a centrally-provisioned machine
  // (CLAUDELENS_SERVER/TOKEN) works without ever running connect.
  cfg.server ??= process.env.CLAUDELENS_SERVER;
  cfg.token ??= process.env.CLAUDELENS_TOKEN;
  return cfg;
}

/**
 * Read-modify-write: reload the file, apply `mutate` to that fresh copy, write it back atomically.
 * Callers change only the keys they own, so concurrent hooks/backfills don't clobber each other's
 * edits (e.g. an untrack made while a long backfill runs). Env-derived server/token are never
 * persisted, and unknown keys in the file are preserved.
 */
export async function updateConfig(mutate: (cfg: ClaudeLensConfig) => void): Promise<ClaudeLensConfig> {
  // ponytail: no lock — the read→write window is a few ms, not the length of a backfill.
  const raw = await readRaw();
  const cfg = normalize(raw);
  mutate(cfg);
  const { backfilledSessions: _legacy, ...rest } = raw;
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  // ~/.claude may not exist when the user only runs Claude Code under a CLAUDE_CONFIG_DIR profile.
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(tmp, JSON.stringify({ ...rest, ...cfg }, null, 2) + '\n', 'utf8');
  await rename(tmp, CONFIG_PATH);
  return cfg;
}

/** Record successful uploads in the ledger: session id -> PARSER_VERSION + transcript mtime. */
export async function recordSynced(done: Record<string, { version: number; mtime?: number }>): Promise<void> {
  if (!Object.keys(done).length) return;
  await updateConfig((cfg) => {
    for (const [id, { version, mtime }] of Object.entries(done)) {
      cfg.backfilled[id] = Math.max(cfg.backfilled[id] ?? 0, version);
      if (mtime !== undefined) cfg.backfilledMtime[id] = Math.max(cfg.backfilledMtime[id] ?? 0, mtime);
    }
  });
}

/** One-line reason for an upload failure: fetch's bare "fetch failed" hides the useful part
 *  (ECONNREFUSED, ENOTFOUND, a timeout) in `cause`. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message;
  return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message;
}

/** Stamp the outcome of an upload attempt for /claudelens:status. Best-effort: a failed write
 *  here must never turn a successful sync into an error (README contract #3). */
export async function recordSyncAttempt(ok: boolean, error?: string): Promise<void> {
  try {
    await updateConfig((cfg) => {
      cfg.lastSyncAt = new Date().toISOString();
      cfg.lastSyncOk = ok;
      cfg.lastSyncError = ok ? undefined : error?.slice(0, 300);
    });
  } catch {
    /* unwritable config — status just shows the previous attempt */
  }
}

/** True once the plugin knows where to send — i.e. connect has run (or env is set). */
export function isConnected(cfg: ClaudeLensConfig): boolean {
  return Boolean(cfg.server);
}

/** The author name to attribute sessions to:
 *  explicit config → env → signed-in account → git (run in the hook's cwd,
 *  which is why it's last: one human working across repos with different git
 *  configs would otherwise split into several authors) → OS user. */
export function resolveName(cfg: ClaudeLensConfig, account?: AccountIdentity): string {
  if (cfg.name?.trim()) return cfg.name.trim();
  if (process.env.CLAUDELENS_NAME?.trim()) return process.env.CLAUDELENS_NAME.trim();
  if (account?.displayName?.trim()) return account.displayName.trim();
  try {
    const git = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim();
    if (git) return git;
  } catch {
    /* git not available / not configured */
  }
  return userInfo().username;
}

/** True if `dir` is at or under any of `roots`. */
export function isUnderAny(dir: string, roots: string[]): boolean {
  const d = resolve(dir);
  return roots.some((p) => {
    const r = resolve(p);
    return d === r || d.startsWith(r + sep);
  });
}

/** Whether THIS developer has excluded `cwd` in their own config. */
export function isExcludedLocally(cwd: string, cfg: ClaudeLensConfig): boolean {
  return isUnderAny(cwd, cfg.ignoreProjects);
}

/** True if the environment declares a global opt-out (DO_NOT_TRACK convention). */
export function envOptedOut(): boolean {
  const truthy = (v?: string) => v != null && v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return truthy(process.env.DO_NOT_TRACK) || truthy(process.env.CLAUDELENS_DISABLE);
}

/**
 * Interpret a committed `.claudelens` marker. The mere presence of the file
 * signals intent to exclude, so anything ambiguous (empty, unrecognized) errs
 * toward EXCLUDED. Forms: JSON `{ "ignore": true }` / `{ "track": false }`, or
 * an `ignore: true` / `track: false` line.
 */
export function markerExcludes(raw: string): boolean {
  const text = raw.trim();
  if (!text) return true;
  try {
    const j = JSON.parse(text) as { ignore?: unknown; track?: unknown };
    if (typeof j.ignore === 'boolean') return j.ignore;
    if (typeof j.track === 'boolean') return !j.track;
  } catch {
    /* not JSON — fall through to the line form */
  }
  for (const line of text.split('\n')) {
    const m = /^\s*(ignore|track)\s*:\s*(true|false)\s*$/i.exec(line);
    if (m) {
      const val = m[2].toLowerCase() === 'true';
      return m[1].toLowerCase() === 'ignore' ? val : !val;
    }
  }
  return true;
}

/**
 * Whether a committed `.claudelens` marker excludes this repo, found by walking
 * up from `dir` to the filesystem root (bounded).
 */
export async function isRepoExcluded(dir: string): Promise<boolean> {
  let cur = resolve(dir);
  const fsRoot = parsePath(cur).root;
  for (let i = 0; i < 40; i++) {
    try {
      const raw = await readFile(join(cur, REPO_MARKER), 'utf8');
      if (markerExcludes(raw)) return true;
    } catch {
      /* no marker at this level */
    }
    if (cur === fsRoot) break;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

/**
 * The single source of truth for "should this session sync?". Tracking is on by
 * default once connected; this returns false only when a switch opts out.
 */
export async function shouldSync(
  cwd: string,
  sessionId: string | undefined,
  cfg: ClaudeLensConfig,
): Promise<boolean> {
  if (!isConnected(cfg)) return false; // not connected yet — nowhere to send
  if (cfg.paused) return false;
  if (envOptedOut()) return false;
  if (isExcludedLocally(cwd, cfg)) return false;
  if (sessionId && cfg.ignoreSessions.includes(sessionId)) return false;
  if (await isRepoExcluded(cwd)) return false;
  return true;
}
