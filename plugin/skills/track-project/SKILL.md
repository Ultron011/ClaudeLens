---
description: Resume tracking the current project after excluding it. Add --team to also remove a committed .claudelens.
---

Re-enable ClaudeLens for the current project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" track-project "${CLAUDE_PROJECT_DIR}"
```

If the repo was excluded team-wide, add `--team` to also delete the committed
`.claudelens` file:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" track-project "${CLAUDE_PROJECT_DIR}" --team
```

Relay the output.
