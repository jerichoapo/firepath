// First-run seed persona and the blank plan (DECISIONS.md D15).
// The seed is deliberately generic — it exists so the app demos itself.

import { MC_DEFAULT_RUNS } from './montecarlo';
import type { PlanInput, Scenario } from './types';

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;

export const DEFAULT_WITHDRAWAL_ORDER: PlanInput['tax']['withdrawalOrder'] =
  ['taxable', 'trad', 'roth', 'hsa'];

export function blankPlan(startYear: number): PlanInput {
  return {
    profile: { currentAge: 30, partnerAge: null, downshiftAge: 50, retireAge: 60, lifeExpectancy: 92 },
    planStartYear: startYear,
    accounts: {
      taxable: { balance: 0, contribution: 0 },
      trad: { balance: 0, contribution: 0 },
      roth: { balance: 0, contribution: 0 },
      hsa: { balance: 0, contribution: 0 },
      cash: { balance: 0, contribution: 0 },
    },
    taxableCostBasis: 0,
    rothBasis: 0,
    incomes: [],
    socialSecurity: { annual: 0, claimAge: 67 },
    expenses: { currentAnnual: 0, phases: [], oneTimes: [] },
    assumptions: {
      expReturn: 0.05,
      returnSd: 0.16,
      inflation: 0.025,
      cashReturn: 0,
      stockAllocation: 0.8,
      contributionGrowth: 0,
      fiMultiplier: 25,
    },
    tax: {
      filingStatus: 'single',
      stateMode: 'none',
      stateFlatRate: 0.05,
      stateBrackets: [{ upTo: Infinity, rate: 0.05 }],
      stateStdDeduction: 0,
      withdrawalOrder: [...DEFAULT_WITHDRAWAL_ORDER],
    },
    mc: { runs: MC_DEFAULT_RUNS, mode: 'normal' },
    milestones: [],
  };
}

export function seedPlan(startYear: number): PlanInput {
  return {
    ...blankPlan(startYear),
    profile: { currentAge: 35, partnerAge: 34, downshiftAge: 50, retireAge: 55, lifeExpectancy: 92 },
    accounts: {
      taxable: { balance: 120_000, contribution: 18_000 },
      // The 401(k) schedule demos D28, matching the part-time downshift income at 50:
      // full contributions while both salaries run, a lighter level in the coast years.
      trad: { balance: 210_000, contribution: 32_000, changes: [{ id: uid(), fromAge: 50, annual: 10_000 }] },
      roth: { balance: 60_000, contribution: 14_000 },
      hsa: { balance: 18_000, contribution: 8_000 },
      cash: { balance: 30_000, contribution: 0 },
    },
    taxableCostBasis: 90_000,
    rothBasis: 45_000,
    incomes: [
      { id: uid(), name: 'Salary — you', kind: 'w2', annual: 95_000, startAge: 35, endAge: 49, growth: 0.01 },
      { id: uid(), name: 'Salary — partner', kind: 'w2', annual: 60_000, startAge: 35, endAge: 49, growth: 0.01 },
      { id: uid(), name: 'Consulting (1099)', kind: 'se', annual: 12_000, startAge: 35, endAge: 44, growth: 0 },
      { id: uid(), name: 'Part-time downshift', kind: 'w2', annual: 35_000, startAge: 50, endAge: 54, growth: 0 },
    ],
    // Split household estimate: partner is a year younger, so their benefit lands a year later.
    socialSecurity: { annual: 24_000, claimAge: 67, partner: { annual: 18_000, claimAge: 67 } },
    expenses: {
      currentAnnual: 72_000,
      phases: [
        { id: uid(), fromAge: 55, annual: 80_000 },
        { id: uid(), fromAge: 70, annual: 65_000 },
      ],
      oneTimes: [
        { id: uid(), name: 'Home down payment', age: 38, amount: 90_000 },
        { id: uid(), name: 'College fund — kid', age: 53, amount: 120_000 },
      ],
    },
    tax: {
      filingStatus: 'married',
      stateMode: 'flat',
      stateFlatRate: 0.05,
      stateBrackets: [{ upTo: Infinity, rate: 0.05 }],
      stateStdDeduction: 8_000,
      withdrawalOrder: [...DEFAULT_WITHDRAWAL_ORDER],
    },
    milestones: [
      { id: uid(), name: 'Kid starts college', age: 53 },
      { id: uid(), name: 'Mortgage paid off', age: 62 },
    ],
  };
}

/** Fixed categorical palette for scenario identity (validated slots, in order). */
export const SCENARIO_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834', '#008300'];

/** First palette slot not yet in use — color follows the scenario, never its index (D25). */
export function nextColor(used: string[]): string {
  return SCENARIO_COLORS.find((c) => !used.includes(c)) ?? SCENARIO_COLORS[used.length % SCENARIO_COLORS.length];
}

export const makeScenario = (name: string, plan: PlanInput, color: string = SCENARIO_COLORS[0]): Scenario => ({
  id: uid(),
  name,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  color,
  plan,
});
