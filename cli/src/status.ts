// `claudelens status` — show current config and which projects are tracked.
// Read-only and non-interactive, so it's safe to run anywhere (including as a
// Claude Code skill).
import pc from 'picocolors';
import { loadConfig, CONFIG_PATH } from './config.js';
import { discover, isTracked } from './projects.js';

export async function runStatus() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.log(pc.yellow('ClaudeLens is not set up on this machine.'));
    console.log(`Run ${pc.cyan('claudelens setup')} to configure it.`);
    return;
  }

  console.log(pc.bold('\n  ClaudeLens status\n'));
  console.log(`  ${pc.dim('Name')}     ${cfg.name}`);
  console.log(`  ${pc.dim('Server')}   ${cfg.server}`);
  console.log(`  ${pc.dim('Token')}    ${cfg.token ? pc.green('set') : pc.dim('(none)')}`);
  console.log(`  ${pc.dim('Redact')}   ${cfg.redact ? 'on' : 'off'}`);
  console.log(`  ${pc.dim('Config')}   ${CONFIG_PATH}`);

  // Live server check.
  try {
    const r = await fetch(`${cfg.server}/api/health`, { signal: AbortSignal.timeout(3000) });
    console.log(`  ${pc.dim('Health')}   ${r.ok ? pc.green('reachable') : pc.red(`HTTP ${r.status}`)}`);
  } catch {
    console.log(`  ${pc.dim('Health')}   ${pc.red('unreachable')}`);
  }

  const projects = await discover();
  const tracked = projects.filter((p) => isTracked(p.cwd, cfg.trackProjects));

  console.log(
    pc.bold(
      `\n  Projects  ${pc.green(`${tracked.length} tracked`)} · ${pc.dim(`${projects.length - tracked.length} not tracked`)}\n`,
    ),
  );
  for (const p of projects) {
    const on = isTracked(p.cwd, cfg.trackProjects);
    const mark = on ? pc.green('✓') : pc.dim('·');
    const label = on ? p.label : pc.dim(p.label);
    console.log(`  ${mark} ${label} ${pc.dim(`(${p.sessions})`)}`);
  }
  console.log(
    `\n  Track the current project with ${pc.cyan('claudelens track')}, or edit with ${pc.cyan('claudelens projects')}\n`,
  );
}
