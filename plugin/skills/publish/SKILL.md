---
description: Manually publish a past Claude Code session to the ClaudeLens gallery, with a curation note and tags. Use for one-off sharing; day-to-day capture is automatic.
---

Launch the ClaudeLens interactive publisher so the user can pick one of their
past sessions, add a note and tags, and upload it:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.mjs"
```

This is the manual path (choose a session, review, confirm). Automatic per-turn
sync for opted-in projects happens on its own via the Stop hook and needs no
command.
