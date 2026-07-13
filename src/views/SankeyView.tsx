// Cash-flow Sankey for any selected year: income sources → household cash flow →
// taxes / spending / savings destinations. Values are the engine's actual funded flows.

import { useMemo } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { ACCOUNT_TYPES, type YearRow } from '../engine/types';
import { fmtCompact, fmtUSD } from '../lib/format';
import { ACCOUNT_LABELS } from '../components/charts/chartTheme';
import { Card, Empty } from '../components/ui';
import { useNav } from '../store/NavContext';
import { usePlanStore } from '../store/PlanContext';
import { useSim } from '../store/SimContext';

const PALETTE = {
  income: '#1baf7a',
  ss: '#008300',
  withdraw: '#9085e9',
  windfall: '#e87ba4',
  hub: '#898781',
  taxes: '#e34948',
  spending: '#eb6834',
  oneTime: '#d55181',
  save: '#2a78d6',
} as const;

interface SankeyNode { name: string; color: string; }
interface SankeyLink { source: number; target: number; value: number; }

function buildFlows(row: YearRow, streamNames: Record<string, string>) {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const hub = () => nodes.findIndex((n) => n.name === 'Household cash flow');
  const add = (name: string, color: string): number => nodes.push({ name, color }) - 1;

  add('Household cash flow', PALETTE.hub);
  const inflow = (name: string, color: string, value: number) => {
    if (value > 1) links.push({ source: add(name, color), target: hub(), value });
  };
  const outflow = (name: string, color: string, value: number) => {
    if (value > 1) links.push({ source: hub(), target: add(name, color), value });
  };

  for (const [id, amount] of Object.entries(row.incomeByStream)) {
    inflow(streamNames[id] ?? 'Income', PALETTE.income, amount);
  }
  inflow('Social Security', PALETTE.ss, row.socialSecurity);
  inflow('RMD (forced)', PALETTE.withdraw, row.rmd);
  for (const t of ACCOUNT_TYPES) {
    inflow(`From ${ACCOUNT_LABELS[t]}`, PALETTE.withdraw, row.withdrawals[t]);
  }
  inflow('Windfalls', PALETTE.windfall, Math.max(0, -row.oneTimeNet));

  outflow('Taxes', PALETTE.taxes, row.taxes.total);
  outflow('Spending', PALETTE.spending, Math.max(0, row.spending - row.unfundedSpending));
  outflow('One-time expenses', PALETTE.oneTime, Math.max(0, row.oneTimeNet));
  for (const t of ACCOUNT_TYPES) {
    outflow(`To ${ACCOUNT_LABELS[t]}`, PALETTE.save, row.contributions[t]);
  }
  outflow('Extra savings → Taxable', PALETTE.save, row.leftoverToTaxable);

  // Sankey requires every node to touch a link; drop orphans and remap indices.
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const map = new Map<number, number>();
  const outNodes = nodes.filter((_, i) => used.has(i)).map((n, j) => (map.set(nodes.indexOf(n), j), n));
  return {
    nodes: outNodes,
    links: links.map((l) => ({ ...l, source: map.get(l.source)!, target: map.get(l.target)! })),
  };
}

interface NodeProps {
  x: number; y: number; width: number; height: number;
  payload: SankeyNode & { value: number; depth: number };
}

/** Long names clip against the chart edges — truncate at ~18 chars; the full name stays
 *  available via the SVG <title> (hover) and the tooltip (F20). */
const truncate = (name: string) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);

function Node({ x, y, width, height, payload }: NodeProps) {
  const isHub = payload.name === 'Household cash flow';
  const left = payload.depth === 0 && !isHub;
  return (
    <g>
      <title>{payload.name}</title>
      <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={2} fill={payload.color} fillOpacity={0.9} />
      <text
        x={isHub ? x + width / 2 : left ? x - 6 : x + width + 6}
        y={isHub ? y - 8 : y + Math.max(2, height) / 2}
        textAnchor={isHub ? 'middle' : left ? 'end' : 'start'}
        dominantBaseline={isHub ? 'auto' : 'central'}
        fontSize={11}
        fill="var(--c-ink-2)"
      >
        <tspan fontWeight={600} fill="var(--c-ink)">{truncate(payload.name)}</tspan>
        <tspan dx={5} fill="var(--c-muted)">{fmtCompact(payload.value)}</tspan>
      </text>
    </g>
  );
}

interface LinkProps {
  sourceX: number; targetX: number; sourceY: number; targetY: number;
  sourceControlX: number; targetControlX: number; linkWidth: number;
  payload: { source: SankeyNode; target: SankeyNode; value: number };
}

function Link({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }: LinkProps) {
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={payload.target.name === 'Household cash flow' ? payload.source.color : payload.target.color}
      strokeOpacity={0.3}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
}

export function SankeyView() {
  const { plan } = usePlanStore();
  const { proj } = useSim();
  // The selected age lives in NavContext so cross-links land here with a year picked,
  // and returning to the tab resumes where you were looking (F22).
  const { cashFlowAge, setCashFlowAge: setAge } = useNav();
  const age = cashFlowAge ?? plan.profile.currentAge;
  const clamped = Math.min(Math.max(age, plan.profile.currentAge), plan.profile.lifeExpectancy);
  const row = proj.rows.find((r) => r.age === clamped) ?? proj.rows[0];

  const streamNames = useMemo(
    () => Object.fromEntries(plan.incomes.map((s) => [s.id, s.name])),
    [plan.incomes],
  );
  const flows = useMemo(() => buildFlows(row, streamNames), [row, streamNames]);

  const saved = ACCOUNT_TYPES.reduce((s, t) => s + row.contributions[t], 0) + row.leftoverToTaxable;
  const withdrawn = ACCOUNT_TYPES.reduce((s, t) => s + row.withdrawals[t], 0) + row.rmd;

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title="Cash flow by year" subtitle="Where money comes from and where it goes in a single simulated year">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-lg border border-[var(--c-border)] px-2 py-1 text-sm" onClick={() => setAge(clamped - 1)} disabled={clamped <= plan.profile.currentAge}>←</button>
          <input
            type="range"
            className="min-w-40 flex-1"
            min={plan.profile.currentAge}
            max={plan.profile.lifeExpectancy}
            value={clamped}
            onChange={(e) => setAge(Number(e.target.value))}
            aria-label="Select year"
          />
          <button type="button" className="rounded-lg border border-[var(--c-border)] px-2 py-1 text-sm" onClick={() => setAge(clamped + 1)} disabled={clamped >= plan.profile.lifeExpectancy}>→</button>
          <p className="w-40 text-sm font-semibold tabular-nums">Age {clamped} · {row.year}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ['Gross income', row.grossIncome],
            ['Taxes', row.taxes.total],
            ['Spending', row.spending + Math.max(0, row.oneTimeNet)],
            ['Saved', saved],
            ['Withdrawn', withdrawn],
            ['Net worth (end)', row.netWorth],
          ].map(([k, v]) => (
            <span key={k as string} className="rounded-lg bg-[var(--c-page)] px-2.5 py-1.5">
              <span className="text-[var(--c-muted)]">{k}:</span>{' '}
              <b className="tabular-nums">{fmtCompact(v as number)}</b>
            </span>
          ))}
        </div>
        {row.unfundedSpending > 1 && (
          <p className="mt-2 rounded-lg bg-[var(--c-bad)]/10 p-2 text-xs font-medium text-[var(--c-bad)]">
            ⚠ {fmtUSD(row.unfundedSpending)} of spending could not be funded this year — accounts are empty.
          </p>
        )}
      </Card>

      <Card title={`Money flow at age ${clamped}`} subtitle="Hover any band for the exact amount">
        {flows.links.length === 0 ? (
          <Empty>No cash flows this year — add income or expenses on the Plan tab.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={460}>
            <Sankey
              data={flows}
              node={Node as never}
              link={Link as never}
              nodePadding={26}
              nodeWidth={10}
              margin={{ top: 24, right: 170, bottom: 12, left: 150 }}
              sort={false}
            >
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as { source?: SankeyNode; target?: SankeyNode; value?: number; name?: string } | undefined;
                  if (!active || !p) return null;
                  return (
                    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
                      {p.source && p.target
                        ? <p className="font-medium">{p.source.name} → {p.target.name}: <b className="tabular-nums">{fmtUSD(p.value ?? 0)}</b></p>
                        : <p className="font-medium">{p.name}: <b className="tabular-nums">{fmtUSD(p.value ?? 0)}</b></p>}
                    </div>
                  );
                }}
              />
            </Sankey>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Tax detail" subtitle="Estimated — see README for simplifications">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['Federal income + LTCG', row.taxes.federal],
            ['State', row.taxes.state],
            ['FICA / SE tax', row.taxes.fica],
            ['Early-withdrawal penalties', row.taxes.penalties],
            ['Total', row.taxes.total],
          ].map(([k, v]) => (
            <span key={k as string} className="rounded-lg bg-[var(--c-page)] px-2.5 py-1.5">
              <span className="text-[var(--c-muted)]">{k}:</span>{' '}
              <b className="tabular-nums">{fmtUSD(v as number)}</b>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
