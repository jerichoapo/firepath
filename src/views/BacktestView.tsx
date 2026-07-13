// Historical backtest: the plan replayed from every viable start year since 1871.

import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { BacktestStart } from '../engine/backtest';
import { fmtCompact, fmtPct, fmtUSD } from '../lib/format';
import { axisProps, gridProps, moneyAxis } from '../components/charts/chartTheme';
import { Card, Empty, Segmented } from '../components/ui';
import { useSim } from '../store/SimContext';

/** Every start year as a row — the worst-10 table, generalized (F29). */
function StartsTable({ starts }: { starts: BacktestStart[] }) {
  return (
    <div className="max-h-[300px] overflow-auto">
      <table className="w-full text-right text-xs tabular-nums">
        <thead className="sticky top-0 bg-[var(--c-surface)]">
          <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
            <th className="py-2 text-left font-medium">Start year</th>
            <th className="font-medium">Outcome</th>
            <th className="font-medium">Ending net worth</th>
            <th className="font-medium">Lowest point</th>
          </tr>
        </thead>
        <tbody>
          {starts.map((s) => (
            <tr key={s.startYear} className="border-b border-[var(--c-grid)]/60">
              <td className="py-1 text-left font-medium">{s.startYear}</td>
              <td className={s.failedAtAge !== null ? 'font-medium text-[var(--c-bad)]' : 'text-[var(--c-good)]'}>
                {s.failedAtAge !== null ? `Fails at age ${s.failedAtAge}` : 'Survives'}
              </td>
              <td>{fmtCompact(Math.max(0, s.finalNetWorth))}</td>
              <td>{fmtCompact(s.minNetWorth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BacktestView() {
  const { plan, backtest, incomplete, btComputing } = useSim();
  const [mode, setMode] = useState<'chart' | 'table'>('chart');

  if (incomplete) {
    return (
      <Card title="Historical backtest">
        <Empty>Finish your plan first — add annual spending on the Plan tab, and the backtest runs automatically.</Empty>
      </Card>
    );
  }

  if (!backtest) {
    return <Card title="Historical backtest"><p className="text-sm text-[var(--c-muted)]">Replaying history…</p></Card>;
  }

  const failures = backtest.starts.filter((s) => s.failedAtAge !== null);
  return (
    // A stale result stays visible, dimmed, while the worker replays the edited plan (F14).
    <div className={`grid grid-cols-1 gap-4 transition-opacity ${btComputing ? 'opacity-60' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Historical success rate">
          <p className="text-5xl font-bold tabular-nums" style={{ color: backtest.successRate >= 0.8 ? 'var(--c-good)' : 'var(--c-bad)' }}>
            {fmtPct(backtest.successRate)}
          </p>
          <p className="mt-1 text-xs text-[var(--c-muted)]">
            {backtest.starts.length - failures.length} of {backtest.starts.length} historical start years survived
          </p>
        </Card>
        <Card title="The test">
          <p className="text-xs leading-relaxed text-[var(--c-ink-2)]">
            Your {backtest.horizonYears}-year plan is replayed with a {Math.round(plan.assumptions.stockAllocation * 100)}/
            {Math.round((1 - plan.assumptions.stockAllocation) * 100)} stock/bond portfolio using real returns from the
            Shiller dataset, starting in every year from {backtest.starts[0]?.startYear} to {backtest.starts.at(-1)?.startYear}.
            Same plan, different luck — this is sequence-of-returns risk made visible.
          </p>
        </Card>
        <Card title="Worst start year">
          {backtest.worst[0] ? (
            <>
              <p className="text-5xl font-bold tabular-nums">{backtest.worst[0].startYear}</p>
              <p className="mt-1 text-xs text-[var(--c-muted)]">
                {backtest.worst[0].failedAtAge !== null
                  ? `Money runs out at age ${backtest.worst[0].failedAtAge}`
                  : `Survives with ${fmtCompact(backtest.worst[0].finalNetWorth)} left`}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--c-muted)]">No viable start years.</p>
          )}
        </Card>
      </div>

      <Card
        title="Ending net worth by historical start year"
        subtitle="Red bars = the plan ran out of money on that path (today's dollars)"
        right={<Segmented value={mode} onChange={setMode} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}
      >
        {mode === 'table' ? (
          <StartsTable starts={backtest.starts} />
        ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={backtest.starts} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={0.5}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="startYear" {...axisProps} tickMargin={6} minTickGap={28} />
            <YAxis {...moneyAxis} />
            <Tooltip
              cursor={{ fill: 'var(--c-grid)', fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                const s = payload?.[0]?.payload as BacktestStart | undefined;
                if (!active || !s) return null;
                return (
                  <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold">Start {s.startYear}</p>
                    <p className="text-[var(--c-ink-2)]">Ends with {fmtUSD(Math.max(0, s.finalNetWorth))}</p>
                    {s.failedAtAge !== null
                      ? <p className="font-medium text-[var(--c-bad)]">✕ Fails at age {s.failedAtAge}</p>
                      : <p className="text-[var(--c-ink-2)]">Lowest point {fmtCompact(s.minNetWorth)}</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="finalNetWorth" name="Ending net worth" minPointSize={2} isAnimationActive={false}>
              {backtest.starts.map((s) => (
                <Cell key={s.startYear} fill={s.failedAtAge !== null ? 'var(--c-bad)' : 'var(--c-taxable)'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        )}
      </Card>

      <Card title="Toughest starting years" subtitle="Ranked by earliest failure, then smallest ending balance">
        <table className="w-full text-right text-xs tabular-nums">
          <thead>
            <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
              <th className="py-2 text-left font-medium">Start year</th>
              <th className="font-medium">Outcome</th>
              <th className="font-medium">Ending net worth</th>
              <th className="font-medium">Lowest point</th>
            </tr>
          </thead>
          <tbody>
            {backtest.worst.map((s) => (
              <tr key={s.startYear} className="border-b border-[var(--c-grid)]/60">
                <td className="py-1.5 text-left font-medium">{s.startYear}</td>
                <td className={s.failedAtAge !== null ? 'font-medium text-[var(--c-bad)]' : 'text-[var(--c-good)]'}>
                  {s.failedAtAge !== null ? `Fails at age ${s.failedAtAge}` : 'Survives'}
                </td>
                <td>{fmtCompact(Math.max(0, s.finalNetWorth))}</td>
                <td>{fmtCompact(s.minNetWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
