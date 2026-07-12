// Derived plan metrics — pure functions of the plan + a projection (never stored).

import { spendingAtAge } from './projection';
import { rmdStartAge } from './taxConfig';
import type { PlanInput, ProjectionResult } from './types';

export const currentNetWorth = (plan: PlanInput): number =>
  Object.values(plan.accounts).reduce((s, a) => s + a.balance, 0);

export const currentInvested = (plan: PlanInput): number =>
  currentNetWorth(plan) - plan.accounts.cash.balance;

/** FI number = spending in the first year of full retirement × multiplier (D10). */
export const fiNumber = (plan: PlanInput): number =>
  spendingAtAge(plan, plan.profile.retireAge) * plan.assumptions.fiMultiplier;

/** Invested assets needed *today* to coast to the FI number by retirement age. */
export function coastNumberAt(plan: PlanInput, age: number): number {
  const yearsLeft = Math.max(0, plan.profile.retireAge - age);
  return fiNumber(plan) / (1 + plan.assumptions.expReturn) ** yearsLeft;
}

export const isCoastFireNow = (plan: PlanInput): boolean =>
  currentInvested(plan) >= coastNumberAt(plan, plan.profile.currentAge);

/** First age where invested assets reach the FI number in a projection (null = never). */
export function fiAge(plan: PlanInput, proj: ProjectionResult): number | null {
  const target = fiNumber(plan);
  if (currentInvested(plan) >= target) return plan.profile.currentAge;
  return proj.rows.find((r) => r.invested >= target)?.age ?? null;
}

/** First age where the projection crosses its coast threshold (null = never). */
export function coastFireAge(plan: PlanInput, proj: ProjectionResult): number | null {
  if (isCoastFireNow(plan)) return plan.profile.currentAge;
  return proj.rows.find((r) => r.age <= plan.profile.retireAge && r.invested >= coastNumberAt(plan, r.age))
    ?.age ?? null;
}

export interface Milestone {
  name: string;
  age: number | null;
  kind: 'computed' | 'user';
  emoji: string;
}

/** All milestones for the timeline: computed ones + user-defined ones, age order. */
export function allMilestones(plan: PlanInput, proj: ProjectionResult): Milestone[] {
  const { profile } = plan;
  const birthYear = plan.planStartYear - profile.currentAge;
  const items: Milestone[] = [
    { name: 'Coast FIRE reached', age: coastFireAge(plan, proj), kind: 'computed', emoji: '⛵' },
    { name: 'FI number reached', age: fiAge(plan, proj), kind: 'computed', emoji: '🔥' },
    { name: 'Downshift', age: profile.downshiftAge, kind: 'computed', emoji: '🌤️' },
    { name: 'Full retirement', age: profile.retireAge, kind: 'computed', emoji: '🏝️' },
    { name: 'Social Security begins', age: plan.socialSecurity.annual > 0 ? plan.socialSecurity.claimAge : null, kind: 'computed', emoji: '🏛️' },
    { name: 'RMDs begin', age: plan.accounts.trad.balance > 0 || plan.accounts.trad.contribution > 0 ? rmdStartAge(birthYear) : null, kind: 'computed', emoji: '📜' },
    ...plan.milestones.map((m) => ({ name: m.name, age: m.age, kind: 'user' as const, emoji: '📍' })),
  ];
  return items
    .filter((m) => m.age !== null && m.age >= profile.currentAge && m.age <= profile.lifeExpectancy)
    .sort((a, b) => (a.age! - b.age!));
}
