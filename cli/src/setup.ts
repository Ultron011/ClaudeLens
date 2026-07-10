// `claudelens setup` — identity + server config (name, server URL, token).
// Tracking is ON by default for every project; choose which projects to track
// or exclude with `claudelens projects`.
import { userInfo } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, saveConfig, newConfig, CONFIG_PATH, type ClaudeLensConfig } from './config.js';

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

  await saveConfig(cfg);

  p.note(
    [
      `${pc.bold('Name')}     ${cfg.name}`,
      `${pc.bold('Server')}   ${cfg.server}`,
      `${pc.bold('Token')}    ${cfg.token ? pc.green('set') : pc.dim('(none)')}`,
      `${pc.bold('Tracking')} ${cfg.trackProjects.length} project(s) opted in`,
      `${pc.bold('Config')}   ${CONFIG_PATH}`,
    ].join('\n'),
    'Saved',
  );
  p.outro(
    pc.green('Setup complete.') +
      '\n' +
      pc.dim('Nothing syncs until you opt a project in. Inside a project, run:  ') +
      pc.cyan('claudelens track'),
  );
}
