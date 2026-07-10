---
description: Choose which projects ClaudeLens tracks. Opens a checklist of the projects you've used Claude Code in — tick to track, untick to exclude. The easy way to opt projects in or out without editing files.
---

Open the ClaudeLens project picker so the user can control which of their
projects sync to the team gallery:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/projects.mjs"
```

It lists every project the user has run Claude Code in (ticked = tracked) and
writes their choices to `~/.claude/claudelens.json`. Excluded projects stop
syncing immediately. After it finishes, mention that a whole repo can also be
excluded team-wide by committing a `.claudelens-ignore` file at its root.
