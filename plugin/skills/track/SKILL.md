---
description: Start tracking the current project in ClaudeLens. Nothing syncs until you opt a project in with this — run it once inside a project and its sessions begin syncing.
---

Opt the current project in to ClaudeLens tracking. This is non-interactive, so
run it and relay the result:

```
claudelens track 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" track
```

It adds the current working directory to the tracked list; sessions in this
project (and subfolders) sync from the next turn on. Tracking is **opt-in** —
nothing syncs until a project is added this way. To stop later, the user runs
`claudelens untrack` in the project (or unticks it in `claudelens projects`).
