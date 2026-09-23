// Decision log, tool reliability, subagents & skills.
// Routes are registered from index.ts before the /api 404 catch-all. Use the helpers in
// ./helpers.js (queryStrings/dateParam/sendError/analyticsScope/IDENTITY_CLAUSE…) so validation,
// scoping and error shapes match the rest of the API.
//
// All three read the transcript jsonb for part of their answer, which is the expensive column
// (TOAST, tens of MB): every transcript scan is prefiltered on a cheap `stats` key that is exact
// for the tool in question, walks the array with a jsonpath/ordinality expansion, and the whole
// scoped result is memoised for CACHE_TTL_MS keyed by the scope params. Filtering/pagination on
// top of a cached scope (decisions' q / notes / project / offset) is done in JS, so "Load more"
// and typing in the search box never re-scan transcripts.
import type express from 'express';
import { pool } from './db.js';
import { BadRequest, NO_PROJECT, analyticsScope, queryStrings, sendError } from './helpers.js';

// ---------------------------------------------------------------------------
// Small TTL cache (promise-valued, so concurrent identical requests share one query)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 64;
const cache = new Map<string, { at: number; p: Promise<unknown> }>();

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.p as Promise<T>;
  const p = fn();
  cache.set(key, { at: now, p });
  // A failed query must not be served from cache for the next minute.
  p.catch(() => cache.delete(key));
  if (cache.size > CACHE_MAX) {
    for (const [k, v] of cache) if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

/** Stable cache key for a scope's bound args. */
const keyOf = (name: string, args: unknown[]) => `${name}:${JSON.stringify(args)}`;

/** Week bucket (Monday, UTC) as 'YYYY-MM-DD' text — never ::date (docs/gotchas.md #2). */
const WEEK_EXPR = `to_char(date_trunc('week', started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

/** The person grouping key — `author`, same as /api/stats' rows and the /u/:author pages. Not
 *  coalesce(account_email, author): several people share one Claude account here, and grouping
 *  by email folded them into one "person" under whoever synced last. */
const IDENTITY_EXPR = `author`;

function intParam(v: string | undefined, name: string, def: number, min: number, max: number): number {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new BadRequest(`"${name}" must be an integer`);
  return Math.min(Math.max(n, min), max);
}

function boolParam(v: string | undefined, name: string): boolean {
  if (v === undefined || v === '' || v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  throw new BadRequest(`"${name}" must be true or false`);
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const rate = (num: number, den: number) => (den > 0 ? round4(num / den) : null);

/** Keep the latest label/author for a person, from rows ordered oldest → newest. */
interface Person {
  identity: string;
  label: string;
  author: string;
}

// ---------------------------------------------------------------------------
// Decisions — every AskUserQuestion call
// ---------------------------------------------------------------------------

interface AskedQuestion {
  question: string;
  header?: string;
  options: string[];
  multiSelect?: boolean;
  answer?: string;
  notes?: string;
}

type Pick = 'recommended' | 'option' | 'custom' | 'unanswered';

interface DecisionQuestion extends AskedQuestion {
  picked: string[];
  custom?: string;
  pick: Pick;
  offeredRecommended: boolean;
}

interface Decision {
  id: string; // `${sessionUuid}:${turnIndex}:${callIndex}`
  sessionId: string; // sessions.id (uuid) — link target /session/<id>#t-<turnIndex>
  title: string;
  author: string;
  identity: string;
  label: string;
  project: string | null;
  turnIndex: number;
  timestamp: string | null;
  dismissed: boolean;
  denied: string | null;
  questions: DecisionQuestion[];
}

const RECOMMENDED = /\(recommended\)|\brecommended\b/i;

/** Same idea as SessionPage's splitAnswer: an exact option label, else ", "-joined multi picks,
 *  and whatever is left over is the user's own text ("Other"). */
function splitAnswer(q: AskedQuestion): { picked: string[]; custom?: string } {
  if (!q.answer) return { picked: [] };
  if (q.options.includes(q.answer)) return { picked: [q.answer] };
  const picked: string[] = [];
  const rest: string[] = [];
  for (const part of q.answer.split(', ')) {
    if (q.options.includes(part) && !picked.includes(part)) picked.push(part);
    else rest.push(part);
  }
  return { picked, custom: rest.length ? rest.join(', ') : undefined };
}

function classify(raw: AskedQuestion): DecisionQuestion {
  const q: AskedQuestion = {
    question: String(raw.question ?? ''),
    header: raw.header ?? undefined,
    options: Array.isArray(raw.options) ? raw.options.map(String) : [],
    multiSelect: raw.multiSelect ?? undefined,
    answer: raw.answer ?? undefined,
    notes: raw.notes ?? undefined,
  };
  const { picked, custom } = splitAnswer(q);
  const offeredRecommended = q.options.some((o) => RECOMMENDED.test(o));
  const pick: Pick = !q.answer
    ? 'unanswered'
    : custom
      ? 'custom'
      : picked.some((o) => RECOMMENDED.test(o))
        ? 'recommended'
        : 'option';
  return { ...q, picked, custom, pick, offeredRecommended };
}

interface DecisionScope {
  decisions: Decision[];
  /** AskUserQuestion calls in scope per stats.toolUsage (every parser version). */
  totalCalls: number;
}

async function loadDecisions(args: unknown[], scopeWhere: string): Promise<DecisionScope> {
  const [rowsQ, callsQ] = await Promise.all([
    // `stats.toolUsage ? 'AskUserQuestion'` is an exact prefilter (the GIN tsv only covers the
    // first 400k chars of a transcript, so it misses decisions in long sessions); question data
    // only exists from parser v6, so older rows are skipped before their transcript is detoasted.
    pool.query(
      `SELECT s.id, s.title, s.author, s.project, ${IDENTITY_EXPR} AS identity,
              s.author AS label,
              s.started_at, (t.i - 1)::int AS "turnIndex", t.turn->>'timestamp' AS ts,
              (c.j - 1)::int AS "callIndex",
              c.tc->'questions' AS questions,
              coalesce((c.tc->>'declined')::boolean, false) AS declined,
              c.tc->>'denied' AS denied
         FROM sessions s,
              LATERAL jsonb_array_elements(s.transcript) WITH ORDINALITY t(turn, i),
              LATERAL jsonb_array_elements(coalesce(t.turn->'toolCalls', '[]'::jsonb)) WITH ORDINALITY c(tc, j)
        WHERE ${scopeWhere}
          AND s.parser_version >= 6
          AND s.stats->'toolUsage' ? 'AskUserQuestion'
          AND c.tc->>'name' = 'AskUserQuestion'
          AND (c.tc ? 'questions' OR c.tc ? 'declined' OR c.tc ? 'denied')`,
      args,
    ),
    pool.query(
      `SELECT coalesce(sum((stats->'toolUsage'->>'AskUserQuestion')::int), 0)::int AS calls
         FROM sessions WHERE ${scopeWhere} AND stats->'toolUsage' ? 'AskUserQuestion'`,
      args,
    ),
  ]);
  const decisions: Decision[] = rowsQ.rows.map((r) => ({
    id: `${r.id}:${r.turnIndex}:${r.callIndex}`,
    sessionId: r.id,
    title: r.title,
    author: r.author,
    identity: r.identity,
    label: r.label,
    project: r.project ?? null,
    turnIndex: r.turnIndex,
    timestamp: r.ts ?? (r.started_at ? new Date(r.started_at).toISOString() : null),
    dismissed: !!r.declined || !!r.denied,
    denied: r.denied ?? null,
    questions: (Array.isArray(r.questions) ? r.questions : []).map(classify),
  }));
  // Newest first; stable tiebreak on turn/call order within a session.
  decisions.sort(
    (a, b) =>
      (b.timestamp ?? '').localeCompare(a.timestamp ?? '') ||
      a.sessionId.localeCompare(b.sessionId) ||
      b.turnIndex - a.turnIndex,
  );
  return { decisions, totalCalls: callsQ.rows[0]?.calls ?? 0 };
}

function matchesText(d: Decision, needle: string): boolean {
  for (const q of d.questions) {
    const hay = [q.question, q.header, q.answer, q.notes, ...q.options].filter(Boolean).join('\n').toLowerCase();
    if (hay.includes(needle)) return true;
  }
  return false;
}

function decisionStats(list: Decision[]) {
  let questions = 0,
    answered = 0,
    withNotes = 0,
    recommended = 0,
    option = 0,
    custom = 0,
    offeredRecommended = 0,
    pickedWhenOffered = 0;
  for (const d of list) {
    for (const q of d.questions) {
      questions++;
      if (q.notes) withNotes++;
      if (q.pick === 'unanswered') continue;
      answered++;
      if (q.pick === 'recommended') recommended++;
      else if (q.pick === 'option') option++;
      else custom++;
      if (q.offeredRecommended) {
        offeredRecommended++;
        if (q.pick === 'recommended') pickedWhenOffered++;
      }
    }
  }
  return {
    calls: list.length,
    questions,
    answered,
    dismissed: list.filter((d) => d.dismissed).length,
    withNotes,
    recommended,
    option,
    custom,
    offeredRecommended,
    pickedWhenOffered,
  };
}

// ---------------------------------------------------------------------------
// Tools — uses, failures, denials, weekly failure rate, MCP servers
// ---------------------------------------------------------------------------

const MCP_RE = /^mcp__(.+?)__(.+)$/;

async function loadTools(args: unknown[], scopeWhere: string) {
  const [perToolQ, denialKindsQ, deniedCallsQ, coverageQ] = await Promise.all([
    // One row per (week, tracked?, tool). `stats ? 'toolErrors'` = the session carries failure
    // data (parser v7+, where it is always written, `{}` when nothing failed).
    pool.query(
      // MATERIALIZED + pulling the two small sub-objects out once: otherwise every per-key
      // `stats->'toolErrors'` re-detoasts the whole stats blob (~2x slower).
      `WITH scope AS MATERIALIZED (
         SELECT stats->'toolUsage' AS tu, stats->'toolErrors' AS te, ${WEEK_EXPR} AS week,
                stats ? 'toolErrors' AS tracked
           FROM sessions WHERE ${scopeWhere})
       SELECT week, tracked, key AS tool, count(*)::int AS sessions,
              sum(value::int)::int AS uses,
              sum(coalesce((te->>key)::int, 0))::int AS errors
         FROM scope, LATERAL jsonb_each_text(coalesce(tu, '{}'::jsonb))
        GROUP BY 1, 2, 3`,
      args,
    ),
    pool.query(
      `SELECT key AS kind, sum(value::int)::int AS count, count(*)::int AS sessions
         FROM sessions, LATERAL jsonb_each_text(stats->'toolDenials')
        WHERE ${scopeWhere} AND jsonb_typeof(stats->'toolDenials') = 'object'
        GROUP BY 1 ORDER BY count DESC`,
      args,
    ),
    // Per-tool denials only exist on the transcript's ToolCall.denied; the stats key tells us
    // exactly which sessions have any, so only those transcripts are read.
    pool.query(
      `SELECT tc->>'name' AS tool, tc->>'denied' AS kind, count(*)::int AS count
         FROM sessions,
              LATERAL jsonb_path_query(transcript, '$[*].toolCalls[*] ? (exists(@.denied))') tc
        WHERE ${scopeWhere} AND stats->'toolDenials' <> '{}'::jsonb
        GROUP BY 1, 2`,
      args,
    ),
    pool.query(
      `SELECT count(*)::int AS sessions,
              count(*) FILTER (WHERE stats ? 'toolErrors')::int AS tracked,
              min(started_at) FILTER (WHERE stats ? 'toolErrors') AS "trackedSince"
         FROM sessions WHERE ${scopeWhere}`,
      args,
    ),
  ]);

  type ToolRow = {
    tool: string;
    server: string | null;
    uses: number;
    sessions: number;
    trackedUses: number;
    errors: number;
    failureRate: number | null;
    denials: number;
    denialKinds: Record<string, number>;
  };
  const tools = new Map<string, ToolRow>();
  const row = (tool: string) => {
    let r = tools.get(tool);
    if (!r) {
      r = {
        tool,
        server: MCP_RE.exec(tool)?.[1] ?? null,
        uses: 0,
        sessions: 0,
        trackedUses: 0,
        errors: 0,
        failureRate: null,
        denials: 0,
        denialKinds: {},
      };
      tools.set(tool, r);
    }
    return r;
  };
  const weekly = new Map<string, { week: string; uses: number; errors: number }>();
  const weeklyTool = new Map<string, { week: string; tool: string; uses: number; errors: number }>();
  for (const r of perToolQ.rows) {
    const t = row(r.tool);
    t.uses += r.uses;
    t.sessions += r.sessions;
    if (r.tracked) {
      t.trackedUses += r.uses;
      t.errors += r.errors;
      if (r.week) {
        const w = weekly.get(r.week) ?? { week: r.week, uses: 0, errors: 0 };
        w.uses += r.uses;
        w.errors += r.errors;
        weekly.set(r.week, w);
        const k = `${r.week}|${r.tool}`;
        const wt = weeklyTool.get(k) ?? { week: r.week, tool: r.tool, uses: 0, errors: 0 };
        wt.uses += r.uses;
        wt.errors += r.errors;
        weeklyTool.set(k, wt);
      }
    }
  }
  for (const d of deniedCallsQ.rows) {
    const t = row(d.tool);
    t.denials += d.count;
    t.denialKinds[d.kind] = (t.denialKinds[d.kind] ?? 0) + d.count;
  }
  const toolList = [...tools.values()]
    .map((t) => ({ ...t, failureRate: rate(t.errors, t.trackedUses) }))
    .sort((a, b) => b.uses - a.uses || a.tool.localeCompare(b.tool));

  const servers = new Map<string, { server: string; tools: number; uses: number; trackedUses: number; errors: number; denials: number }>();
  for (const t of toolList) {
    if (!t.server) continue;
    const s = servers.get(t.server) ?? { server: t.server, tools: 0, uses: 0, trackedUses: 0, errors: 0, denials: 0 };
    s.tools++;
    s.uses += t.uses;
    s.trackedUses += t.trackedUses;
    s.errors += t.errors;
    s.denials += t.denials;
    servers.set(t.server, s);
  }

  // Per-tool weekly series for the most-used tools with failure data (the page's trend picker).
  const trendTools = toolList
    .filter((t) => t.trackedUses > 0)
    .sort((a, b) => b.errors - a.errors || b.trackedUses - a.trackedUses)
    .slice(0, 8)
    .map((t) => t.tool);
  const trendSet = new Set(trendTools);

  const totals = toolList.reduce(
    (acc, t) => {
      acc.uses += t.uses;
      acc.trackedUses += t.trackedUses;
      acc.errors += t.errors;
      acc.denials += t.denials;
      return acc;
    },
    { uses: 0, trackedUses: 0, errors: 0, denials: 0, failureRate: null as number | null },
  );
  totals.failureRate = rate(totals.errors, totals.trackedUses);
  const cov = coverageQ.rows[0] ?? {};

  return {
    coverage: {
      sessions: cov.sessions ?? 0,
      tracked: cov.tracked ?? 0,
      trackedSince: cov.trackedSince ?? null,
    },
    totals,
    tools: toolList,
    mcpServers: [...servers.values()]
      .map((s) => ({ ...s, failureRate: rate(s.errors, s.trackedUses) }))
      .sort((a, b) => b.uses - a.uses),
    denials: denialKindsQ.rows,
    weekly: [...weekly.values()]
      .map((w) => ({ week: w.week, uses: w.uses, errors: w.errors, failureRate: rate(w.errors, w.uses) }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    trendTools,
    weeklyByTool: [...weeklyTool.values()]
      .filter((w) => trendSet.has(w.tool))
      .map((w) => ({ ...w, failureRate: rate(w.errors, w.uses) }))
      .sort((a, b) => a.week.localeCompare(b.week) || a.tool.localeCompare(b.tool)),
  };
}

// ---------------------------------------------------------------------------
// Agents — subagent types and skills
// ---------------------------------------------------------------------------

/** ToolCall.detail for Agent/Task is `subagent_type`, falling back to the call's *description*
 *  when no type was given — and Claude Code runs an untyped call as general-purpose. Agent type
 *  ids never contain whitespace, so a detail that does is a description: count it as that. */
const agentType = (detail: string) => (/\s/.test(detail) ? 'general-purpose' : detail);

async function loadAgents(args: unknown[], scopeWhere: string) {
  const [sessQ, callsQ] = await Promise.all([
    // Cheap: only small stats keys, every row in scope, oldest first so the last write per person
    // wins for label/author.
    pool.query(
      `SELECT id, author, ${IDENTITY_EXPR} AS identity,
              author AS label,
              started_at, ${WEEK_EXPR} AS week,
              stats->'skills' AS skills, stats->'subagents' AS subagents,
              stats->'subagentUsage' AS "subagentUsage"
         FROM sessions WHERE ${scopeWhere}
        ORDER BY started_at NULLS FIRST, created_at`,
      args,
    ),
    // Invocation counts per session (stats.skills/subagents are distinct-per-session lists).
    // Exact prefilter on stats.toolUsage; jsonpath avoids expanding every turn into a row.
    pool.query(
      `SELECT id, tc->>'name' AS name, tc->>'detail' AS detail, count(*)::int AS n
         FROM sessions,
              LATERAL jsonb_path_query(transcript,
                '$[*].toolCalls[*] ? (@.name == "Skill" || @.name == "Agent" || @.name == "Task")') tc
        WHERE ${scopeWhere} AND stats->'toolUsage' ?| array['Skill','Agent','Task']
        GROUP BY 1, 2, 3`,
      args,
    ),
  ]);

  const people = new Map<string, Person>();
  const sess = new Map<string, { identity: string; week: string | null; startedAt: string | null }>();
  let tracked = 0;
  for (const r of sessQ.rows) {
    people.set(r.identity, { identity: r.identity, label: r.label, author: r.author });
    sess.set(r.id, {
      identity: r.identity,
      week: r.week,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    });
    if (r.subagentUsage && typeof r.subagentUsage === 'object') tracked++;
  }

  type Agg = {
    name: string;
    uses: number;
    sessions: number;
    people: Map<string, number>;
    lastUsed: string | null;
  };
  const newAgg = (name: string): Agg => ({ name, uses: 0, sessions: 0, people: new Map(), lastUsed: null });
  const skills = new Map<string, Agg>();
  const agents = new Map<string, Agg & { trackedRuns: number; tokens: number; cost: number; toolCalls: number }>();
  const agent = (name: string) => {
    let a = agents.get(name);
    if (!a) agents.set(name, (a = { ...newAgg(name), trackedRuns: 0, tokens: 0, cost: 0, toolCalls: 0 }));
    return a;
  };
  const skill = (name: string) => {
    let a = skills.get(name);
    if (!a) skills.set(name, (a = newAgg(name)));
    return a;
  };
  const touch = (a: Agg, identity: string, startedAt: string | null, n: number) => {
    a.people.set(identity, (a.people.get(identity) ?? 0) + n);
    if (startedAt && (!a.lastUsed || startedAt > a.lastUsed)) a.lastUsed = startedAt;
  };

  // Sessions + people from the per-session lists (present on every parser version).
  for (const r of sessQ.rows) {
    const s = sess.get(r.id)!;
    for (const name of Array.isArray(r.skills) ? r.skills : []) {
      const a = skill(String(name));
      a.sessions++;
      touch(a, s.identity, s.startedAt, 0);
    }
    const types = new Set<string>((Array.isArray(r.subagents) ? r.subagents : []).map((n: unknown) => agentType(String(n))));
    for (const name of types) {
      const a = agent(name);
      a.sessions++;
      touch(a, s.identity, s.startedAt, 0);
    }
    if (r.subagentUsage && typeof r.subagentUsage === 'object') {
      for (const [name, u] of Object.entries(r.subagentUsage as Record<string, any>)) {
        const a = agent(name);
        a.trackedRuns += Number(u?.runs ?? 0);
        a.tokens += Number(u?.totalTokens ?? 0);
        a.cost += Number(u?.costUsd ?? 0);
        a.toolCalls += Number(u?.toolCalls ?? 0);
      }
    }
  }

  // Invocations from the transcript, plus the weekly skill trend.
  const skillWeekly = new Map<string, { week: string; skill: string; uses: number }>();
  for (const r of callsQ.rows) {
    const s = sess.get(r.id);
    if (!s || !r.detail) continue;
    if (r.name === 'Skill') {
      const a = skill(r.detail);
      a.uses += r.n;
      touch(a, s.identity, s.startedAt, r.n);
      if (s.week) {
        const k = `${s.week}|${r.detail}`;
        const w = skillWeekly.get(k) ?? { week: s.week, skill: r.detail, uses: 0 };
        w.uses += r.n;
        skillWeekly.set(k, w);
      }
    } else {
      const a = agent(agentType(r.detail));
      a.uses += r.n;
      touch(a, s.identity, s.startedAt, r.n);
    }
  }

  const peopleOf = (a: Agg) =>
    [...a.people.entries()]
      .map(([identity, uses]) => ({ ...people.get(identity)!, uses }))
      .sort((x, y) => y.uses - x.uses || x.label.localeCompare(y.label));

  const subagentList = [...agents.values()]
    .map((a) => ({
      type: a.name,
      runs: a.uses,
      sessions: a.sessions,
      people: peopleOf(a),
      trackedRuns: a.trackedRuns,
      tokens: a.tokens,
      cost: round4(a.cost),
      toolCalls: a.toolCalls,
      lastUsed: a.lastUsed,
    }))
    .sort((a, b) => b.runs - a.runs || b.sessions - a.sessions || a.type.localeCompare(b.type));
  const skillList = [...skills.values()]
    .map((a) => ({ skill: a.name, uses: a.uses, sessions: a.sessions, people: peopleOf(a), lastUsed: a.lastUsed }))
    .sort((a, b) => b.uses - a.uses || b.sessions - a.sessions || a.skill.localeCompare(b.skill));

  return {
    coverage: { sessions: sessQ.rows.length, tracked },
    subagents: subagentList,
    skills: skillList,
    skillWeekly: [...skillWeekly.values()].sort((a, b) => a.week.localeCompare(b.week) || b.uses - a.uses),
    people: [...people.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerInsights(app: express.Express) {
  /** GET /api/insights/decisions — AskUserQuestion log, newest first.
   *  Scope: identity/from/to/project. Filters: q (question/header/options/answer/notes substring),
   *  notes=true (only calls with a note). Paging: limit (1–100, default 30), offset. */
  app.get('/api/insights/decisions', async (req, res) => {
    let args: unknown[], scopeWhere: string, q: string, notesOnly: boolean, limit: number, offset: number, project: string | undefined;
    try {
      ({ args, scopeWhere } = analyticsScope(req));
      const qs = queryStrings(req.query);
      q = (qs.q ?? '').trim().toLowerCase();
      if (q.length > 200) throw new BadRequest('"q" is too long');
      notesOnly = boolParam(qs.notes, 'notes');
      limit = intParam(qs.limit, 'limit', 30, 1, 100);
      offset = intParam(qs.offset, 'offset', 0, 0, 1_000_000);
      project = qs.project;
    } catch (err) {
      return sendError(res, 'insights/decisions', err);
    }
    try {
      // Cache the scope without the project, so the project facet can list every project that has
      // decisions; the project filter is applied below with the same (no project) semantics.
      const baseArgs = [args[0], args[1], args[2], null];
      const scope = await cached(keyOf('decisions', baseArgs), () => loadDecisions(baseArgs, scopeWhere));

      const projects = new Map<string, number>();
      for (const d of scope.decisions) {
        const p = d.project ?? NO_PROJECT;
        projects.set(p, (projects.get(p) ?? 0) + 1);
      }
      let list = scope.decisions;
      if (project !== undefined) {
        list = list.filter((d) => (project === NO_PROJECT ? d.project === null : d.project === project));
      }
      if (q) list = list.filter((d) => matchesText(d, q));
      const stats = decisionStats(list);
      if (notesOnly) list = list.filter((d) => d.questions.some((x) => x.notes));

      res.json({
        coverage: {
          // Every AskUserQuestion call in the scope (all parser versions), vs the ones whose
          // questions/answers were captured (parser v6+). Project-independent.
          calls: scope.totalCalls,
          withData: scope.decisions.length,
        },
        stats,
        projects: [...projects.entries()]
          .map(([p, n]) => ({ project: p, decisions: n }))
          .sort((a, b) => b.decisions - a.decisions),
        total: list.length,
        items: list.slice(offset, offset + limit),
        hasMore: offset + limit < list.length,
      });
    } catch (err) {
      sendError(res, 'insights/decisions', err);
    }
  });

  /** GET /api/insights/tools — per-tool uses/failures/denials, MCP servers, weekly failure rate. */
  app.get('/api/insights/tools', async (req, res) => {
    let args: unknown[], scopeWhere: string;
    try {
      ({ args, scopeWhere } = analyticsScope(req));
    } catch (err) {
      return sendError(res, 'insights/tools', err);
    }
    try {
      res.json(await cached(keyOf('tools', args), () => loadTools(args, scopeWhere)));
    } catch (err) {
      sendError(res, 'insights/tools', err);
    }
  });

  /** GET /api/insights/agents — subagent types and skills: invocations, sessions, people, cost. */
  app.get('/api/insights/agents', async (req, res) => {
    let args: unknown[], scopeWhere: string;
    try {
      ({ args, scopeWhere } = analyticsScope(req));
    } catch (err) {
      return sendError(res, 'insights/agents', err);
    }
    try {
      res.json(await cached(keyOf('agents', args), () => loadAgents(args, scopeWhere)));
    } catch (err) {
      sendError(res, 'insights/agents', err);
    }
  });
}
