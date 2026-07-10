// Per-developer ClaudeLens config, stored at ~/.claude/claudelens.json.
// Holds the contributor identity (name + stable id) and which projects are
// opted in to automatic sync. A project is synced only if it is EXPLICITLY
// opted in — either a committed `.claudelens.json` marker at/above the session
// cwd, or an entry in the user allowlist below. Default is OFF.
import { readFile, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';

export const CONFIG_PATH = join(homedir(), '.claude', 'claudelens.json');
/** Committed marker that opts a whole project OUT of tracking (team-wide). */
export const IGNORE_MARKER = '.claudelens-ignore';

export interface ClaudeLensConfig {
  /** Display name — this IS the contributor identity. */
  name: string;
  /** Ingest target. */
  server: string;
  /** Optional shared bearer token. */
  token?: string;
  /** Absolute project roots to EXCLUDE from tracking (everything else syncs). */
  optOutProjects: string[];
  /** Individual session ids to EXCLUDE. */
  optOutSessions: string[];
  /** Run secret redaction before upload. Off by default (internal-only). */
  redact: boolean;
}

const DEFAULTS: Omit<ClaudeLensConfig, 'name'> = {
  server: process.env.CLAUDELENS_SERVER ?? 'http://localhost:4000',
  token: process.env.CLAUDELENS_TOKEN || undefined,
  optOutProjects: [],
  optOutSessions: [],
  redact: false,
};

export async function loadConfig(): Promise<ClaudeLensConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ClaudeLensConfig>;
    if (!parsed.name) return null;
    return {
      name: parsed.name,
      server: parsed.server ?? DEFAULTS.server,
      token: parsed.token ?? DEFAULTS.token,
      optOutProjects: parsed.optOutProjects ?? [],
      optOutSessions: parsed.optOutSessions ?? [],
      redact: parsed.redact ?? DEFAULTS.redact,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(cfg: ClaudeLensConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/** Build a fresh config. */
export function newConfig(name: string, overrides: Partial<ClaudeLensConfig> = {}): ClaudeLensConfig {
  return {
    name,
    ...DEFAULTS,
    ...overrides,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** True if `dir` is at or under any listed project root. */
function isUnderAny(dir: string, roots: string[]): boolean {
  const d = resolve(dir);
  return roots.some((p) => {
    const root = resolve(p);
    return d === root || d.startsWith(root + sep);
  });
}

/** Walk up from `dir` looking for a committed opt-out marker file. */
async function hasIgnoreMarker(dir: string): Promise<boolean> {
  let cur = resolve(dir);
  while (true) {
    if (await exists(join(cur, IGNORE_MARKER))) return true;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

/**
 * Whether a session should be synced. Tracking is ON by default; a session is
 * skipped only if it has been explicitly opted out — by session id, by a
 * project in the opt-out list, or by a committed `.claudelens-ignore` marker.
 */
export async function shouldTrack(
  cwd: string,
  sessionId: string,
  cfg: ClaudeLensConfig,
): Promise<boolean> {
  if (sessionId && cfg.optOutSessions.includes(sessionId)) return false;
  if (isUnderAny(cwd, cfg.optOutProjects)) return false;
  if (await hasIgnoreMarker(cwd)) return false;
  return true;
}
