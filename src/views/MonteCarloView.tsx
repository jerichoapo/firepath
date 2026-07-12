// Monte Carlo: success gauge, percentile fan chart, and final-outcome distribution.

import { useMemo } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts';
import { MC_MAX_RUNS, MC_MIN_RUNS, quantileOfSorted, type McResult } from '../engine/montecarlo';
import { portfolioStats } from '../engine/returns';
import { fmtCompact, fmtPct, fmtUSD } from '../lib/format';
import { axisProps, gridProps, moneyAxis } from '../components/charts/chartTheme';
import { Card, Empty, NumField, Segmented } from '../components/ui';
import { usePlanStore } from '../store/PlanContext';
import { useAltMc, useSim } from '../store/SimContext';

function FanTip({ active, label, payload }: TooltipProps<number, string>) {
  const row = payload?.[0]?.payload as { p50: number; outer: [number, number]; inner: [number, number] } | undefined;
  if (!active || !row) return null;
  const rows: [string, number][] = [
    ['90th percentile', row.outer[1]],
    ['75th percentile', row.inner[1]],
    ['Median', row.p50],
    ['25th percentile', row.inner[0]],
    ['10th percentile', row.outer[0]],
  ];
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">Age {String(label)}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-[var(--c-ink-2)]">
          <span>{k}</span>
          <span className="font-medium tabular-nums text-[var(--c-ink)]">{fmtUSD(v)}</span>
        </p>
      ))}
    </div>
  );
}

function FanChart({ mc, retireAge }: { mc: McResult; retireAge: number }) {
  const data = mc.ages.map((age, i) => ({
    age,
    outer: [mc.bands[10][i], mc.bands[90][i]] as [number, number],
    inner: [mc.bands[25][i], mc.bands[75][i]] as [number, number],
    p50: mc.bands[50][i],
  }));
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="age" {...axisProps} tickMargin={6} />
        <YAxis {...moneyAxis} />
        <Tooltip content={<FanTip />} />
        <Area dataKey="outer" name="10–90%" stroke="none" fill="var(--c-fan-outer)" fillOpacity={0.5} isAnimationActive={false} />
        <Area dataKey="inner" name="25–75%" stroke="none" fill="var(--c-fan-inner)" fillOpacity={0.55} isAnimationActive={false} />
        <Line dataKey="p50" name="Median" stroke="var(--c-median)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <ReferenceLine x={retireAge} stroke="var(--c-muted)" strokeDasharray="2 4"
          label={{ value: `Retire ${retireAge}`, position: 'insideTopLeft', fill: 'var(--c-muted)', fontSize: 11 }} />
        <ReferenceLine y={0} stroke="var(--c-axis)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function OutcomeHistogram({ finals }: { finals: number[] }) {
  const data = useMemo(() => {
    const sorted = [...finals].sort((a, b) => a - b);
    const lo = Math.min(0, sorted[0]);
    const hi = Math.max(1, quantileOfSorted(sorted, 0.95));
    const BINS = 28;
    const width = (hi - lo) / BINS;
    const bins = Array.from({ length: BINS + 1 }, (_, i) => ({
      x: lo + i * width,
      label: i === BINS ? `≥ ${fmtCompact(hi)}` : fmtCompact(lo + i * width),
      count: 0,
    }));
    for (const v of sorted) bins[Math.min(BINS, Math.floor((v - lo) / width))].count++;
    return bins;
  }, [finals]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={1}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} interval={Math.floor(data.length / 6)} tickMargin={6} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--c-grid)', fillOpacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
                <p className="font-semibold">{(payload[0].payload as { label: string }).label}</p>
                <p className="text-[var(--c-ink-2)]">{payload[0].value} runs end here</p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="count" name="Runs" fill="var(--c-fan-inner)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonteCarloView() {
  const { plan, update } = usePlanStore();
  const { mc, mcProgress, incomplete, backtest } = useSim();
  const alt = useAltMc();

  if (incomplete) {
    return (
      <Card title="Monte Carlo">
        <Empty>Finish your plan first — add annual spending on the Plan tab, and simulations run automatically.</Empty>
      </Card>
    );
  }

  const { expReturn, returnSd, stockAllocation } = plan.assumptions;
  const hist = portfolioStats(stockAllocation);
  const alloc = `${Math.round(stockAllocation * 100)}/${Math.round((1 - stockAllocation) * 100)}`;
  const methods: { name: string; active: boolean; source: string; result: { successRate: number } | null }[] = [
    {
      name: 'Monte Carlo — normal',
      active: plan.mc.mode === 'normal',
      source: `Your assumptions: μ ${(expReturn * 100).toFixed(1)}% real · σ ${(returnSd * 100).toFixed(1)}%, drawn independently each year`,
      result: plan.mc.mode === 'normal' ? mc : alt.result,
    },
    {
      name: 'Monte Carlo — bootstrap',
      active: plan.mc.mode === 'bootstrap',
      source: `5-year blocks of the 1871–2024 record at ${alloc} stock/bond (${(hist.mean * 100).toFixed(1)}% real · σ ${(hist.sd * 100).toFixed(1)}%)`,
      result: plan.mc.mode === 'bootstrap' ? mc : alt.result,
    },
    {
      name: 'Historical backtest',
      active: false,
      source: `The same ${alloc} record replayed in sequence from every possible start year`,
      result: backtest,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card title="Simulation settings" subtitle="Runs in a Web Worker — the UI never blocks">
          <div className="grid gap-3">
            <NumField
              label="Trials"
              value={plan.mc.runs}
              onChange={(v) => update((p) => ({ ...p, mc: { ...p.mc, runs: Math.round(v) } }))}
              min={MC_MIN_RUNS}
              max={MC_MAX_RUNS}
              slider={[MC_MIN_RUNS, MC_MAX_RUNS, 500]}
            />
            <Segmented
              label="Return model"
              value={plan.mc.mode}
              onChange={(mode) => update((p) => ({ ...p, mc: { ...p.mc, mode } }))}
              options={[
                { value: 'normal', label: 'Normal (μ, σ)' },
                { value: 'bootstrap', label: 'Block bootstrap' },
              ]}
            />
            <p className="text-xs leading-relaxed text-[var(--c-muted)]">
              {plan.mc.mode === 'normal'
                ? `Independent draws from N(${(plan.assumptions.expReturn * 100).toFixed(1)}%, ${(plan.assumptions.returnSd * 100).toFixed(1)}%) each year.`
                : `Stitches random 5-year blocks of real ${Math.round(plan.assumptions.stockAllocation * 100)}/${Math.round((1 - plan.assumptions.stockAllocation) * 100)} stock/bond history (1871–2024), preserving momentum and multi-year streaks.`}
            </p>
          </div>
        </Card>

        <Card title="Chance of success" subtitle="Share of trials that fund every year of spending through end of plan">
          {mc ? (
            <div className="flex items-center gap-6">
              <p
                className="text-6xl font-bold tabular-nums"
                style={{ color: mc.successRate >= 0.8 ? 'var(--c-good)' : mc.successRate < 0.6 ? 'var(--c-bad)' : 'var(--c-ink)' }}
              >
                {fmtPct(mc.successRate)}
              </p>
              <div className="text-xs leading-relaxed text-[var(--c-ink-2)]">
                <p>{mc.runs.toLocaleString()} trials · {plan.mc.mode === 'normal' ? 'normal returns' : 'block bootstrap'}</p>
                <p>{Math.round(mc.successRate * mc.runs).toLocaleString()} succeeded · {Math.round((1 - mc.successRate) * mc.runs).toLocaleString()} ran out of money</p>
                <p>Median ending net worth: <b className="text-[var(--c-ink)]">{fmtCompact(mc.medianFinal)}</b></p>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-[var(--c-muted)]">Simulating… {Math.round(mcProgress * 100)}%</p>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--c-grid)]">
                <div className="h-full rounded-full bg-[var(--c-accent)] transition-all" style={{ width: `${mcProgress * 100}%` }} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="About these numbers"
        subtitle="Same plan, three ways to model returns — a gap between them is your margin of safety, not a bug"
      >
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
              <th className="py-2 pr-3 font-medium">Method</th>
              <th className="pr-3 font-medium">Returns come from</th>
              <th className="text-right font-medium">Success</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.name} className={`border-b border-[var(--c-grid)]/60 ${m.active ? 'bg-[var(--c-accent)]/5' : ''}`}>
                <td className="py-1.5 pr-3 font-medium">
                  {m.name}
                  {m.active && <span className="ml-1.5 rounded bg-[var(--c-accent)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--c-accent)]">in header</span>}
                </td>
                <td className="pr-3 text-[var(--c-ink-2)]">{m.source}</td>
                <td className="text-right font-semibold tabular-nums">{m.result ? fmtPct(m.result.successRate) : '…'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-[var(--c-muted)]">
          Normal mode prices <i>your</i> assumptions; the two historical modes replay the record.
          When your μ is more conservative than history's, normal-mode success will sit below the other two.
        </p>
      </Card>

      {mc && (
        <>
          <Card title="Net worth percentile bands" subtitle="10–90% (outer), 25–75% (inner), median line — today's dollars">
            <FanChart mc={mc} retireAge={plan.profile.retireAge} />
          </Card>
          <Card title="Distribution of ending net worth" subtitle="Where each trial lands at end of plan (top 5% grouped into the last bin)">
            <OutcomeHistogram finals={mc.finalNetWorths} />
          </Card>
        </>
      )}
    </div>
  );
}
