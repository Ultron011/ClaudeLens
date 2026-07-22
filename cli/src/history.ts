// Historical backfill: bulk-sync sessions from ~/.claude/projects that existed
// before ClaudeLens was installed (or predate the Stop hook ever firing).
// Two ops, both driven by the /claudelens:sync-history skill:
//   `list-projects` — enumerate what's on disk so the agent can present a
//                      numbered pick-list to the user in chat.
//   `sync-history`   — upload the chosen project(s), reusing the exact same
//                      parse + upsert path as the live Stop-hook sync, so a
//                      backfilled session is indistinguishable from a live one.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseTranscript, redactDeep } from '@claudelens/shared';
import type { IngestPayload } from '@claudelens/shared';
import { loadConfig, saveConfig, shouldSync, resolveName, isConnected } from './config.js';

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

async function listProjects(): Promise<ProjectEntry[]> {
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
      if (sessionId && cfg.backfilledSessions.includes(sessionId)) synced++;
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

  const author = resolveName(cfg);
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const dir of dirs) {
    const full = join(PROJECTS_DIR, dir);
    for (const f of await jsonlFiles(full)) {
      const path = join(full, f);
      try {
        const session = parseTranscript(await readFile(path, 'utf8'));
        if (!session.sessionId || session.sessionId === 'unknown' || session.stats.turns < 1) continue;

        if (!force && cfg.backfilledSessions.includes(session.sessionId)) {
          skipped++;
          continue;
        }
        if (session.cwd && !(await shouldSync(session.cwd, session.sessionId, cfg))) {
          skipped++;
          continue;
        }

        if (cfg.redact) {
          session.turns = redactDeep(session.turns).value;
          if (session.stats.firstUserPrompt) {
            session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
          }
        }

        const payload: IngestPayload = { session, author };
        const res = await fetch(`${cfg.server}/api/sessions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`server responded ${res.status}`);

        if (!cfg.backfilledSessions.includes(session.sessionId)) cfg.backfilledSessions.push(session.sessionId);
        synced++;
      } catch (err) {
        failed++;
        if (process.env.CLAUDELENS_DEBUG) console.error(`[claudelens sync-history] ${path}:`, err);
      }
    }
    await saveConfig(cfg); // persist progress per project so an interruption doesn't re-upload everything
  }

  console.log(`✔ Synced ${synced} session(s). Skipped ${skipped} (already synced or excluded). Failed ${failed}.`);
}
