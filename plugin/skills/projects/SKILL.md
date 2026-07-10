---
description: Choose which projects ClaudeLens tracks (opt in/out). Interactive checklist — must be run in the user's own terminal, not inside Claude Code.
---

The project picker is interactive, and interactive prompts do **not** work
inside Claude Code (no TTY). Do not try to run it yourself. Tell the user to run
this in their own terminal:

```
claudelens projects
```

It lists every project they've used Claude Code in (ticked = tracked); they
untick to exclude and it saves the choice — no files or JSON to edit. Excluded
projects stop syncing immediately.

Also mention: a whole repo can be excluded team-wide by committing a
`.claudelens-ignore` file at its root.
