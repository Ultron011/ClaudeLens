// `status` — invoked by the /claudelens:status skill. Read-only, non-interactive:
// prints where sessions go, who they're attributed to, and the switch state for
// the current project/session so the developer can see exactly what's tracked.
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  loadConfig,
  isConnected,
  resolveName,
  isExcludedLocally,
  isRepoExcluded,
  envOptedOut,
} from './config.js';

export async function runStatus(): Promise<void> {
  const cfg = await loadConfig();
  const cwd = process.cwd();

  if (!isConnected(cfg)) {
    console.log('ClaudeLens is not connected yet.');
    console.log('Run  /claudelens:connect <server-url> <token>  once to turn tracking on.');
    return;
  }

  const repoOff = await isRepoExcluded(cwd);
  const projOff = isExcludedLocally(cwd, cfg);
  const globalOff = cfg.paused || envOptedOut();

  const trackingHere = !globalOff && !projOff && !repoOff;

  console.log('ClaudeLens');
  console.log(`  Server    ${cfg.server}`);
  console.log(`  Author    ${resolveName(cfg)}`);
  console.log(`  Global    ${cfg.paused ? 'PAUSED' : envOptedOut() ? 'disabled by env (DO_NOT_TRACK)' : 'on'}`);
  console.log(`  This dir  ${cwd.replace(homedir(), '~')}`);
  console.log(
    `            ${
      trackingHere
        ? 'tracked ✓'
        : repoOff
          ? 'excluded by committed .claudelens (team-wide)'
          : projOff
            ? 'excluded (you ran /claudelens:untrack-project)'
            : 'not tracked (global pause/opt-out)'
    }`,
  );

  if (cfg.ignoreProjects.length) {
    console.log(`  Excluded projects (${cfg.ignoreProjects.length}):`);
    for (const p of cfg.ignoreProjects) console.log(`    · ${resolve(p).replace(homedir(), '~')}`);
  }
  if (cfg.ignoreSessions.length) {
    console.log(`  Excluded sessions: ${cfg.ignoreSessions.length}`);
  }
  // Live health check.
  try {
    const r = await fetch(`${cfg.server}/api/health`, { signal: AbortSignal.timeout(3000) });
    console.log(`  Health    ${r.ok ? 'reachable' : `HTTP ${r.status}`}`);
  } catch {
    console.log('  Health    unreachable');
  }
}
