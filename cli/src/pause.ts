// `claudelens pause` / `claudelens resume` — a global kill-switch. Pausing stops
// ALL syncing machine-wide without touching your exclusion lists, so you can go
// heads-down on sensitive work and flip everything back on afterwards.
import pc from 'picocolors';
import { loadConfig, saveConfig } from './config.js';

async function setPaused(paused: boolean) {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error(pc.yellow('Not set up yet — run `claudelens setup` first.'));
    process.exit(1);
  }
  if (cfg.paused === paused) {
    console.log(pc.dim(paused ? 'Already paused.' : 'Not paused.'));
    return;
  }
  cfg.paused = paused;
  await saveConfig(cfg);
  if (paused) {
    console.log(pc.yellow('\n  ⏸  Paused — nothing syncs until you run ') + pc.cyan('claudelens resume') + '\n');
  } else {
    console.log(pc.green('\n  ▶  Resumed — tracked projects sync again from the next turn.\n'));
  }
}

export const runPause = () => setPaused(true);
export const runResume = () => setPaused(false);
