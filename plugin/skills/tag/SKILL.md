---
description: Set tags on THIS session on the ClaudeLens dashboard (replaces existing tags). Usage - /claudelens:tag <tag> [<tag>...]; --clear removes them; no args shows the current tags.
---

Replace the current session's dashboard tags:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/claudelens.mjs" tag --session "${CLAUDE_SESSION_ID}" $ARGUMENTS
```

Tags are split on spaces and commas (a leading `#` is dropped), so pass them as
the user wrote them. The list **replaces** any existing tags — to add one, include
the existing ones too (run it with no tags first to see them). `--clear` removes
all tags. If the session hasn't reached the dashboard yet, the command syncs it
first; an untracked session is never uploaded. Relay the one-line output.
