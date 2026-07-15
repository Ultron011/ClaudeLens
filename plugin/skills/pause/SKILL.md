---
description: Pause ALL ClaudeLens syncing on this machine — a global kill-switch. Nothing syncs until /claudelens:resume.
---

Global kill-switch for a stretch of sensitive work. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" pause
```

Nothing syncs on this machine until the user runs `/claudelens:resume`. It
doesn't change which projects/sessions are excluded. Relay the output.
