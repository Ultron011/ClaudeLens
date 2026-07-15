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
  const cWrite = usage.cache_creation_input_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  return (inTok * p.input + outTok * p.output + cWrite * p.cacheWrite + cRead * p.cacheRead) / 1e6;
}
var TABLE, DEFAULT;
var init_pricing = __esm({
  "../shared/src/pricing.ts"() {
    "use strict";
    TABLE = [
      ["opus", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
      ["sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
      ["haiku", { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 }],
      ["fable", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }]
    ];
    DEFAULT = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
  }
});

// ../shared/src/redact.ts
function redactText(input) {
  let text = input;
  const hits = {};
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
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
function basename(p) {
  if (!p) return void 0;
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || void 0;
}
function parseTranscript(jsonl) {
  const entries = [];
  for (const line of jsonl.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
    }
  }
  const turns = [];
  const toolUsage = {};
  const skills = /* @__PURE__ */ new Set();
  const subagents = /* @__PURE__ */ new Set();
  const models = /* @__PURE__ */ new Set();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let estimatedCostUsd = 0;
  let sessionId = "";
  let cwd;
  let gitBranch;
  let version;
  let title = "";
  let firstUserPrompt;
  const timestamps = [];
  for (const e of entries) {
    if (e.sessionId && !sessionId) sessionId = e.sessionId;
    if (e.cwd && !cwd) cwd = e.cwd;
    if (e.gitBranch && !gitBranch) gitBranch = e.gitBranch;
    if (e.version && !version) version = e.version;
    if (e.type === "ai-title" && e.aiTitle) title = e.aiTitle;
    if (e.type !== "user" && e.type !== "assistant") continue;
    const msg = e.message;
    if (!msg) continue;
    const blocks = asBlocks(msg.content);
    const model = msg.model ?? e.model;
    if (model) models.add(model);
    if (e.timestamp) timestamps.push(e.timestamp);
    if (e.type === "assistant" && msg.usage) {
      const u = msg.usage;
      inputTokens += u.input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
      cacheReadTokens += u.cache_read_input_tokens ?? 0;
      cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
      estimatedCostUsd += costForUsage(model, u);
    }
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
        if ((b.name === "Task" || b.name === "Agent") && detail) subagents.add(detail);
        toolCalls.push({ name: b.name, detail });
      }
    }
    const rawText = textParts.join("\n\n").trim();
    const text = e.type === "user" ? cleanUserText(rawText) : rawText;
    if (e.type === "user" && !firstUserPrompt && text) firstUserPrompt = text;
    if (!text && !thinkingParts.length && !toolCalls.length) continue;
    turns.push({
      role: e.type,
      timestamp: e.timestamp,
      model,
      text,
      thinking: thinkingParts.length ? thinkingParts.join("\n\n") : void 0,
      toolCalls,
      isSidechain: e.isSidechain
    });
  }
  timestamps.sort();
  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];
  const durationMs = startedAt && endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : void 0;
  const userTurns = turns.filter((t) => t.role === "user").length;
  const assistantTurns = turns.filter((t) => t.role === "assistant").length;
  const stats = {
    turns: turns.length,
    userTurns,
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
    firstUserPrompt: firstUserPrompt?.slice(0, 500)
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
    turns
  };
}
var INJECTED_TAG_NAME, INJECTED_BLOCK, INJECTED_TAG, CAVEAT;
var init_parser = __esm({
  "../shared/src/parser.ts"() {
    "use strict";
    init_pricing();
    INJECTED_TAG_NAME = "(?:system-reminder|user-prompt-submit-hook|(?:local-)?command-[a-z-]+|bash-[a-z-]+)";
    INJECTED_BLOCK = new RegExp(`<(${INJECTED_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, "g");
    INJECTED_TAG = new RegExp(`</?${INJECTED_TAG_NAME}\\b[^>]*>`, "g");
    CAVEAT = /Caveat:\s*The messages below were generated by the user while running local commands\.[\s\S]*?(?:\n\n|$)/g;
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
import { readFile, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve, sep, dirname, parse as parsePath } from "node:path";
async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      name: parsed.name,
      server: parsed.server ?? process.env.CLAUDELENS_SERVER,
      token: parsed.token ?? process.env.CLAUDELENS_TOKEN,
      ignoreProjects: parsed.ignoreProjects ?? [],
      ignoreSessions: parsed.ignoreSessions ?? [],
      paused: parsed.paused ?? false,
      redact: parsed.redact ?? false
    };
  } catch {
    return {
      ...EMPTY,
      server: process.env.CLAUDELENS_SERVER,
      token: process.env.CLAUDELENS_TOKEN
    };
  }
}
async function saveConfig(cfg) {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
function isConnected(cfg) {
  return Boolean(cfg.server);
}
function resolveName(cfg) {
  if (cfg.name?.trim()) return cfg.name.trim();
  if (process.env.CLAUDELENS_NAME?.trim()) return process.env.CLAUDELENS_NAME.trim();
  try {
    const git = execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim();
    if (git) return git;
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
      redact: false
    };
  }
});

// src/sync.ts
var sync_exports = {};
__export(sync_exports, {
  runSync: () => runSync
});
import { readFile as readFile2 } from "node:fs/promises";
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function readSettledSession(path) {
  let session = parseTranscript(await readFile2(path, "utf8"));
  for (let i = 0; i < 10; i++) {
    const last = session.turns[session.turns.length - 1];
    if (last && last.role === "assistant") break;
    await sleep(250);
    session = parseTranscript(await readFile2(path, "utf8"));
  }
  return session;
}
async function runSync() {
  const cfg = await loadConfig();
  const raw = await readStdin();
  let hook = {};
  try {
    hook = JSON.parse(raw);
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;
  if (!await shouldSync(cwd, session_id, cfg)) return;
  const session = await readSettledSession(transcript_path);
  if (!session.sessionId || session.stats.turns < 1) return;
  if (cfg.ignoreSessions.includes(session.sessionId)) return;
  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }
  const payload = { session, author: resolveName(cfg) };
  await fetch(`${cfg.server}/api/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}
    },
    body: JSON.stringify(payload)
  });
}
var sleep;
var init_sync = __esm({
  "src/sync.ts"() {
    "use strict";
    init_src();
    init_config();
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }
});

// src/connect.ts
var connect_exports = {};
__export(connect_exports, {
  runConnect: () => runConnect
});
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
  return out;
}
async function runConnect() {
  const args = parse(process.argv.slice(3));
  if (!args.server) {
    console.error("Usage: connect <server-url> <token>");
    process.exit(1);
  }
  const cfg = await loadConfig();
  cfg.server = args.server.replace(/\/+$/, "");
  if (args.token) cfg.token = args.token;
  if (args.name) cfg.name = args.name;
  if (args.session && !cfg.ignoreSessions.includes(args.session)) {
    cfg.ignoreSessions.push(args.session);
  }
  await saveConfig(cfg);
  console.log(`\u2714 Connected to ${cfg.server} as "${resolveName(cfg)}".`);
  console.log("Tracking is now on for every project. This session is excluded so the token is never uploaded.");
  console.log("Opt out anytime: /claudelens:untrack (this session), /claudelens:untrack-project, or /claudelens:pause.");
}
var init_connect = __esm({
  "src/connect.ts"() {
    "use strict";
    init_config();
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
import { readdir, readFile as readFile3, writeFile as writeFile2, unlink, stat } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2, resolve as resolve2 } from "node:path";
function argFlag(name) {
  return process.argv.slice(3).includes(name);
}
function positional() {
  return process.argv.slice(3).find((a) => !a.startsWith("-"));
}
function positionalDir() {
  const p = positional();
  return resolve2(p && !p.startsWith("-") ? p : process.cwd());
}
async function resolveSessionId(explicit, cwd) {
  const clean = explicit?.trim();
  if (clean && !clean.includes("$") && !clean.includes("{")) return clean;
  let dirs;
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return void 0;
  }
  let best;
  for (const d of dirs) {
    const full = join2(PROJECTS_DIR, d);
    let files;
    try {
      files = (await readdir(full)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join2(full, f);
      try {
        const raw = await readFile3(path, "utf8");
        let sid;
        let matches = false;
        let scanned = 0;
        for (const line of raw.split("\n")) {
          if (!line.trim() || ++scanned > 80) break;
          try {
            const e = JSON.parse(line);
            if (e.sessionId && !sid) sid = e.sessionId;
            if (e.cwd && resolve2(e.cwd) === resolve2(cwd)) matches = true;
          } catch {
          }
        }
        if (matches && sid) {
          const { mtimeMs } = await stat(path);
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
    cfg.ignoreSessions.push(id);
    await saveConfig(cfg);
  }
  console.log(`\u2714 This session (${id.slice(0, 8)}) will not be tracked. Nothing from it is sent to the dashboard.`);
}
async function runTrackSession() {
  const cfg = await loadConfig();
  const id = await resolveSessionId(positional(), process.cwd());
  if (id) {
    cfg.ignoreSessions = cfg.ignoreSessions.filter((s) => s !== id);
    await saveConfig(cfg);
  }
  console.log("\u2714 This session is tracked again (syncs from the next turn).");
}
async function runUntrackProject() {
  const cfg = await loadConfig();
  const dir = positionalDir();
  const team = argFlag("--team") || argFlag("--shared");
  if (!isExcludedLocally(dir, cfg)) {
    cfg.ignoreProjects.push(dir);
    await saveConfig(cfg);
  }
  if (team) {
    await writeFile2(
      join2(dir, REPO_MARKER),
      "# ClaudeLens: this repo is never tracked, for anyone. Commit this file.\nignore: true\n",
      "utf8"
    );
    console.log(`\u2714 Wrote ${REPO_MARKER} in ${pretty(dir)} \u2014 commit it to exclude this repo for the whole team.`);
  } else {
    console.log(`\u2714 This project (${pretty(dir)}) will not be tracked. Its sessions stop syncing immediately.`);
  }
}
async function runTrackProject() {
  const cfg = await loadConfig();
  const dir = positionalDir();
  const team = argFlag("--team") || argFlag("--shared");
  cfg.ignoreProjects = cfg.ignoreProjects.filter((p) => resolve2(p) !== dir);
  await saveConfig(cfg);
  if (team) {
    try {
      await unlink(join2(dir, REPO_MARKER));
    } catch {
    }
  }
  console.log(`\u2714 Tracking ${pretty(dir)} again.`);
}
async function setPaused(paused) {
  const cfg = await loadConfig();
  cfg.paused = paused;
  await saveConfig(cfg);
  console.log(
    paused ? "\u23F8  Paused \u2014 nothing syncs on this machine until /claudelens:resume." : "\u25B6  Resumed \u2014 tracked projects sync again from the next turn."
  );
}
var PROJECTS_DIR, pretty, runPause, runResume;
var init_optout = __esm({
  "src/optout.ts"() {
    "use strict";
    init_config();
    PROJECTS_DIR = join2(homedir2(), ".claude", "projects");
    pretty = (d) => d.replace(homedir2(), "~");
    runPause = () => setPaused(true);
    runResume = () => setPaused(false);
  }
});

// src/status.ts
var status_exports = {};
__export(status_exports, {
  runStatus: () => runStatus
});
import { resolve as resolve3 } from "node:path";
import { homedir as homedir3 } from "node:os";
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
  console.log("ClaudeLens");
  console.log(`  Server    ${cfg.server}`);
  console.log(`  Author    ${resolveName(cfg)}`);
  console.log(`  Global    ${cfg.paused ? "PAUSED" : envOptedOut() ? "disabled by env (DO_NOT_TRACK)" : "on"}`);
  console.log(`  This dir  ${cwd.replace(homedir3(), "~")}`);
  console.log(
    `            ${trackingHere ? "tracked \u2713" : repoOff ? "excluded by committed .claudelens (team-wide)" : projOff ? "excluded (you ran /claudelens:untrack-project)" : "not tracked (global pause/opt-out)"}`
  );
  if (cfg.ignoreProjects.length) {
    console.log(`  Excluded projects (${cfg.ignoreProjects.length}):`);
    for (const p of cfg.ignoreProjects) console.log(`    \xB7 ${resolve3(p).replace(homedir3(), "~")}`);
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
    init_config();
  }
});

// src/update.ts
var update_exports = {};
__export(update_exports, {
  runUpdate: () => runUpdate
});
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname as dirname2, resolve as resolve4, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  return r.status === 0;
}
function findGitRoot(start) {
  let cur = resolve4(start);
  for (let i = 0; i < 40; i++) {
    if (existsSync(join3(cur, ".git"))) return cur;
    const parent = dirname2(cur);
    if (parent === cur) return void 0;
    cur = parent;
  }
  return void 0;
}
async function runUpdate() {
  const bundleDir = dirname2(fileURLToPath(import.meta.url));
  const repo = findGitRoot(bundleDir);
  if (!repo) {
    console.log("Couldn't find a git checkout for this plugin.");
    console.log("Update it from Claude Code with:  /plugin  \u2192  update  (or re-add the marketplace).");
    return;
  }
  console.log(`Updating ClaudeLens in ${repo}`);
  if (!run("git", ["-C", repo, "pull", "--ff-only"], repo)) {
    console.log("git pull failed \u2014 resolve it in the checkout, then retry.");
    return;
  }
  if (existsSync(join3(repo, "pnpm-workspace.yaml"))) {
    console.log("Rebuilding bundle\u2026");
    if (!run("pnpm", ["--filter", "@claudelens/cli", "build:plugin"], repo)) {
      console.log("(skipped rebuild \u2014 using the committed bundle from the pull)");
    }
  }
  console.log("\u2714 Updated. Takes effect on the next turn \u2014 no reinstall needed.");
}
var init_update = __esm({
  "src/update.ts"() {
    "use strict";
  }
});

// src/cli.ts
var op = process.argv[2];
async function main() {
  switch (op) {
    case "sync":
      return (await Promise.resolve().then(() => (init_sync(), sync_exports))).runSync();
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
    default:
      console.error(
        `ClaudeLens is a Claude Code plugin \u2014 use the /claudelens:* commands, not a terminal.
Unknown op: ${op ?? "(none)"}`
      );
      process.exit(1);
  }
}
main().catch((err) => {
  if (op === "sync") {
    if (process.env.CLAUDELENS_DEBUG) console.error("[claudelens sync]", err);
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
