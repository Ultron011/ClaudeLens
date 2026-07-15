---
description: Connect ClaudeLens to your team's server (one time). After this, every Claude Code session is tracked automatically. Usage - /claudelens:connect <server-url> <token>
---

One-time setup: point ClaudeLens at the team server so tracking turns on. The
user provides the **server URL** and **ingest token** (from whoever hosts the
server). Read them from the user's message / `$ARGUMENTS` and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" connect $ARGUMENTS --session "${CLAUDE_SESSION_ID}"
```

Leave `$ARGUMENTS` unquoted so the shell splits it into `<server-url> <token>`.
The `--session` flag makes connect
**exclude this very session** from syncing, so the token you just typed is never
uploaded to the dashboard. Relay the command's output.

If the user hasn't given both values, ask for the server URL and token first.
After connecting, tracking is on for every project automatically — they only act
again if they want to opt something OUT (`/claudelens:untrack`,
`/claudelens:untrack-project`, `/claudelens:pause`).
