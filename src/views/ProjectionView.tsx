// Deterministic projection: hero stacked-area chart + the year-by-year table.

import { NetWorthArea } from '../components/charts/NetWorthArea';
import { Card } from '../components/ui';
import { fmtCompact } from '../lib/format';
import { useNav } from '../store/NavContext';
import { useSim } from '../store/SimContext';

export function ProjectionView() {
  const { plan, proj, fiN, fiAgeVal, coastAgeVal } = useSim();
  const { goToCashFlow } = useNav();

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title="Net worth by account"
        subtitle={`Deterministic projection at ${(plan.assumptions.expReturn * 100).toFixed(1)}% real return, today's dollars — the FI line compares against the dashed invested series (net worth minus cash)`}
        right={
          <div className="flex gap-4 text-xs">
            <span>🔥 FI {fiAgeVal != null ? `at ${fiAgeVal}` : 'not reached'}</span>
            <span>⛵ Coast {coastAgeVal != null ? `at ${coastAgeVal}` : 'not reached'}</span>
          </div>
        }
      >
        <NetWorthArea proj={proj} fiN={fiN} fiAgeVal={fiAgeVal} retireAge={plan.profile.retireAge} height={380} />
      </Card>

      <Card title="Year by year" subtitle="Every simulated year — income, taxes, flows, balances (today's $). Click a row for that year's cash flow.">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-right text-[13px] tabular-nums sm:text-xs">
            <thead className="sticky top-0 bg-[var(--c-surface)]">
              <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
                {/* Sticky first column: 64% of this table is off-screen on phones, and
                    a net-worth figure is meaningless without its year in view. */}
                <th className="sticky left-0 z-[2] bg-[var(--c-surface)] py-2 pr-3 text-left font-medium">Age · Year</th>
                <th className="px-2 font-medium">Income</th>
                <th className="px-2 font-medium">Taxes</th>
                <th className="px-2 font-medium">Spending</th>
                <th className="px-2 font-medium">Saved</th>
                <th className="px-2 font-medium">Withdrawn</th>
                <th className="px-2 font-medium">Invested</th>
                <th className="pl-2 font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {proj.rows.map((r) => {
                const saved = Object.values(r.contributions).reduce((s, x) => s + x, 0) + r.leftoverToTaxable;
                const withdrawn = Object.values(r.withdrawals).reduce((s, x) => s + x, 0);
                return (
                  <tr
                    key={r.age}
                    onClick={() => goToCashFlow(r.age)}
                    className={`cursor-pointer border-b border-[var(--c-grid)]/60 hover:bg-[var(--c-grid)]/30 ${r.failed ? 'text-[var(--c-bad)]' : ''}`}
                  >
                    <td className="sticky left-0 z-[1] bg-[var(--c-surface)] py-1.5 pr-3 text-left font-medium">
                      {/* Keyboard path for the row's cross-link (the row click is mouse-only). */}
                      <button
                        type="button"
                        aria-label={`View cash flow at age ${r.age}`}
                        title={`View cash flow at age ${r.age}`}
                        className="rounded hover:text-[var(--c-accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--c-accent)]"
                        onClick={() => goToCashFlow(r.age)}
                      >
                        {r.age} · {r.year}
                      </button>
                      {r.age === fiAgeVal && ' 🔥'}
                      {r.age === plan.profile.retireAge && ' 🏝️'}
                      {r.failed && ' ⚠'}
                    </td>
                    <td className="px-2">{fmtCompact(r.grossIncome)}</td>
                    <td className="px-2">{fmtCompact(r.taxes.total)}</td>
                    <td className="px-2">{fmtCompact(r.spending + r.oneTimeNet)}</td>
                    <td className="px-2">{saved > 0.5 ? fmtCompact(saved) : '—'}</td>
                    <td className="px-2">{withdrawn > 0.5 ? fmtCompact(withdrawn) : '—'}</td>
                    <td className="px-2">{fmtCompact(r.invested)}</td>
                    <td className="pl-2 font-semibold">{fmtCompact(r.netWorth)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
