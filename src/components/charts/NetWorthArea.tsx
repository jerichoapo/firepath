// Stacked area of net worth by account type over time, with FI reference lines and
// the dashed invested boundary — the series the FI number actually compares against.

import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ProjectionResult } from '../../engine/types';
import { fmtCompact } from '../../lib/format';
import { ACCOUNT_COLORS, ACCOUNT_LABELS, ChartTip, STACK_ORDER, axisProps, gridProps, moneyAxis } from './chartTheme';

export function NetWorthArea({ proj, fiN, fiAgeVal, retireAge, height = 340, compact = false }: {
  proj: ProjectionResult;
  fiN?: number;
  fiAgeVal?: number | null;
  retireAge?: number;
  height?: number;
  compact?: boolean;
}) {
  const data = proj.rows.map((r) => ({ age: r.age, year: r.year, invested: r.invested, ...r.balances }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="age" {...axisProps} tickMargin={6} interval="preserveStartEnd" />
        <YAxis {...moneyAxis} />
        <Tooltip
          content={
            <ChartTip
              order={['invested', ...[...STACK_ORDER].reverse()] as unknown as string[]}
              titleFmt={(age) => {
                const row = data.find((d) => d.age === age);
                return `Age ${age} · ${row?.year ?? ''}`;
              }}
            />
          }
        />
        {!compact && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--c-ink-2)' }} />}
        {STACK_ORDER.map((t) => (
          <Area
            key={t}
            type="monotone"
            dataKey={t}
            name={ACCOUNT_LABELS[t]}
            stackId="nw"
            stroke={ACCOUNT_COLORS[t]}
            strokeWidth={1}
            fill={ACCOUNT_COLORS[t]}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
        ))}
        {/* The FI number compares against invested assets, not the (cash-inclusive) stack top. */}
        <Line
          type="monotone"
          dataKey="invested"
          name="Invested (excl. cash)"
          stroke="var(--c-ink-2)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
        />
        {fiN !== undefined && fiN > 0 && (
          <ReferenceLine
            y={fiN}
            stroke="var(--c-median)"
            strokeDasharray="6 4"
            label={{ value: `FI ${fmtCompact(fiN)}`, position: 'insideTopRight', fill: 'var(--c-median)', fontSize: 11 }}
          />
        )}
        {fiAgeVal != null && (
          <ReferenceLine
            x={fiAgeVal}
            stroke="var(--c-good)"
            strokeDasharray="4 4"
            label={{ value: `FI @ ${fiAgeVal}`, position: 'insideTopLeft', fill: 'var(--c-good)', fontSize: 11 }}
          />
        )}
        {!compact && retireAge !== undefined && (
          <ReferenceLine
            x={retireAge}
            stroke="var(--c-muted)"
            strokeDasharray="2 4"
            label={{ value: `Retire ${retireAge}`, position: 'insideBottomLeft', fill: 'var(--c-muted)', fontSize: 11 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
