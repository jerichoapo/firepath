// The plan editor: every input in the model, grouped into cards, with a live
// projection preview in a sticky rail. Charts everywhere update as you type/drag.

import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountInput, type AccountType, type Assumptions, type ExpensesInput, type IncomeStream, type PlanInput, type Profile, type TaxSettings } from '../engine/types';
import { uid } from '../engine/seed';
import { fmtCompact } from '../lib/format';
import { NetWorthArea } from '../components/charts/NetWorthArea';
import { Btn, Card, Empty, NumField, Segmented, Select } from '../components/ui';
import { usePlanStore } from '../store/PlanContext';
import { useSim } from '../store/SimContext';

const rowGrid = 'grid items-end gap-2';

export function PlanView() {
  const { plan, update } = usePlanStore();
  const sim = useSim();

  const patch = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) =>
    update((p) => ({ ...p, [key]: value }));
  const profile = (p: Partial<Profile>) => patch('profile', { ...plan.profile, ...p });
  const assume = (a: Partial<Assumptions>) => patch('assumptions', { ...plan.assumptions, ...a });
  const expenses = (e: Partial<ExpensesInput>) => patch('expenses', { ...plan.expenses, ...e });
  const tax = (t: Partial<TaxSettings>) => patch('tax', { ...plan.tax, ...t });
  const account = (t: AccountType, a: Partial<AccountInput>) =>
    patch('accounts', { ...plan.accounts, [t]: { ...plan.accounts[t], ...a } });
  const income = (id: string, s: Partial<IncomeStream>) =>
    patch('incomes', plan.incomes.map((i) => (i.id === id ? { ...i, ...s } : i)));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-1 content-start gap-4 lg:col-span-2 xl:grid-cols-2">
        <Card title="Household" subtitle="Ages drive the whole timeline">
          <div className={`${rowGrid} grid-cols-2`}>
            <NumField label="Your age" value={plan.profile.currentAge} onChange={(v) => profile({ currentAge: Math.round(v) })} min={16} max={90} />
            <div>
              <Segmented
                label="Planning as"
                value={plan.profile.partnerAge == null ? 'solo' : 'couple'}
                onChange={(v) => profile({ partnerAge: v === 'solo' ? null : plan.profile.currentAge })}
                options={[{ value: 'solo', label: 'Solo' }, { value: 'couple', label: 'Couple' }]}
              />
            </div>
            {plan.profile.partnerAge != null && (
              <NumField label="Partner age" value={plan.profile.partnerAge} onChange={(v) => profile({ partnerAge: Math.round(v) })} min={16} max={90} />
            )}
            <NumField label="Downshift age" value={plan.profile.downshiftAge} onChange={(v) => profile({ downshiftAge: Math.round(v) })} help="When you plan to drop to part-time. Model the income change in Income streams." />
            <NumField label="Full retirement age" value={plan.profile.retireAge} onChange={(v) => profile({ retireAge: Math.round(v) })} help="Planned contributions stop here; the FI number uses spending at this age." />
            <NumField label="Life expectancy" value={plan.profile.lifeExpectancy} onChange={(v) => profile({ lifeExpectancy: Math.round(v) })} min={plan.profile.currentAge + 1} max={110} />
          </div>
        </Card>

        <Card title="Accounts" subtitle="Balances today + planned annual contributions">
          <div className="grid gap-2">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
              <span /><span>Balance</span><span>Contribution / yr</span>
            </div>
            {ACCOUNT_TYPES.map((t) => (
              <div key={t} className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--c-${t})` }} />
                  {ACCOUNT_LABELS[t]}
                </span>
                <NumField label="" prefix="$" value={plan.accounts[t].balance} onChange={(v) => account(t, { balance: v })} />
                <NumField label="" prefix="$" value={plan.accounts[t].contribution} onChange={(v) => account(t, { contribution: v })} />
              </div>
            ))}
            <div className={`${rowGrid} mt-1 grid-cols-2`}>
              <NumField label="Taxable cost basis" prefix="$" value={plan.taxableCostBasis} onChange={(v) => patch('taxableCostBasis', v)} help="What you paid for the taxable balance — gains above it are taxed on withdrawal." />
              <NumField label="Roth contribution basis" prefix="$" value={plan.rothBasis} onChange={(v) => patch('rothBasis', v)} help="Lifetime Roth contributions — withdrawable any time without tax or penalty." />
            </div>
          </div>
        </Card>

        <Card
          title="Income streams"
          subtitle="Salary, 1099, future part-time — with start/end ages"
          right={<Btn onClick={() => patch('incomes', [...plan.incomes, { id: uid(), name: 'New income', kind: 'w2', annual: 50_000, startAge: plan.profile.currentAge, endAge: plan.profile.retireAge - 1, growth: 0 }])}>+ Add</Btn>}
          className="xl:col-span-2"
        >
          {plan.incomes.length === 0 && <Empty>No income streams. Add salary, consulting, or part-time income.</Empty>}
          <div className="grid gap-2">
            {plan.incomes.map((s) => (
              <div key={s.id} className={`${rowGrid} grid-cols-[1.6fr_0.9fr_1.1fr_0.7fr_0.7fr_0.8fr_auto]`}>
                <NumTextField label="Name" value={s.name} onChange={(name) => income(s.id, { name })} />
                <Select label="Type" value={s.kind} onChange={(kind) => income(s.id, { kind })} options={[{ value: 'w2', label: 'W-2' }, { value: 'se', label: '1099' }]} />
                <NumField label="Annual" prefix="$" value={s.annual} onChange={(annual) => income(s.id, { annual })} />
                <NumField label="From" value={s.startAge} onChange={(v) => income(s.id, { startAge: Math.round(v) })} />
                <NumField label="To" value={s.endAge} onChange={(v) => income(s.id, { endAge: Math.round(v) })} help="Inclusive last age" />
                <NumField label="Growth" suffix="%" percent value={s.growth} onChange={(growth) => income(s.id, { growth })} help="Real growth above inflation" />
                <Btn variant="danger" title="Remove" onClick={() => patch('incomes', plan.incomes.filter((i) => i.id !== s.id))}>✕</Btn>
              </div>
            ))}
          </div>
          <div className={`${rowGrid} mt-3 grid-cols-2 border-t border-[var(--c-border)] pt-3`}>
            <NumField label="Social Security (household, $/yr)" prefix="$" value={plan.socialSecurity.annual} onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, annual: v })} help="Your own estimate in today's dollars (e.g., from ssa.gov). 85% is treated as taxable." />
            <NumField label="Claiming age" value={plan.socialSecurity.claimAge} onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, claimAge: Math.round(v) })} min={62} max={70} slider={[62, 70, 1]} />
          </div>
        </Card>

        <Card
          title="Spending"
          subtitle="Phases let retirement spending differ from today's"
          right={<Btn onClick={() => expenses({ phases: [...plan.expenses.phases, { id: uid(), fromAge: plan.profile.retireAge, annual: plan.expenses.currentAnnual }] })}>+ Phase</Btn>}
        >
          <NumField label="Current annual spending" prefix="$" value={plan.expenses.currentAnnual} onChange={(v) => expenses({ currentAnnual: v })} slider={[0, 300_000, 1_000]} />
          <div className="mt-2 grid gap-2">
            {plan.expenses.phases.map((ph) => (
              <div key={ph.id} className={`${rowGrid} grid-cols-[1fr_1.4fr_auto]`}>
                <NumField label="From age" value={ph.fromAge} onChange={(v) => expenses({ phases: plan.expenses.phases.map((x) => (x.id === ph.id ? { ...x, fromAge: Math.round(v) } : x)) })} />
                <NumField label="Annual spend" prefix="$" value={ph.annual} onChange={(v) => expenses({ phases: plan.expenses.phases.map((x) => (x.id === ph.id ? { ...x, annual: v } : x)) })} />
                <Btn variant="danger" onClick={() => expenses({ phases: plan.expenses.phases.filter((x) => x.id !== ph.id) })}>✕</Btn>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[var(--c-border)] pt-3">
            <p className="text-xs font-semibold">One-time expenses</p>
            <Btn onClick={() => expenses({ oneTimes: [...plan.expenses.oneTimes, { id: uid(), name: 'New expense', age: plan.profile.currentAge + 5, amount: 25_000 }] })}>+ Add</Btn>
          </div>
          <div className="mt-2 grid gap-2">
            {plan.expenses.oneTimes.length === 0 && <Empty>Down payment, ADU build, college…</Empty>}
            {plan.expenses.oneTimes.map((o) => (
              <div key={o.id} className={`${rowGrid} grid-cols-[1.6fr_0.8fr_1.2fr_auto]`}>
                <NumTextField label="Name" value={o.name} onChange={(name) => expenses({ oneTimes: plan.expenses.oneTimes.map((x) => (x.id === o.id ? { ...x, name } : x)) })} />
                <NumField label="Age" value={o.age} onChange={(v) => expenses({ oneTimes: plan.expenses.oneTimes.map((x) => (x.id === o.id ? { ...x, age: Math.round(v) } : x)) })} />
                <NumField label="Amount" prefix="$" value={o.amount} onChange={(v) => expenses({ oneTimes: plan.expenses.oneTimes.map((x) => (x.id === o.id ? { ...x, amount: v } : x)) })} help="Negative = windfall (inheritance, sale)" />
                <Btn variant="danger" onClick={() => expenses({ oneTimes: plan.expenses.oneTimes.filter((x) => x.id !== o.id) })}>✕</Btn>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Assumptions" subtitle="Real (inflation-adjusted) rates — drag to explore">
          <div className={`${rowGrid} grid-cols-2`}>
            <NumField label="Expected real return" suffix="%" percent value={plan.assumptions.expReturn} onChange={(v) => assume({ expReturn: v })} slider={[0, 12, 0.1]} />
            <NumField label="Return volatility (σ)" suffix="%" percent value={plan.assumptions.returnSd} onChange={(v) => assume({ returnSd: v })} slider={[0, 30, 0.5]} />
            <NumField label="Inflation (reference)" suffix="%" percent value={plan.assumptions.inflation} onChange={(v) => assume({ inflation: v })} slider={[0, 8, 0.1]} help="Everything is modeled in today's dollars; this is context for choosing real rates." />
            <NumField label="Cash real return" suffix="%" percent value={plan.assumptions.cashReturn} onChange={(v) => assume({ cashReturn: v })} slider={[-3, 3, 0.1]} />
            <NumField label="Stock allocation" suffix="%" percent value={plan.assumptions.stockAllocation} onChange={(v) => assume({ stockAllocation: Math.min(1, Math.max(0, v)) })} slider={[0, 100, 5]} help="Used by historical backtesting and bootstrap Monte Carlo (stocks vs 10-yr Treasuries)." />
            <NumField label="Contribution growth" suffix="%" percent value={plan.assumptions.contributionGrowth} onChange={(v) => assume({ contributionGrowth: v })} slider={[0, 8, 0.25]} help="Real annual growth of planned contributions (savings-rate growth)." />
            <NumField label="FI multiplier" suffix="× spend" value={plan.assumptions.fiMultiplier} onChange={(v) => assume({ fiMultiplier: v })} slider={[15, 40, 0.5]} help="25× ≈ the 4% rule." />
          </div>
        </Card>

        <Card title="Taxes" subtitle="Estimates only — see README for the simplifications">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-4">
              <Segmented label="Filing status" value={plan.tax.filingStatus} onChange={(filingStatus) => tax({ filingStatus })} options={[{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }]} />
              <Segmented label="State tax" value={plan.tax.stateMode} onChange={(stateMode) => tax({ stateMode })} options={[{ value: 'none', label: 'None' }, { value: 'flat', label: 'Flat' }, { value: 'brackets', label: 'Brackets' }]} />
            </div>
            {plan.tax.stateMode !== 'none' && (
              <div className={`${rowGrid} grid-cols-2`}>
                {plan.tax.stateMode === 'flat' && (
                  <NumField label="Flat rate" suffix="%" percent value={plan.tax.stateFlatRate} onChange={(v) => tax({ stateFlatRate: v })} slider={[0, 13, 0.1]} />
                )}
                <NumField label="State standard deduction" prefix="$" value={plan.tax.stateStdDeduction} onChange={(v) => tax({ stateStdDeduction: v })} />
              </div>
            )}
            {plan.tax.stateMode === 'brackets' && (
              <div className="grid gap-2">
                {plan.tax.stateBrackets.map((b, i) => (
                  <div key={i} className={`${rowGrid} grid-cols-[1.4fr_1fr_auto]`}>
                    <NumField label={i === plan.tax.stateBrackets.length - 1 ? 'Up to (top bracket)' : 'Up to'} prefix="$" value={Number.isFinite(b.upTo) ? b.upTo : 0} onChange={(v) => tax({ stateBrackets: plan.tax.stateBrackets.map((x, j) => (j === i ? { ...x, upTo: v } : x)) })} help="The last bracket is treated as unlimited." />
                    <NumField label="Rate" suffix="%" percent value={b.rate} onChange={(v) => tax({ stateBrackets: plan.tax.stateBrackets.map((x, j) => (j === i ? { ...x, rate: v } : x)) })} />
                    <Btn variant="danger" disabled={plan.tax.stateBrackets.length <= 1} onClick={() => tax({ stateBrackets: plan.tax.stateBrackets.filter((_, j) => j !== i) })}>✕</Btn>
                  </div>
                ))}
                <Btn onClick={() => tax({ stateBrackets: [...plan.tax.stateBrackets.slice(0, -1), { upTo: 50_000, rate: 0.05 }, plan.tax.stateBrackets.at(-1)!] })}>+ Bracket</Btn>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs text-[var(--c-ink-2)]">Withdrawal order (cash is always first)</p>
              <div className="flex flex-wrap gap-1.5">
                {plan.tax.withdrawalOrder.map((t, i) => (
                  <span key={t} className="flex items-center gap-1 rounded-lg border border-[var(--c-border)] px-2 py-1 text-xs">
                    <span className="text-[var(--c-muted)]">{i + 1}.</span> {ACCOUNT_LABELS[t]}
                    <button
                      type="button"
                      aria-label={`Move ${ACCOUNT_LABELS[t]} earlier`}
                      className="ml-1 text-[var(--c-muted)] hover:text-[var(--c-ink)] disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => {
                        const order = [...plan.tax.withdrawalOrder];
                        [order[i - 1], order[i]] = [order[i], order[i - 1]];
                        tax({ withdrawalOrder: order });
                      }}
                    >←</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Your milestones"
          subtitle="Personal markers for the timeline"
          right={<Btn onClick={() => patch('milestones', [...plan.milestones, { id: uid(), name: 'New milestone', age: plan.profile.currentAge + 10 }])}>+ Add</Btn>}
        >
          {plan.milestones.length === 0 && <Empty>Kid starts college, mortgage paid off…</Empty>}
          <div className="grid gap-2">
            {plan.milestones.map((m) => (
              <div key={m.id} className={`${rowGrid} grid-cols-[2fr_1fr_auto]`}>
                <NumTextField label="Name" value={m.name} onChange={(name) => patch('milestones', plan.milestones.map((x) => (x.id === m.id ? { ...x, name } : x)))} />
                <NumField label="Age" value={m.age} onChange={(v) => patch('milestones', plan.milestones.map((x) => (x.id === m.id ? { ...x, age: Math.round(v) } : x)))} />
                <Btn variant="danger" onClick={() => patch('milestones', plan.milestones.filter((x) => x.id !== m.id))}>✕</Btn>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-16 lg:self-start">
        <Card title="Live projection" subtitle={`Deterministic at ${(plan.assumptions.expReturn * 100).toFixed(1)}% real`}>
          <NetWorthArea proj={sim.proj} fiN={sim.fiN} fiAgeVal={sim.fiAgeVal} height={230} compact />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <StatRow k="FI number" v={fmtCompact(sim.fiN)} />
            <StatRow k="FI age" v={sim.fiAgeVal != null ? String(sim.fiAgeVal) : '—'} />
            <StatRow k="Net worth @ retire" v={fmtCompact(sim.proj.rows.find((r) => r.age === plan.profile.retireAge)?.netWorth ?? 0)} />
            <StatRow k="End of plan" v={fmtCompact(sim.proj.finalNetWorth)} />
          </dl>
          {sim.proj.failedAtAge != null && (
            <p className="mt-2 rounded-lg bg-[var(--c-bad)]/10 p-2 text-xs font-medium text-[var(--c-bad)]">
              ⚠ Deterministic plan runs out of money at age {sim.proj.failedAtAge}.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[var(--c-page)] px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

/** Text sibling of NumField so list rows line up. */
function NumTextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-[var(--c-ink-2)]">{label}</span>
      <input
        className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
