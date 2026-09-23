---
description: Connect ClaudeLens to your team's server (one time). After this, every Claude Code session is tracked automatically. Usage - /claudelens:connect <server-url> <token> <your display name>
---

One-time setup: point ClaudeLens at the team server and set the name your
sessions appear under on the dashboard.

**Disclosure — tell the user this before or when you connect:** ClaudeLens
also reads the email address of the Claude Code account you're signed in
with (`~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json` under a profile) and sends it along with each synced session, to group
your sessions by account on the dashboard. To opt out of sharing that email
while still syncing transcripts, set `"shareAccount": false` in
`~/.claude/claudelens.json`.

The user provides three things — the **server URL**, the **ingest token**
(both from whoever hosts the server), and their **display name**. Read them
from the user's message / `$ARGUMENTS` and run:

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
`/claudelens:pause`). The command also backs up the **current** project's past
history (not the whole machine's, to avoid a surprise upload) and, if it finds
other projects with history, tells you to run `/claudelens:sync-history` for
those — relay that line too.
