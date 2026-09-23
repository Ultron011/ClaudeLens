#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../shared/src/types.ts
var init_types = __esm({
  "../shared/src/types.ts"() {
    "use strict";
  }
});

// ../shared/src/pricing.ts
function priceFor(model) {
  if (!model) return DEFAULT;
  const m = model.toLowerCase();
  for (const [key, price] of TABLE) if (m.includes(key)) return price;
  return DEFAULT;
}
function costForUsage(model, usage) {
  const p = priceFor(model);
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  const split = usage.cache_creation;
  const has1h = typeof split?.ephemeral_1h_input_tokens === "number";
  const has5m = typeof split?.ephemeral_5m_input_tokens === "number";
  const w1h = has1h ? split.ephemeral_1h_input_tokens : 0;
  const w5m = has5m || has1h ? split?.ephemeral_5m_input_tokens ?? 0 : usage.cache_creation_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (inTok * p.input + outTok * p.output + cRead * p.cacheRead + w5m * p.input * CACHE_WRITE_5M + w1h * p.input * CACHE_WRITE_1H) / 1e6 + searches * WEB_SEARCH_USD;
}
var CACHE_WRITE_5M, CACHE_WRITE_1H, WEB_SEARCH_USD, TABLE, DEFAULT;
var init_pricing = __esm({
  "../shared/src/pricing.ts"() {
    "use strict";
    CACHE_WRITE_5M = 1.25;
    CACHE_WRITE_1H = 2;
    WEB_SEARCH_USD = 10 / 1e3;
    TABLE = [
      // Legacy Opus generations kept the old $15/$75 price.
      ["claude-3-opus", { input: 15, output: 75, cacheRead: 1.5 }],
      ["opus-4-1", { input: 15, output: 75, cacheRead: 1.5 }],
      ["opus-4-0", { input: 15, output: 75, cacheRead: 1.5 }],
      ["opus-4-2025", { input: 15, output: 75, cacheRead: 1.5 }],
      // claude-opus-4-20250514
      ["opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
      ["opus", { input: 5, output: 25, cacheRead: 0.5 }],
      // opus 4.5+ and opus 5
      ["fable", { input: 10, output: 50, cacheRead: 0.25 }],
      ["sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
      ["sonnet", { input: 3, output: 15, cacheRead: 0.3 }],
      // sonnet 3.x / 4.x
      ["claude-3-haiku", { input: 0.25, output: 1.25, cacheRead: 0.03 }],
      ["3-5-haiku", { input: 0.8, output: 4, cacheRead: 0.08 }],
      ["haiku", { input: 1, output: 5, cacheRead: 0.1 }]
      // haiku 4.5+
    ];
    DEFAULT = { input: 3, output: 15, cacheRead: 0.3 };
  }
});

// ../shared/src/redact.ts
function redactText(input) {
  let text = input;
  const hits = {};
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      const match = args[0];
      if (match.includes("\xABREDACTED\xBB")) return match;
      hits[rule.name] = (hits[rule.name] ?? 0) + 1;
      if (rule.name === "assignment") {
        const [, key, sep2] = args;
        return `${key}${sep2}\xABREDACTED\xBB`;
      }
      if (rule.name === "conn-uri") {
        const [, scheme, user] = args;
        return `${scheme}${user}:\xABREDACTED\xBB@`;
      }
      return "\xABREDACTED\xBB";
    });
  }
  return { text, hits };
}
function mergeHits(into, from) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}
function redactDeep(value) {
  const hits = {};
  const walk = (v) => {
    if (typeof v === "string") {
      const r = redactText(v);
      mergeHits(hits, r.hits);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return { value: walk(value), hits };
}
var RULES;
var init_redact = __esm({
  "../shared/src/redact.ts"() {
    "use strict";
    RULES = [
      { name: "anthropic-key", re: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
      { name: "openai-key", re: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g },
      { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
      { name: "github-token", re: /gh[pousr]_[a-zA-Z0-9]{20,}/g },
      { name: "slack-token", re: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
      { name: "google-key", re: /AIza[0-9A-Za-z_-]{35}/g },
      { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
      { name: "jwt", re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
      { name: "bearer", re: /[Bb]earer\s+[a-zA-Z0-9._-]{20,}/g },
      // key=value / key: value style assignments to sensitive names
      { name: "assignment", re: /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Z0-9_]*)\b(\s*[:=]\s*)(["']?)([^\s"']{6,})\3/gi },
      // connection strings with inline credentials
      { name: "conn-uri", re: /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi }
    ];
  }
});

// ../shared/src/parser.ts
function summarizeToolArgs(name, input) {
  if (!input) return void 0;
  const fields = ARG_FIELDS[name];
  const parts = [];
  if (fields) {
    for (const f of fields) {
      const v = input[f];
      if (v === void 0 || v === null) continue;
      parts.push(String(v));
    }
  } else {
    for (const [k, v] of Object.entries(input)) {
      if (NEVER.test(k)) continue;
      if (typeof v !== "string") continue;
      parts.push(`${k}=${v}`);
      break;
    }
  }
  if (!parts.length) return void 0;
  let joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return void 0;
  if (joined.length > ARG_CAP) joined = joined.slice(0, ARG_CAP - 1) + "\u2026";
  return redactText(joined).text;
}
function asBlocks(content) {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}
function toolDetail(name, input) {
  if (!input) return void 0;
  if (name === "Skill") return input.skill ?? input.command;
  if (name === "Task" || name === "Agent")
    return input.subagent_type ?? input.description;
  return void 0;
}
function cleanUserText(text) {
  return text.replace(INJECTED_BLOCK, "").replace(CAVEAT, "").replace(INJECTED_TAG, "").trim();
}
function askedQuestions(input) {
  if (!Array.isArray(input?.questions)) return void 0;
  const out = [];
  for (const q of input.questions) {
    if (typeof q?.question !== "string") continue;
    out.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : void 0,
      options: Array.isArray(q.options) ? q.options.map((o) => typeof o?.label === "string" ? o.label : "").filter(Boolean) : [],
      multiSelect: q.multiSelect === true || void 0
    });
  }
  return out.length ? out : void 0;
}
function applyAnswers(tc, result, isError) {
  const r = result && typeof result === "object" ? result : void 0;
  const answers = r?.answers;
  const notes = r?.annotations;
  if (!answers || typeof answers !== "object") {
    if (isError) tc.declined = true;
    return;
  }
  for (const q of tc.questions ?? []) {
    const a = answers[q.question];
    if (typeof a === "string" && a) q.answer = a;
    const n = notes?.[q.question]?.notes;
    if (typeof n === "string" && n.trim()) q.notes = n.trim();
  }
}
function basename(p) {
  if (!p) return void 0;
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || void 0;
}
function parseLines(jsonl) {
  const entries = [];
  for (const line of jsonl.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
    }
  }
  return entries;
}
function plainText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n\n");
}
function parseTranscript(jsonl, opts = {}) {
  const entries = parseLines(jsonl);
  const turns = [];
  const toolUsage = {};
  const toolErrors = {};
  const toolDenials = {};
  const skills = /* @__PURE__ */ new Set();
  const subagents = /* @__PURE__ */ new Set();
  const models = /* @__PURE__ */ new Set();
  const modelUsage = {};
  const daily = {};
  const callsById = /* @__PURE__ */ new Map();
  const agentTypeById = /* @__PURE__ */ new Map();
  const seenUsage = /* @__PURE__ */ new Set();
  const turnByMessage = /* @__PURE__ */ new Map();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let estimatedCostUsd = 0;
  let interrupts = 0;
  let compactions = 0;
  let apiErrors = 0;
  let rateLimitHits = 0;
  const costRuns = /* @__PURE__ */ new Map();
  let sessionId = "";
  let cwd;
  let gitBranch;
  let version;
  let title = "";
  let firstUserPrompt;
  const timestamps = [];
  const ensureModel = (m) => modelUsage[m] ??= { turns: 0, totalTokens: 0, costUsd: 0, activeMs: 0, measured: true, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const ensureDay = (d) => daily[d] ??= { turns: 0, userMessages: 0, totalTokens: 0, costUsd: 0, activeMs: 0 };
  const addUsage = (e, model) => {
    const u = e.message?.usage;
    const key = e.message?.id ?? e.requestId;
    if (!u || key && seenUsage.has(key)) return { tokens: 0, cost: 0 };
    if (key) seenUsage.add(key);
    const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const cost = costForUsage(model, u);
    inputTokens += u.input_tokens ?? 0;
    outputTokens += u.output_tokens ?? 0;
    cacheReadTokens += u.cache_read_input_tokens ?? 0;
    cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    estimatedCostUsd += cost;
    const mu = ensureModel(model ?? "(unknown)");
    mu.totalTokens += tokens;
    mu.costUsd += cost;
    mu.inputTokens += u.input_tokens ?? 0;
    mu.outputTokens += u.output_tokens ?? 0;
    mu.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    mu.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    const day = e.timestamp?.slice(0, 10);
    if (day) ensureDay(day).totalTokens += tokens;
    if (day) ensureDay(day).costUsd += cost;
    return { tokens, cost };
  };
  const isGenuineHumanTurn = (e) => !(e.origin?.kind && e.origin.kind !== "human") && e.promptSource !== "system" && e.isMeta !== true;
  let userMessages = 0;
  const userTextsAfter = [];
  entries.forEach((e, index) => {
    if (e.type === "user" && e.message) userTextsAfter.push({ index, text: plainText(e.message.content) });
  });
  const replayedLater = (index, prompt) => userTextsAfter.some((u) => u.index > index && u.text.includes(prompt));
  let currentMode;
  const modeOrder = [];
  const noteMode = (m) => {
    currentMode = m;
    if (!modeOrder.includes(m)) modeOrder.push(m);
  };
  const GAP_CAP_MS = 5 * 60 * 1e3;
  let sawTurnDuration = false;
  let lastAssistant;
  const addActive = (ms) => {
    sawTurnDuration = true;
    if (!lastAssistant) return;
    ensureModel(lastAssistant.model).activeMs += ms;
    if (lastAssistant.day) ensureDay(lastAssistant.day).activeMs += ms;
  };
  const pushUserTurn = (e, text, toolCalls = []) => {
    const day = e.timestamp?.slice(0, 10);
    if (day) ensureDay(day).turns += 1;
    if (isGenuineHumanTurn(e)) {
      userMessages += 1;
      if (day) ensureDay(day).userMessages += 1;
    }
    turns.push({
      role: "user",
      timestamp: e.timestamp,
      text,
      toolCalls,
      isSidechain: e.isSidechain,
      permissionMode: currentMode
    });
  };
  for (const [index, e] of entries.entries()) {
    if (e.sessionId && !sessionId) sessionId = e.sessionId;
    if (e.cwd && !cwd) cwd = e.cwd;
    if (e.gitBranch && !gitBranch) gitBranch = e.gitBranch;
    if (e.version && !version) version = e.version;
    if (e.type === "ai-title" && e.aiTitle) title = e.aiTitle;
    if (e.type === "permission-mode") {
      if (e.permissionMode) noteMode(e.permissionMode);
      continue;
    }
    if (e.type === "system") {
      if (e.subtype === "turn_duration" && typeof e.durationMs === "number") addActive(e.durationMs);
      if (e.subtype === "compact_boundary") compactions++;
      continue;
    }
    if (e.type === "cost-state") {
      if (typeof e.totalCostUSD === "number") {
        costRuns.set(e.startTime ?? 0, {
          costUsd: e.totalCostUSD,
          linesAdded: e.totalLinesAdded ?? 0,
          linesRemoved: e.totalLinesRemoved ?? 0
        });
      }
      continue;
    }
    if (e.type === "attachment") {
      const a = e.attachment;
      if (a?.type === "queued_command" && a.commandMode === "prompt" && a.origin?.kind === "human") {
        const raw = plainText(a.prompt).trim();
        const text2 = cleanUserText(raw);
        if (text2 && !replayedLater(index, raw)) {
          if (e.timestamp) timestamps.push(e.timestamp);
          if (!firstUserPrompt && !SKILL_BODY_PREFIX.test(text2)) firstUserPrompt = text2;
          pushUserTurn(e, text2);
        }
      }
      continue;
    }
    if (e.type !== "user" && e.type !== "assistant") continue;
    const msg = e.message;
    if (!msg) continue;
    if (e.type === "user" && (e.isCompactSummary || e.isVisibleInTranscriptOnly)) continue;
    const model = msg.model ?? e.model;
    if (e.type === "assistant" && isSynthetic(e, model)) {
      if (e.isApiErrorMessage) {
        apiErrors++;
        if (LIMIT_NOTICE.test(plainText(msg.content))) rateLimitHits++;
      }
      continue;
    }
    if (e.type === "user" && e.permissionMode) noteMode(e.permissionMode);
    const blocks = asBlocks(msg.content);
    if (model) models.add(model);
    if (e.timestamp) timestamps.push(e.timestamp);
    const day = e.timestamp?.slice(0, 10);
    if (e.type === "assistant") addUsage(e, model);
    const textParts = [];
    const thinkingParts = [];
    const toolCalls = [];
    for (const b of blocks) {
      if (b.type === "text" && b.text) textParts.push(b.text);
      else if (b.type === "thinking" && b.thinking) thinkingParts.push(b.thinking);
      else if (b.type === "tool_use" && b.name) {
        toolUsage[b.name] = (toolUsage[b.name] ?? 0) + 1;
        const detail = toolDetail(b.name, b.input);
        if (b.name === "Skill" && detail) skills.add(detail);
        if ((b.name === "Task" || b.name === "Agent") && detail) {
          subagents.add(detail);
          if (b.id) agentTypeById.set(b.id, detail);
        }
        const tc = { name: b.name, detail, args: summarizeToolArgs(b.name, b.input) };
        if (b.name === "AskUserQuestion") tc.questions = askedQuestions(b.input);
        if (b.id) callsById.set(b.id, tc);
        toolCalls.push(tc);
      } else if (b.type === "tool_result" && b.tool_use_id && callsById.has(b.tool_use_id)) {
        const tc = callsById.get(b.tool_use_id);
        callsById.delete(b.tool_use_id);
        if (tc.name === "AskUserQuestion") applyAnswers(tc, e.toolUseResult, b.is_error);
        if (e.toolDenialKind) {
          tc.denied = e.toolDenialKind;
          toolDenials[e.toolDenialKind] = (toolDenials[e.toolDenialKind] ?? 0) + 1;
        } else if (b.is_error) {
          tc.error = true;
          toolErrors[tc.name] = (toolErrors[tc.name] ?? 0) + 1;
        }
      }
    }
    const rawText = textParts.join("\n\n").trim();
    const text = e.type === "user" ? cleanUserText(rawText) : rawText;
    if (e.type === "user") {
      if (INTERRUPT.test(text)) {
        interrupts++;
        continue;
      }
      if (!firstUserPrompt && text && !SKILL_BODY_PREFIX.test(text)) firstUserPrompt = text;
      if (!text && !toolCalls.length) continue;
      pushUserTurn(e, text, toolCalls);
      continue;
    }
    const assistantModel = model ?? "(unknown)";
    lastAssistant = { model: assistantModel, day };
    if (!text && !thinkingParts.length && !toolCalls.length) continue;
    const msgKey = msg.id ?? e.requestId;
    const prior = msgKey ? turnByMessage.get(msgKey) : void 0;
    if (prior) {
      if (text) prior.text = prior.text ? `${prior.text}

${text}` : text;
      if (thinkingParts.length) {
        const th = thinkingParts.join("\n\n");
        prior.thinking = prior.thinking ? `${prior.thinking}

${th}` : th;
      }
      prior.toolCalls.push(...toolCalls);
      continue;
    }
    if (day) ensureDay(day).turns += 1;
    ensureModel(assistantModel).turns += 1;
    const turn = {
      role: "assistant",
      timestamp: e.timestamp,
      model,
      text,
      thinking: thinkingParts.length ? thinkingParts.join("\n\n") : void 0,
      toolCalls,
      isSidechain: e.isSidechain,
      permissionMode: currentMode
    };
    if (msgKey) turnByMessage.set(msgKey, turn);
    turns.push(turn);
  }
  const subagentUsage = {};
  for (const sub of opts.subagents ?? []) {
    const type = sub.meta?.agentType ?? (sub.meta?.toolUseId ? agentTypeById.get(sub.meta.toolUseId) : void 0) ?? "unknown";
    const su = subagentUsage[type] ??= { runs: 0, totalTokens: 0, costUsd: 0, toolCalls: 0 };
    su.runs += 1;
    for (const e of parseLines(sub.jsonl)) {
      if (e.type !== "assistant" || !e.message) continue;
      const model = e.message.model ?? e.model;
      if (isSynthetic(e, model)) continue;
      if (model) models.add(model);
      const added = addUsage(e, model);
      su.totalTokens += added.tokens;
      su.costUsd += added.cost;
      for (const b of asBlocks(e.message.content)) {
        if (b.type !== "tool_use" || !b.name) continue;
        toolUsage[b.name] = (toolUsage[b.name] ?? 0) + 1;
        su.toolCalls += 1;
      }
    }
  }
  for (const su of Object.values(subagentUsage)) su.costUsd = Math.round(su.costUsd * 1e4) / 1e4;
  const activeMsMeasured = sawTurnDuration;
  if (!sawTurnDuration) {
    let prevTs;
    for (const t of turns) {
      const ts = t.timestamp ? new Date(t.timestamp).getTime() : void 0;
      if (t.role === "assistant" && ts !== void 0) {
        const gap = prevTs !== void 0 ? Math.min(Math.max(ts - prevTs, 0), GAP_CAP_MS) : 0;
        ensureModel(t.model ?? "(unknown)").activeMs += gap;
        const day = t.timestamp?.slice(0, 10);
        if (day) ensureDay(day).activeMs += gap;
      }
      if (ts !== void 0) prevTs = ts;
    }
    for (const mu of Object.values(modelUsage)) mu.measured = false;
  }
  timestamps.sort();
  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];
  const durationMs = startedAt && endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : void 0;
  const assistantTurns = turns.filter((t) => t.role === "assistant").length;
  let reported;
  if (costRuns.size) {
    reported = { costUsd: 0, linesAdded: 0, linesRemoved: 0 };
    for (const r of costRuns.values()) {
      reported.costUsd += r.costUsd;
      reported.linesAdded += r.linesAdded;
      reported.linesRemoved += r.linesRemoved;
    }
    reported.costUsd = Math.round(reported.costUsd * 1e4) / 1e4;
  }
  const stats = {
    turns: turns.length,
    userMessages,
    assistantTurns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1e4) / 1e4,
    models: [...models],
    toolUsage,
    skills: [...skills],
    subagents: [...subagents],
    durationMs,
    firstUserPrompt: firstUserPrompt?.slice(0, 500),
    permissionModes: modeOrder,
    usedAutoMode: modeOrder.includes("auto"),
    modelUsage,
    daily,
    activeMsMeasured,
    toolErrors,
    toolDenials,
    subagentUsage,
    interrupts,
    compactions,
    apiErrors,
    rateLimitHits,
    reported
  };
  if (!title) title = firstUserPrompt?.slice(0, 80) || `Session ${sessionId.slice(0, 8)}`;
  return {
    sessionId: sessionId || "unknown",
    title,
    cwd,
    project: basename(cwd),
    gitBranch,
    version,
    startedAt,
    endedAt,
    stats,
    turns,
    parserVersion: PARSER_VERSION
  };
}
var PARSER_VERSION, ARG_CAP, ARG_FIELDS, NEVER, INJECTED_TAG_NAME, INJECTED_BLOCK, INJECTED_TAG, CAVEAT, SKILL_BODY_PREFIX, INTERRUPT, LIMIT_NOTICE, isSynthetic;
var init_parser = __esm({
  "../shared/src/parser.ts"() {
    "use strict";
    init_pricing();
    init_redact();
    PARSER_VERSION = 7;
    ARG_CAP = 300;
    ARG_FIELDS = {
      Bash: ["command"],
      BashOutput: ["bash_id"],
      KillShell: ["shell_id"],
      WebFetch: ["url"],
      WebSearch: ["query"],
      ToolSearch: ["query"],
      Read: ["file_path"],
      Write: ["file_path"],
      Edit: ["file_path"],
      MultiEdit: ["file_path"],
      NotebookEdit: ["notebook_path", "file_path"],
      Glob: ["pattern", "path"],
      Grep: ["pattern", "path"],
      Task: ["subagent_type", "description"],
      Agent: ["subagent_type", "description"],
      Skill: ["skill", "args"],
      TodoWrite: [],
      ExitPlanMode: []
    };
    NEVER = /^(content|contents|new_string|old_string|file_text|body|prompt|text|patch|diff|edits|todos|snippet|replace_all)$/i;
    INJECTED_TAG_NAME = "(?:system-reminder|user-prompt-submit-hook|(?:local-)?command-[a-z-]+|bash-[a-z-]+)";
    INJECTED_BLOCK = new RegExp(`<(${INJECTED_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, "g");
    INJECTED_TAG = new RegExp(`</?${INJECTED_TAG_NAME}\\b[^>]*>`, "g");
    CAVEAT = /Caveat:\s*The messages below were generated by the user while running local commands\.[\s\S]*?(?:\n\n|$)/g;
    SKILL_BODY_PREFIX = /^Base directory for this skill:\s*\S+/;
    INTERRUPT = /^\[Request interrupted by user/;
    LIMIT_NOTICE = /\b(session|weekly|usage) limit\b/i;
    isSynthetic = (e, model) => model === "<synthetic>" || e.isApiErrorMessage === true;
  }
});

// ../shared/src/index.ts
var init_src = __esm({
  "../shared/src/index.ts"() {
    "use strict";
    init_types();
    init_pricing();
    init_redact();
    init_parser();
  }
});

// src/config.ts
import { readFile, writeFile, rename } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve, sep, dirname, parse as parsePath } from "node:path";
function migrateBackfilled(parsed) {
  if (parsed.backfilled) return parsed.backfilled;
  if (parsed.backfilledSessions) return Object.fromEntries(parsed.backfilledSessions.map((id) => [id, 0]));
  return {};
}
async function readRaw() {
  let raw;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
  return JSON.parse(raw);
}
function normalize(parsed) {
  return {
    name: parsed.name,
    server: parsed.server,
    token: parsed.token,
    ignoreProjects: parsed.ignoreProjects ?? [],
    ignoreSessions: parsed.ignoreSessions ?? [],
    paused: parsed.paused ?? false,
    redact: parsed.redact ?? true,
    backfilled: migrateBackfilled(parsed),
    backfilledMtime: parsed.backfilledMtime ?? {},
    shareAccount: parsed.shareAccount
  };
}
async function loadConfig() {
  let cfg;
  try {
    cfg = normalize(await readRaw());
  } catch {
    cfg = { ...EMPTY, backfilled: {}, backfilledMtime: {} };
  }
  cfg.server ??= process.env.CLAUDELENS_SERVER;
  cfg.token ??= process.env.CLAUDELENS_TOKEN;
  return cfg;
}
async function updateConfig(mutate) {
  const raw = await readRaw();
  const cfg = normalize(raw);
  mutate(cfg);
  const { backfilledSessions: _legacy, ...rest } = raw;
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...rest, ...cfg }, null, 2) + "\n", "utf8");
  await rename(tmp, CONFIG_PATH);
  return cfg;
}
async function recordSynced(done) {
  if (!Object.keys(done).length) return;
  await updateConfig((cfg) => {
    for (const [id, { version, mtime }] of Object.entries(done)) {
      cfg.backfilled[id] = Math.max(cfg.backfilled[id] ?? 0, version);
      if (mtime !== void 0) cfg.backfilledMtime[id] = Math.max(cfg.backfilledMtime[id] ?? 0, mtime);
    }
  });
}
function isConnected(cfg) {
  return Boolean(cfg.server);
}
function resolveName(cfg, account) {
  if (cfg.name?.trim()) return cfg.name.trim();
  if (process.env.CLAUDELENS_NAME?.trim()) return process.env.CLAUDELENS_NAME.trim();
  if (account?.displayName?.trim()) return account.displayName.trim();
  try {
    const git2 = execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim();
    if (git2) return git2;
  } catch {
  }
  return userInfo().username;
}
function isUnderAny(dir, roots) {
  const d = resolve(dir);
  return roots.some((p) => {
    const r = resolve(p);
    return d === r || d.startsWith(r + sep);
  });
}
function isExcludedLocally(cwd, cfg) {
  return isUnderAny(cwd, cfg.ignoreProjects);
}
function envOptedOut() {
  const truthy = (v) => v != null && v !== "" && v !== "0" && v.toLowerCase() !== "false";
  return truthy(process.env.DO_NOT_TRACK) || truthy(process.env.CLAUDELENS_DISABLE);
}
function markerExcludes(raw) {
  const text = raw.trim();
  if (!text) return true;
  try {
    const j = JSON.parse(text);
    if (typeof j.ignore === "boolean") return j.ignore;
    if (typeof j.track === "boolean") return !j.track;
  } catch {
  }
  for (const line of text.split("\n")) {
    const m = /^\s*(ignore|track)\s*:\s*(true|false)\s*$/i.exec(line);
    if (m) {
      const val = m[2].toLowerCase() === "true";
      return m[1].toLowerCase() === "ignore" ? val : !val;
    }
  }
  return true;
}
async function isRepoExcluded(dir) {
  let cur = resolve(dir);
  const fsRoot = parsePath(cur).root;
  for (let i = 0; i < 40; i++) {
    try {
      const raw = await readFile(join(cur, REPO_MARKER), "utf8");
      if (markerExcludes(raw)) return true;
    } catch {
    }
    if (cur === fsRoot) break;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}
async function shouldSync(cwd, sessionId, cfg) {
  if (!isConnected(cfg)) return false;
  if (cfg.paused) return false;
  if (envOptedOut()) return false;
  if (isExcludedLocally(cwd, cfg)) return false;
  if (sessionId && cfg.ignoreSessions.includes(sessionId)) return false;
  if (await isRepoExcluded(cwd)) return false;
  return true;
}
var CONFIG_PATH, REPO_MARKER, EMPTY;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    CONFIG_PATH = join(homedir(), ".claude", "claudelens.json");
    REPO_MARKER = ".claudelens";
    EMPTY = {
      ignoreProjects: [],
      ignoreSessions: [],
      paused: false,
      redact: true,
      backfilled: {},
      backfilledMtime: {}
    };
  }
});

// src/account.ts
import { readFile as readFile2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
function configPath() {
  return join2(process.env.CLAUDE_CONFIG_DIR || homedir2(), ".claude.json");
}
async function readAccount() {
  if (hasCached) return cached;
  try {
    const raw = await readFile2(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    const acc = parsed.oauthAccount;
    if (!acc || typeof acc !== "object") return void 0;
    const account = {
      email: typeof acc.emailAddress === "string" ? acc.emailAddress : void 0,
      displayName: typeof acc.displayName === "string" ? acc.displayName : void 0,
      organizationName: typeof acc.organizationName === "string" ? acc.organizationName : void 0
    };
    cached = account;
    hasCached = true;
    return account;
  } catch {
    return void 0;
  }
}
var cached, hasCached;
var init_account = __esm({
  "src/account.ts"() {
    "use strict";
    hasCached = false;
  }
});

// src/upload.ts
import { readdir, readFile as readFile3 } from "node:fs/promises";
import { join as join3 } from "node:path";
async function readSubagents(transcriptPath) {
  const dir = join3(transcriptPath.replace(/\.jsonl$/, ""), "subagents");
  let names;
  try {
    names = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of names) {
    try {
      const jsonl = await readFile3(join3(dir, f), "utf8");
      let meta;
      try {
        meta = JSON.parse(await readFile3(join3(dir, f.replace(/\.jsonl$/, ".meta.json")), "utf8"));
      } catch {
      }
      out.push({ meta, jsonl });
    } catch {
    }
  }
  return out;
}
async function parseSessionFile(path) {
  const [jsonl, subagents] = await Promise.all([readFile3(path, "utf8"), readSubagents(path)]);
  return parseTranscript(jsonl, { subagents });
}
async function uploadSession(session, cfg, author, account) {
  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    session.title = redactDeep(session.title).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }
  const payload = { session, author, account };
  const body = JSON.stringify(payload);
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${cfg.server}/api/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}
      },
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    });
    if (res.status !== 429 && res.status !== 503 || attempt >= RETRIES) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = retryAfter > 0 ? retryAfter * 1e3 : 500 * 2 ** attempt + Math.random() * 250;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 1e4)));
  }
  if (!res.ok) throw new Error(`server responded ${res.status}`);
  const reply = await res.json().catch(() => void 0);
  if (reply?.ignored) {
    const { sessionId, cwd } = reply.untrack ?? {};
    if (sessionId || cwd) {
      await updateConfig((c) => {
        if (sessionId && !c.ignoreSessions.includes(sessionId)) c.ignoreSessions.push(sessionId);
        else if (cwd && !c.ignoreProjects.includes(cwd)) c.ignoreProjects.push(cwd);
      });
    }
    return false;
  }
  return true;
}
var UPLOAD_TIMEOUT_MS, RETRIES;
var init_upload = __esm({
  "src/upload.ts"() {
    "use strict";
    init_src();
    init_config();
    UPLOAD_TIMEOUT_MS = 15e3;
    RETRIES = 5;
  }
});

// src/sync.ts
var sync_exports = {};
__export(sync_exports, {
  isDetached: () => isDetached,
  runSync: () => runSync,
  spawnDetached: () => spawnDetached
});
import { spawn } from "node:child_process";
import { readFile as readFile4, stat } from "node:fs/promises";
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
function spawnDetached(op2, env = {}) {
  try {
    const child = spawn(process.execPath, [process.argv[1], op2, "--detached"], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...env }
    });
    child.on("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
function lastEntry(raw) {
  const end = raw.trimEnd();
  try {
    return JSON.parse(end.slice(end.lastIndexOf("\n") + 1));
  } catch {
    return void 0;
  }
}
async function readSettledSession(path, inline) {
  const subagents = await readSubagents(path);
  let mtime = (await stat(path)).mtimeMs;
  let raw = await readFile4(path, "utf8");
  for (let i = 0; i < (inline ? 4 : 20); i++) {
    const tail = lastEntry(raw);
    if (tail?.type === "system" && (tail.subtype === "stop_hook_summary" || tail.subtype === "turn_duration")) break;
    if (inline && tail?.type === "assistant") break;
    await sleep(250);
    mtime = (await stat(path)).mtimeMs;
    raw = await readFile4(path, "utf8");
  }
  return { session: parseTranscript(raw, { subagents }), mtime };
}
async function runSync() {
  let hook = {};
  try {
    hook = JSON.parse(isDetached() ? process.env[PAYLOAD_ENV] ?? "" : await readStdin());
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;
  if (!isDetached()) {
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused || envOptedOut()) return;
    if (spawnDetached("sync", { [PAYLOAD_ENV]: JSON.stringify({ transcript_path, cwd, session_id }) })) return;
  }
  await syncNow(transcript_path, cwd, session_id, !isDetached());
}
async function syncNow(transcriptPath, cwd, sessionId, inline) {
  const cfg = await loadConfig();
  if (!await shouldSync(cwd, sessionId, cfg)) return;
  const { session, mtime } = await readSettledSession(transcriptPath, inline);
  if (!session.sessionId || session.stats.turns < 1) return;
  if (cfg.ignoreSessions.includes(session.sessionId)) return;
  const id = session.sessionId;
  if (cfg.backfilled[id] === void 0) {
    await updateConfig((c) => {
      c.backfilled[id] ??= 0;
    });
  }
  const account = cfg.shareAccount === false ? void 0 : await readAccount();
  if (await uploadSession(session, cfg, resolveName(cfg, account), account)) {
    await recordSynced({ [id]: { version: PARSER_VERSION, mtime } });
  }
}
var PAYLOAD_ENV, isDetached, sleep;
var init_sync = __esm({
  "src/sync.ts"() {
    "use strict";
    init_src();
    init_config();
    init_account();
    init_upload();
    PAYLOAD_ENV = "CLAUDELENS_HOOK_PAYLOAD";
    isDetached = () => process.argv.includes("--detached");
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }
});

// src/history.ts
var history_exports = {};
__export(history_exports, {
  backfillDirs: () => backfillDirs,
  backfillProject: () => backfillProject,
  catchUp: () => catchUp,
  listProjects: () => listProjects,
  runCatchUp: () => runCatchUp,
  runListProjects: () => runListProjects,
  runSyncHistory: () => runSyncHistory
});
import { readdir as readdir2, readFile as readFile5, stat as stat2 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { basename as basename2, join as join4, resolve as resolve2 } from "node:path";
async function jsonlFiles(dir) {
  try {
    return (await readdir2(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
}
async function peek(path) {
  let raw;
  try {
    raw = await readFile5(path, "utf8");
  } catch {
    return {};
  }
  let cwd;
  let sessionId;
  let scanned = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    if (++scanned > 80) break;
    try {
      const e = JSON.parse(line);
      cwd ??= e.cwd;
      sessionId ??= e.sessionId;
    } catch {
    }
    if (cwd && sessionId) break;
  }
  return { cwd, sessionId };
}
async function listProjects() {
  const cfg = await loadConfig();
  let dirNames;
  try {
    dirNames = (await readdir2(PROJECTS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const entries = [];
  for (const dir of dirNames) {
    const full = join4(PROJECTS_DIR, dir);
    const files = await jsonlFiles(full);
    if (!files.length) continue;
    let cwd;
    let synced = 0;
    let lastMtime = 0;
    for (const f of files) {
      const path = join4(full, f);
      const [{ cwd: fileCwd, sessionId }, st] = await Promise.all([peek(path), stat2(path)]);
      cwd ??= fileCwd;
      const version = sessionId ? cfg.backfilled[sessionId] : void 0;
      if (version !== void 0 && version >= PARSER_VERSION) synced++;
      if (st.mtimeMs > lastMtime) lastMtime = st.mtimeMs;
    }
    entries.push({
      index: entries.length + 1,
      dir,
      cwd,
      sessions: files.length,
      synced,
      lastActivity: lastMtime ? new Date(lastMtime).toISOString() : void 0
    });
  }
  return entries;
}
async function runListProjects() {
  const cfg = await loadConfig();
  if (!isConnected(cfg)) {
    console.log("Not connected. Run /claudelens:connect <server-url> <token> <name> first.");
    return;
  }
  const entries = await listProjects();
  if (!entries.length) {
    console.log("No project history found under ~/.claude/projects.");
    return;
  }
  console.log(JSON.stringify(entries, null, 2));
}
function selectDirs(all) {
  const rest = process.argv.slice(3).filter((a) => !a.startsWith("--"));
  if (process.argv.slice(3).includes("--all")) return all.map((e) => e.dir);
  const out = [];
  for (const arg of rest) {
    const n = Number(arg);
    const byIndex = Number.isInteger(n) ? all.find((e) => e.index === n) : void 0;
    const byDir = all.find((e) => e.dir === arg);
    const byCwd = all.find((e) => e.cwd === arg);
    const match = byIndex ?? byDir ?? byCwd;
    if (match) out.push(match.dir);
  }
  return [...new Set(out)];
}
async function findProjectDir(cwd) {
  const target = resolve2(cwd);
  const entries = await listProjects();
  return entries.find((e) => e.cwd && resolve2(e.cwd) === target)?.dir;
}
function isCurrent(cfg, sessionId, mtime) {
  const version = cfg.backfilled[sessionId];
  const syncedMtime = cfg.backfilledMtime[sessionId];
  return version !== void 0 && version >= PARSER_VERSION && (syncedMtime === void 0 || mtime <= syncedMtime);
}
async function backfillOne(path, cfg, author, account, force, result, done) {
  try {
    const { mtimeMs } = await stat2(path);
    const session = await parseSessionFile(path);
    if (!session.sessionId || session.sessionId === "unknown" || session.stats.turns < 1) return;
    const priorVersion = cfg.backfilled[session.sessionId];
    if (!force && isCurrent(cfg, session.sessionId, mtimeMs)) {
      result.skipped++;
      return;
    }
    if (session.cwd && !await shouldSync(session.cwd, session.sessionId, cfg)) {
      result.skipped++;
      return;
    }
    if (!await uploadSession(session, cfg, author, account)) {
      result.skipped++;
      return;
    }
    if (priorVersion !== void 0 && priorVersion < PARSER_VERSION) result.upgraded++;
    done[session.sessionId] = { version: PARSER_VERSION, mtime: mtimeMs };
    result.synced++;
  } catch (err) {
    result.failed++;
    if (process.env.CLAUDELENS_DEBUG) console.error(`[claudelens sync-history] ${path}:`, err);
  }
}
async function uploadFiles(files, cfg, opts, result) {
  const account = cfg.shareAccount === false ? void 0 : await readAccount();
  const author = resolveName(cfg, account);
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const done = {};
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      await backfillOne(files[next++], cfg, author, account, opts.force ?? false, result, done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  await recordSynced(done);
}
async function backfillDirs(dirs, opts = {}) {
  const result = { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  for (const dir of dirs) {
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused) break;
    const full = join4(PROJECTS_DIR, dir);
    const files = (await jsonlFiles(full)).map((f) => join4(full, f));
    result.scanned += files.length;
    await uploadFiles(files, cfg, opts, result);
  }
  return result;
}
async function catchUp() {
  const result = { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  const cfg = await loadConfig();
  if (!isConnected(cfg) || cfg.paused || envOptedOut()) return result;
  let dirNames;
  try {
    dirNames = (await readdir2(PROJECTS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return result;
  }
  const stale = [];
  for (const dir of dirNames) {
    for (const f of await jsonlFiles(join4(PROJECTS_DIR, dir))) {
      const id = basename2(f, ".jsonl");
      if (cfg.backfilled[id] === void 0 || cfg.ignoreSessions.includes(id)) continue;
      const path = join4(PROJECTS_DIR, dir, f);
      try {
        const { mtimeMs } = await stat2(path);
        if (!isCurrent(cfg, id, mtimeMs)) stale.push({ path, mtime: mtimeMs });
      } catch {
      }
    }
  }
  stale.sort((a, b) => b.mtime - a.mtime);
  const batch = stale.slice(0, CATCHUP_CAP).map((s) => s.path);
  result.scanned = batch.length;
  if (batch.length) await uploadFiles(batch, cfg, {}, result);
  return result;
}
async function runCatchUp() {
  if (!isDetached()) {
    const cfg = await loadConfig();
    if (!isConnected(cfg) || cfg.paused || envOptedOut()) return;
    if (spawnDetached("catchup")) return;
  }
  await catchUp();
}
async function backfillProject(cwd, opts = {}) {
  const dir = await findProjectDir(cwd);
  if (!dir) return { scanned: 0, synced: 0, skipped: 0, failed: 0, upgraded: 0 };
  return backfillDirs([dir], opts);
}
async function runSyncHistory() {
  const cfg = await loadConfig();
  if (!isConnected(cfg)) {
    console.log("Not connected. Run /claudelens:connect <server-url> <token> <name> first.");
    return;
  }
  const force = process.argv.slice(3).includes("--force");
  const all = await listProjects();
  const dirs = selectDirs(all);
  if (!dirs.length) {
    console.log("No matching projects selected. Pass indices or dir names from list-projects, or --all.");
    return;
  }
  const { synced, skipped, failed, upgraded } = await backfillDirs(dirs, { force });
  console.log(
    `\u2714 Synced ${synced} session(s) (${upgraded} upgraded). Skipped ${skipped} (already synced or excluded). Failed ${failed}.`
  );
}
var PROJECTS_DIR, CATCHUP_CAP;
var init_history = __esm({
  "src/history.ts"() {
    "use strict";
    init_src();
    init_config();
    init_account();
    init_upload();
    init_sync();
    PROJECTS_DIR = join4(homedir3(), ".claude", "projects");
    CATCHUP_CAP = 25;
  }
});

// src/connect.ts
var connect_exports = {};
__export(connect_exports, {
  runConnect: () => runConnect
});
import { resolve as resolve3 } from "node:path";
function parse(argv) {
  const out = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") out.session = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--server") out.server = argv[++i];
    else if (!a.startsWith("-")) positionals.push(a);
  }
  if (!out.server && positionals[0]) out.server = positionals[0];
  if (!out.token && positionals[1]) out.token = positionals[1];
  if (!out.name && positionals.length > 2) out.name = positionals.slice(2).join(" ");
  return out;
}
async function runConnect() {
  const args = parse(process.argv.slice(3));
  if (!args.server) {
    console.error("Usage: connect <server-url> <token> <your display name>");
    process.exit(1);
  }
  const server = args.server.replace(/\/+$/, "");
  const cfg = await updateConfig((c) => {
    c.server = server;
    if (args.token) c.token = args.token;
    if (args.name) c.name = args.name;
    if (args.session && !c.ignoreSessions.includes(args.session)) c.ignoreSessions.push(args.session);
  });
  const account = cfg.shareAccount === false ? void 0 : await readAccount();
  console.log(`\u2714 Connected to ${cfg.server} as "${resolveName(cfg, account)}".`);
  console.log("Tracking is now on for every project. This session is excluded so the token is never uploaded.");
  console.log("Opt out anytime: /claudelens:untrack (this session), /claudelens:untrack-project, or /claudelens:pause.");
  const cwd = process.cwd();
  const { synced, upgraded, failed } = await backfillProject(cwd);
  if (synced || failed) {
    console.log(`Backed up ${synced} past session(s) here (${upgraded} upgraded, ${failed} failed).`);
  }
  const others = (await listProjects()).filter((p) => p.cwd && resolve3(p.cwd) !== resolve3(cwd) && p.sessions > 0);
  if (others.length) {
    console.log(
      `Found ${others.length} other project(s) with history \u2014 run /claudelens:sync-history to back those up.`
    );
  }
}
var init_connect = __esm({
  "src/connect.ts"() {
    "use strict";
    init_config();
    init_account();
    init_history();
  }
});

// src/optout.ts
var optout_exports = {};
__export(optout_exports, {
  runPause: () => runPause,
  runResume: () => runResume,
  runTrackProject: () => runTrackProject,
  runTrackSession: () => runTrackSession,
  runUntrackProject: () => runUntrackProject,
  runUntrackSession: () => runUntrackSession
});
import { readdir as readdir3, readFile as readFile6, writeFile as writeFile2, unlink, stat as stat3 } from "node:fs/promises";
import { homedir as homedir4 } from "node:os";
import { join as join5, resolve as resolve4 } from "node:path";
function argFlag(name) {
  return process.argv.slice(3).includes(name);
}
function positional() {
  return process.argv.slice(3).find((a) => !a.startsWith("-"));
}
function positionalDir() {
  const p = positional();
  return resolve4(p && !p.startsWith("-") ? p : process.cwd());
}
async function resolveSessionId(explicit, cwd) {
  const clean = explicit?.trim();
  if (clean && !clean.includes("$") && !clean.includes("{")) return clean;
  let dirs;
  try {
    dirs = await readdir3(PROJECTS_DIR2);
  } catch {
    return void 0;
  }
  let best;
  for (const d of dirs) {
    const full = join5(PROJECTS_DIR2, d);
    let files;
    try {
      files = (await readdir3(full)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join5(full, f);
      try {
        const raw = await readFile6(path, "utf8");
        let sid;
        let matches = false;
        let scanned = 0;
        for (const line of raw.split("\n")) {
          if (!line.trim() || ++scanned > 80) break;
          try {
            const e = JSON.parse(line);
            if (e.sessionId && !sid) sid = e.sessionId;
            if (e.cwd && resolve4(e.cwd) === resolve4(cwd)) matches = true;
          } catch {
          }
        }
        if (matches && sid) {
          const { mtimeMs } = await stat3(path);
          if (!best || mtimeMs > best.mtime) best = { id: sid, mtime: mtimeMs };
        }
      } catch {
      }
    }
  }
  return best?.id;
}
async function runUntrackSession() {
  const cfg = await loadConfig();
  const id = await resolveSessionId(positional(), process.cwd());
  if (!id) {
    console.log("Could not identify this session yet (no transcript). Try again after your first message.");
    return;
  }
  if (!cfg.ignoreSessions.includes(id)) {
    await updateConfig((c) => {
      if (!c.ignoreSessions.includes(id)) c.ignoreSessions.push(id);
    });
  }
  console.log(`\u2714 This session (${id.slice(0, 8)}) will not be tracked. Nothing from it is sent to the dashboard.`);
}
async function runTrackSession() {
  const id = await resolveSessionId(positional(), process.cwd());
  if (id) {
    await updateConfig((c) => {
      c.ignoreSessions = c.ignoreSessions.filter((s) => s !== id);
    });
  }
  console.log("\u2714 This session is tracked again (syncs from the next turn).");
}
async function runUntrackProject() {
  const cfg = await loadConfig();
  const dir = positionalDir();
  const team = argFlag("--team") || argFlag("--shared");
  if (!isExcludedLocally(dir, cfg)) {
    await updateConfig((c) => {
      if (!isExcludedLocally(dir, c)) c.ignoreProjects.push(dir);
    });
  }
  if (team) {
    await writeFile2(
      join5(dir, REPO_MARKER),
      "# ClaudeLens: this repo is never tracked, for anyone. Commit this file.\nignore: true\n",
      "utf8"
    );
    console.log(`\u2714 Wrote ${REPO_MARKER} in ${pretty(dir)} \u2014 commit it to exclude this repo for the whole team.`);
  } else {
    console.log(`\u2714 This project (${pretty(dir)}) will not be tracked. Its sessions stop syncing immediately.`);
  }
}
async function runTrackProject() {
  const dir = positionalDir();
  const team = argFlag("--team") || argFlag("--shared");
  await updateConfig((c) => {
    c.ignoreProjects = c.ignoreProjects.filter((p) => resolve4(p) !== dir);
  });
  if (team) {
    try {
      await unlink(join5(dir, REPO_MARKER));
    } catch {
    }
  }
  const { synced, upgraded, failed } = await backfillProject(dir);
  console.log(
    `\u2714 Tracking ${pretty(dir)} again. Backed up ${synced} past session(s) (${upgraded} upgraded, ${failed} failed).`
  );
}
async function setPaused(paused) {
  await updateConfig((c) => {
    c.paused = paused;
  });
  console.log(
    paused ? "\u23F8  Paused \u2014 nothing syncs on this machine until /claudelens:resume." : "\u25B6  Resumed \u2014 tracked projects sync again from the next turn."
  );
}
var PROJECTS_DIR2, pretty, runPause, runResume;
var init_optout = __esm({
  "src/optout.ts"() {
    "use strict";
    init_config();
    init_history();
    PROJECTS_DIR2 = join5(homedir4(), ".claude", "projects");
    pretty = (d) => d.replace(homedir4(), "~");
    runPause = () => setPaused(true);
    runResume = () => setPaused(false);
  }
});

// src/status.ts
var status_exports = {};
__export(status_exports, {
  runStatus: () => runStatus
});
import { resolve as resolve5 } from "node:path";
import { homedir as homedir5 } from "node:os";
async function runStatus() {
  const cfg = await loadConfig();
  const cwd = process.cwd();
  if (!isConnected(cfg)) {
    console.log("ClaudeLens is not connected yet.");
    console.log("Run  /claudelens:connect <server-url> <token>  once to turn tracking on.");
    return;
  }
  const repoOff = await isRepoExcluded(cwd);
  const projOff = isExcludedLocally(cwd, cfg);
  const globalOff = cfg.paused || envOptedOut();
  const trackingHere = !globalOff && !projOff && !repoOff;
  const account = cfg.shareAccount === false ? void 0 : await readAccount();
  console.log("ClaudeLens");
  console.log(`  Server    ${cfg.server}`);
  console.log(`  Author    ${resolveName(cfg, account)}`);
  if (account) {
    console.log(`  Account   ${account.email ?? "(no email)"}${account.organizationName ? ` \xB7 ${account.organizationName}` : ""}`);
  } else if (cfg.shareAccount === false) {
    console.log("  Account   not shared (shareAccount: false)");
  } else {
    console.log("  Account   unavailable (could not read ~/.claude.json)");
  }
  console.log(`  Parser    v${PARSER_VERSION} (local)`);
  console.log(`  Global    ${cfg.paused ? "PAUSED" : envOptedOut() ? "disabled by env (DO_NOT_TRACK)" : "on"}`);
  console.log(`  This dir  ${cwd.replace(homedir5(), "~")}`);
  console.log(
    `            ${trackingHere ? "tracked \u2713" : repoOff ? "excluded by committed .claudelens (team-wide)" : projOff ? "excluded (you ran /claudelens:untrack-project)" : "not tracked (global pause/opt-out)"}`
  );
  if (cfg.ignoreProjects.length) {
    console.log(`  Excluded projects (${cfg.ignoreProjects.length}):`);
    for (const p of cfg.ignoreProjects) console.log(`    \xB7 ${resolve5(p).replace(homedir5(), "~")}`);
  }
  if (cfg.ignoreSessions.length) {
    console.log(`  Excluded sessions: ${cfg.ignoreSessions.length}`);
  }
  try {
    const r = await fetch(`${cfg.server}/api/health`, { signal: AbortSignal.timeout(3e3) });
    console.log(`  Health    ${r.ok ? "reachable" : `HTTP ${r.status}`}`);
  } catch {
    console.log("  Health    unreachable");
  }
}
var init_status = __esm({
  "src/status.ts"() {
    "use strict";
    init_src();
    init_config();
    init_account();
  }
});

// src/update.ts
var update_exports = {};
__export(update_exports, {
  runUpdate: () => runUpdate
});
import { readFile as readFile7, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir as homedir6 } from "node:os";
import { join as join6, resolve as resolve6 } from "node:path";
function git(args, cwd) {
  return spawnSync("git", args, { cwd, stdio: "inherit" }).status === 0;
}
function runningRoot() {
  const a = process.argv.slice(3);
  const i = a.indexOf("--root");
  const v = i >= 0 ? a[i + 1] : void 0;
  if (v && !v.includes("$") && !v.includes("{")) return v;
  return process.env.CLAUDE_PLUGIN_ROOT || void 0;
}
async function findMarketplace() {
  try {
    const raw = await readFile7(join6(PLUGINS_DIR, "known_marketplaces.json"), "utf8");
    const reg = JSON.parse(raw);
    for (const entry of Object.values(reg)) {
      const loc = entry.installLocation;
      if (loc && existsSync(join6(loc, ".git")) && existsSync(join6(loc, "plugin", MARKER))) return loc;
    }
  } catch {
  }
  const guess = join6(PLUGINS_DIR, "marketplaces", "claudelens");
  if (existsSync(join6(guess, ".git")) && existsSync(join6(guess, "plugin", MARKER))) return guess;
  return void 0;
}
async function runUpdate() {
  const mp = await findMarketplace();
  if (!mp) {
    console.log("Couldn't find the ClaudeLens marketplace checkout.");
    console.log("Update via Claude Code:  /plugin  \u2192  update  (or re-add the marketplace).");
    return;
  }
  console.log(`Pulling latest in ${mp} \u2026`);
  if (!git(["-C", mp, "pull", "--ff-only"], mp)) {
    console.log("git pull failed \u2014 resolve it in that checkout, then retry.");
    return;
  }
  const src = join6(mp, "plugin");
  const root = runningRoot();
  if (!root || !existsSync(root)) {
    console.log("\u2714 Latest fetched. Activate it with  /plugin  \u2192  update  (or restart Claude Code).");
    return;
  }
  if (resolve6(src) === resolve6(root)) {
    console.log("\u2714 Updated (running directly from the marketplace checkout).");
    return;
  }
  for (const part of ["dist", "skills", "hooks", ".claude-plugin"]) {
    const from = join6(src, part);
    if (existsSync(from)) await cp(from, join6(root, part), { recursive: true, force: true });
  }
  console.log("\u2714 Updated \u2014 new code runs from the next turn.");
  console.log("(If an update adds/removes slash commands, run /plugin \u2192 update too so the menu refreshes.)");
}
var PLUGINS_DIR, MARKER;
var init_update = __esm({
  "src/update.ts"() {
    "use strict";
    PLUGINS_DIR = join6(homedir6(), ".claude", "plugins");
    MARKER = join6("dist", "claudelens.mjs");
  }
});

// src/cli.ts
var op = process.argv[2];
async function main() {
  switch (op) {
    case "sync":
      return (await Promise.resolve().then(() => (init_sync(), sync_exports))).runSync();
    case "catchup":
      return (await Promise.resolve().then(() => (init_history(), history_exports))).runCatchUp();
    case "connect":
      return (await Promise.resolve().then(() => (init_connect(), connect_exports))).runConnect();
    case "untrack-session":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runUntrackSession();
    case "track-session":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runTrackSession();
    case "untrack-project":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runUntrackProject();
    case "track-project":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runTrackProject();
    case "pause":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runPause();
    case "resume":
      return (await Promise.resolve().then(() => (init_optout(), optout_exports))).runResume();
    case "status":
      return (await Promise.resolve().then(() => (init_status(), status_exports))).runStatus();
    case "update":
      return (await Promise.resolve().then(() => (init_update(), update_exports))).runUpdate();
    case "list-projects":
      return (await Promise.resolve().then(() => (init_history(), history_exports))).runListProjects();
    case "sync-history":
      return (await Promise.resolve().then(() => (init_history(), history_exports))).runSyncHistory();
    default:
      console.error(
        `ClaudeLens is a Claude Code plugin \u2014 use the /claudelens:* commands, not a terminal.
Unknown op: ${op ?? "(none)"}`
      );
      process.exit(1);
  }
}
main().catch((err) => {
  if (op === "sync" || op === "catchup") {
    if (process.env.CLAUDELENS_DEBUG) console.error("[claudelens sync]", err);
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
