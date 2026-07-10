// `claudelens update` — pull the latest code and rebuild the bundle, so both
// the `claudelens` command and the Stop-hook sync run the newest version with
// no plugin reinstall. Works because the installed `claudelens` command and the
// hook both point at this repo's bundle.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';

function run(cmd: string, args: string[], cwd: string): boolean {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return r.status === 0;
}

export async function runUpdate() {
  // bundle lives at <repo>/plugin/dist/claudelens.mjs
  const bundle = fileURLToPath(import.meta.url);
  const repo = resolve(dirname(bundle), '..', '..');

  if (!existsSync(join(repo, '.git'))) {
    console.error(pc.red(`Can't find the ClaudeLens git clone at ${repo}.`));
    console.error(
      'Update from your clone (where you ran `claudelens install`), or reinstall the plugin in Claude Code.',
    );
    process.exit(1);
  }

  console.log(pc.dim(`Updating ClaudeLens in ${repo}\n`));

  if (!run('git', ['-C', repo, 'pull', '--ff-only'], repo)) {
    console.error(pc.red('\ngit pull failed — resolve it in the repo, then retry.'));
    process.exit(1);
  }

  // Rebuild the bundle from the pulled source (best-effort: the committed
  // bundle is already current, so a missing pnpm is not fatal).
  console.log(pc.dim('\nRebuilding bundle…'));
  const built = run('pnpm', ['--filter', '@claudelens/cli', 'build:plugin'], repo);
  if (!built) {
    console.log(pc.yellow('(skipped rebuild — using the committed bundle from the pull)'));
  }

  console.log(pc.green('\n✔ Updated.'));
  console.log(pc.dim('Takes effect on the next turn / command — no plugin reinstall needed.'));
}
