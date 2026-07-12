// Historical backtest: run the plan starting from every year with enough remaining data,
// exposing sequence-of-returns risk. Runs in the Web Worker.

import { HISTORICAL } from './data/historical';
import { project } from './projection';
import { historicalPortfolio, historicalReturns } from './returns';
import type { PlanInput } from './types';

export interface BacktestStart {
  startYear: number;
  failedAtAge: number | null;
  finalNetWorth: number;
  /** Lowest net worth seen along the way (drawdown severity). */
  minNetWorth: number;
}

export interface BacktestResult {
  horizonYears: number;
  starts: BacktestStart[];
  successRate: number;
  /** Start years ranked worst-first (failures by earliest failure age, then lowest final NW). */
  worst: BacktestStart[];
}

export function runBacktest(plan: PlanInput): BacktestResult {
  const horizon = plan.profile.lifeExpectancy - plan.profile.currentAge + 1;
  const portfolio = historicalPortfolio(plan.assumptions.stockAllocation);
  const starts: BacktestStart[] = [];

  for (let s = 0; s + horizon <= portfolio.length; s++) {
    const proj = project(plan, historicalReturns(portfolio, s));
    starts.push({
      startYear: HISTORICAL[s].year,
      failedAtAge: proj.failedAtAge,
      finalNetWorth: proj.finalNetWorth,
      minNetWorth: Math.min(...proj.rows.map((r) => r.netWorth)),
    });
  }

  const successes = starts.filter((s) => s.failedAtAge === null).length;
  const worst = [...starts].sort((a, b) => {
    if ((a.failedAtAge === null) !== (b.failedAtAge === null)) return a.failedAtAge === null ? 1 : -1;
    if (a.failedAtAge !== null && b.failedAtAge !== null && a.failedAtAge !== b.failedAtAge) {
      return a.failedAtAge - b.failedAtAge;
    }
    return a.finalNetWorth - b.finalNetWorth;
  });

  return {
    horizonYears: horizon,
    starts,
    successRate: starts.length ? successes / starts.length : 0,
    worst: worst.slice(0, 10),
  };
}
