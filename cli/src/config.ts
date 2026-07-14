// Per-developer ClaudeLens config, stored at ~/.claude/claudelens.json.
//
// Tracking is ON BY DEFAULT: every project you use Claude Code in syncs after
// each turn — UNLESS you exclude it. Exclusions are opt-out and layered:
//   • ignoreProjects   absolute roots THIS developer excludes  (`claudelens untrack`)
//   • ignoreSessions   individual session ids to skip          (`claudelens sessions`)
//   • paused           a global kill-switch                    (`claudelens pause`)
//   • a committed `.claudelens` file in a repo excludes it for the WHOLE team.
//
// `trackingReviewed` guards the opt-in→opt-out switch: until the developer has
// confirmed the review checklist once (`claudelens setup` / `projects`), nothing
// default-syncs. So upgrading an older opt-in config NEVER silently starts
// uploading projects the developer hasn't looked at.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep, dirname, parse as parsePath } from 'node:path';

export const CONFIG_PATH = join(homedir(), '.claude', 'claudelens.json');

/** Filename of the committed, team-shared repo exclusion marker. */
export const REPO_MARKER = '.claudelens';

export interface ClaudeLensConfig {
  /** Display name — this IS the contributor identity. */
  name: string;
  /** Ingest target. */
  server: string;
  /** Optional shared bearer token. */
  token?: string;
  /** Absolute project roots THIS developer has excluded from tracking. */
  ignoreProjects: string[];
  /** Session ids to skip even inside an otherwise-tracked project. */
  ignoreSessions: string[];
  /** Global kill-switch — when true, nothing syncs regardless of the lists. */
  paused: boolean;
  /**
   * Set true once the developer has seen and confirmed the tracking review.
   * Until then, default-on syncing is held back — this is what makes upgrading
   * an old opt-in config safe (no surprise uploads before they've looked).
   */
  trackingReviewed: boolean;
  /** Run secret redaction before upload. Off by default (internal-only). */
  redact: boolean;
  /** @deprecated legacy opt-in allowlist; migrated into the opt-out model. */
  trackProjects?: string[];
}

const DEFAULTS: Omit<ClaudeLensConfig, 'name'> = {
  server: process.env.CLAUDELENS_SERVER ?? 'http://localhost:4000',
  token: process.env.CLAUDELENS_TOKEN || undefined,
  ignoreProjects: [],
  ignoreSessions: [],
  paused: false,
  trackingReviewed: false,
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
      ignoreProjects: parsed.ignoreProjects ?? [],
      ignoreSessions: parsed.ignoreSessions ?? [],
      paused: parsed.paused ?? DEFAULTS.paused,
      trackingReviewed: parsed.trackingReviewed ?? DEFAULTS.trackingReviewed,
      redact: parsed.redact ?? DEFAULTS.redact,
      // Preserved only so `setup` can migrate it; never written back once migrated.
      trackProjects: parsed.trackProjects,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(cfg: ClaudeLensConfig): Promise<void> {
  // Drop the legacy field on save so a migrated config stays clean.
  const { trackProjects: _legacy, ...clean } = cfg;
  await writeFile(CONFIG_PATH, JSON.stringify(clean, null, 2) + '\n', 'utf8');
}

/** Build a fresh config. */
export function newConfig(name: string, overrides: Partial<ClaudeLensConfig> = {}): ClaudeLensConfig {
  return { name, ...DEFAULTS, ...overrides };
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

/**
 * Interpret the contents of a committed `.claudelens` marker. The mere presence
 * of the file signals intent to exclude, so anything ambiguous (empty file,
 * unrecognized content) errs toward EXCLUDED — nothing unintended gets tracked.
 * Recognized forms: JSON `{ "ignore": true }` / `{ "track": false }`, or a
 * `ignore: true` / `track: false` line.
 */
export function markerExcludes(raw: string): boolean {
  const text = raw.trim();
  if (!text) return true; // empty marker = "exclude this repo"
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
  return true; // present but unrecognized → be safe, exclude
}

/**
 * Whether a committed `.claudelens` marker excludes this repo, found by walking
 * up from `dir` to the filesystem root (bounded). A team-shared exclusion that
 * protects a sensitive repo for everyone, no matter whose machine it's on.
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
 * default; this returns false only when something has opted out.
 */
export async function shouldSync(
  cwd: string,
  sessionId: string | undefined,
  cfg: ClaudeLensConfig,
): Promise<boolean> {
  if (cfg.paused) return false;
  if (!cfg.trackingReviewed) return false; // hasn't confirmed default-on yet
  if (isExcludedLocally(cwd, cfg)) return false;
  if (sessionId && cfg.ignoreSessions.includes(sessionId)) return false;
  if (await isRepoExcluded(cwd)) return false;
  return true;
}
