// Manage per-project exclusions. Tracking is ON BY DEFAULT, so these commands
// are about opting OUT (and back in):
//
//   claudelens untrack [dir]            stop tracking a project (this machine)
//   claudelens untrack [dir] --shared   also write a committed .claudelens so the
//                                        repo is excluded for the WHOLE team
//   claudelens track   [dir]            resume tracking a project you'd excluded
//   claudelens track   [dir] --shared   also remove the committed .claudelens
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { writeFile, unlink } from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, saveConfig, isExcludedLocally, REPO_MARKER } from './config.js';

const pretty = (d: string) => d.replace(homedir(), '~');

/** Split argv after the subcommand into an optional path and a --shared flag. */
function parseArgs(): { dir: string; shared: boolean } {
  const args = process.argv.slice(3);
  const shared = args.includes('--shared') || args.includes('--repo');
  const positional = args.find((a) => !a.startsWith('-'));
  return { dir: resolve(positional ?? process.cwd()), shared };
}

function reviewHint(reviewed: boolean) {
  if (!reviewed) {
    console.log(
      pc.dim('  Finish switching tracking on with ') + pc.cyan('claudelens projects') + pc.dim('.'),
    );
  }
}

export async function runTrack() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error(pc.yellow('Not set up yet — run `claudelens setup` first.'));
    process.exit(1);
  }
  const { dir, shared } = parseArgs();

  const wasExcluded = cfg.ignoreProjects.some((p) => resolve(p) === dir);
  cfg.ignoreProjects = cfg.ignoreProjects.filter((p) => resolve(p) !== dir);
  await saveConfig(cfg);

  if (shared) {
    try {
      await unlink(join(dir, REPO_MARKER));
      console.log(pc.dim(`  Removed committed ${REPO_MARKER} — repo tracked for the team again.`));
    } catch {
      /* nothing to remove */
    }
  }

  if (wasExcluded || shared) {
    console.log(pc.green(`\n  ✔ Tracking  ${pretty(dir)}`));
    console.log(pc.dim('  Sessions here (and in subfolders) sync from the next turn on.'));
  } else {
    console.log(pc.dim(`Already tracking ${pretty(dir)} (tracking is on by default).`));
  }
  reviewHint(cfg.trackingReviewed);
  console.log('');
}

export async function runUntrack() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error(pc.yellow('Not set up yet — run `claudelens setup` first.'));
    process.exit(1);
  }
  const { dir, shared } = parseArgs();

  if (!isExcludedLocally(dir, cfg)) {
    cfg.ignoreProjects.push(dir);
    await saveConfig(cfg);
  }

  if (shared) {
    await writeFile(
      join(dir, REPO_MARKER),
      '# ClaudeLens: this repo is never tracked, for anyone. Commit this file.\nignore: true\n',
      'utf8',
    );
    console.log(pc.yellow(`\n  ✔ Wrote ${REPO_MARKER} — commit it to exclude this repo team-wide.`));
  } else {
    console.log(pc.yellow(`\n  ✔ Stopped tracking  ${pretty(dir)}`));
    console.log(pc.dim('  Sessions here stop syncing immediately (this machine only).'));
  }
  console.log('');
}
