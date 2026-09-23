// `status` — invoked by the /claudelens:status skill. Read-only, non-interactive:
// prints where sessions go, who they're attributed to, and the switch state for
// the current project/session so the developer can see exactly what's tracked.
// Also the "why did my sessions stop arriving?" checklist: which Claude profile
// (CLAUDE_CONFIG_DIR) and plugin build ran it, and the last upload attempt's outcome.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { PARSER_VERSION } from '@claudelens/shared';
import {
  loadConfig,
  isConnected,
  resolveName,
  isExcludedLocally,
  isRepoExcluded,
  envOptedOut,
  claudeConfigDir,
  CONFIG_PATH,
} from './config.js';
import { readAccount, accountPath } from './account.js';

const tilde = (p: string) => p.replace(homedir(), '~');

/** The running plugin dir: --root from the skill, else CLAUDE_PLUGIN_ROOT, else derived from this
 *  bundle's own path (<root>/dist/claudelens.mjs). */
function pluginRoot(): string {
  const a = process.argv.slice(3);
  const i = a.indexOf('--root');
  const v = i >= 0 ? a[i + 1] : undefined;
  if (v && !v.includes('$') && !v.includes('{')) return v;
  return process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(resolve(process.argv[1])));
}

function pluginVersion(root: string): string {
  try {
    return (JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: string }).version ?? '?';
  } catch {
    return 'unknown';
  }
}

/** "3m ago" style age of an ISO time, for the last-sync line. */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 90 * 60) return `${Math.round(s / 60)}m ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export async function runStatus(): Promise<void> {
  const cfg = await loadConfig();
  const cwd = process.cwd();

  const root = pluginRoot();
  const profile = `${tilde(claudeConfigDir())}${process.env.CLAUDE_CONFIG_DIR?.trim() ? ' (CLAUDE_CONFIG_DIR)' : ' (default)'}`;
  const plugin = `v${pluginVersion(root)} · ${tilde(root)}`;

  if (!isConnected(cfg)) {
    console.log('ClaudeLens is not connected yet.');
    console.log(`  Claude    ${profile}`);
    console.log(`  Plugin    ${plugin}`);
    console.log('Run  /claudelens:connect <server-url> <token>  once to turn tracking on.');
    return;
  }

  const repoOff = await isRepoExcluded(cwd);
  const projOff = isExcludedLocally(cwd, cfg);
  const globalOff = cfg.paused || envOptedOut();

  const trackingHere = !globalOff && !projOff && !repoOff;
  const account = cfg.shareAccount === false ? undefined : await readAccount();

  console.log('ClaudeLens');
  console.log(`  Server    ${cfg.server}`);
  console.log(`  Claude    ${profile}`);
  console.log(`  Plugin    ${plugin}`);
  console.log(`  Config    ${tilde(CONFIG_PATH)} (shared by every Claude profile)`);
  console.log(`  Author    ${resolveName(cfg, account)}`);
  if (account) {
    console.log(`  Account   ${account.email ?? '(no email)'}${account.organizationName ? ` · ${account.organizationName}` : ''}`);
  } else if (cfg.shareAccount === false) {
    console.log('  Account   not shared (shareAccount: false)');
  } else {
    console.log(`  Account   unavailable (could not read ${tilde(accountPath())})`);
  }
  console.log(`  Parser    v${PARSER_VERSION} (local)`);
  console.log(`  Global    ${cfg.paused ? 'PAUSED (/claudelens:resume to turn back on)' : envOptedOut() ? 'disabled by env (DO_NOT_TRACK)' : 'on'}`);
  console.log(
    `  Last sync ${
      cfg.lastSyncAt
        ? `${new Date(cfg.lastSyncAt).toISOString().replace('T', ' ').slice(0, 19)} UTC (${ago(cfg.lastSyncAt)}) — ${
            cfg.lastSyncOk ? 'ok' : `FAILED: ${cfg.lastSyncError ?? 'unknown error'}`
          }`
        : 'none recorded yet (tracked since plugin 0.8.0)'
    }`,
  );
  console.log(`  This dir  ${tilde(cwd)}`);
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
    for (const p of cfg.ignoreProjects) console.log(`    · ${tilde(resolve(p))}`);
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
