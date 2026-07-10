// `claudelens projects` — pick which projects ClaudeLens tracks (opt-in).
// Discovers the projects you've used Claude Code in and shows a checklist;
// ticked = tracked. Nothing syncs unless it's ticked. Writes your config —
// no marker files or JSON editing.
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig, isUnderAny } from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export interface Discovered {
  cwd: string;
  label: string;
  sessions: number;
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
  const byCwd = new Map<string, Discovered>();
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
  return [...byCwd.values()].sort((a, b) => b.sessions - a.sessions);
}

/** Whether a project is currently tracked (opt-in list). */
export function isTracked(cwd: string, trackProjects: string[]): boolean {
  return isUnderAny(cwd, trackProjects);
}

export async function runProjects() {
  p.intro(pc.bgCyan(pc.black(' ClaudeLens · projects ')));

  const cfg = await loadConfig();
  if (!cfg) {
    p.cancel('Not set up yet — run `claudelens setup` first.');
    return;
  }

  const projects = await discover();
  if (!projects.length) {
    p.cancel(`No Claude Code projects found in ${PROJECTS_DIR}.`);
    return;
  }

  const tracked = await p.multiselect({
    message: 'Which projects should ClaudeLens track?  (nothing is tracked by default)',
    options: projects.map((pr) => ({
      value: pr.cwd,
      label: pr.label,
      hint: `${pr.sessions} session${pr.sessions === 1 ? '' : 's'}`,
    })),
    initialValues: projects.filter((pr) => isTracked(pr.cwd, cfg.trackProjects)).map((pr) => pr.cwd),
    required: false,
  });
  if (p.isCancel(tracked)) return p.cancel('Cancelled — nothing changed.');

  const picked = tracked as string[];
  // Keep any tracked projects that weren't in the discovered list (e.g. a fresh
  // project added via `claudelens track` before it has sessions).
  const discoveredCwds = new Set(projects.map((pr) => resolve(pr.cwd)));
  const keptUndiscovered = cfg.trackProjects.filter((d) => !discoveredCwds.has(resolve(d)));
  cfg.trackProjects = [...picked, ...keptUndiscovered];
  await saveConfig(cfg);

  p.note(`${pc.green('Tracking')}  ${cfg.trackProjects.length} project(s)`, 'Saved');
  p.outro(pc.dim('Newly tracked projects sync on their next turn; untracked ones stop immediately.'));
}
