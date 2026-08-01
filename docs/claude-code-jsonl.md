# Claude Code JSONL transcript format

Ground truth for `~/.claude/projects/<url-encoded-cwd>/<sessionId>.jsonl`, the file `shared/src/parser.ts:parseTranscript` consumes. Facts below were derived from 12 real transcripts (Claude Code 2.1.218–2.1.220, ~4k user/assistant lines total) plus the 2.1.220 binary. Re-derive, don't trust blindly — see "How to investigate this yourself" at the bottom.

## Location and per-line shape

- One session = one file: `~/.claude/projects/<url-encoded-cwd>/<sessionId>.jsonl`.
- One JSON object per line. **Malformed lines happen in practice** — `parseTranscript` wraps `JSON.parse` per line in `try/catch` and silently skips failures (`parser.ts:134-138`). Never assume a file parses cleanly end to end.
- Honor `CLAUDE_CONFIG_DIR` if set — it moves `~/.claude` (and therefore `~/.claude/projects` and `~/.claude.json`) elsewhere. See `cli/src/account.ts`.

## Line-type census (12 transcripts, ~4k user/assistant lines)

```
assistant: 2541   user: 1435   attachment: 378   last-prompt: 349
mode: 333         permission-mode: 333            system: 312
file-history-snapshot: 227      custom-title: 168   agent-name: 168
ai-title: 160     file-history-delta: 60          queue-operation: 22
```

The parser reads only `user`, `assistant`, `permission-mode`, `system`, and `ai-title` (`parser.ts:199-220`). Everything else — `attachment`, `last-prompt`, `mode`, `file-history-snapshot`, `custom-title`, `agent-name`, `file-history-delta`, `queue-operation` — is on disk and currently ignored.

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

`RawEntry` in `shared/src/types.ts` types only the subset the parser actually reads (`type`, `uuid`, `parentUuid`, `sessionId`, `timestamp`, `cwd`, `gitBranch`, `version`, `model`, `aiTitle`, `isSidechain`, `subtype`, `durationMs`, `permissionMode`, `origin`, `promptSource`, `isMeta`, `message`) — everything else above is real but untyped. Don't assume `RawEntry`'s field list is the whole line shape; it's a deliberate subset (see "uncaptured fields" below).

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
