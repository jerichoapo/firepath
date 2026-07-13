// Monte Carlo: success gauge, percentile fan chart, and final-outcome distribution.

import { useMemo, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from 'recharts';
import { DEFAULT_SEED, MC_MAX_RUNS, MC_MIN_RUNS, quantileOfSorted, type McResult } from '../engine/montecarlo';
import { portfolioStats } from '../engine/returns';
import { fmtCompact, fmtPct, fmtUSD } from '../lib/format';
import { axisProps, gridProps, moneyAxis } from '../components/charts/chartTheme';
import { Btn, Card, Empty, NumField, Segmented } from '../components/ui';
import { usePlanStore } from '../store/PlanContext';
import { useAltMc, useSim } from '../store/SimContext';

type ViewMode = 'chart' | 'table';
const VIEW_OPTIONS = [{ value: 'chart' as const, label: 'Chart' }, { value: 'table' as const, label: 'Table' }];

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

interface Bin { x: number; label: string; range: string; count: number }

/** Shared by the histogram chart, its tooltip, and the table view (F21/F29). */
function buildBins(finals: number[]): Bin[] {
  const sorted = [...finals].sort((a, b) => a - b);
  const lo = Math.min(0, sorted[0]);
  const hi = Math.max(1, quantileOfSorted(sorted, 0.95));
  const BINS = 28;
  const width = (hi - lo) / BINS;
  const bins = Array.from({ length: BINS + 1 }, (_, i) => {
    const x = lo + i * width;
    const last = i === BINS;
    return {
      x,
      label: last ? `≥ ${fmtCompact(hi)}` : fmtCompact(x),
      range: last ? `≥ ${fmtCompact(hi)}` : `${fmtCompact(x)} – ${fmtCompact(x + width)}`,
      count: 0,
    };
  });
  for (const v of sorted) bins[Math.min(BINS, Math.floor((v - lo) / width))].count++;
  return bins;
}

function OutcomeHistogram({ bins }: { bins: Bin[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={1}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} interval={Math.floor(bins.length / 6)} tickMargin={6} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--c-grid)', fillOpacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
                <p className="font-semibold">{(payload[0].payload as Bin).range}</p>
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

const tableHead = 'border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]';

function FanTable({ mc }: { mc: McResult }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full text-right text-xs tabular-nums">
        <thead className="sticky top-0 bg-[var(--c-surface)]">
          <tr className={tableHead}>
            <th className="py-2 text-left font-medium">Age</th>
            <th className="font-medium">10th pct</th>
            <th className="font-medium">25th pct</th>
            <th className="font-medium">Median</th>
            <th className="font-medium">75th pct</th>
            <th className="font-medium">90th pct</th>
          </tr>
        </thead>
        <tbody>
          {mc.ages.map((age, i) => (
            <tr key={age} className="border-b border-[var(--c-grid)]/60">
              <td className="py-1 text-left font-medium">{age}</td>
              {([10, 25, 50, 75, 90] as const).map((p) => (
                <td key={p} className={p === 50 ? 'font-semibold' : ''}>{fmtCompact(mc.bands[p][i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistogramTable({ bins }: { bins: Bin[] }) {
  return (
    <div className="max-h-[220px] overflow-auto">
      <table className="w-full text-right text-xs tabular-nums">
        <thead className="sticky top-0 bg-[var(--c-surface)]">
          <tr className={tableHead}>
            <th className="py-2 text-left font-medium">Ending net worth</th>
            <th className="font-medium">Runs</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => (
            <tr key={b.label} className="border-b border-[var(--c-grid)]/60">
              <td className="py-1 text-left">{b.range}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "If it fails, when" — failure counts by age, aligned under the fan chart (F26). */
function FailureStrip({ mc }: { mc: McResult }) {
  const total = mc.failuresByAge.reduce((s, x) => s + x, 0);
  if (total === 0) return null;
  const peakAge = mc.ages[mc.failuresByAge.indexOf(Math.max(...mc.failuresByAge))];
  const data = mc.ages.map((age, i) => ({ age, fails: mc.failuresByAge[i] }));
  return (
    <div className="mt-2 border-t border-[var(--c-grid)]/60 pt-2">
      <ResponsiveContainer width="100%" height={56}>
        <BarChart data={data} margin={{ top: 2, right: 12, bottom: 0, left: 0 }} barCategoryGap={0.5}>
          <XAxis dataKey="age" hide />
          <YAxis width={52} tick={false} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--c-grid)', fillOpacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold">Age {(payload[0].payload as { age: number }).age}</p>
                  <p className="text-[var(--c-ink-2)]">{payload[0].value} runs run out of money here</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="fails" name="Runs failing" fill="var(--c-bad)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-[var(--c-muted)]">
        ▼ If it fails, when: <b className="text-[var(--c-bad)]">{fmtPct(total / mc.runs)}</b> of runs run out
        of money; peak failure age <b className="text-[var(--c-ink)]">{peakAge}</b>.
      </p>
    </div>
  );
}

export function MonteCarloView() {
  const { plan, update } = usePlanStore();
  const { mc, mcProgress, mcComputing, incomplete, backtest, seed, rerollSeed } = useSim();
  const alt = useAltMc();
  const [fanMode, setFanMode] = useState<ViewMode>('chart');
  const [histMode, setHistMode] = useState<ViewMode>('chart');
  const bins = useMemo(() => (mc ? buildBins(mc.finalNetWorths) : []), [mc]);
  // Stale results stay on screen at reduced opacity while the worker recomputes (F12/F14).
  const dim = `transition-opacity ${mcComputing ? 'opacity-50' : ''}`;

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
              // Clamped here, not just on blur: a mid-edit value must never send the
              // worker a multi-million-trial job.
              onChange={(v) => update((p) => ({ ...p, mc: { ...p.mc, runs: Math.min(MC_MAX_RUNS, Math.max(MC_MIN_RUNS, Math.round(v))) } }))}
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
            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={rerollSeed} title="Same odds, new luck — draw a fresh set of random paths">🎲 New draw</Btn>
              {seed !== DEFAULT_SEED && (
                <span className="text-[11px] text-[var(--c-muted)]">
                  draw #{seed - DEFAULT_SEED + 1} · session-only; reload restores the fixed draw
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card title="Chance of success" subtitle="Share of trials that fund every year of spending through end of plan">
          {mc ? (
            <>
              <div className={`flex items-center gap-6 ${dim}`}>
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
              {/* Thin recompute bar; the slot is always reserved so nothing jumps. */}
              <div className={`mt-3 h-1 overflow-hidden rounded-full bg-[var(--c-grid)] transition-opacity ${mcComputing ? '' : 'opacity-0'}`}>
                <div className="h-full rounded-full bg-[var(--c-accent)] transition-all" style={{ width: `${mcProgress * 100}%` }} />
              </div>
            </>
          ) : (
            <div>
              <p className="mb-2 text-sm text-[var(--c-muted)]">Computing… {Math.round(mcProgress * 100)}%</p>
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

      {/* These cards never unmount once the view is open — a recompute dims them instead
          of collapsing the layout (F14). */}
      <Card
        title="Net worth percentile bands"
        subtitle="10–90% (outer), 25–75% (inner), median line — today's dollars"
        right={<Segmented value={fanMode} onChange={setFanMode} options={VIEW_OPTIONS} />}
      >
        {mc ? (
          <div className={dim}>
            {fanMode === 'chart' ? <FanChart mc={mc} retireAge={plan.profile.retireAge} /> : <FanTable mc={mc} />}
            <FailureStrip mc={mc} />
          </div>
        ) : (
          <div className="flex h-[360px] items-center justify-center text-sm text-[var(--c-muted)]">Computing distributions…</div>
        )}
      </Card>
      <Card
        title="Distribution of ending net worth"
        subtitle="Where each trial lands at end of plan (top 5% grouped into the last bin; bars labeled by bin start)"
        right={<Segmented value={histMode} onChange={setHistMode} options={VIEW_OPTIONS} />}
      >
        {mc ? (
          <div className={dim}>
            {histMode === 'chart' ? <OutcomeHistogram bins={bins} /> : <HistogramTable bins={bins} />}
          </div>
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-[var(--c-muted)]">Computing distributions…</div>
        )}
      </Card>
    </div>
  );
}
