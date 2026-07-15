---
description: Update ClaudeLens to the latest version — pulls the newest bundle and hot-swaps it so the tracker runs current code. No reinstall needed.
---

Update the plugin in place. Run and relay the output:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" update --root "${CLAUDE_PLUGIN_ROOT}"
```

It finds the ClaudeLens marketplace checkout, fast-forwards it, and copies the
freshly-pulled files into the running plugin so new code takes effect on the next
turn. If it can't locate the checkout, it will tell the user to update via Claude
Code's `/plugin` menu. If an update adds or removes slash commands, a `/plugin`
update is still worth running so the command menu refreshes.
