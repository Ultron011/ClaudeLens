// `claudelens sessions` — fine-grained, per-session opt-out. Lists recent
// sessions in the CURRENT project as a checklist (ticked = tracked); untick a
// single conversation to keep it off the dashboard even though the project is
// tracked. For the one-off sensitive session inside an otherwise-shared repo.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseTranscript } from '@claudelens/shared';
import { loadConfig, saveConfig, isUnderAny } from './config.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface SessionEntry {
  id: string;
  label: string;
  mtime: number;
  turns: number;
}

/** Collect sessions whose cwd is at or under `root`, newest first. */
async function sessionsUnder(root: string): Promise<SessionEntry[]> {
  let dirs: string[];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const byId = new Map<string, SessionEntry>();
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
        const session = parseTranscript(raw);
        if (!session.sessionId || session.sessionId === 'unknown') continue;
        if (session.stats.turns < 1) continue;
        // The session's cwd lives on its entries; use the parsed project root.
        const cwd = session.cwd ?? root;
        if (!isUnderAny(cwd, [root])) continue;
        const st = await stat(path);
        const first = session.stats.firstUserPrompt?.replace(/\s+/g, ' ').trim() ?? '';
        const label = (session.title || first || session.sessionId).slice(0, 72);
        const existing = byId.get(session.sessionId);
        if (!existing || st.mtimeMs > existing.mtime) {
          byId.set(session.sessionId, { id: session.sessionId, label, mtime: st.mtimeMs, turns: session.stats.turns });
        }
      } catch {
        /* ignore unreadable files */
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.mtime - a.mtime);
}

export async function runSessions() {
  p.intro(pc.bgCyan(pc.black(' ClaudeLens · sessions ')));

  const cfg = await loadConfig();
  if (!cfg) {
    p.cancel('Not set up yet — run `claudelens setup` first.');
    return;
  }

  const root = resolve(process.argv[3] ?? process.cwd());
  const sessions = await sessionsUnder(root);
  if (!sessions.length) {
    p.cancel(`No Claude Code sessions found under ${root.replace(homedir(), '~')}.`);
    return;
  }

  const ignored = new Set(cfg.ignoreSessions);
  const tracked = await p.multiselect({
    message: 'Which sessions in this project should sync?  (untick to keep one off the dashboard)',
    options: sessions.map((s) => ({
      value: s.id,
      label: s.label,
      hint: `${s.turns} turn${s.turns === 1 ? '' : 's'}`,
    })),
    initialValues: sessions.filter((s) => !ignored.has(s.id)).map((s) => s.id),
    required: false,
  });
  if (p.isCancel(tracked)) return p.cancel('Cancelled — nothing changed.');

  const picked = new Set(tracked as string[]);
  const shownIds = new Set(sessions.map((s) => s.id));
  const untickedNow = sessions.filter((s) => !picked.has(s.id)).map((s) => s.id);
  // Preserve exclusions for sessions not shown here (other projects).
  const keptElsewhere = cfg.ignoreSessions.filter((id) => !shownIds.has(id));
  cfg.ignoreSessions = [...new Set([...untickedNow, ...keptElsewhere])];
  await saveConfig(cfg);

  p.note(
    untickedNow.length
      ? `${pc.yellow('Excluded')}  ${untickedNow.length} session(s) in this project`
      : pc.green('All sessions in this project sync'),
    'Saved',
  );
  p.outro(pc.dim('Excluded sessions are removed from future syncs; re-tick to restore.'));
}
