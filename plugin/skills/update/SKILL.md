---
description: Update ClaudeLens to the latest version — pulls the newest bundle so the tracker runs the current code. No reinstall needed.
---

Update the plugin in place. Run and relay the output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" update
```

It fast-forwards the plugin's git checkout to the latest committed bundle (and
rebuilds if run from a full dev clone). Takes effect on the next turn. If it says
it can't find a git checkout, tell the user to update via Claude Code's `/plugin`
menu instead.
