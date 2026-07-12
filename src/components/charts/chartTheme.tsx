// Shared chart configuration: account colors (fixed categorical order), axis defaults,
// and the one tooltip component every chart uses.

import type { TooltipProps } from 'recharts';
import { fmtCompact, fmtUSD } from '../../lib/format';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountType } from '../../engine/types';

export const ACCOUNT_COLORS: Record<AccountType, string> = {
  taxable: 'var(--c-taxable)',
  trad: 'var(--c-trad)',
  roth: 'var(--c-roth)',
  hsa: 'var(--c-hsa)',
  cash: 'var(--c-cash)',
};

export const STACK_ORDER = ACCOUNT_TYPES;
export { ACCOUNT_LABELS };

export const axisProps = {
  tickLine: false,
  axisLine: { stroke: 'var(--c-axis)' },
  tick: { fill: 'var(--c-muted)', fontSize: 11 },
} as const;

export const moneyAxis = { ...axisProps, tickFormatter: fmtCompact, width: 52 } as const;

export const gridProps = { stroke: 'var(--c-grid)', strokeDasharray: '3 3', vertical: false } as const;

/** Tooltip body: title + colored rows. Values in full dollars. */
export function ChartTip({ active, label, payload, titleFmt, order }: TooltipProps<number, string> & {
  titleFmt?: (label: unknown) => string;
  /** Optional explicit ordering/filtering of payload keys. */
  order?: string[];
}) {
  if (!active || !payload?.length) return null;
  let items = payload.filter((p) => p.value !== undefined && p.name !== undefined);
  if (order) {
    items = order
      .map((k) => items.find((p) => p.dataKey === k || p.name === k))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-[var(--c-ink)]">{titleFmt ? titleFmt(label) : String(label)}</p>
      {items.map((p) => (
        <p key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4 text-[var(--c-ink-2)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-[var(--c-ink)]">{fmtUSD(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}
