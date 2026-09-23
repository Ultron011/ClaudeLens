import { getProfile, type Activity, type Profile } from '../../api.trends.js';
import { fmtDuration, fmtTokens } from '../../format.js';
import { foldModels } from '../../charts/palette.js';
import { useFetch } from '../../useFetch.js';
import { activeWindowText } from './HourHeatmap.js';
import '../../styles.trends.css';

const pct = (f: number | null) => (f == null ? '—' : `${Math.round(f * 100)}%`);
const fmt1 = (v: number | null) => (v == null ? '—' : v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1).replace(/\.0$/, ''));

/** How one person works with Claude Code, over the selected range: typical session, prompts per
 *  session, auto-mode share, interrupts, model mix, top tools and skills, reported line churn and
 *  active hours. Medians, not means — one 9-hour marathon shouldn't define "typical". */
export function ProfileCard({
  author,
  from,
  to,
  activity,
  className = 'panel',
}: {
  author: string;
  from: string;
  to: string;
  /** the page's shared activity fetch, for the active-hours line */
  activity: Activity | null;
  className?: string;
}) {
  const { data: p, err, refetch } = useFetch<Profile>(
    (signal) => getProfile({ author, from, to }, signal),
    [author, from, to],
  );

  const hoursLine = activity ? activeWindowText(activity.hours, activity.tz) : null;
  const { rows, other } = foldModels(p?.models ?? []);
  const mix = (other ? [...rows, other] : rows).map((m) => ({ ...m, tokens: Number(m.tokens) || 0 }));
  const mixTotal = mix.reduce((n, m) => n + m.tokens, 0);
  const maxTool = Math.max(1, ...(p?.tools ?? []).map((t) => t.uses));

  return (
    <section className={className} aria-labelledby="profile-h">
      <div className="panel-head">
        <div>
          <h4 id="profile-h">Working style</h4>
          <p className="panel-sub">{hoursLine ? `Active ${hoursLine}.` : 'Typical session over the selected range.'}</p>
        </div>
      </div>

      {err && !p ? (
        <div className="empty compact">
          <p className="muted">Couldn’t load the profile: {err}</p>
          <button type="button" className="chip" onClick={refetch}>
            Retry
          </button>
        </div>
      ) : !p ? (
        <div className="skel skel-heat" />
      ) : p.sessions === 0 ? (
        <p className="muted">No sessions in this range.</p>
      ) : (
        <div className="profile">
          <dl className="profile-stats">
            <div>
              <dt>Typical session</dt>
              <dd>{fmtDuration(p.medianDurationMs ?? undefined) || '—'}</dd>
            </div>
            <div>
              <dt>Prompts / session</dt>
              <dd>{fmt1(p.medianPrompts)}</dd>
            </div>
            <div title={`${p.autoSessions} of ${p.sessions} sessions used auto mode`}>
              <dt>Auto mode</dt>
              <dd>{pct(p.autoShare)}</dd>
            </div>
            <div title={`${p.interrupts} interrupts across ${p.sessions} sessions`}>
              <dt>Interrupts / session</dt>
              <dd>{p.interruptsPerSession == null ? '—' : p.interruptsPerSession.toFixed(1)}</dd>
            </div>
            <div
              title={
                p.lines.sessions
                  ? `Claude Code's own count, from ${p.lines.sessions} of ${p.sessions} sessions (plugin 0.7+)`
                  : 'Reported by Claude Code from plugin 0.7 — no re-synced sessions in this range yet'
              }
            >
              <dt>Lines ±</dt>
              <dd>
                {p.lines.sessions ? (
                  <>
                    <span className="lines-add">+{fmtTokens(p.lines.added)}</span>{' '}
                    <span className="lines-del">−{fmtTokens(p.lines.removed)}</span>
                  </>
                ) : (
                  '—'
                )}
              </dd>
              <span className="profile-cov">
                {p.lines.sessions}/{p.sessions} sessions
              </span>
            </div>
          </dl>

          {mix.length > 0 && (
            <div className="profile-block">
              <h5 className="eff-title">Model mix</h5>
              <div
                className="mixbar"
                role="img"
                aria-label={`Share of tokens: ${mix.map((m) => `${m.model} ${Math.round((m.tokens / (mixTotal || 1)) * 100)}%`).join(', ')}`}
              >
                {mix.map((m) => (
                  <span
                    key={m.model}
                    style={{ flexGrow: m.tokens, background: m.color }}
                    title={`${m.model}: ${Math.round((m.tokens / (mixTotal || 1)) * 100)}% of tokens`}
                  />
                ))}
              </div>
              <ul className="mix-legend">
                {mix.map((m) => (
                  <li key={m.model}>
                    <span className="model-dot" style={{ background: m.color }} aria-hidden />
                    <span className="mix-name">{m.model}</span>
                    <span className="mix-val">{Math.round((m.tokens / (mixTotal || 1)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.tools.length > 0 && (
            <div className="profile-block">
              <h5 className="eff-title">Top tools</h5>
              <ul className="barlist">
                {p.tools.slice(0, 6).map((t) => (
                  <li key={t.tool}>
                    <span className="bar-label tool">{t.tool}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(t.uses / maxTool) * 100}%` }} />
                    </span>
                    <span className="bar-count">{fmtTokens(t.uses)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.skills.length > 0 && (
            <div className="profile-block">
              <h5 className="eff-title">Top skills</h5>
              <div className="card-skills">
                {p.skills.slice(0, 6).map((s) => (
                  <span key={s.skill} className="pill skill" title={`${s.uses} sessions`}>
                    /{s.skill} <span className="tag-count">{s.uses}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
