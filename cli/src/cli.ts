#!/usr/bin/env node
// ClaudeLens bundle entrypoint. This is NOT a human-facing CLI — there is no
// terminal `claudelens` command and no interactive setup. Every op here is
// invoked by the plugin: the Stop hook runs `sync`, and the /claudelens:*
// slash-command skills run the rest. See plugin/hooks/hooks.json and
// plugin/skills/*. Kept a plain arg switch so it stays trivial to invoke as
//   node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" <op> [args]
const op = process.argv[2];

async function main() {
  switch (op) {
    case 'sync': // Stop hook
      return (await import('./sync.js')).runSync();
    case 'connect': // /claudelens:connect
      return (await import('./connect.js')).runConnect();
    case 'untrack-session': // /claudelens:untrack
      return (await import('./optout.js')).runUntrackSession();
    case 'track-session':
      return (await import('./optout.js')).runTrackSession();
    case 'untrack-project': // /claudelens:untrack-project
      return (await import('./optout.js')).runUntrackProject();
    case 'track-project': // /claudelens:track
      return (await import('./optout.js')).runTrackProject();
    case 'pause': // /claudelens:pause
      return (await import('./optout.js')).runPause();
    case 'resume': // /claudelens:resume
      return (await import('./optout.js')).runResume();
    case 'status': // /claudelens:status
      return (await import('./status.js')).runStatus();
    case 'update': // /claudelens:update
      return (await import('./update.js')).runUpdate();
    default:
      console.error(
        `ClaudeLens is a Claude Code plugin — use the /claudelens:* commands, not a terminal.\n` +
          `Unknown op: ${op ?? '(none)'}`,
      );
      process.exit(1);
  }
}

main().catch((err) => {
  // The Stop hook must never disrupt a session; swallow sync errors.
  if (op === 'sync') {
    if (process.env.CLAUDELENS_DEBUG) console.error('[claudelens sync]', err);
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
