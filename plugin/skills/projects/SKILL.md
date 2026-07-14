---
description: Review which projects ClaudeLens tracks — an interactive checklist. Tracking is on by default (everything ticked); untick to exclude. Must be run in the user's own terminal, not inside Claude Code.
---

The project checklist is interactive, and interactive prompts do **not** work
inside Claude Code (no TTY). Do not try to run it yourself. Tell the user to run
this in their own terminal:

```
claudelens projects
```

Tracking is **on by default**: the checklist starts with every project ticked.
Unticking a project stops its sessions from syncing (this machine only); ticking
it again resumes. For the common case of "stop tracking the project I'm in",
they can just run `claudelens untrack` inside it (or the `/claudelens:track`
skill). To exclude a repo for the whole team, `claudelens untrack --shared`
writes a committed `.claudelens` file.
