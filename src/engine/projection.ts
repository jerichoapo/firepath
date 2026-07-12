// The single year-by-year projection loop. Deterministic, Monte Carlo, and backtest
// modes all run THIS function with different ReturnGenerators.
//
// Order of operations per simulated year (DECISIONS.md D4, D7–D9):
//   1. RMD is forced out of tax-deferred first (ordinary income, cash inflow).
//   2. Earned income + Social Security arrive; pre-tax contributions reduce them.
//   3. Taxes and the withdrawal gross-up are solved by fixed-point iteration:
//      shortfalls draw cash first, then the configured account order.
//   4. After-tax contributions are funded from surplus (scaled down if it's short);
//      anything left over sweeps into the taxable account.
//   5. Returns are applied to end-of-flow balances (contributions earn a full year).

import { federalTax, payrollTax, stateTax } from './tax';
import {
  EARLY_WITHDRAWAL_PENALTY, PENALTY_FREE_AGE, SS_TAXABLE_SHARE, rmdDivisor, rmdStartAge,
} from './taxConfig';
import type {
  AccountType, PlanInput, ProjectionResult, ReturnGenerator, TaxesPaid, YearRow,
} from './types';

/** Tax/withdrawal fixed point stops when the tax estimate moves less than this. */
const TAX_TOLERANCE = 0.01;
const MAX_TAX_ITERATIONS = 40;
/** A year "fails" when more spending than this goes unfunded. */
const FAILURE_TOLERANCE = 1;

const zeroByAccount = (): Record<AccountType, number> =>
  ({ taxable: 0, trad: 0, roth: 0, hsa: 0, cash: 0 });

export function spendingAtAge(plan: PlanInput, age: number): number {
  let spend = plan.expenses.currentAnnual;
  for (const p of [...plan.expenses.phases].sort((a, b) => a.fromAge - b.fromAge)) {
    if (age >= p.fromAge) spend = p.annual;
  }
  return spend;
}

export function project(plan: PlanInput, returns: ReturnGenerator): ProjectionResult {
  const { profile, assumptions, tax, socialSecurity: ss } = plan;
  const birthYear = plan.planStartYear - profile.currentAge;
  const rmdAge = rmdStartAge(birthYear);

  const bal = zeroByAccount();
  for (const t of Object.keys(bal) as AccountType[]) bal[t] = plan.accounts[t].balance;
  let taxableBasis = Math.min(plan.taxableCostBasis, bal.taxable);
  let rothBasis = Math.min(plan.rothBasis, bal.roth);

  const rows: YearRow[] = [];
  let failedAtAge: number | null = null;

  for (let age = profile.currentAge; age <= profile.lifeExpectancy; age++) {
    const yearIndex = age - profile.currentAge;
    const portfolioReturn = returns(yearIndex);

    // --- 1. RMD (forced distribution, becomes ordinary income + cash inflow)
    let rmd = 0;
    if (age >= rmdAge && bal.trad > 0) {
      rmd = bal.trad / rmdDivisor(age);
      bal.trad -= rmd;
    }

    // --- 2. Income and planned contributions
    const incomeByStream: Record<string, number> = {};
    let w2 = 0;
    let se = 0;
    for (const s of plan.incomes) {
      if (age < s.startAge || age > s.endAge) continue;
      const amount = s.annual * (1 + s.growth) ** (age - Math.max(s.startAge, profile.currentAge));
      incomeByStream[s.id] = amount;
      if (s.kind === 'w2') w2 += amount;
      else se += amount;
    }
    const earned = w2 + se;
    // Partner SS is keyed to the partner's own age: they are (currentAge − partnerAge)
    // years younger, so their benefit begins when age − gap reaches their claim age (D21).
    const partnerSs =
      profile.partnerAge != null && ss.partner != null &&
      age - (profile.currentAge - profile.partnerAge) >= ss.partner.claimAge
        ? ss.partner.annual
        : 0;
    const ssIncome = (age >= ss.claimAge ? ss.annual : 0) + partnerSs;

    const contribScale =
      age >= profile.retireAge ? 0 : (1 + assumptions.contributionGrowth) ** yearIndex;
    const planned = zeroByAccount();
    for (const t of Object.keys(planned) as AccountType[]) {
      planned[t] = plan.accounts[t].contribution * contribScale;
    }
    // Pre-tax contributions can't exceed earned income; scale trad+hsa down together.
    const pretaxPlanned = planned.trad + planned.hsa;
    const pretaxScale = pretaxPlanned > 0 ? Math.min(1, earned / pretaxPlanned) : 0;
    const pretaxContrib = pretaxPlanned * pretaxScale;
    const afterTaxPlanned = planned.taxable + planned.roth + planned.cash;

    const { fica, halfSeDeduction } = payrollTax(w2, se);

    // --- 3. Spending for the year
    const oneTimeNet = plan.expenses.oneTimes
      .filter((o) => o.age === age)
      .reduce((s, o) => s + o.amount, 0);
    const spending = spendingAtAge(plan, age);
    const outflow = spending + oneTimeNet;

    const baseInflow = earned - pretaxContrib + ssIncome + rmd;
    const ordinaryBase =
      Math.max(0, earned - pretaxContrib - halfSeDeduction) + SS_TAXABLE_SHARE * ssIncome + rmd;
    const early = age < PENALTY_FREE_AGE;

    // --- 4. Fixed point: taxes ↔ withdrawals ↔ contribution funding
    const withdrawals = zeroByAccount();
    let realizedGains = 0;
    let rothBasisUsed = 0;
    let rothEarningsOut = 0;
    let contribFactor = 0;
    let leftover = 0;
    let unfunded = 0;
    let taxes: TaxesPaid = { federal: 0, state: 0, fica, penalties: 0, total: fica };

    for (let iter = 0; iter < MAX_TAX_ITERATIONS; iter++) {
      const ordinaryIncome =
        ordinaryBase + withdrawals.trad + (early ? rothEarningsOut : 0);
      const incomes = { ordinaryIncome, ltcgIncome: realizedGains };
      const penalties = early
        ? EARLY_WITHDRAWAL_PENALTY * (withdrawals.trad + rothEarningsOut)
        : 0;
      const next: TaxesPaid = {
        federal: federalTax(incomes, tax.filingStatus),
        state: stateTax(incomes, tax),
        fica,
        penalties,
        total: 0,
      };
      next.total = next.federal + next.state + next.fica + next.penalties;
      const converged = Math.abs(next.total - taxes.total) < TAX_TOLERANCE && iter > 0;
      taxes = next;

      const net = baseInflow - taxes.total - outflow;
      for (const t of Object.keys(withdrawals) as AccountType[]) withdrawals[t] = 0;
      realizedGains = rothBasisUsed = rothEarningsOut = 0;
      contribFactor = leftover = unfunded = 0;

      if (net >= 0) {
        contribFactor = afterTaxPlanned > 0 ? Math.min(1, net / afterTaxPlanned) : 0;
        leftover = net - afterTaxPlanned * contribFactor;
      } else {
        // Withdraw to cover the gap: cash first, then the configured order.
        let need = -net;
        withdrawals.cash = Math.min(bal.cash, need);
        need -= withdrawals.cash;
        for (const t of tax.withdrawalOrder) {
          if (need <= 0) break;
          const take = Math.min(bal[t], need);
          withdrawals[t] = take;
          need -= take;
          if (t === 'taxable' && bal.taxable > 0) {
            realizedGains = take * Math.max(0, 1 - taxableBasis / bal.taxable);
          } else if (t === 'roth') {
            rothBasisUsed = Math.min(take, rothBasis);
            rothEarningsOut = take - rothBasisUsed;
          }
        }
        unfunded = need;
      }
      if (converged) break;
    }

    // --- 5. Apply flows to balances
    for (const t of Object.keys(withdrawals) as AccountType[]) bal[t] -= withdrawals[t];
    if (withdrawals.taxable > 0) {
      taxableBasis = Math.max(0, taxableBasis - (withdrawals.taxable - realizedGains));
    }
    rothBasis -= rothBasisUsed;

    const contributions = zeroByAccount();
    contributions.trad = planned.trad * pretaxScale;
    contributions.hsa = planned.hsa * pretaxScale;
    contributions.taxable = planned.taxable * contribFactor;
    contributions.roth = planned.roth * contribFactor;
    contributions.cash = planned.cash * contribFactor;
    for (const t of Object.keys(contributions) as AccountType[]) bal[t] += contributions[t];
    bal.taxable += leftover;
    taxableBasis += contributions.taxable + leftover;
    rothBasis += contributions.roth;

    // --- 6. Growth on end-of-flow balances
    for (const t of ['taxable', 'trad', 'roth', 'hsa'] as const) {
      bal[t] *= 1 + portfolioReturn;
      if (bal[t] < 0) bal[t] = 0;
    }
    bal.cash *= 1 + assumptions.cashReturn;
    // Basis is NOT capped at balance: after a down year, untouched basis persists and
    // shelters the recovery — the annual-model analogue of a capital-loss carryforward.

    const failed = unfunded > FAILURE_TOLERANCE;
    if (failed && failedAtAge === null) failedAtAge = age;

    const invested = bal.taxable + bal.trad + bal.roth + bal.hsa;
    rows.push({
      age,
      year: plan.planStartYear + yearIndex,
      balances: { ...bal },
      netWorth: invested + bal.cash,
      invested,
      incomeByStream,
      socialSecurity: ssIncome,
      rmd,
      grossIncome: earned + ssIncome + rmd,
      taxes,
      spending,
      oneTimeNet,
      contributions,
      leftoverToTaxable: leftover,
      withdrawals,
      unfundedSpending: unfunded,
      failed,
    });
  }

  return { rows, failedAtAge, finalNetWorth: rows[rows.length - 1]?.netWorth ?? 0 };
}
