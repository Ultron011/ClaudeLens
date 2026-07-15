// `update` — invoked by /claudelens:update. The running plugin lives in a
// version-pinned cache snapshot (no git), while the git checkout is the separate
// marketplace clone. So we: (1) find the marketplace clone via Claude Code's
// registry, (2) fast-forward it, (3) hot-swap the freshly-pulled files into the
// running plugin dir (passed as --root / CLAUDE_PLUGIN_ROOT) so new code takes
// effect on the next turn. Falls back to guiding the user to /plugin if it can't
// locate things. Best-effort and non-destructive: only overwrites plugin files.
import { readFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const PLUGINS_DIR = join(homedir(), '.claude', 'plugins');
const MARKER = join('dist', 'claudelens.mjs'); // proves a dir is our plugin source

function git(args: string[], cwd: string): boolean {
  return spawnSync('git', args, { cwd, stdio: 'inherit' }).status === 0;
}

/** The running plugin dir: --root <dir> from the skill, or CLAUDE_PLUGIN_ROOT. */
function runningRoot(): string | undefined {
  const a = process.argv.slice(3);
  const i = a.indexOf('--root');
  const v = i >= 0 ? a[i + 1] : undefined;
  if (v && !v.includes('$') && !v.includes('{')) return v;
  return process.env.CLAUDE_PLUGIN_ROOT || undefined;
}

/** Find the ClaudeLens marketplace git checkout via Claude Code's registry. */
async function findMarketplace(): Promise<string | undefined> {
  try {
    const raw = await readFile(join(PLUGINS_DIR, 'known_marketplaces.json'), 'utf8');
    const reg = JSON.parse(raw) as Record<string, { installLocation?: string }>;
    for (const entry of Object.values(reg)) {
      const loc = entry.installLocation;
      if (loc && existsSync(join(loc, '.git')) && existsSync(join(loc, 'plugin', MARKER))) return loc;
    }
  } catch {
    /* no registry — try the conventional path */
  }
  const guess = join(PLUGINS_DIR, 'marketplaces', 'claudelens');
  if (existsSync(join(guess, '.git')) && existsSync(join(guess, 'plugin', MARKER))) return guess;
  return undefined;
}

export async function runUpdate(): Promise<void> {
  const mp = await findMarketplace();
  if (!mp) {
    console.log("Couldn't find the ClaudeLens marketplace checkout.");
    console.log('Update via Claude Code:  /plugin  →  update  (or re-add the marketplace).');
    return;
  }

  console.log(`Pulling latest in ${mp} …`);
  if (!git(['-C', mp, 'pull', '--ff-only'], mp)) {
    console.log('git pull failed — resolve it in that checkout, then retry.');
    return;
  }

  const src = join(mp, 'plugin');
  const root = runningRoot();
  if (!root || !existsSync(root)) {
    console.log('✔ Latest fetched. Activate it with  /plugin  →  update  (or restart Claude Code).');
    return;
  }
  if (resolve(src) === resolve(root)) {
    console.log('✔ Updated (running directly from the marketplace checkout).');
    return;
  }

  // Hot-swap the running plugin's files with the freshly-pulled ones.
  for (const part of ['dist', 'skills', 'hooks', '.claude-plugin']) {
    const from = join(src, part);
    if (existsSync(from)) await cp(from, join(root, part), { recursive: true, force: true });
  }
  console.log('✔ Updated — new code runs from the next turn.');
  console.log('(If an update adds/removes slash commands, run /plugin → update too so the menu refreshes.)');
}
