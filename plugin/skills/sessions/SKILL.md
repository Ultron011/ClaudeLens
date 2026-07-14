---
description: Exclude individual Claude Code sessions in a project from ClaudeLens — an interactive checklist for keeping a single sensitive conversation off the dashboard even when the project is tracked. Run in the user's own terminal.
---

For the one-off sensitive conversation inside an otherwise-tracked project. The
checklist is interactive, so interactive prompts do **not** work inside Claude
Code (no TTY). Don't run it yourself — tell the user to run this in their own
terminal, from inside the project:

```
claudelens sessions
```

It lists recent sessions in the current project with every one ticked (tracked);
unticking a session removes it from future syncs and keeps it off the dashboard.
To exclude a whole project instead, use `claudelens untrack`.
