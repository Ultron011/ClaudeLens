---
description: Configure ClaudeLens — set your contributor name and opt the current project in to automatic session sync. Run once per machine, and again in each project you want tracked.
---

Run the ClaudeLens setup wizard so this developer's sessions sync to the team gallery.

Execute the bundled setup script and let the user answer its interactive prompts:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/setup.mjs"
```

The wizard asks for a display name, the server URL, and whether to track the
current project. It writes `~/.claude/claudelens.json` and, if the project is
opted in, a committed `.claudelens.json` marker in the project root. After it
finishes, remind the user that sessions in tracked projects now sync
automatically after every turn — no further action needed.
