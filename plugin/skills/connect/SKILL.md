---
description: Connect ClaudeLens to your team's server (one time). After this, every Claude Code session is tracked automatically. Usage - /claudelens:connect <server-url> <token> <your display name>
---

One-time setup: point ClaudeLens at the team server and set the name your
sessions appear under on the dashboard. The user provides three things — the
**server URL**, the **ingest token** (both from whoever hosts the server), and
their **display name**. Read them from the user's message / `$ARGUMENTS` and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" connect $ARGUMENTS --session "${CLAUDE_SESSION_ID}"
```

Leave `$ARGUMENTS` unquoted so the shell splits it into `<server-url> <token>
<name...>` (the name may be several words). The `--session` flag makes connect
**exclude this very session**, so the token you just typed is never uploaded to
the dashboard. Relay the command's output.

**If the user hasn't given all three, ask before running** — especially the
display name. If you connect without a name, sessions fall back to the machine's
git/OS username, which is usually not what they want on a shared gallery.

After connecting, tracking is on for every project automatically — they only act
again to opt something OUT (`/claudelens:untrack`, `/claudelens:untrack-project`,
`/claudelens:pause`).
