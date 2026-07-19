// The plan editor: every input in the model, grouped into cards, with a live
// projection preview in a sticky rail. Charts everywhere update as you type/drag.

import { useState } from 'react';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountInput, type AccountType, type Assumptions, type ContributionChange, type ExpensesInput, type IncomeStream, type PlanInput, type Profile, type TaxSettings } from '../engine/types';
import { savingsRate } from '../engine/metrics';
import { contributionAtAge, contributionSteps, spendingAtAge } from '../engine/projection';
import { portfolioStats } from '../engine/returns';
import { uid } from '../engine/seed';
import { fmtCompact, fmtPct } from '../lib/format';
import { NetWorthArea } from '../components/charts/NetWorthArea';
import { Btn, Card, Empty, Help, NumField, Segmented, Select } from '../components/ui';
import { usePlanStore } from '../store/PlanContext';
import { useSim } from '../store/SimContext';

const rowGrid = 'grid items-end gap-2';

export function PlanView() {
  const { plan, update, flags, setFlag } = usePlanStore();
  const sim = useSim();
  const invalid = sim.issues.filter((i) => i.level === 'invalid');
  const badStreams = new Set(invalid.map((i) => i.streamId).filter(Boolean));
  const sr = sim.proj.rows.length > 0 ? savingsRate(sim.proj.rows[0]) : null;
  const hist = portfolioStats(plan.assumptions.stockAllocation);
  const allocLabel = `${Math.round(plan.assumptions.stockAllocation * 100)}/${Math.round((1 - plan.assumptions.stockAllocation) * 100)}`;

  const patch = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) =>
    update((p) => ({ ...p, [key]: value }));
  const profile = (p: Partial<Profile>) => patch('profile', { ...plan.profile, ...p });
  const assume = (a: Partial<Assumptions>) => patch('assumptions', { ...plan.assumptions, ...a });
  const expenses = (e: Partial<ExpensesInput>) => patch('expenses', { ...plan.expenses, ...e });
  const tax = (t: Partial<TaxSettings>) => patch('tax', { ...plan.tax, ...t });
  const account = (t: AccountType, a: Partial<AccountInput>) =>
    patch('accounts', { ...plan.accounts, [t]: { ...plan.accounts[t], ...a } });
  // Contribution schedules (D28). An emptied list is dropped so exports stay clean.
  const setChanges = (t: AccountType, list: ContributionChange[]) =>
    account(t, { changes: list.length > 0 ? list : undefined });
  const patchChange = (t: AccountType, id: string, c: Partial<ContributionChange>) =>
    setChanges(t, (plan.accounts[t].changes ?? []).map((x) => (x.id === id ? { ...x, ...c } : x)));
  const addChange = (t: AccountType) => {
    const existing = plan.accounts[t].changes ?? [];
    const last = existing[existing.length - 1];
    setChanges(t, [...existing, {
      id: uid(),
      fromAge: Math.min(plan.profile.retireAge - 1, (last?.fromAge ?? plan.profile.currentAge) + 5),
      annual: last?.annual ?? plan.accounts[t].contribution,
    }]);
  };
  const scheduleWarnings = sim.issues.filter((i) => i.level === 'warning');
  const income = (id: string, s: Partial<IncomeStream>) =>
    patch('incomes', plan.incomes.map((i) => (i.id === id ? { ...i, ...s } : i)));
  const moveWithdrawal = (i: number, d: -1 | 1) => {
    const order = [...plan.tax.withdrawalOrder];
    [order[i], order[i + d]] = [order[i + d], order[i]];
    tax({ withdrawalOrder: order });
  };

  // The spending lever edits the number the FI bar is priced from: whatever spending
  // level is in force at retirement age — the governing phase, or currentAnnual when
  // no phase covers retirement (F13).
  const retirementSpend = spendingAtAge(plan, plan.profile.retireAge);
  const setRetirementSpend = (v: number) => {
    const governing = [...plan.expenses.phases]
      .sort((a, b) => a.fromAge - b.fromAge)
      .filter((p) => p.fromAge <= plan.profile.retireAge)
      .at(-1);
    if (governing) {
      expenses({ phases: plan.expenses.phases.map((p) => (p.id === governing.id ? { ...p, annual: v } : p)) });
    } else {
      expenses({ currentAnnual: v });
    }
  };

  // Basis disclosure open-state survives tab switches for the rest of the browser
  // session, without becoming a forever-flag (F6).
  const [basisOpen, setBasisOpen] = useState(() => sessionStorage.getItem('firepath-basis-open') === '1');
  // Which account's contribution schedule is expanded (one at a time keeps the card scannable).
  const [scheduleOpen, setScheduleOpen] = useState<AccountType | null>(null);

  // Funded-vs-planned (D28): the engine funds contributions from each year's actual
  // surplus and silently scales them down when it's short — surface that here, where
  // the plan is typed in. Shortfall years are counted, not just year one, because a
  // schedule makes it easy to over-plan a later age.
  const funding = (() => {
    let workingYears = 0;
    let shortYears = 0;
    let first: { age: number; planned: number; funded: number } | null = null;
    let anyPlanned = false;
    for (const r of sim.proj.rows) {
      if (r.age >= plan.profile.retireAge) break;
      workingYears++;
      const planned = ACCOUNT_TYPES.reduce((s, t) => s + contributionAtAge(plan, t, r.age), 0);
      if (planned > 0) anyPlanned = true;
      const funded = Object.values(r.contributions).reduce((s, x) => s + x, 0);
      if (funded < planned - 1) {
        shortYears++;
        first ??= { age: r.age, planned, funded };
      }
    }
    return { anyPlanned, workingYears, shortYears, first };
  })();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {!flags.orientationDismissed && (
        <Card
          title="How FirePath works"
          className="lg:col-span-3"
          right={<Btn onClick={() => setFlag('orientationDismissed')} title="Dismiss guide">✕ Got it</Btn>}
        >
          <ol className="grid list-decimal gap-1 pl-4 text-xs text-[var(--c-ink-2)] sm:grid-cols-2">
            <li>Describe your household on this tab — accounts, income, spending, assumptions.</li>
            <li><b>Projection</b> shows the single expected path; the header verdict updates live as you type.</li>
            <li><b>Monte Carlo</b> and <b>Backtest</b> stress-test the same plan against randomness and against history.</li>
            <li><b>Scenarios</b>: duplicate the plan, change one thing, and compare futures side by side.</li>
          </ol>
        </Card>
      )}
      {invalid.length > 0 && (
        <div className="rounded-xl border border-[var(--c-bad)]/40 bg-[var(--c-bad)]/8 p-3 text-xs lg:col-span-3" role="alert">
          <p className="mb-1 font-semibold text-[var(--c-bad)]">⚠ Fix these inputs — parts of the plan don't make sense yet:</p>
          <ul className="grid list-disc gap-0.5 pl-4 text-[var(--c-ink-2)]">
            {invalid.map((i, n) => <li key={n}>{i.message}</li>)}
          </ul>
        </div>
      )}

      {/* Quick levers (F13): the three inputs that move the plan most, with the verdict
          right beside them — the "what if I retire at X?" loop lives here. */}
      <Card
        title="Quick levers"
        subtitle="The three inputs that move the plan most — the verdict reacts as you drag"
        className="lg:col-span-3"
      >
        <div className="grid items-end gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <NumField
            label="Retire at age"
            value={plan.profile.retireAge}
            onChange={(v) => profile({ retireAge: Math.round(v) })}
            slider={[plan.profile.currentAge, 80, 1]}
            help="Planned contributions stop and retirement spending starts here. The same field as Household's Full retirement age."
          />
          <NumField
            label="Spending in retirement"
            prefix="$"
            min={0}
            value={retirementSpend}
            onChange={setRetirementSpend}
            slider={[0, 300_000, 5_000]}
            help="The spending level in force at your retirement age — the FI number is this × your FI multiplier. Edits the spending phase that covers retirement, or current spending if none does."
          />
          <NumField
            label="Expected return"
            suffix="%"
            percent
            value={plan.assumptions.expReturn}
            onChange={(v) => assume({ expReturn: v })}
            slider={[0, 12, 0.1]}
            help="Real (after-inflation) mean return — the same knob as in Assumptions."
          />
          <div className="min-w-44 rounded-lg bg-[var(--c-page)] px-3 py-2">
            <p className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-[var(--c-muted)]">Projected FI</span>
              <b className="tabular-nums">
                {sim.incomplete ? '—' : sim.fiAgeVal != null ? `Age ${sim.fiAgeVal}` : 'Not reached'}
              </b>
            </p>
            <p className="mt-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-[var(--c-muted)]">Success</span>
              <b className={`tabular-nums transition-opacity ${sim.mcComputing && !sim.incomplete ? 'opacity-50' : ''}`}>
                {sim.incomplete ? '—' : sim.mc ? fmtPct(sim.mc.successRate) : 'computing…'}
              </b>
            </p>
          </div>
        </div>
      </Card>
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
              <NumField label="Partner age" value={plan.profile.partnerAge} onChange={(v) => profile({ partnerAge: Math.round(v) })} min={16} max={90} help="Sets when partner Social Security begins — their claim age is keyed to their own age." />
            )}
            <NumField label="Full retirement age" value={plan.profile.retireAge} onChange={(v) => profile({ retireAge: Math.round(v) })} slider={[plan.profile.currentAge, 80, 1]} help="Planned contributions stop here; the FI number uses spending at this age. Also on the Quick levers strip — both edit the same field." />
            <NumField label="Life expectancy" value={plan.profile.lifeExpectancy} onChange={(v) => profile({ lifeExpectancy: Math.round(v) })} min={plan.profile.currentAge + 1} max={110} />
          </div>
        </Card>

        <Card title="Accounts" subtitle="Balances today + planned annual contributions">
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wide text-[var(--c-muted)] sm:grid-cols-[1.2fr_1fr_1.3fr]">
              <span className="hidden sm:block" /><span>Balance</span><span>Contribution / yr</span>
            </div>
            {ACCOUNT_TYPES.map((t) => {
              const changes = plan.accounts[t].changes ?? [];
              const open = scheduleOpen === t;
              const scheduled = changes.length > 0;
              return (
                <div key={t} className={open ? 'rounded-lg border border-[var(--c-border)] p-1.5' : ''}>
                  {/* Mobile: the account name takes its own line; the two money fields share the row. */}
                  <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1.2fr_1fr_1.3fr]">
                    <span className="col-span-2 flex items-center gap-1.5 text-xs font-medium sm:col-span-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--c-${t})` }} />
                      {ACCOUNT_LABELS[t]}
                    </span>
                    <NumField label="" ariaLabel={`${ACCOUNT_LABELS[t]} balance`} prefix="$" min={0} value={plan.accounts[t].balance} onChange={(v) => account(t, { balance: v })} />
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 flex-1">
                        <NumField label="" ariaLabel={`${ACCOUNT_LABELS[t]} contribution per year`} prefix="$" min={0} value={plan.accounts[t].contribution} onChange={(v) => account(t, { contribution: v })} />
                      </span>
                      <button
                        type="button"
                        aria-label={`Vary ${ACCOUNT_LABELS[t]} contribution by age`}
                        aria-pressed={open}
                        title="Vary by age"
                        className={`rounded-lg border px-1.5 py-1.5 text-xs transition-colors ${
                          open || scheduled
                            ? 'border-[var(--c-accent)]/50 text-[var(--c-accent)]'
                            : 'border-[var(--c-border)] text-[var(--c-muted)] hover:text-[var(--c-ink)]'
                        }`}
                        onClick={() => setScheduleOpen(open ? null : t)}
                      >
                        ⏱
                      </button>
                    </span>
                  </div>
                  {scheduled && !open && (
                    <p className="mt-1 text-right text-[11px] tabular-nums text-[var(--c-ink-2)]">
                      {contributionSteps(plan, t).map((s, i) => (i === 0 ? fmtCompact(s.annual) : `${fmtCompact(s.annual)} @${s.fromAge}`)).join(' → ')}
                    </p>
                  )}
                  {open && (
                    <div className="mt-2 grid gap-1.5 border-t border-[var(--c-border)] pt-2">
                      <p className="text-[11px] leading-relaxed text-[var(--c-muted)]">
                        The amount above applies from age {plan.profile.currentAge}; each change sets a
                        new level from its age and holds until the next. Everything stops at retirement
                        (age {plan.profile.retireAge}).
                      </p>
                      {changes.map((c) => {
                        const warns = scheduleWarnings.filter((w) => w.accountType === t && w.changeId === c.id);
                        return (
                          <div key={c.id}>
                            <div className={`${rowGrid} grid-cols-[1fr_1.4fr_auto]`}>
                              <NumField label="From age" value={c.fromAge} onChange={(v) => patchChange(t, c.id, { fromAge: Math.round(v) })} />
                              <NumField label="New amount" prefix="$" min={0} value={c.annual} onChange={(v) => patchChange(t, c.id, { annual: v })} />
                              <Btn variant="danger" title="Remove change" onClick={() => setChanges(t, changes.filter((x) => x.id !== c.id))}>✕</Btn>
                            </div>
                            {warns.map((w) => (
                              <p key={w.code} className="mt-0.5 text-[11px] text-[var(--c-bad)]">⚠ {w.message}</p>
                            ))}
                          </div>
                        );
                      })}
                      <div>
                        <Btn onClick={() => addChange(t)}>+ Add change at age…</Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {funding.anyPlanned && (
              <p
                data-testid="funding-status"
                className={`mt-1 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                  funding.first
                    ? 'bg-[var(--c-bad)]/10 text-[var(--c-bad)]'
                    : 'bg-[var(--c-page)] text-[var(--c-ink-2)]'
                }`}
              >
                {funding.first ? (
                  <span>
                    ⚠ {funding.shortYears} of {funding.workingYears} working years can't fund the
                    full plan — first at age {funding.first.age}, where income covers{' '}
                    {fmtCompact(funding.first.funded)} of {fmtCompact(funding.first.planned)} planned.
                  </span>
                ) : (
                  <span>✓ Planned contributions are fully funded from income in every working year.</span>
                )}
                <Help
                  label="contribution funding"
                  text="Contributions come out of each year's income after taxes and spending. When a year falls short (a one-time expense, a lighter income year), the plan contributes what's left and skips the rest — it never borrows. The projection and all charts already reflect this."
                />
              </p>
            )}
            {/* Basis is a tax-nerd concept; it shouldn't ambush someone typing in their
                first balances (F6). */}
            <details
              className="mt-1"
              open={basisOpen}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setBasisOpen(open);
                sessionStorage.setItem('firepath-basis-open', open ? '1' : '0');
              }}
            >
              <summary className="cursor-pointer select-none text-xs font-medium text-[var(--c-ink-2)] hover:text-[var(--c-ink)]">
                Advanced: basis tracking
              </summary>
              <p className="mb-2 mt-1.5 text-[11px] leading-relaxed text-[var(--c-muted)]">
                Used to estimate taxes when you sell taxable shares or withdraw Roth contributions
                early. Fine to leave as-is until you care about tax precision.
              </p>
              <div className={`${rowGrid} grid-cols-2`}>
                <NumField label="Taxable cost basis" prefix="$" min={0} value={plan.taxableCostBasis} onChange={(v) => patch('taxableCostBasis', v)} help="What you paid for the taxable balance — gains above it are taxed on withdrawal." />
                <NumField label="Roth contribution basis" prefix="$" min={0} value={plan.rothBasis} onChange={(v) => patch('rothBasis', v)} help="Lifetime Roth contributions — withdrawable any time without tax or penalty." />
              </div>
            </details>
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
              <div
                key={s.id}
                className={`${rowGrid} grid-cols-2 sm:grid-cols-[1.6fr_0.9fr_1.1fr_0.7fr_0.7fr_0.8fr_auto] ${
                  badStreams.has(s.id) ? 'rounded-lg p-1.5 ring-1 ring-[var(--c-bad)]/60' : ''
                }`}
              >
                <NumTextField label="Name" value={s.name} onChange={(name) => income(s.id, { name })} />
                <Select label="Type" value={s.kind} onChange={(kind) => income(s.id, { kind })} options={[{ value: 'w2', label: 'W-2' }, { value: 'se', label: '1099' }]} />
                <NumField label="Annual" prefix="$" min={0} value={s.annual} onChange={(annual) => income(s.id, { annual })} />
                <NumField label="From" value={s.startAge} onChange={(v) => income(s.id, { startAge: Math.round(v) })} />
                <NumField label="To" value={s.endAge} onChange={(v) => income(s.id, { endAge: Math.round(v) })} help="Inclusive last age" />
                <NumField label="Growth" suffix="%" percent value={s.growth} onChange={(growth) => income(s.id, { growth })} help="Real growth above inflation" />
                <div className="col-span-2 justify-self-end sm:col-span-1 sm:justify-self-auto">
                  <Btn variant="danger" title="Remove" onClick={() => patch('incomes', plan.incomes.filter((i) => i.id !== s.id))}>✕</Btn>
                </div>
              </div>
            ))}
          </div>
          <div className={`${rowGrid} mt-3 grid-cols-2 border-t border-[var(--c-border)] pt-3`}>
            <NumField label="Social Security — you ($/yr)" prefix="$" min={0} value={plan.socialSecurity.annual} onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, annual: v })} help="Your own estimate in today's dollars (e.g., from ssa.gov). 85% is treated as taxable." />
            <NumField label="Your claiming age" value={plan.socialSecurity.claimAge} onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, claimAge: Math.round(v) })} min={62} max={70} slider={[62, 70, 1]} />
            {plan.profile.partnerAge != null && (
              <>
                <NumField
                  label="Social Security — partner ($/yr)"
                  prefix="$"
                  min={0}
                  value={plan.socialSecurity.partner?.annual ?? 0}
                  onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, partner: { claimAge: 67, ...plan.socialSecurity.partner, annual: v } })}
                  help="Begins when your partner reaches their claim age (keyed to their own age, not yours)."
                />
                <NumField
                  label="Partner claiming age"
                  value={plan.socialSecurity.partner?.claimAge ?? 67}
                  onChange={(v) => patch('socialSecurity', { ...plan.socialSecurity, partner: { annual: 0, ...plan.socialSecurity.partner, claimAge: Math.round(v) } })}
                  min={62}
                  max={70}
                  slider={[62, 70, 1]}
                />
              </>
            )}
          </div>
        </Card>

        <Card
          title="Spending"
          subtitle="Phases let retirement spending differ from today's"
          right={<Btn onClick={() => expenses({ phases: [...plan.expenses.phases, { id: uid(), fromAge: plan.profile.retireAge, annual: plan.expenses.currentAnnual }] })}>+ Phase</Btn>}
        >
          <NumField label="Current annual spending" prefix="$" min={0} value={plan.expenses.currentAnnual} onChange={(v) => expenses({ currentAnnual: v })} slider={[0, 300_000, 1_000]} />
          <div className="mt-2 grid gap-2">
            {plan.expenses.phases.map((ph) => (
              <div key={ph.id} className={`${rowGrid} grid-cols-[1fr_1.4fr_auto]`}>
                <NumField label="From age" value={ph.fromAge} onChange={(v) => expenses({ phases: plan.expenses.phases.map((x) => (x.id === ph.id ? { ...x, fromAge: Math.round(v) } : x)) })} />
                <NumField label="Annual spend" prefix="$" min={0} value={ph.annual} onChange={(v) => expenses({ phases: plan.expenses.phases.map((x) => (x.id === ph.id ? { ...x, annual: v } : x)) })} />
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
              <div key={o.id} className={`${rowGrid} grid-cols-2 sm:grid-cols-[1.6fr_0.8fr_1.2fr_auto]`}>
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
            <NumField label="Cash real return" suffix="%" percent value={plan.assumptions.cashReturn} onChange={(v) => assume({ cashReturn: v })} slider={[-3, 3, 0.1]} />
            <NumField label="Stock allocation" suffix="%" percent value={plan.assumptions.stockAllocation} onChange={(v) => assume({ stockAllocation: Math.min(1, Math.max(0, v)) })} slider={[0, 100, 5]} help="Used by historical backtesting and bootstrap Monte Carlo (stocks vs 10-yr Treasuries)." />
            <NumField label="Contribution growth" suffix="%" percent value={plan.assumptions.contributionGrowth} onChange={(v) => assume({ contributionGrowth: v })} slider={[0, 8, 0.25]} help="Real annual growth of planned contributions (savings-rate growth)." />
            <NumField
              label={`FI multiplier (= ${plan.assumptions.fiMultiplier > 0 ? (100 / plan.assumptions.fiMultiplier).toFixed(1) : '—'}% withdrawal rate)`}
              suffix="× spend"
              min={1}
              value={plan.assumptions.fiMultiplier}
              onChange={(v) => assume({ fiMultiplier: v })}
              slider={[15, 40, 0.5]}
              help="25× spending is the 4% rule; 30× is a 3.3% withdrawal rate."
            />
            <p className="col-span-2 rounded-lg bg-[var(--c-page)] p-2.5 text-[11px] leading-relaxed text-[var(--c-ink-2)]">
              💡 All figures are <b>today's dollars</b> and every rate above is <b>real</b> (inflation-adjusted).
              Inflation is already netted out of the model, so there's no inflation knob to turn.
              For reference, the 1871–2024 record at your {allocLabel} stock/bond mix:{' '}
              <b>{(hist.mean * 100).toFixed(1)}% real · σ {(hist.sd * 100).toFixed(1)}%</b> — that's what
              bootstrap Monte Carlo and the backtest replay.
            </p>
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
              <ol className="grid max-w-72 gap-1">
                {plan.tax.withdrawalOrder.map((t, i) => (
                  <li key={t} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--c-border)] px-2 py-1 text-xs">
                    <span><span className="text-[var(--c-muted)]">{i + 1}.</span> {ACCOUNT_LABELS[t]}</span>
                    <span className="flex gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move ${ACCOUNT_LABELS[t]} earlier`}
                        className="rounded px-1 text-[var(--c-muted)] hover:bg-[var(--c-grid)]/40 hover:text-[var(--c-ink)] disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={i === 0}
                        onClick={() => moveWithdrawal(i, -1)}
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${ACCOUNT_LABELS[t]} later`}
                        className="rounded px-1 text-[var(--c-muted)] hover:bg-[var(--c-grid)]/40 hover:text-[var(--c-ink)] disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={i === plan.tax.withdrawalOrder.length - 1}
                        onClick={() => moveWithdrawal(i, 1)}
                      >↓</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-[11px] text-[var(--c-muted)]">
              Not modeled: Roth conversion ladders. Early tax-deferred withdrawals pay the 10%
              penalty here — a conservative simplification for early retirees.
            </p>
          </div>
        </Card>

        <Card
          title="Your milestones"
          subtitle="Personal markers for the timeline"
          right={<Btn onClick={() => patch('milestones', [...plan.milestones, { id: uid(), name: 'New milestone', age: plan.profile.currentAge + 10 }])}>+ Add</Btn>}
        >
          <div className={`${rowGrid} mb-3 grid-cols-2 border-b border-[var(--c-border)] pb-3`}>
            <NumField
              label="Downshift / part-time age"
              value={plan.profile.downshiftAge}
              onChange={(v) => profile({ downshiftAge: Math.round(v) })}
              help="A timeline marker only — model the actual income change in Income streams."
            />
            <p className="self-center text-[11px] text-[var(--c-muted)]">
              🌤️ Shown on the timeline; it doesn't change any money math.
            </p>
          </div>
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
            <StatRow k="FI number" v={sim.incomplete ? '—' : fmtCompact(sim.fiN)} />
            <StatRow k="FI age" v={!sim.incomplete && sim.fiAgeVal != null ? String(sim.fiAgeVal) : '—'} />
            <StatRow k="Savings rate (yr 1)" v={sr != null ? fmtPct(sr) : '—'} />
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
        className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-base outline-none focus:border-[var(--c-accent)] sm:text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
