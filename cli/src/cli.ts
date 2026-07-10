#!/usr/bin/env node
// ClaudeLens CLI — run these in YOUR OWN terminal. Interactive prompts don't
// work through Claude Code (no TTY), so `setup` / `projects` live here.
// Subcommands: setup · projects · status · install · publish · sync (internal).
const cmd = process.argv[2];

function printHelp() {
  console.log(`ClaudeLens — a lens into how your team works with Claude Code

Usage: claudelens <command>

  track [dir]    Start tracking a project (defaults to the current directory)
  untrack [dir]  Stop tracking a project
  projects       Edit tracked projects (interactive checklist)
  status         Show current config and tracked projects
  setup          Configure your name, server URL and token
  update         Pull the latest code + rebuild — no plugin reinstall
  install        Add the 'claudelens' command to your PATH (~/.local/bin)
  publish        Manually pick and publish one past session
  sync           (internal) invoked by the Stop hook; reads a hook payload on stdin

Run these in your own terminal — interactive prompts don't work inside Claude Code.`);
}

async function main() {
  switch (cmd) {
    case 'setup':
      return (await import('./setup.js')).runSetup();
    case 'track':
      return (await import('./track.js')).runTrack();
    case 'untrack':
      return (await import('./track.js')).runUntrack();
    case 'projects':
      return (await import('./projects.js')).runProjects();
    case 'status':
      return (await import('./status.js')).runStatus();
    case 'update':
      return (await import('./update.js')).runUpdate();
    case 'install':
      return (await import('./install.js')).runInstall();
    case 'publish':
      return (await import('./index.js')).runPublish();
    case 'sync':
      return (await import('./sync.js')).runSync();
    case '-h':
    case '--help':
    case 'help':
    case undefined:
      return printHelp();
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  // The Stop hook must never disrupt a session; swallow sync errors.
  if (cmd === 'sync') {
    if (process.env.CLAUDELENS_DEBUG) console.error('[claudelens sync]', err);
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
