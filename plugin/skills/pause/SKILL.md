---
description: Pause or resume all ClaudeLens syncing — a global kill-switch that stops every project from syncing without losing the user's exclusion lists.
---

A global kill-switch for when the user is doing sensitive work and wants nothing
synced for a while. Non-interactive — run the one they want and relay the result.

**Pause everything** (stops all syncing, keeps all exclusion settings):

```
claudelens pause 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" pause
```

**Resume**:

```
claudelens resume 2>/dev/null || node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" resume
```

Pausing is machine-wide and reversible; it doesn't change which projects or
sessions are excluded. To exclude just one project instead, use `claudelens
untrack`.
