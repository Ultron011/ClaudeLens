---
description: Edit which projects ClaudeLens tracks — an interactive checklist (tick = track). Must be run in the user's own terminal, not inside Claude Code.
---

The project checklist is interactive, and interactive prompts do **not** work
inside Claude Code (no TTY). Do not try to run it yourself. Tell the user to run
this in their own terminal:

```
claudelens projects
```

Tracking is **opt-in**: nothing syncs unless ticked. Ticking a project starts
syncing its sessions; unticking stops it. For the common case of "track the
project I'm in", they can instead just run `claudelens track` inside it (or the
`/claudelens:track` skill).
