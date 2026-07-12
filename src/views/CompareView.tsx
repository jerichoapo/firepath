// Scenario manager + side-by-side comparison: metrics table and overlaid MC medians.

import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { coastFireAge, fiAge, fiNumber } from '../engine/metrics';
import { project } from '../engine/projection';
import { fixedReturns } from '../engine/returns';
import { blankPlan, makeScenario } from '../engine/seed';
import { fmtCompact, fmtPct } from '../lib/format';
import { ChartTip, axisProps, gridProps, moneyAxis } from '../components/charts/chartTheme';
import { Btn, Card, Empty } from '../components/ui';
import { usePlanStore } from '../store/PlanContext';
import { useScenarioMcs } from '../store/SimContext';

/** Fixed categorical order for scenario lines (validated palette slots). */
const SCENARIO_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834', '#008300'];
export const scenarioColor = (i: number) => SCENARIO_COLORS[i % SCENARIO_COLORS.length];

const CHECK_AGES = [45, 50, 65];

export function CompareView() {
  const store = usePlanStore();
  const mcs = useScenarioMcs(store.scenarios);
  const [renaming, setRenaming] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      store.scenarios.map((s) => {
        const proj = project(s.plan, fixedReturns(s.plan.assumptions.expReturn));
        const atAge = (age: number) => proj.rows.find((r) => r.age === age)?.netWorth ?? null;
        return {
          scenario: s,
          fiN: fiNumber(s.plan),
          fiAgeVal: fiAge(s.plan, proj),
          coastAgeVal: coastFireAge(s.plan, proj),
          checks: CHECK_AGES.map(atAge),
          final: proj.finalNetWorth,
          failedAt: proj.failedAtAge,
        };
      }),
    [store.scenarios],
  );

  const overlay = useMemo(() => {
    const byAge = new Map<number, Record<string, number>>();
    for (const s of store.scenarios) {
      const mc = mcs[s.id];
      if (!mc) continue;
      mc.ages.forEach((age, i) => {
        const row = byAge.get(age) ?? {};
        row[s.id] = mc.bands[50][i];
        byAge.set(age, row);
      });
    }
    return [...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([age, vals]) => ({ age, ...vals }));
  }, [store.scenarios, mcs]);

  const waiting = store.scenarios.filter((s) => !mcs[s.id]).length;

  return (
    <div className="grid gap-4">
      <Card
        title="Scenarios"
        subtitle="Each scenario is a full, independently editable copy of the plan"
        right={
          <Btn variant="primary" onClick={() => store.dispatch({ type: 'add', scenario: makeScenario(`Scenario ${store.scenarios.length + 1}`, blankPlan(new Date().getFullYear())) })}>
            + New blank
          </Btn>
        }
      >
        <div className="flex flex-wrap gap-2">
          {store.scenarios.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
                s.id === store.active.id ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/10' : 'border-[var(--c-border)]'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: scenarioColor(i) }} />
              {renaming === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.name}
                  className="w-28 bg-transparent font-medium outline-none"
                  onBlur={(e) => { store.dispatch({ type: 'rename', id: s.id, name: e.target.value || s.name }); setRenaming(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <button type="button" className="font-medium" title="Switch to this scenario" onClick={() => store.dispatch({ type: 'select', id: s.id })}>
                  {s.name}
                </button>
              )}
              <button type="button" className="text-[var(--c-muted)] hover:text-[var(--c-ink)]" title="Rename" onClick={() => setRenaming(s.id)}>✎</button>
              <button type="button" className="text-[var(--c-muted)] hover:text-[var(--c-ink)]" title="Duplicate — then edit the copy" onClick={() => store.dispatch({ type: 'duplicate', id: s.id })}>⧉</button>
              <button
                type="button"
                className="text-[var(--c-muted)] hover:text-[var(--c-bad)]"
                title="Delete"
                onClick={() => confirm(`Delete scenario "${s.name}"?`) && store.dispatch({ type: 'delete', id: s.id })}
              >✕</button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--c-muted)]">
          Tip: duplicate your base plan, then change one thing — a career break, a bigger house, retiring five years earlier — and compare.
        </p>
      </Card>

      <Card title="Side by side" subtitle="Deterministic FI metrics + Monte Carlo success per scenario">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-xs tabular-nums">
            <thead>
              <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
                <th className="py-2 text-left font-medium">Scenario</th>
                <th className="font-medium">FI number</th>
                <th className="font-medium">FI age</th>
                <th className="font-medium">Coast age</th>
                <th className="font-medium">Success</th>
                {CHECK_AGES.map((a) => <th key={a} className="font-medium">NW @ {a}</th>)}
                <th className="font-medium">End of plan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ scenario: s, ...r }, i) => (
                <tr key={s.id} className={`border-b border-[var(--c-grid)]/60 ${s.id === store.active.id ? 'bg-[var(--c-accent)]/5' : ''}`}>
                  <td className="py-2 text-left font-medium">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: scenarioColor(i) }} />
                    {s.name}
                  </td>
                  <td>{fmtCompact(r.fiN)}</td>
                  <td>{r.fiAgeVal ?? '—'}</td>
                  <td>{r.coastAgeVal ?? '—'}</td>
                  <td className="font-semibold" style={{ color: mcs[s.id] ? (mcs[s.id]!.successRate >= 0.8 ? 'var(--c-good)' : mcs[s.id]!.successRate < 0.6 ? 'var(--c-bad)' : undefined) : undefined }}>
                    {mcs[s.id] ? fmtPct(mcs[s.id]!.successRate) : '…'}
                  </td>
                  {r.checks.map((v, j) => <td key={j}>{v != null ? fmtCompact(v) : '—'}</td>)}
                  <td className={r.failedAt != null ? 'font-medium text-[var(--c-bad)]' : ''}>
                    {r.failedAt != null ? `broke @ ${r.failedAt}` : fmtCompact(r.final)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Median projections, overlaid"
        subtitle={waiting > 0 ? `Monte Carlo medians — computing ${waiting} scenario${waiting > 1 ? 's' : ''}…` : 'Monte Carlo median net worth per scenario (today\'s dollars)'}
      >
        {overlay.length === 0 ? (
          <Empty>Running simulations…</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={overlay} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="age" {...axisProps} tickMargin={6} />
              <YAxis {...moneyAxis} />
              <Tooltip content={<ChartTip titleFmt={(age) => `Age ${age}`} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {store.scenarios.map((s, i) => (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  stroke={scenarioColor(i)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
