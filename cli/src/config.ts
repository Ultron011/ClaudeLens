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
// Config lives at ~/.claude/claudelens.json (survives plugin updates). Nothing
// syncs until `server` is set — connecting is the enablement step.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep, dirname, parse as parsePath } from 'node:path';

export const CONFIG_PATH = join(homedir(), '.claude', 'claudelens.json');

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
  /** Run secret redaction before upload. */
  redact: boolean;
}

const EMPTY: ClaudeLensConfig = {
  ignoreProjects: [],
  ignoreSessions: [],
  paused: false,
  redact: false,
};

export async function loadConfig(): Promise<ClaudeLensConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ClaudeLensConfig>;
    return {
      name: parsed.name,
      server: parsed.server ?? process.env.CLAUDELENS_SERVER,
      token: parsed.token ?? process.env.CLAUDELENS_TOKEN,
      ignoreProjects: parsed.ignoreProjects ?? [],
      ignoreSessions: parsed.ignoreSessions ?? [],
      paused: parsed.paused ?? false,
      redact: parsed.redact ?? false,
    };
  } catch {
    // No config file yet — fall back to env so a centrally-provisioned machine
    // (CLAUDELENS_SERVER/TOKEN) works without ever running connect.
    return {
      ...EMPTY,
      server: process.env.CLAUDELENS_SERVER,
      token: process.env.CLAUDELENS_TOKEN,
    };
  }
}

export async function saveConfig(cfg: ClaudeLensConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/** True once the plugin knows where to send — i.e. connect has run (or env is set). */
export function isConnected(cfg: ClaudeLensConfig): boolean {
  return Boolean(cfg.server);
}

/** The author name to attribute sessions to: explicit → env → git → OS user. */
export function resolveName(cfg: ClaudeLensConfig): string {
  if (cfg.name?.trim()) return cfg.name.trim();
  if (process.env.CLAUDELENS_NAME?.trim()) return process.env.CLAUDELENS_NAME.trim();
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
