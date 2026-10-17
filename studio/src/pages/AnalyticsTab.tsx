import { useEffect, useState } from "react";
import type { Process, Project } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, EmptyState, Skeleton, toast } from "../components/ui";
import { api, type Analytics } from "../lib/api";
import { cx } from "../lib/util";

const n = (o: Record<string, number> | undefined, ...keys: string[]) => keys.reduce((s, k) => s + (o?.[k] ?? 0), 0);

export function AnalyticsTab({ project, processes }: { project: Project; processes: Process[] }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    setErr(null);
    api.analytics(project.id).then(setData, (e: Error) => {
      setErr(e.message);
      toast.error("Could not load analytics", e);
    });
  };
  useEffect(load, [project.id]);

  if (err && !data)
    return (
      <div className="card">
        <EmptyState icon="alert" title="Analytics unavailable" actions={<Button onClick={load}>Retry</Button>}>
          {err}
        </EmptyState>
      </div>
    );
  if (!data)
    return (
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card kpi">
            <Skeleton w="50%" h={12} />
            <Skeleton w="35%" h={28} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
    );

  const t = data.totals;
  const completions = n(t, "show_complete", "try_complete", "test_complete");
  const scores = Object.values(data.avgScore);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const kpis = [
    { label: "Views", value: n(t, "view"), icon: "eye", tone: "brand" },
    { label: "Completions", value: completions, icon: "checkSquare", tone: "teal", sub: `${n(t, "show_complete")} show · ${n(t, "try_complete")} try · ${n(t, "test_complete")} test` },
    { label: "Avg. test score", value: avgScore === null ? "–" : `${avgScore}%`, icon: "target", tone: "violet" },
    { label: "Assist sessions", value: n(t, "assist_start"), icon: "compass", tone: "amber", sub: `${n(t, "assist_complete")} completed` },
    { label: "Searches & questions", value: n(t, "search", "ask"), icon: "search", tone: "brand" },
    { label: "Downloads", value: n(t, "download"), icon: "download", tone: "teal" },
  ];

  // last 14 days
  const days: { key: string; label: string; v: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), v: data.daily[key] ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.v));
  const rows = processes
    .map((p) => {
      const b = data.byProcess[p.id] ?? {};
      return { p, views: n(b, "view"), show: n(b, "show_complete"), tr: n(b, "try_complete"), test: n(b, "test_complete"), assist: n(b, "assist_start"), downloads: n(b, "download"), score: data.avgScore[p.id] };
    })
    .sort((a, b) => b.views - a.views);
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  const maxQ = Math.max(1, ...data.topQueries.map((q) => q[1]));

  return (
    <div className="analytics">
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi" data-testid="kpi">
            <div className="kpi-head">
              <span className={cx("kpi-icon", `tone-${k.tone}`)}>
                <Icon name={k.icon} size={15} />
              </span>
              {k.label}
            </div>
            <div className="kpi-value">{k.value}</div>
            {k.sub && <div className="kpi-sub">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <section className="card chart-card">
          <div className="card-head">
            <h3>Activity</h3>
            <span className="muted small">Events per day · last 14 days</span>
          </div>
          {data.eventCount === 0 ? (
            <EmptyState compact icon="chart" title="No activity yet">
              Publish the portal and share it with learners. Views, completions, searches and Assist sessions appear here.
            </EmptyState>
          ) : (
            <div className="bar-chart" role="img" aria-label="Events per day">
              {days.map((d) => (
                <div key={d.key} className="bar-col" title={`${d.label}: ${d.v} events`}>
                  <div className="bar-value">{d.v || ""}</div>
                  <div className="bar-track">
                    <div className="bar" style={{ height: `${(d.v / maxDay) * 100}%` }} />
                  </div>
                  <div className="bar-label">{d.label.replace(/\s/, " ")}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Top searches</h3>
            <span className="muted small">Portal search and AI questions</span>
          </div>
          {data.topQueries.length === 0 ? (
            <EmptyState compact icon="search" title="No searches yet" />
          ) : (
            <ol className="query-list">
              {data.topQueries.map(([q, c]) => (
                <li key={q}>
                  <span className="query-text">{q}</span>
                  <span className="query-bar">
                    <span style={{ width: `${(c / maxQ) * 100}%` }} />
                  </span>
                  <span className="query-count mono">{c}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card table-card">
        <div className="card-head">
          <h3>By process</h3>
          <span className="muted small">{data.eventCount} events in total</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Process</th>
                <th className="num">Views</th>
                <th className="num">Show Me</th>
                <th className="num">Try Me</th>
                <th className="num">Test Me</th>
                <th>Avg. score</th>
                <th className="num">Assist</th>
                <th className="num">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted center">
                    No processes yet
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td>
                    <div className="table-proc">
                      <span>{r.p.title}</span>
                      <span className="view-bar">
                        <span style={{ width: `${(r.views / maxViews) * 100}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="num">{r.views}</td>
                  <td className="num">{r.show}</td>
                  <td className="num">{r.tr}</td>
                  <td className="num">{r.test}</td>
                  <td>
                    {r.score === undefined ? (
                      <span className="muted">–</span>
                    ) : (
                      <span className="score">
                        <span className="score-bar">
                          <span className={cx(r.score >= (r.p.passMark ?? 80) ? "is-pass" : "is-fail")} style={{ width: `${r.score}%` }} />
                        </span>
                        <span className="mono">{r.score}%</span>
                      </span>
                    )}
                  </td>
                  <td className="num">{r.assist}</td>
                  <td className="num">{r.downloads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
