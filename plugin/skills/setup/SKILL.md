---
description: Set up ClaudeLens for this user — installs the `claudelens` command, then walks them through configuring their name, server URL and token.
---

Get this user set up on ClaudeLens. Two steps:

**1. Install the `claudelens` terminal command.** This is non-interactive and
safe — run it and relay the output:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" install
```

It drops a `claudelens` command in `~/.local/bin`. If it warns that
`~/.local/bin` isn't on the user's PATH, show them the exact line it prints to
fix that (and tell them to reopen their terminal).

**2. Finish setup in their own terminal.** Configuration is interactive, and
interactive prompts do **not** work inside Claude Code (no TTY). Tell the user
to run this in their own terminal:

```
claudelens setup
```

They'll enter their display name, the ClaudeLens **server URL**, and the
**ingest token** (both provided by whoever hosts the server). After that,
nothing syncs until they opt a project in — tell them to run `claudelens track`
inside any project they want captured (or the `/claudelens:track` skill).
