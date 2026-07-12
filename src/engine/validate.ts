// Plan validity — pure checks that gate what the UI is allowed to claim.
// 'incomplete' = the plan can't be judged yet (FI metrics would be vacuously true).
// 'invalid'    = inputs contradict themselves; the engine would compute nonsense.

import { fiNumber } from './metrics';
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type PlanInput } from './types';

export type IssueLevel = 'incomplete' | 'invalid';
export type IssueCode = 'no-spending' | 'life-expectancy' | 'stream-ages' | 'negative-balance';

export interface PlanIssue {
  level: IssueLevel;
  code: IssueCode;
  message: string;
  /** Offending income stream, when the issue concerns one. */
  streamId?: string;
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

  return issues;
}

export const isIncomplete = (issues: PlanIssue[]): boolean =>
  issues.some((i) => i.level === 'incomplete');
