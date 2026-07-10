#!/usr/bin/env -S npx tsx
// `/claudelens:setup` — one-time (re-runnable) configuration.
// Sets the contributor name and server URL. Tracking is ON by default for every
// project; this wizard also lets you opt the CURRENT project out. Run once per
// developer machine.
import { writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  loadConfig,
  saveConfig,
  newConfig,
  CONFIG_PATH,
  IGNORE_MARKER,
  type ClaudeLensConfig,
} from './config.js';

async function main() {
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

  const cfg: ClaudeLensConfig = existing
    ? { ...existing, name: (name as string).trim(), server: (server as string).trim() }
    : newConfig((name as string).trim(), { server: (server as string).trim() });

  const cwd = resolve(process.cwd());
  const optOut = await p.confirm({
    message: `Tracking is ON for every project. Opt THIS project out?  ${pc.dim(cwd)}`,
    initialValue: false,
  });
  if (p.isCancel(optOut)) return p.cancel('Cancelled.');

  if (optOut) {
    // Committed marker → opts the whole repo out for everyone on the team.
    try {
      await writeFile(
        join(cwd, IGNORE_MARKER),
        'This project is excluded from ClaudeLens tracking.\n',
        'utf8',
      );
    } catch {
      // fall back to the personal opt-out list if we can't write the marker
    }
    if (!cfg.optOutProjects.includes(cwd)) cfg.optOutProjects.push(cwd);
  } else {
    // Re-enabling: drop it from the personal opt-out list.
    cfg.optOutProjects = cfg.optOutProjects.filter((d) => d !== cwd);
  }

  await saveConfig(cfg);

  p.note(
    [
      `${pc.bold('Name')}       ${cfg.name}`,
      `${pc.bold('Server')}     ${cfg.server}`,
      `${pc.bold('Tracking')}   ${pc.green('ON by default')} for all projects`,
      `${pc.bold('Opted out')}  ${cfg.optOutProjects.length ? cfg.optOutProjects.join('\n             ') : '(none)'}`,
      `${pc.bold('Config')}     ${CONFIG_PATH}`,
    ].join('\n'),
    'Saved',
  );
  p.outro(pc.green('Setup complete — your sessions now sync automatically (except opted-out projects).'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
