#!/usr/bin/env -S npx tsx
// `/claudelens:projects` — pick which projects ClaudeLens tracks.
// Discovers the projects you've used Claude Code in, shows a checklist
// (ticked = tracked), and writes the excluded ones to your config. No marker
// files or JSON editing required.
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig } from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface Discovered {
  cwd: string;
  label: string;
  sessions: number;
}

/** Read the real cwd from the first parseable line of a session file. */
async function cwdOf(dir: string, files: string[]): Promise<string | undefined> {
  for (const f of files) {
    try {
      const raw = await readFile(join(dir, f), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as { cwd?: string };
        if (e.cwd) return e.cwd;
        break; // only need the first entry
      }
    } catch {
      /* try next file */
    }
  }
  return undefined;
}

async function discover(): Promise<Discovered[]> {
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

function isExcluded(cwd: string, optOut: string[]): boolean {
  const d = resolve(cwd);
  return optOut.some((root) => {
    const r = resolve(root);
    return d === r || d.startsWith(r + sep);
  });
}

async function main() {
  p.intro(pc.bgCyan(pc.black(' ClaudeLens · projects ')));

  const cfg = await loadConfig();
  if (!cfg) {
    p.cancel('Not set up yet — run /claudelens:setup first.');
    return;
  }

  const projects = await discover();
  if (!projects.length) {
    p.cancel(`No Claude Code projects found in ${PROJECTS_DIR}.`);
    return;
  }

  const tracked = await p.multiselect({
    message: 'Which projects should ClaudeLens track?',
    options: projects.map((pr) => ({
      value: pr.cwd,
      label: pr.label,
      hint: `${pr.sessions} session${pr.sessions === 1 ? '' : 's'}`,
    })),
    initialValues: projects.filter((pr) => !isExcluded(pr.cwd, cfg.optOutProjects)).map((pr) => pr.cwd),
    required: false,
  });
  if (p.isCancel(tracked)) return p.cancel('Cancelled — nothing changed.');

  const keep = new Set(tracked as string[]);
  cfg.optOutProjects = projects.filter((pr) => !keep.has(pr.cwd)).map((pr) => pr.cwd);
  await saveConfig(cfg);

  const excluded = projects.length - keep.size;
  p.note(
    [
      `${pc.green('Tracking')}  ${keep.size} project(s)`,
      `${pc.yellow('Excluded')}  ${excluded} project(s)`,
    ].join('\n'),
    'Saved',
  );
  p.outro(pc.dim('Excluded projects stop syncing immediately; tracked ones resume on the next turn.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
