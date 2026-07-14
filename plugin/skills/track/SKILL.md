---
description: Manage ClaudeLens tracking for the current project. Tracking is on by default; use this to stop tracking a project (untrack) or resume one you'd excluded (track).
---

Tracking in ClaudeLens is **on by default** — every project the user works in
syncs after each turn unless they opt it out. These are non-interactive, so run
the one they want and relay the result.

**Stop tracking the current project** (this machine only):

```
claudelens untrack 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" untrack
```

**Exclude the whole repo for the entire team** (writes a committed `.claudelens`
file — tell the user to commit it):

```
claudelens untrack --shared 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" untrack --shared
```

**Resume tracking a project** they'd previously excluded:

```
claudelens track 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" track
```

To review every project at once, or to exclude individual sessions, point the
user at `claudelens projects` and `claudelens sessions` (both interactive, so
they run those in their own terminal). To stop everything at once, `claudelens
pause`.
