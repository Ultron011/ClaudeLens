import { useParams } from 'react-router-dom';
import { getAnalytics, type Analytics } from '../api.js';
import { fmtCost, fmtDay, fmtDuration, fmtTokens } from '../format.js';
import { Shell } from '../components/Shell.js';
import { Stat } from '../components/Stat.js';
import { useFetch } from '../useFetch.js';
import { usePref } from '../usePref.js';
import { Chart } from '../charts/Chart.js';
import { foldModels, modelActiveMs, type ModelRow } from '../charts/palette.js';

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export function AnalyticsPage() {
  const { author } = useParams();
  const identity = author ? decodeURIComponent(author) : undefined;
  const [range, setRange] = usePref('range', '30d');
  const days = RANGE_DAYS[range] ?? 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const { data, err, loading } = useFetch<Analytics>(
    (signal) => getAnalytics(identity, from.toISOString(), to.toISOString(), signal),
    [identity, range],
  );

  const daily = data?.daily ?? [];
  const labels = daily.map((d) => fmtDay(d.day));
  const { rows, other } = foldModels(data?.models ?? []);
  const modelRows = other ? [...rows, other] : rows;

  return (
    <Shell
      crumbs={identity ? [{ label: identity, to: `/u/${encodeURIComponent(identity)}` }, { label: 'Analytics' }] : [{ label: 'Analytics' }]}
      tagline={identity ? undefined : 'usage across the whole team'}
    >
      <div className="content-head">
        <h1>{identity ? `${identity}'s analytics` : 'Analytics'}</h1>
        <p className="lede">Models, tokens, sessions and cost over time. All days are UTC.</p>
      </div>

      <div className="controls" role="group" aria-label="Date range">
        {Object.keys(RANGE_DAYS).map((r) => (
          <button key={r} type="button" className={r === range ? 'chip on' : 'chip'} onClick={() => setRange(r)}>
            {r}
          </button>
        ))}
      </div>

      {err ? (
        <div className="empty">
          <h3>Can&rsquo;t reach the server</h3>
          <p className="muted">{err}</p>
        </div>
      ) : loading && !data ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className="card-stats analytics-kpis">
            <Stat label="sessions" value={String(Number(data?.totals.sessions ?? 0))} accent />
            <Stat
              label="messages"
              value={Number(data?.totals.userMessages ?? 0).toLocaleString()}
              title={`${Number(data?.totals.turns ?? 0).toLocaleString()} Claude turns`}
            />
            <Stat label="tokens" value={fmtTokens(Number(data?.totals.tokens ?? 0))} />
            <Stat label="cost" value={fmtCost(data?.totals.cost ?? 0)} />
          </div>

          <section className="panel chart-panel">
            <h4>Tokens per day</h4>
            <Chart
              kind="line"
              labels={labels}
              series={[{ key: 'tokens', label: 'Tokens', color: 'var(--series-1)', values: daily.map((d) => Number(d.tokens)) }]}
              ariaLabel={`Tokens per day, ${labels.length} days`}
            />
          </section>

          <section className="panel chart-panel">
            <h4>Sessions per day</h4>
            <p className="muted">Counts a session on every UTC day it was active — a session spanning three days counts three times.</p>
            <Chart
              kind="bars"
              labels={labels}
              series={[{ key: 'sessions', label: 'Sessions', color: 'var(--series-1)', values: daily.map((d) => Number(d.sessions)) }]}
              ariaLabel={`Sessions per day, ${labels.length} days`}
            />
          </section>

          <section className="panel chart-panel">
            <h4>Messages per day</h4>
            <Chart
              kind="bars"
              labels={labels}
              series={[{ key: 'messages', label: 'Messages', color: 'var(--series-1)', values: daily.map((d) => Number(d.userMessages)) }]}
              ariaLabel={`Messages per day, ${labels.length} days`}
            />
          </section>

          <section className="panel chart-panel">
            <h4>Cost per day</h4>
            <Chart
              kind="bars"
              labels={labels}
              series={[{ key: 'cost', label: 'Cost', color: 'var(--series-1)', values: daily.map((d) => Number(d.cost ?? 0)) }]}
              ariaLabel={`Cost per day in dollars, ${labels.length} days`}
            />
          </section>

          <section className="panel">
            <h4>Models</h4>
            {modelRows.length === 0 ? (
              <p className="muted">No model usage in this range.</p>
            ) : (
              <div className="chart-table-wrap" tabIndex={0} role="region" aria-label="Models table">
                <table className="chart-table">
                  <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    Per-model breakdown for the selected range
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Model</th>
                      <th scope="col" className="num">Sessions</th>
                      <th scope="col" className="num">Turns</th>
                      <th scope="col" className="num">Active time</th>
                      <th scope="col" className="num">Tokens</th>
                      <th scope="col" className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map((m) => (
                      <ModelTableRow key={m.model} m={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}

function ModelTableRow({ m }: { m: ModelRow }) {
  return (
    <tr>
      <td>
        <span className="model-dot" style={{ background: m.color }} aria-hidden />
        {m.model}
      </td>
      <td className="num">{m.sessions}</td>
      <td className="num">{m.turns}</td>
      <td className="num" title={m.measured ? 'active time' : 'estimated from response latency'}>
        {fmtDuration(modelActiveMs(m)) || '—'}
      </td>
      <td className="num">{fmtTokens(Number(m.tokens))}</td>
      <td className="num">{fmtCost(m.cost)}</td>
    </tr>
  );
}
