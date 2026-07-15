// The opt-out "switches", all invoked by slash-command skills and all
// non-interactive (they print a one-line result the skill relays). Every switch
// is checked by `shouldSync` BEFORE any upload, so flipping one guarantees
// nothing for that scope reaches the server.
//
// Ops:  untrack-session / track-session   (a single conversation)
//       untrack-project / track-project   (the current project; --team writes .claudelens)
//       pause / resume                     (global kill-switch)
import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, saveConfig, isExcludedLocally, REPO_MARKER } from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const pretty = (d: string) => d.replace(homedir(), '~');

function argFlag(name: string): boolean {
  return process.argv.slice(3).includes(name);
}
function positional(): string | undefined {
  return process.argv.slice(3).find((a) => !a.startsWith('-'));
}
function positionalDir(): string {
  const p = positional();
  return resolve(p && !p.startsWith('-') ? p : process.cwd());
}

/**
 * Resolve the current session id. Skills pass it via `${CLAUDE_SESSION_ID}`; if
 * that's empty (or an unsubstituted placeholder), fall back to the newest
 * transcript whose cwd matches `cwd`.
 */
async function resolveSessionId(explicit: string | undefined, cwd: string): Promise<string | undefined> {
  const clean = explicit?.trim();
  if (clean && !clean.includes('$') && !clean.includes('{')) return clean;

  let dirs: string[];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return undefined;
  }
  let best: { id: string; mtime: number } | undefined;
  for (const d of dirs) {
    const full = join(PROJECTS_DIR, d);
    let files: string[];
    try {
      files = (await readdir(full)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join(full, f);
      try {
        const raw = await readFile(path, 'utf8');
        let sid: string | undefined;
        let matches = false;
        let scanned = 0;
        for (const line of raw.split('\n')) {
          if (!line.trim() || ++scanned > 80) break;
          try {
            const e = JSON.parse(line) as { cwd?: string; sessionId?: string };
            if (e.sessionId && !sid) sid = e.sessionId;
            if (e.cwd && resolve(e.cwd) === resolve(cwd)) matches = true;
          } catch {
            /* skip malformed line */
          }
        }
        if (matches && sid) {
          const { mtimeMs } = await stat(path);
          if (!best || mtimeMs > best.mtime) best = { id: sid, mtime: mtimeMs };
        }
      } catch {
        /* ignore unreadable file */
      }
    }
  }
  return best?.id;
}

export async function runUntrackSession(): Promise<void> {
  const cfg = await loadConfig();
  const id = await resolveSessionId(positional(), process.cwd());
  if (!id) {
    console.log('Could not identify this session yet (no transcript). Try again after your first message.');
    return;
  }
  if (!cfg.ignoreSessions.includes(id)) {
    cfg.ignoreSessions.push(id);
    await saveConfig(cfg);
  }
  console.log(`✔ This session (${id.slice(0, 8)}) will not be tracked. Nothing from it is sent to the dashboard.`);
}

export async function runTrackSession(): Promise<void> {
  const cfg = await loadConfig();
  const id = await resolveSessionId(positional(), process.cwd());
  if (id) {
    cfg.ignoreSessions = cfg.ignoreSessions.filter((s) => s !== id);
    await saveConfig(cfg);
  }
  console.log('✔ This session is tracked again (syncs from the next turn).');
}

export async function runUntrackProject(): Promise<void> {
  const cfg = await loadConfig();
  const dir = positionalDir();
  const team = argFlag('--team') || argFlag('--shared');

  if (!isExcludedLocally(dir, cfg)) {
    cfg.ignoreProjects.push(dir);
    await saveConfig(cfg);
  }
  if (team) {
    await writeFile(
      join(dir, REPO_MARKER),
      '# ClaudeLens: this repo is never tracked, for anyone. Commit this file.\nignore: true\n',
      'utf8',
    );
    console.log(`✔ Wrote ${REPO_MARKER} in ${pretty(dir)} — commit it to exclude this repo for the whole team.`);
  } else {
    console.log(`✔ This project (${pretty(dir)}) will not be tracked. Its sessions stop syncing immediately.`);
  }
}

export async function runTrackProject(): Promise<void> {
  const cfg = await loadConfig();
  const dir = positionalDir();
  const team = argFlag('--team') || argFlag('--shared');

  cfg.ignoreProjects = cfg.ignoreProjects.filter((p) => resolve(p) !== dir);
  await saveConfig(cfg);
  if (team) {
    try {
      await unlink(join(dir, REPO_MARKER));
    } catch {
      /* nothing to remove */
    }
  }
  console.log(`✔ Tracking ${pretty(dir)} again.`);
}

async function setPaused(paused: boolean): Promise<void> {
  const cfg = await loadConfig();
  cfg.paused = paused;
  await saveConfig(cfg);
  console.log(
    paused
      ? '⏸  Paused — nothing syncs on this machine until /claudelens:resume.'
      : '▶  Resumed — tracked projects sync again from the next turn.',
  );
}
export const runPause = () => setPaused(true);
export const runResume = () => setPaused(false);
