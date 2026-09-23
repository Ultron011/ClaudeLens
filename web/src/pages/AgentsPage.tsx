import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgentInsights, type AgentsResponse, type PersonUse, type SkillRow, type SubagentRow } from '../api.insights.js';
import { fmtCost, fmtDate, fmtDay, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Kpi, KpiSkeleton } from '../components/Kpi.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { Chart, type Series } from '../charts/Chart.js';
import { OTHER_COLOR } from '../charts/palette.js';
import { useFetch } from '../useFetch.js';
import {
  Bar,
  Coverage,
  ErrorState,
  InsightsTabs,
  ScopeFilters,
  useInsightScope,
} from '../components/insights/InsightsChrome.js';
import '../styles.insights.css';

/** Series slots for the skill trend: the top skills by uses in range, the rest folded. */
const TREND_SLOTS = 5;
/** Matrix columns: the most-used skills. */
const MATRIX_COLS = 8;

const searchLink = (term: string) => `/search?${new URLSearchParams({ q: term, in: 'transcript' })}`;

function People({ people, max = 3 }: { people: PersonUse[]; max?: number }) {
  if (!people.length) return <span className="muted">—</span>;
  const head = people.slice(0, max);
  const rest = people.length - head.length;
  return (
    <span className="ins-people" title={people.map((p) => `${p.label} (${p.uses})`).join(', ')}>
      {head.map((p) => (
        <Link key={p.identity} to={`/u/${encodeURIComponent(p.author)}`} className="ins-person-pill">
          {p.label}
        </Link>
      ))}
      {rest > 0 && <span className="muted">+{rest}</span>}
    </span>
  );
}

export function AgentsPage() {
  const { person, project, setParam, scope, scopeKey, rangeLabel, rangePicker } = useInsightScope();
  const { data, err, loading } = useFetch<AgentsResponse>((signal) => getAgentInsights(scope, signal), [scopeKey]);
  const [allSkills, setAllSkills] = useState(false);

  const first = loading && !data;
  const subs = data?.subagents ?? [];
  const skills = data?.skills ?? [];
  const cov = data?.coverage;

  const runs = subs.reduce((n, s) => n + s.runs, 0);
  const cost = subs.reduce((n, s) => n + s.cost, 0);
  const skillUses = skills.reduce((n, s) => n + s.uses, 0);

  const subCols: Column<SubagentRow>[] = [
    {
      key: 'type',
      header: 'Subagent',
      sortable: true,
      sortValue: (r) => r.type,
      render: (r) => (
        <Link to={searchLink(r.type)} className="mono" title="Find sessions that mention it">
          {r.type}
        </Link>
      ),
    },
    { key: 'runs', header: 'Runs', numeric: true, sortable: true, sortValue: (r) => r.runs, render: (r) => r.runs.toLocaleString() },
    { key: 'sessions', header: 'Sessions', numeric: true, sortable: true, sortValue: (r) => r.sessions, render: (r) => r.sessions.toLocaleString() },
    { key: 'people', header: 'Who uses it', sortable: true, sortValue: (r) => r.people.length, render: (r) => <People people={r.people} /> },
    {
      key: 'tokens',
      header: 'Tokens',
      numeric: true,
      sortable: true,
      sortValue: (r) => r.tokens,
      render: (r) => (r.trackedRuns ? fmtTokens(r.tokens) : <span className="muted">—</span>),
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      sortable: true,
      sortValue: (r) => r.cost,
      render: (r) => (r.trackedRuns ? fmtCost(r.cost) : <span className="muted">—</span>),
    },
    {
      key: 'perRun',
      header: 'Per run',
      numeric: true,
      sortable: true,
      sortValue: (r) => (r.trackedRuns ? r.cost / r.trackedRuns : -1),
      render: (r) =>
        r.trackedRuns ? (
          <span title={`${r.trackedRuns} tracked runs · ${Math.round(r.toolCalls / r.trackedRuns)} tool calls each`}>
            {fmtCost(r.cost / r.trackedRuns)}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'last', header: 'Last used', sortable: true, sortValue: (r) => r.lastUsed ?? '', render: (r) => (r.lastUsed ? fmtDate(r.lastUsed) : '—') },
  ];

  // Skill trend — stacked weekly columns, top skills get stable series slots by rank.
  const top = skills.filter((s) => s.uses > 0).slice(0, TREND_SLOTS).map((s) => s.skill);
  const weeks = [...new Set((data?.skillWeekly ?? []).map((w) => w.week))].sort();
  const cell = new Map((data?.skillWeekly ?? []).map((w) => [`${w.week}|${w.skill}`, w.uses]));
  const series: Series[] = top.map((sk, i) => ({
    key: sk,
    label: sk,
    color: `var(--series-${i + 1})`,
    values: weeks.map((w) => cell.get(`${w}|${sk}`) ?? 0),
  }));
  const topSet = new Set(top);
  const otherVals = weeks.map((w) =>
    (data?.skillWeekly ?? []).filter((x) => x.week === w && !topSet.has(x.skill)).reduce((n, x) => n + x.uses, 0),
  );
  if (otherVals.some((v) => v > 0)) series.push({ key: '__other', label: 'Other skills', color: OTHER_COLOR, values: otherVals });

  const shownSkills = allSkills ? skills : skills.slice(0, 15);
  const maxSkill = Math.max(1, ...skills.map((s) => s.uses || s.sessions));

  return (
    <Shell crumbs={[{ label: 'Insights', to: '/insights/decisions' }, { label: 'Agents & skills' }]} actions={rangePicker}>
      <div className="page-head">
        <div>
          <h1>Subagents &amp; skills</h1>
          <p className="lede">
            Which subagents and skills the team actually reaches for, who uses them and what they cost —
            over {rangeLabel}.
          </p>
        </div>
        <div className="page-head-actions">
          <InsightsTabs />
        </div>
      </div>

      <ScopeFilters person={person} project={project} setParam={setParam} />

      {err ? (
        <ErrorState title="Couldn’t load subagents & skills" err={err} />
      ) : (
        <>
          <div className="kpi-row">
            {first ? (
              <>
                <KpiSkeleton label="Subagent runs" />
                <KpiSkeleton label="Subagent cost" />
                <KpiSkeleton label="Skill uses" />
                <KpiSkeleton label="Skills in use" />
              </>
            ) : (
              <>
                <Kpi label="Subagent runs" icon="people" value={runs.toLocaleString()} foot={`${subs.length} types`} primary />
                <Kpi label="Subagent cost" icon="coin" value={fmtCost(cost)} foot="tracked runs only (parser v7+)" />
                <Kpi label="Skill uses" icon="bolt" value={skillUses.toLocaleString()} foot="Skill tool calls" />
                <Kpi
                  label="Skills in use"
                  icon="layers"
                  value={skills.length.toLocaleString()}
                  foot={`by ${new Set(skills.flatMap((s) => s.people.map((p) => p.identity))).size} people`}
                />
              </>
            )}
          </div>

          {cov && (
            <Coverage>
              Runs, sessions and people come from all {cov.sessions.toLocaleString()} sessions in range.
              Tokens and cost come from the {cov.tracked.toLocaleString()} synced with parser v7+ (plugin
              ≥0.7), which record each subagent’s own usage; “—” means none of that type’s runs were
              tracked.
            </Coverage>
          )}

          <div className="bento">
            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Subagent types</h4>
                  <p className="panel-sub">Runs are Agent/Task calls in the main transcript. Click a type to find sessions using it.</p>
                </div>
              </div>
              {first ? (
                <div className="skel" style={{ height: 240, borderRadius: 'var(--r-lg)' }} />
              ) : subs.length === 0 ? (
                <p className="muted">No subagents ran in this range.</p>
              ) : (
                <DataTable columns={subCols} rows={subs} rowKey={(r) => r.type} caption="Subagent types by runs" ariaLabel="Subagent types" />
              )}
            </section>

            <section className="panel col-5">
              <div className="panel-head">
                <div>
                  <h4>Skills</h4>
                  <p className="panel-sub">Ranked by Skill tool calls; people who used each in brackets.</p>
                </div>
              </div>
              {first ? (
                <div className="skel skel-chart" />
              ) : skills.length === 0 ? (
                <p className="muted">No skills used in this range.</p>
              ) : (
                <>
                  <ol className="ins-rank">
                    {shownSkills.map((s: SkillRow) => (
                      <li key={s.skill}>
                        <Link to={searchLink(s.skill)} className="ins-rank-label mono" title={`${s.skill} — ${s.sessions} sessions, last ${s.lastUsed ? fmtDate(s.lastUsed) : '—'}`}>
                          {s.skill}
                        </Link>
                        <Bar value={s.uses || s.sessions} max={maxSkill} />
                        <span className="ins-rank-n">
                          {s.uses.toLocaleString()}
                          <span className="muted"> ({s.people.length})</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {skills.length > shownSkills.length && (
                    <div className="load-more">
                      <button type="button" className="chip" onClick={() => setAllSkills(true)}>
                        Show all {skills.length} skills
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="panel col-7">
              <div className="panel-head">
                <div>
                  <h4>Skill uses by week</h4>
                  <p className="panel-sub">Top {TREND_SLOTS} skills, the rest folded into “Other”. Weeks by session start (UTC, Mon).</p>
                </div>
              </div>
              {first ? (
                <div className="skel skel-chart" />
              ) : weeks.length === 0 ? (
                <p className="muted ins-empty-chart">No skill calls in this range.</p>
              ) : (
                <Chart
                  kind="bars"
                  height={220}
                  labels={weeks.map(fmtDay)}
                  series={series}
                  ariaLabel={`Skill uses per week, ${weeks.length} weeks`}
                />
              )}
            </section>

            <section className="panel col-12">
              <div className="panel-head">
                <div>
                  <h4>Who uses which skill</h4>
                  <p className="panel-sub">Skill calls per person, for the {MATRIX_COLS} most-used skills.</p>
                </div>
              </div>
              {first ? (
                <div className="skel" style={{ height: 200, borderRadius: 'var(--r-lg)' }} />
              ) : (
                <SkillMatrix skills={skills} />
              )}
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

function SkillMatrix({ skills }: { skills: SkillRow[] }) {
  const cols = skills.filter((s) => s.uses > 0).slice(0, MATRIX_COLS);
  if (!cols.length) return <p className="muted">No skill calls in this range.</p>;
  const people = new Map<string, { label: string; author: string; total: number }>();
  const cell = new Map<string, number>();
  for (const s of cols) {
    for (const p of s.people) {
      if (!p.uses) continue;
      const cur = people.get(p.identity) ?? { label: p.label, author: p.author, total: 0 };
      cur.total += p.uses;
      people.set(p.identity, cur);
      cell.set(`${p.identity}|${s.skill}`, p.uses);
    }
  }
  const rows = [...people.entries()].sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...cell.values());
  return (
    <div className="chart-table-wrap" tabIndex={0} role="region" aria-label="People by skill">
      <table className="chart-table ins-matrix">
        <caption className="sr-only">Skill calls per person</caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            {cols.map((s) => (
              <th key={s.skill} scope="col" className="num" title={s.skill}>
                <span className="ins-matrix-h">{s.skill.includes(':') ? s.skill.split(':').pop() : s.skill}</span>
              </th>
            ))}
            <th scope="col" className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, p]) => (
            <tr key={id}>
              <td>
                <Link to={`/u/${encodeURIComponent(p.author)}`} className="subtle-link">
                  {p.label}
                </Link>
              </td>
              {cols.map((s) => {
                const n = cell.get(`${id}|${s.skill}`) ?? 0;
                return (
                  <td key={s.skill} className="num">
                    {n ? (
                      <span
                        className="ins-heat"
                        style={{ ['--heat' as string]: `${Math.round(18 + (n / max) * 62)}%` }}
                        title={`${p.label} · ${s.skill}: ${n}`}
                      >
                        {n}
                      </span>
                    ) : (
                      <span className="muted">·</span>
                    )}
                  </td>
                );
              })}
              <td className="num">
                <strong>{p.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
