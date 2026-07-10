---
description: Manually pick and publish one past Claude Code session to the gallery. Interactive — run in the user's own terminal. Day-to-day capture is automatic.
---

Manual publishing is interactive (pick a session, review, confirm), and
interactive prompts do **not** work inside Claude Code. Tell the user to run
this in their own terminal:

```
claudelens publish
```

Note that this is only for one-off sharing — sessions in tracked projects sync
automatically after every turn via the Stop hook, with no command needed.
