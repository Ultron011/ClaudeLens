---
description: Stop tracking the CURRENT project in ClaudeLens (all its sessions). Add --team to exclude the repo for everyone via a committed .claudelens file.
---

Exclude the current project from ClaudeLens. For just this machine:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" untrack-project "${CLAUDE_PROJECT_DIR}"
```

To exclude the repo for the **whole team** (writes a committed `.claudelens`
file the user should commit):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" untrack-project "${CLAUDE_PROJECT_DIR}" --team
```

Use `--team` only if the user asks to exclude it for everyone. Sessions in this
project stop syncing immediately. Relay the output. Undo with
`/claudelens:track-project`.
