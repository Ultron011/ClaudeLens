// `claudelens setup` — identity + server config (name, server URL, token),
// then a one-time tracking review. Tracking is ON BY DEFAULT: the review shows
// every project you've used Claude Code in, all ticked, and you untick the ones
// you don't want captured. Nothing syncs until you pass this screen — so a fresh
// install (or an upgrade from the old opt-in model) never uploads a project you
// haven't looked at.
import { userInfo } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig, newConfig, CONFIG_PATH, type ClaudeLensConfig } from './config.js';
import { reviewProjects } from './projects.js';

export async function runSetup() {
  p.intro(pc.bgCyan(pc.black(' ClaudeLens setup ')));

  const existing = await loadConfig();

  const name = await p.text({
    message: 'Your name (shown as the author on the dashboard)',
    initialValue: existing?.name ?? userInfo().username,
    validate: (v) => (v.trim() ? undefined : 'required'),
  });
  if (p.isCancel(name)) return p.cancel('Cancelled.');

  const server = await p.text({
    message: 'ClaudeLens server URL',
    initialValue: existing?.server ?? 'http://localhost:4000',
    validate: (v) => (v.trim() ? undefined : 'required'),
  });
  if (p.isCancel(server)) return p.cancel('Cancelled.');

  const token = await p.password({
    message: 'Ingest token (blank = keep current / open server)',
  });
  if (p.isCancel(token)) return p.cancel('Cancelled.');
  const tokenValue = (token as string).trim() || existing?.token || undefined;

  const cfg: ClaudeLensConfig = existing
    ? { ...existing, name: (name as string).trim(), server: (server as string).trim(), token: tokenValue }
    : newConfig((name as string).trim(), { server: (server as string).trim(), token: tokenValue });

  // Note when we're upgrading a legacy opt-in config, so the review copy can
  // make clear that tracking is switching to on-by-default.
  const upgrading = Boolean(existing?.trackProjects && !existing.trackingReviewed);
  if (upgrading) {
    p.log.info(
      pc.dim('Upgrading from the old opt-in setup — ') +
        'tracking now defaults to on. Nothing has synced yet; review below.',
    );
  }

  // The tracking review — the moment where the developer confirms exactly what
  // will and won't sync before anything does.
  p.log.step(pc.bold('Tracking is on by default.') + pc.dim(' Review what syncs — untick to exclude.'));
  const reviewed = await reviewProjects(cfg);
  if (!reviewed) return p.cancel('Cancelled — nothing changed.');

  await saveConfig(cfg);

  p.note(
    [
      `${pc.bold('Name')}      ${cfg.name}`,
      `${pc.bold('Server')}    ${cfg.server}`,
      `${pc.bold('Token')}     ${cfg.token ? pc.green('set') : pc.dim('(none)')}`,
      `${pc.bold('Tracking')}  ${trackingSummary(cfg)}`,
      `${pc.bold('Config')}    ${CONFIG_PATH}`,
    ].join('\n'),
    'Saved',
  );
  p.outro(
    pc.green('Setup complete. ') +
      pc.dim('Tracked projects sync automatically after each turn.\n') +
      pc.dim('Exclude one anytime with ') +
      pc.cyan('claudelens untrack') +
      pc.dim(', or pause everything with ') +
      pc.cyan('claudelens pause') +
      pc.dim('.'),
  );
}

/** Human summary of the current exclusion state. */
function trackingSummary(cfg: ClaudeLensConfig): string {
  const n = cfg.ignoreProjects.length;
  if (cfg.paused) return pc.yellow('paused (nothing syncs)');
  return n === 0
    ? pc.green('every project')
    : `${pc.green('on')} · ${n} project(s) excluded`;
}
