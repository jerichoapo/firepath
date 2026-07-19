// Scenario manager + side-by-side comparison: metrics table and overlaid MC medians.

import { useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { coastFireAge, fiAge, fiNumber } from '../engine/metrics';
import { project } from '../engine/projection';
import { fixedReturns } from '../engine/returns';
import { isIncomplete, planIssues } from '../engine/validate';
import { blankPlan, makeScenario } from '../engine/seed';
import type { PlanInput } from '../engine/types';
import { fmtCompact, fmtPct } from '../lib/format';
import { ChartTip, axisProps, gridProps, moneyAxis } from '../components/charts/chartTheme';
import { Btn, Card, Confirm, Empty, useToast } from '../components/ui';
import { useNav } from '../store/NavContext';
import { usePlanStore } from '../store/PlanContext';
import { useScenarioMcs } from '../store/SimContext';

const CHECK_AGES = [45, 50, 65];

/** Duplicate-with-a-tweak presets: the classic "what if I'm wrong about…" checks (F25). */
const STRESS_PRESETS: { label: string; suffix: string; tweak: (p: PlanInput) => PlanInput }[] = [
  {
    label: 'SS −25%',
    suffix: 'SS −25%',
    tweak: (p) => ({
      ...p,
      socialSecurity: {
        ...p.socialSecurity,
        annual: Math.round(p.socialSecurity.annual * 0.75),
        partner: p.socialSecurity.partner
          ? { ...p.socialSecurity.partner, annual: Math.round(p.socialSecurity.partner.annual * 0.75) }
          : undefined,
      },
    }),
  },
  {
    label: 'Returns −1%',
    suffix: 'returns −1%',
    tweak: (p) => ({
      ...p,
      assumptions: { ...p.assumptions, expReturn: p.assumptions.expReturn - 0.01 },
    }),
  },
  {
    label: 'Spending +10%',
    suffix: 'spending +10%',
    tweak: (p) => ({
      ...p,
      expenses: {
        ...p.expenses,
        currentAnnual: Math.round(p.expenses.currentAnnual * 1.1),
        phases: p.expenses.phases.map((ph) => ({ ...ph, annual: Math.round(ph.annual * 1.1) })),
      },
    }),
  },
];

export function CompareView() {
  const store = usePlanStore();
  const mcs = useScenarioMcs(store.scenarios);
  const toast = useToast();
  const { setTab } = useNav();
  const [renaming, setRenaming] = useState<string | null>(null);

  // Announce the active-scenario switch that add/duplicate performs (F15).
  const announce = (name: string) =>
    toast({
      text: `Now editing "${name}" — change something, then come back to compare.`,
      action: { label: 'Edit plan →', run: () => setTab('plan') },
    });

  const rows = useMemo(
    () =>
      store.scenarios.map((s) => {
        const proj = project(s.plan, fixedReturns(s.plan.assumptions.expReturn));
        const atAge = (age: number) => proj.rows.find((r) => r.age === age)?.netWorth ?? null;
        return {
          scenario: s,
          incomplete: isIncomplete(planIssues(s.plan)),
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
    <div className="grid grid-cols-1 gap-4">
      <Card
        title="Scenarios"
        subtitle="Each scenario is a full, independently editable copy of the plan"
        right={
          <Btn
            variant="primary"
            onClick={() => {
              const name = `Scenario ${store.scenarios.length + 1}`;
              store.dispatch({ type: 'add', scenario: makeScenario(name, blankPlan(new Date().getFullYear())) });
              announce(name);
            }}
          >
            + New blank
          </Btn>
        }
      >
        <div className="flex flex-wrap gap-2">
          {store.scenarios.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
                s.id === store.active.id ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/10' : 'border-[var(--c-border)]'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {renaming === s.id ? (
                <input
                  autoFocus
                  value={s.name}
                  className="w-28 bg-transparent font-medium outline-none"
                  onChange={(e) => store.dispatch({ type: 'rename', id: s.id, name: e.target.value })}
                  onBlur={() => { if (!s.name.trim()) store.dispatch({ type: 'rename', id: s.id, name: 'Untitled' }); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenaming(null); }}
                />
              ) : (
                <button type="button" className="font-medium" title="Switch to this scenario" onClick={() => store.dispatch({ type: 'select', id: s.id })}>
                  {s.name}
                </button>
              )}
              {s.id === store.active.id && (
                <button
                  type="button"
                  className="whitespace-nowrap font-semibold text-[var(--c-accent)] hover:underline"
                  onClick={() => setTab('plan')}
                >
                  Edit plan →
                </button>
              )}
              <button type="button" aria-label={`Rename ${s.name}`} className="text-[var(--c-muted)] hover:text-[var(--c-ink)]" title="Rename" onClick={() => setRenaming(s.id)}>✎</button>
              <button
                type="button"
                aria-label={`Duplicate ${s.name}`}
                className="text-[var(--c-muted)] hover:text-[var(--c-ink)]"
                title="Duplicate — then edit the copy"
                onClick={() => { store.dispatch({ type: 'duplicate', id: s.id }); announce(`${s.name} (copy)`); }}
              >⧉</button>
              <Confirm
                title={`Delete "${s.name}"?`}
                confirmLabel="Delete"
                onConfirm={() => store.dispatch({ type: 'delete', id: s.id })}
              >
                {(open) => (
                  <button type="button" aria-label={`Delete ${s.name}`} className="text-[var(--c-muted)] hover:text-[var(--c-bad)]" title="Delete" onClick={open}>✕</button>
                )}
              </Confirm>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--c-border)] pt-3">
          <span className="mr-1 text-[11px] text-[var(--c-muted)]">Stress-test the active plan:</span>
          {STRESS_PRESETS.map((preset) => (
            <Btn
              key={preset.label}
              title={`Duplicate "${store.active.name}" with ${preset.suffix} applied`}
              onClick={() => {
                const name = `${store.active.name} — ${preset.suffix}`;
                store.dispatch({ type: 'add', scenario: makeScenario(name, preset.tweak(structuredClone(store.plan))) });
                announce(name);
              }}
            >
              {preset.label}
            </Btn>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--c-muted)]">
          Tip: duplicate your base plan, then change one thing — a career break, a bigger house, retiring five years earlier — and compare.
        </p>
      </Card>

      <Card title="Side by side" subtitle="Deterministic FI metrics + Monte Carlo success per scenario">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-[13px] tabular-nums sm:text-xs">
            <thead>
              <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
                <th className="sticky left-0 z-[2] bg-[var(--c-surface)] py-2 text-left font-medium">Scenario</th>
                <th className="font-medium">FI number</th>
                <th className="font-medium">FI age</th>
                <th className="font-medium">Coast age</th>
                <th className="font-medium">Success</th>
                {CHECK_AGES.map((a) => <th key={a} className="font-medium">NW @ {a}</th>)}
                <th className="font-medium">End of plan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ scenario: s, ...r }) => (
                <tr key={s.id} className={`border-b border-[var(--c-grid)]/60 ${s.id === store.active.id ? 'bg-[var(--c-accent)]/5' : ''}`}>
                  {/* Sticky like the projection table — scenario numbers need their name in view. */}
                  <td className="sticky left-0 z-[1] bg-[var(--c-surface)] py-2 text-left font-medium">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </td>
                  {/* An incomplete scenario (no spending) would report vacuous FI/success — dash it. */}
                  <td>{r.incomplete ? '—' : fmtCompact(r.fiN)}</td>
                  <td>{r.incomplete ? '—' : r.fiAgeVal ?? '—'}</td>
                  <td>{r.incomplete ? '—' : r.coastAgeVal ?? '—'}</td>
                  <td className="font-semibold" style={{ color: !r.incomplete && mcs[s.id] ? (mcs[s.id]!.successRate >= 0.8 ? 'var(--c-good)' : mcs[s.id]!.successRate < 0.6 ? 'var(--c-bad)' : undefined) : undefined }}>
                    {r.incomplete ? '—' : mcs[s.id] ? fmtPct(mcs[s.id]!.successRate) : '…'}
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
              {store.scenarios.map((s) => (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  stroke={s.color}
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
