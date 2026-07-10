// `claudelens track [path]` — start tracking a project (defaults to the current
// directory). From then on, sessions in that project (and its subfolders) sync.
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import pc from 'picocolors';
import { loadConfig, saveConfig, isUnderAny } from './config.js';

const pretty = (d: string) => d.replace(homedir(), '~');

export async function runTrack() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error(pc.yellow('Not set up yet — run `claudelens setup` first.'));
    process.exit(1);
  }
  const dir = resolve(process.argv[3] ?? process.cwd());

  if (isUnderAny(dir, cfg.trackProjects)) {
    console.log(pc.dim(`Already tracking ${pretty(dir)}`));
    return;
  }
  cfg.trackProjects.push(dir);
  await saveConfig(cfg);
  console.log(pc.green(`\n  ✔ Now tracking  ${pretty(dir)}`));
  console.log(pc.dim('  Sessions here (and in subfolders) sync from the next turn on.\n'));
}

export async function runUntrack() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error(pc.yellow('Not set up yet — run `claudelens setup` first.'));
    process.exit(1);
  }
  const dir = resolve(process.argv[3] ?? process.cwd());
  const before = cfg.trackProjects.length;
  cfg.trackProjects = cfg.trackProjects.filter((p) => resolve(p) !== dir);

  if (cfg.trackProjects.length === before) {
    console.log(pc.dim(`${pretty(dir)} wasn't being tracked.`));
    return;
  }
  await saveConfig(cfg);
  console.log(pc.yellow(`\n  ✔ Stopped tracking  ${pretty(dir)}\n`));
}
