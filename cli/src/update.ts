// `update` — invoked by /claudelens:update. Pulls the latest committed bundle so
// the Stop-hook sync runs the newest version. The plugin ships its bundle
// (plugin/dist/claudelens.mjs) committed, so a fast-forward pull of the checkout
// that contains it is enough — no rebuild required. If a full monorepo with
// pnpm is present (a dev clone), we also rebuild, best-effort.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function run(cmd: string, args: string[], cwd: string): boolean {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return r.status === 0;
}

/** Nearest ancestor of `start` that is a git checkout, or undefined. */
function findGitRoot(start: string): string | undefined {
  let cur = resolve(start);
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(cur, '.git'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
  return undefined;
}

export async function runUpdate(): Promise<void> {
  const bundleDir = dirname(fileURLToPath(import.meta.url)); // .../dist
  const repo = findGitRoot(bundleDir);

  if (!repo) {
    console.log("Couldn't find a git checkout for this plugin.");
    console.log('Update it from Claude Code with:  /plugin  →  update  (or re-add the marketplace).');
    return;
  }

  console.log(`Updating ClaudeLens in ${repo}`);
  if (!run('git', ['-C', repo, 'pull', '--ff-only'], repo)) {
    console.log('git pull failed — resolve it in the checkout, then retry.');
    return;
  }

  // Rebuild only if this is a full dev clone with the workspace present.
  if (existsSync(join(repo, 'pnpm-workspace.yaml'))) {
    console.log('Rebuilding bundle…');
    if (!run('pnpm', ['--filter', '@claudelens/cli', 'build:plugin'], repo)) {
      console.log('(skipped rebuild — using the committed bundle from the pull)');
    }
  }

  console.log('✔ Updated. Takes effect on the next turn — no reinstall needed.');
}
