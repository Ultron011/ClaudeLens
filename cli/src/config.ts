// Per-developer ClaudeLens config, stored at ~/.claude/claudelens.json.
// Holds the contributor identity (name) and the OPT-IN list of projects to
// track. Nothing syncs unless the project is in `trackProjects` — add the
// current project with `claudelens track`.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const CONFIG_PATH = join(homedir(), '.claude', 'claudelens.json');

export interface ClaudeLensConfig {
  /** Display name — this IS the contributor identity. */
  name: string;
  /** Ingest target. */
  server: string;
  /** Optional shared bearer token. */
  token?: string;
  /** Absolute project roots to TRACK. Empty = nothing syncs (opt-in). */
  trackProjects: string[];
  /** Run secret redaction before upload. Off by default (internal-only). */
  redact: boolean;
}

const DEFAULTS: Omit<ClaudeLensConfig, 'name'> = {
  server: process.env.CLAUDELENS_SERVER ?? 'http://localhost:4000',
  token: process.env.CLAUDELENS_TOKEN || undefined,
  trackProjects: [],
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
      trackProjects: parsed.trackProjects ?? [],
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

/** Whether a session in `cwd` should sync: only if its project is tracked. */
export function shouldTrack(cwd: string, cfg: ClaudeLensConfig): boolean {
  return isUnderAny(cwd, cfg.trackProjects);
}
