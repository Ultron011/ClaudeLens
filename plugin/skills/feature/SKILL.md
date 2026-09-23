---
description: Feature THIS session on the ClaudeLens dashboard so teammates find it. /claudelens:feature --off un-features it.
---

Mark the current session as featured on the team dashboard:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" feature --session "${CLAUDE_SESSION_ID}" $ARGUMENTS
```

`$ARGUMENTS` is empty or `--off` (un-feature). If the session hasn't reached the
dashboard yet, the command syncs it first and retries; an untracked session is
never uploaded — it says so instead. Relay the one-line output, including the
link. Suggest `/claudelens:note` if the session has no note explaining why it's
worth reading.
