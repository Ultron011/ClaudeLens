// `claudelens projects` — review which projects ClaudeLens tracks. Tracking is
// ON BY DEFAULT, so the checklist starts with EVERY discovered project ticked;
// untick the ones you don't want captured. Unticked projects go into your
// opt-out list (`ignoreProjects`). Writes your config — no marker files or JSON
// editing. (A committed `.claudelens` file excludes a repo for the whole team;
// those show up here as locked/off and can't be re-ticked from your machine.)
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  loadConfig,
  saveConfig,
  isExcludedLocally,
  isRepoExcluded,
  type ClaudeLensConfig,
} from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export interface Discovered {
  cwd: string;
  label: string;
  sessions: number;
  /** Excluded by a committed `.claudelens` — not toggleable from this machine. */
  repoExcluded: boolean;
}

/**
 * Read the real cwd from a session file. The first line is often a `mode` /
 * summary entry with no cwd, so scan the first several entries (not just line
 * one) until one carries a cwd.
 */
async function cwdOf(dir: string, files: string[]): Promise<string | undefined> {
  for (const f of files) {
    try {
      const raw = await readFile(join(dir, f), 'utf8');
      let scanned = 0;
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        if (++scanned > 80) break; // cap per file; cwd shows up well within this
        try {
          const e = JSON.parse(line) as { cwd?: string };
          if (e.cwd) return e.cwd;
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* try next file */
    }
  }
  return undefined;
}

export async function discover(): Promise<Discovered[]> {
  let dirs: string[];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const byCwd = new Map<string, Omit<Discovered, 'repoExcluded'>>();
  for (const d of dirs) {
    const full = join(PROJECTS_DIR, d);
    let files: string[];
    try {
      files = (await readdir(full)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    if (!files.length) continue;
    const cwd = await cwdOf(full, files);
    if (!cwd) continue;
    const existing = byCwd.get(cwd);
    if (existing) existing.sessions += files.length;
    else byCwd.set(cwd, { cwd, label: cwd.replace(homedir(), '~'), sessions: files.length });
  }
  const list = [...byCwd.values()].sort((a, b) => b.sessions - a.sessions);
  return Promise.all(
    list.map(async (pr) => ({ ...pr, repoExcluded: await isRepoExcluded(pr.cwd) })),
  );
}

/** Whether a project is currently tracked: on by default unless opted out. */
export function isTracked(cwd: string, cfg: ClaudeLensConfig): boolean {
  return !isExcludedLocally(cwd, cfg);
}

/**
 * Render the tracking review checklist and fold the result back into `cfg`
 * (mutating `ignoreProjects` and setting `trackingReviewed`). Returns false if
 * the developer cancelled — caller should not save. Shared by `setup` and
 * `projects` so the review is identical in both.
 */
export async function reviewProjects(cfg: ClaudeLensConfig): Promise<boolean> {
  const projects = await discover();
  if (!projects.length) {
    p.note(
      pc.dim(
        `No Claude Code projects found yet in ${PROJECTS_DIR}.\n` +
          'New projects will be tracked automatically once you use them.',
      ),
      'Tracking on',
    );
    cfg.trackingReviewed = true;
    return true;
  }

  const toggleable = projects.filter((pr) => !pr.repoExcluded);
  const lockedOut = projects.filter((pr) => pr.repoExcluded);

  if (lockedOut.length) {
    p.note(
      lockedOut.map((pr) => `${pc.dim('·')} ${pc.dim(pr.label)}`).join('\n'),
      'Excluded by a committed .claudelens (team-wide)',
    );
  }

  const tracked = await p.multiselect({
    message: 'Which projects should ClaudeLens track?  (everything is on by default — untick to exclude)',
    options: toggleable.map((pr) => ({
      value: pr.cwd,
      label: pr.label,
      hint: `${pr.sessions} session${pr.sessions === 1 ? '' : 's'}`,
    })),
    initialValues: toggleable.filter((pr) => isTracked(pr.cwd, cfg)).map((pr) => pr.cwd),
    required: false,
  });
  if (p.isCancel(tracked)) return false;

  const picked = new Set(tracked as string[]);
  const discoveredCwds = new Set(toggleable.map((pr) => resolve(pr.cwd)));
  // Unticked discovered projects become exclusions; keep any prior exclusions
  // that weren't in the discovered list (e.g. a repo with no sessions yet).
  const untickedNow = toggleable.filter((pr) => !picked.has(pr.cwd)).map((pr) => pr.cwd);
  const keptUndiscovered = cfg.ignoreProjects.filter((d) => !discoveredCwds.has(resolve(d)));
  cfg.ignoreProjects = [...untickedNow, ...keptUndiscovered];
  cfg.trackingReviewed = true;
  return true;
}

export async function runProjects() {
  p.intro(pc.bgCyan(pc.black(' ClaudeLens · projects ')));

  const cfg = await loadConfig();
  if (!cfg) {
    p.cancel('Not set up yet — run `claudelens setup` first.');
    return;
  }

  const ok = await reviewProjects(cfg);
  if (!ok) return p.cancel('Cancelled — nothing changed.');

  await saveConfig(cfg);
  const excluded = cfg.ignoreProjects.length;
  p.note(
    excluded
      ? `${pc.yellow('Excluded')}  ${excluded} project(s) — everything else is tracked`
      : pc.green('Tracking every project'),
    'Saved',
  );
  p.outro(pc.dim('Newly tracked projects sync on their next turn; excluded ones stop immediately.'));
}
