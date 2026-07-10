---
description: Update ClaudeLens to the latest version — pulls the code and rebuilds. No plugin uninstall/reinstall needed.
---

Update the user's ClaudeLens install. This is non-interactive (it runs
git + a rebuild), so you can run it and relay the output:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" update
```

If it reports it can't find the git clone, the plugin was installed without a
local clone — tell the user to run it from their cloned repo instead
(`claudelens update`), or reinstall the plugin in Claude Code for that one-off.
It updates both the `claudelens` command and the Stop-hook sync; changes take
effect on the next turn with no reinstall.
