---
description: Add a note to THIS session on the ClaudeLens dashboard — why it's worth reading. Usage - /claudelens:note <text>, or /claudelens:note --clear to remove it.
---

Set the dashboard note for the current session — a line or two telling teammates
why this conversation is worth reading. Run exactly this, keeping the heredoc so
the note's quotes and punctuation reach the command untouched:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" note --session "${CLAUDE_SESSION_ID}" --stdin <<'CLAUDELENS_NOTE'
$ARGUMENTS
CLAUDELENS_NOTE
```

If the user gave no text, ask what the note should say (don't invent one). To
remove the note, the user runs `/claudelens:note --clear` — the command above
handles that as-is.

If the session hasn't reached the dashboard yet, the command syncs it first and
retries. An untracked session (`/claudelens:untrack`) is never uploaded — it
says so instead. Relay the one-line output, including the link.
