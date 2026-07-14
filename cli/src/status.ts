// `claudelens status` — show current config and which projects are tracked.
// Read-only and non-interactive, so it's safe to run anywhere (including as a
// Claude Code skill). Tracking is on by default; this makes the exclusions and
// the global pause visible at a glance.
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
  console.log(
    `  ${pc.dim('Sync')}     ${
      cfg.paused
        ? pc.yellow('paused — nothing syncs')
        : cfg.trackingReviewed
          ? pc.green('on (tracking by default)')
          : pc.yellow('not reviewed yet — run `claudelens projects`')
    }`,
  );
  console.log(`  ${pc.dim('Config')}   ${CONFIG_PATH}`);

  // Live server check.
  try {
    const r = await fetch(`${cfg.server}/api/health`, { signal: AbortSignal.timeout(3000) });
    console.log(`  ${pc.dim('Health')}   ${r.ok ? pc.green('reachable') : pc.red(`HTTP ${r.status}`)}`);
  } catch {
    console.log(`  ${pc.dim('Health')}   ${pc.red('unreachable')}`);
  }

  const projects = await discover();
  const tracked = projects.filter((pr) => !pr.repoExcluded && isTracked(pr.cwd, cfg));

  console.log(
    pc.bold(
      `\n  Projects  ${pc.green(`${tracked.length} tracked`)} · ${pc.dim(
        `${projects.length - tracked.length} excluded`,
      )}\n`,
    ),
  );
  for (const pr of projects) {
    const repoOff = pr.repoExcluded;
    const on = !repoOff && isTracked(pr.cwd, cfg);
    const mark = on ? pc.green('✓') : pc.dim('·');
    const label = on ? pr.label : pc.dim(pr.label);
    const tag = repoOff ? pc.dim('  (repo .claudelens)') : '';
    console.log(`  ${mark} ${label} ${pc.dim(`(${pr.sessions})`)}${tag}`);
  }

  if (cfg.ignoreSessions.length) {
    console.log(pc.dim(`\n  ${cfg.ignoreSessions.length} individual session(s) excluded.`));
  }
  console.log(
    `\n  Exclude the current project with ${pc.cyan('claudelens untrack')}, ` +
      `or review all with ${pc.cyan('claudelens projects')}\n`,
  );
}
