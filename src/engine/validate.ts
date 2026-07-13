// Plan validity — pure checks that gate what the UI is allowed to claim.
// 'incomplete' = the plan can't be judged yet (FI metrics would be vacuously true).
// 'invalid'    = inputs contradict themselves; the engine would compute nonsense.
// 'warning'    = the engine copes (it sorts/shadows/ignores), but part of the input is
//                inert and the user probably didn't mean that. Rendered inline, in place.

import { fiNumber } from './metrics';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountType, type PlanInput } from './types';

export type IssueLevel = 'incomplete' | 'invalid' | 'warning';
export type IssueCode =
  | 'no-spending' | 'life-expectancy' | 'stream-ages' | 'negative-balance'
  | 'change-after-retirement' | 'change-in-past' | 'change-duplicate-age';

export interface PlanIssue {
  level: IssueLevel;
  code: IssueCode;
  message: string;
  /** Offending income stream, when the issue concerns one. */
  streamId?: string;
  /** Offending account + contribution change, when the issue concerns a schedule. */
  accountType?: AccountType;
  changeId?: string;
}

export function planIssues(plan: PlanInput): PlanIssue[] {
  const issues: PlanIssue[] = [];

  // With no retirement spending the FI number is $0, so "FI reached", "Coast FIRE"
  // and "100% success" are all trivially true — suppress them instead (D19).
  if (fiNumber(plan) <= 0) {
    issues.push({
      level: 'incomplete',
      code: 'no-spending',
      message: 'Add annual spending to size your FI number — success metrics stay hidden until then.',
    });
  }

  if (plan.profile.lifeExpectancy <= plan.profile.currentAge) {
    issues.push({
      level: 'invalid',
      code: 'life-expectancy',
      message: 'Life expectancy must be greater than your current age — there are no years to simulate.',
    });
  }

  for (const s of plan.incomes) {
    if (s.endAge < s.startAge) {
      issues.push({
        level: 'invalid',
        code: 'stream-ages',
        message: `"${s.name}" ends at ${s.endAge}, before it starts at ${s.startAge} — it contributes nothing.`,
        streamId: s.id,
      });
    }
  }

  for (const t of ACCOUNT_TYPES) {
    if (plan.accounts[t].balance < 0) {
      issues.push({
        level: 'invalid',
        code: 'negative-balance',
        message: `${ACCOUNT_LABELS[t]} balance is negative — debts aren't modeled; balances must be ≥ $0.`,
      });
    }
  }
  if (plan.taxableCostBasis < 0 || plan.rothBasis < 0) {
    issues.push({
      level: 'invalid',
      code: 'negative-balance',
      message: 'Cost basis must be ≥ $0.',
    });
  }

  // Contribution schedules (D28): the engine shadows/ignores these safely, but an inert
  // change is almost certainly a typo — warn at the row it concerns.
  for (const t of ACCOUNT_TYPES) {
    const changes = plan.accounts[t].changes ?? [];
    const seenAges = new Map<number, string>();
    for (const c of changes) {
      if (c.fromAge >= plan.profile.retireAge) {
        issues.push({
          level: 'warning',
          code: 'change-after-retirement',
          message: `Never takes effect — contributions stop at retirement (age ${plan.profile.retireAge}).`,
          accountType: t,
          changeId: c.id,
        });
      } else if (c.fromAge <= plan.profile.currentAge) {
        issues.push({
          level: 'warning',
          code: 'change-in-past',
          message: `At or before your current age (${plan.profile.currentAge}) — ignored; edit the base amount instead.`,
          accountType: t,
          changeId: c.id,
        });
      }
      const dup = seenAges.get(c.fromAge);
      if (dup !== undefined) {
        issues.push({
          level: 'warning',
          code: 'change-duplicate-age',
          message: `Two changes at age ${c.fromAge} — this later one wins.`,
          accountType: t,
          changeId: c.id,
        });
      }
      seenAges.set(c.fromAge, c.id);
    }
  }

  return issues;
}

export const isIncomplete = (issues: PlanIssue[]): boolean =>
  issues.some((i) => i.level === 'incomplete');
