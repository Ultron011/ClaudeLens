---
description: Configure ClaudeLens (your name, server URL, ingest token). Interactive — must be run in the user's own terminal, not inside Claude Code.
---

ClaudeLens setup is interactive, and interactive prompts do **not** work inside
Claude Code (no TTY). Do not try to run it yourself. Instead, tell the user to
run this in their own terminal:

```
claudelens setup
```

If the `claudelens` command isn't found, tell them to install it once (from the
cloned repo):

```
node plugin/dist/claudelens.mjs install
```

and add `~/.local/bin` to their PATH if prompted. Then `claudelens setup`.
