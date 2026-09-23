# Claude Code JSONL transcript format

Ground truth for `~/.claude/projects/<url-encoded-cwd>/<sessionId>.jsonl`, the file `shared/src/parser.ts:parseTranscript` consumes. Facts below were derived from 12 real transcripts (Claude Code 2.1.218–2.1.220, ~4k user/assistant lines total) plus the 2.1.220 binary. Re-derive, don't trust blindly — see "How to investigate this yourself" at the bottom.

## Location and per-line shape

- One session = one file: `~/.claude/projects/<url-encoded-cwd>/<sessionId>.jsonl`.
- One JSON object per line. **Malformed lines happen in practice** — `parseTranscript` wraps `JSON.parse` per line in `try/catch` and silently skips failures (`parser.ts:134-138`). Never assume a file parses cleanly end to end.
- Honor `CLAUDE_CONFIG_DIR` if set (one per Claude Code profile) — it moves `~/.claude` (and therefore `~/.claude/projects` and `~/.claude/plugins`) to `$CLAUDE_CONFIG_DIR`, and `~/.claude.json` to `$CLAUDE_CONFIG_DIR/.claude.json` (inside the dir, not beside it). The CLI resolves all of these via `claudeConfigDir()` / `projectsDir()` (`cli/src/config.ts`) and `accountPath()` (`cli/src/account.ts`).

## Line-type census (12 transcripts, ~4k user/assistant lines)

```
assistant: 2541   user: 1435   attachment: 378   last-prompt: 349
mode: 333         permission-mode: 333            system: 312
file-history-snapshot: 227      custom-title: 168   agent-name: 168
ai-title: 160     file-history-delta: 60          queue-operation: 22
```

The parser (≤v6) read only `user`, `assistant`, `permission-mode`, `system`, and `ai-title`; v7 also reads `cost-state` and `attachment` (`queued_command` only). Everything else — `attachment`, `last-prompt`, `mode`, `file-history-snapshot`, `custom-title`, `agent-name`, `file-history-delta`, `queue-operation` — is on disk and currently ignored.

## 2026-09 re-census (594 main transcripts + 30 subagent dirs, Claude Code 2.1.239–2.1.280)

```
assistant: 23980  attachment: 18056  user: 13911  last-prompt: 4327  atis-latch: 4228
ai-title: 3992    mode: 3184         permission-mode: 3015           bridge-session: 2871
system: 1587      queue-operation: 1444  file-history-snapshot: 709  file-history-delta: 626
cost-state: 407   agent-name: 156    frame-link: 92  agent-setting: 40  (+ a few rarer types)
```

What changed and what the parser (v7) now reads:

- **One assistant line per content block.** An API message with thinking + text + 3 tool calls is
  5 `assistant` lines sharing `message.id` / `requestId`, each carrying the **identical** `usage`
  (verified: 12,216 messages, 11,785 extra split lines, 0 usage mismatches). Tool_result `user`
  lines can sit *between* split lines (parallel tool calls). Summing usage per line inflated
  tokens ~2× — the parser now counts once per `message.id` and merges the lines into one Turn.
- **`usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`** splits cache
  writes by TTL (Claude Code mostly writes 1h); `usage.server_tool_use.web_search_requests`.
- **`cost-state`** — `{totalCostUSD, totalLinesAdded, totalLinesRemoved, startTime,
  modelUsage: {model: {inputTokens, outputTokens, cacheReadInputTokens,
  cacheCreationInputTokens, webSearchRequests, costUSD}}}`. Cumulative **per process run**
  (`startTime`); a resumed run starts from zero, so take the last line per `startTime` and sum
  runs. Includes subagent spend and background Haiku calls that never appear in the transcript.
  Model keys may carry a `[1m]` suffix. This is the ground truth `pricing.ts` is calibrated on:
  per model, `(costUSD − in·p_in − out·p_out − cr·p_cr) / cacheCreation` lands between 1.25× and
  2× `p_in` on every line (exactly 2× when all writes were 1h); Haiku lines with no cache writes
  have zero residual. Re-derive with a per-model least-squares over these lines.
- **Subagent transcripts** moved out of the main file: `<projectDir>/<sessionId>/subagents/
  agent-<id>.jsonl` (+ `agent-<id>.meta.json`: `{agentType, description, toolUseId, spawnDepth,
  isFork?, model?}`). Lines are `isSidechain: true`; they have no `cost-state`. The CLI reads the
  dir and passes it to `parseTranscript(jsonl, { subagents })`.
- **`toolDenialKind`** is a top-level key on the tool_result carrier `user` line (`automode-blocked`
  40, `user-rejected` 22, `permission-rule` 1); the tool_result itself is also `is_error`.
- **Compaction**: `system` `compact_boundary` (with `compactMetadata`), followed by a `user` line
  with `isCompactSummary: true, isVisibleInTranscriptOnly: true` ("This session is being continued
  from a previous conversation…") — not typed by anyone.
- **Interrupts**: `user` lines whose text is `[Request interrupted by user]` or `[Request
  interrupted by user for tool use]`.
- **`<synthetic>` assistant lines**: `isApiErrorMessage: true` with `error: "rate_limit"` ("You've
  hit your session/weekly limit · resets …") or `model_not_found`; also non-error "No response
  requested." fillers. Zero usage, not model output.
- **`attachment` `queued_command`**: `commandMode: "prompt"` + `origin.kind: "human"` is a prompt
  typed while Claude was busy (59 seen; only 4 later re-appear as a `user` line);
  `commandMode: "task-notification"` is background-task output, not human.
- **Auto mode is now common**: `permission-mode` lines `auto` 2957 / acceptEdits 40 / plan 20 /
  default 15; on human `user` lines `auto` 682, `bypassPermissions` 366, `default` 55,
  `acceptEdits` 17, `plan` 5. (The "`auto` never observed" note below is from the older sample.)
- `system` subtypes: `stop_hook_summary` (718) then `turn_duration` (624) close each turn *after*
  Stop hooks return — the detached sync waits for either at the file tail.

### Slash commands, branches, files (read by parser v9)

- **Slash commands** the human runs are written as a wrapper, e.g.
  `<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>`,
  in ONE of two places (never both for the same invocation, verified on 558 local transcripts):
  a `user` line with **string** `message.content` (`/model`, `/clear`, `/compact`, `/login`,
  `/effort`) or a `system` line with `subtype: "local_command"` and a top-level **`content`**
  string (`/remote-control`, `/resume`, sometimes `/model`) — commands that never reach the model.
  The command's output follows as `<local-command-stdout>…</local-command-stdout>` (a separate
  user or local_command line). `cleanUserText` strips all of it from turn text, so
  `stats.slashCommands` is read from the raw text **before** stripping; `isMeta` / sidechain lines
  and tool_result bodies are ignored (a `grep` output quoting a wrapper isn't a command). Plugin
  / skill commands use the same wrapper (`/claudelens:status`); a missing leading `/` is added.
- **`gitBranch`** is on nearly every line and changes mid-session when the user switches branch
  (8 of 558 local sessions had >1) — `stats.gitBranches` keeps every distinct value; the
  top-level `ParsedSession.gitBranch` stays the first one seen.
- **File paths** come from `tool_use.input.file_path` (`Read`, `Edit`, `MultiEdit`, `Write`) and
  `input.notebook_path` (`NotebookEdit`) — absolute paths in the OS's own separators. Relative
  to `cwd` they become repo paths; Windows paths need `\` → `/` first.

## Complete observed top-level key set

```
agentName, aiTitle, attachment, attributionPlugin, attributionSkill, backup, content, customTitle,
cwd, durationMs, effort, entrypoint, gitBranch, hasOutput, hookAdditionalContext, hookCount,
hookErrors, hookInfos, imagePasteIds, interruptedMessageId, isMeta, isSidechain, isSnapshotUpdate,
lastPrompt, leafUuid, level, message, messageCount, messageId, mode, operation, origin, parentUuid,
pendingBackgroundAgentCount, permissionMode, preventedContinuation, promptId, promptSource,
requestId, sessionId, session_id, slug, snapshot, snapshotMessageId, stopReason, subtype, timestamp,
toolDenialKind, toolUseID, toolUseResult, trackingPath, type, userFeedback, userType, uuid, version
```

`RawEntry` in `shared/src/types.ts` types only the subset the parser actually reads (`type`, `uuid`, `parentUuid`, `sessionId`, `timestamp`, `cwd`, `gitBranch`, `version`, `model`, `aiTitle`, `isSidechain`, `subtype`, `content` (system lines), `durationMs`, `permissionMode`, `origin`, `promptSource`, `isMeta`, `message`, plus the v7 keys) — everything else above is real but untyped. Don't assume `RawEntry`'s field list is the whole line shape; it's a deliberate subset (see "uncaptured fields" below).

## `permissionMode` — the auto-mode signal

Enum extracted from the Claude Code 2.1.220 binary (`Yye=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]`) and cross-checked against `sdk-tools.d.ts:516`. In the binary, `"auto"` maps to the `classify` permission behaviour — that mapping *is* what "auto mode" means; there is no separate flag.

It appears on disk two ways:

1. **A dedicated line**: `{"type":"permission-mode","permissionMode":"…","sessionId":"…"}`. This line **carries no `timestamp`** — file order is the only timeline signal. Emitted at turn boundaries, and observed to sometimes lag the turn it actually describes by one line (seen at line 235 of a real transcript). Treat it as state-seeding (start of session / after a resume), not as a precise per-turn stamp.
2. **Stamped directly on human-prompt `user` lines** as `e.permissionMode`. This is the **authoritative per-turn source** — but it is only present when a human actually typed the prompt. It is **absent on tool_result-carrier `user` lines** (the ones that just relay a tool's output back to the model).

`shared/src/types.ts` types this deliberately open-ended:
```ts
export type PermissionMode =
  | 'default' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk' | 'plan' | (string & {});
```

**Observed on disk across the 12-transcript sample: `acceptEdits` 723, `default` 697, `plan` 45. `auto` = 0 occurrences out of ~1,465 total values.** Detection is implemented and exercised by unit tests with synthetic data, but has never fired on a real transcript. Consequence: **never write an exhaustive `switch` over the enum** — always render an unknown/future string verbatim (see `web/src/components/ModeBadges.tsx`'s lookup-with-fallback pattern, not a switch).

### The `mode` vs `permission-mode` trap

There is **also** a separate, differently-named line: `{"type":"mode","mode":"normal"}` — 333 occurrences in the census (labelled "mode: 333" above), value observed only ever `"normal"`. This is **unrelated to permissions** — it's Claude Code's own conversation-mode marker (normal vs. e.g. plan-entry UI state), not the permission gate. Do not use `type:"mode"` for auto-mode detection; only `type:"permission-mode"` and the per-line `permissionMode` field count. Confusing the two silently breaks auto-mode detection with no type error, since both lines are shaped similarly.

## `system` / `turn_duration` — the only real active-time signal

`{"type":"system","subtype":"turn_duration","durationMs":N,"messageCount":N,"timestamp":…}` — 418 occurrences in the census. Lands at the end of every Claude turn, right after `stop_hook_summary`. `durationMs` covers **generation plus tool execution** (it's wall-clock for the whole turn, not just model latency).

**Version-dependent — absent from older transcripts.** The parser tracks this with `sawTurnDuration` (`parser.ts:190`) and falls back to a capped-gap heuristic between assistant turns when no `turn_duration` line exists anywhere in the file (`GAP_CAP_MS = 5 * 60 * 1000`). The fallback measures latency, not real work time, and is systematically smaller — that's why `ModelUsage.measured: boolean` exists and why it's set false for an entire session at once (`parser.ts:317-318`), never mixed per-model within one session.

## Account identity is NOT in the JSONL

Every transcript was grepped for identity-shaped keys at depth ≤3. The only identity-adjacent fields present are `userType` (always `"external"`) and `entrypoint` (always `"cli"`). **No email, org, tenant, or OAuth identity appears anywhere in the JSONL.**

It lives in **`~/.claude.json` → `oauthAccount`**:
```
{accountUuid, emailAddress, organizationUuid, organizationName, organizationType,
 organizationRole, seatTier, billingType, displayName, accountCreatedAt, hasExtraUsageEnabled}
```
~70 KB file, ~1 ms to parse (`cli/src/account.ts`). Honor `CLAUDE_CONFIG_DIR`. Claude Code rewrites this file constantly, so **torn reads are possible** — `readAccount()` caches only a successful read (`hasCached`/`cached` in `account.ts`), never caches a failure, and never throws (a broken read must not block a session sync).

## Turn inflation — the metric trap

`user`/`assistant` JSONL lines are individual API messages, not conversational turns. Measured on a real session (`885ec531`): **346 raw `user` lines, of which 299 were tool_result carriers** (empty of human-visible content); 686 raw `assistant` lines. After the parser's empty-turn suppression (`if (!text && !thinkingParts.length && !toolCalls.length) continue;`, `parser.ts:276`):

```
turns = 548      userMessages = 46      assistantTurns = 501
```

Claude emits **~10.7 assistant messages per human message** (`501/47` on this measurement, quoted as "~10.7" and "11.7×" in different measurements across the session — the exact ratio depends on tool-call density, but it is always roughly an order of magnitude). Any raw "turns" number surfaced to a human reads about 11× too large as a proxy for "how much did I type." This is why `SessionStats.userMessages` exists as a separate, tightened field (see below) and why `web/src/format.ts:msgCount()` — not `stats.turns` — is the metric shown as the headline number everywhere in the UI.

## Non-genuinely-human `user` lines

Not every `type:"user"` line was typed by a person. Three independent signals mark injected ones:
- `origin: {kind: "human" | "task-notification" | …}` — exclude when `kind` is present and `!== "human"` (observed value: `task-notification`).
- `promptSource: "typed" | "system" | "suggestion_accepted"` — exclude `"system"`. **Keep `"suggestion_accepted"`** — the human did accept it, so it's genuine input even though Claude Code generated the literal text.
- `isMeta: true` — exclude unconditionally.

`shared/src/parser.ts:isGenuineHumanTurn` implements exactly this (lines 171-174) and gates `SessionStats.userMessages`/`DailyStats.userMessages`. Measured impact on the sample transcript was small (~1 of 346 raw user lines), but it's the difference between "messages I sent" and "messages that merely arrived" — worth keeping exact even though it rarely changes the number.

## Other uncaptured, potentially useful fields (future-work menu)

None of these are read by the parser today. Listed so a future agent doesn't have to rediscover that they exist:

- `attributionSkill` / `attributionPlugin` — exact skill/plugin provenance for a turn, more reliable than inferring skill use from the `Skill` tool_use block.
- `agent-name` lines (168 in the census) — real subagent identity, independent of parsing `Task`/`Agent` tool_use `input.subagent_type`.
- `effort` — presumably reasoning-effort level; unexplored.
- `slug` — a resume-chain id shared across **multiple `sessionId`s**. Arguably the true "conversation" unit — `(session_id, author)` as currently used fragments a single resumed conversation into several rows.
- `custom-title` (168 lines) — a user-set title distinct from `ai-title` (which the parser does read, `aiTitle`).
- `toolDenialKind` — why a tool call was denied/blocked.
- `toolUseResult` — the actual tool output (stdout, `structuredPatch`, etc.) attached to `tool_result` content blocks; currently the parser only reads tool_use (the call), never tool_result (the output).
- `message.diagnostics.cache_miss_reason`, `usage.service_tier` / `usage.speed` / `usage.inference_geo` — deeper API-level telemetry nested under `message`.

## How to investigate this yourself

Don't trust the counts above forever — re-derive them against current transcripts:

```bash
# Line-type census for one project's transcripts
jq -r '.type' ~/.claude/projects/*/*.jsonl | sort | uniq -c | sort -rn

# All distinct top-level keys seen anywhere
jq -r 'keys[]' ~/.claude/projects/*/*.jsonl | sort -u

# permissionMode value distribution (both places it appears)
jq -r 'select(.type=="permission-mode") | .permissionMode' ~/.claude/projects/*/*.jsonl | sort | uniq -c
jq -r 'select(.type=="user" and .permissionMode) | .permissionMode' ~/.claude/projects/*/*.jsonl | sort | uniq -c

# Does `mode` ever differ from "normal"?
jq -r 'select(.type=="mode") | .mode' ~/.claude/projects/*/*.jsonl | sort -u

# turn_duration presence (version-dependence check) — empty output means an older transcript
jq -r 'select(.subtype=="turn_duration") | .durationMs' ~/.claude/projects/*/*.jsonl | head

# Grep for any identity-shaped key directly in the JSONL (expect nothing)
grep -iE '"(email|oauth|account|org)' ~/.claude/projects/*/*.jsonl

# Non-human user lines
jq -r 'select(.type=="user") | [.origin.kind, .promptSource, .isMeta] | @tsv' ~/.claude/projects/*/*.jsonl | sort | uniq -c

# Raw turn-inflation count for one session file
jq -r 'select(.type=="user" or .type=="assistant") | .type' <session>.jsonl | sort | uniq -c
```

The unit tests in `shared/test/parser.test.ts` (run via `pnpm --filter shared test`) encode several of the above as assertions against a 12-line synthetic fixture — read them for exact expected shapes when writing new parser logic.
