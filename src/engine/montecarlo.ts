// Monte Carlo driver — pure, deterministic given a seed. Split into init/run/finish so
// the Web Worker can process runs in abortable chunks; runMonteCarlo composes them.

import { project } from './projection';
import { bootstrapReturns, historicalPortfolio, mulberry32, normalReturns } from './returns';
import type { PlanInput } from './types';

export const MC_MIN_RUNS = 500;
export const MC_MAX_RUNS = 10_000;
export const MC_DEFAULT_RUNS = 5_000;
export const DEFAULT_SEED = 20260712;

export const PERCENTILES = [10, 25, 50, 75, 90] as const;
export type Percentile = (typeof PERCENTILES)[number];

export interface McResult {
  runs: number;
  successRate: number;
  /** bands[p][i] = p-th percentile of net worth in simulated year i. */
  bands: Record<Percentile, number[]>;
  ages: number[];
  /** Final net worth of every run (for the outcome distribution). */
  finalNetWorths: number[];
  medianFinal: number;
}

export interface McAccumulator {
  runs: number;
  seed: number;
  perYear: number[][];
  finals: number[];
  successes: number;
}

export function mcInit(plan: PlanInput, runs?: number, seed = DEFAULT_SEED): McAccumulator {
  const n = Math.min(MC_MAX_RUNS, Math.max(MC_MIN_RUNS, runs ?? plan.mc.runs));
  const horizon = plan.profile.lifeExpectancy - plan.profile.currentAge + 1;
  return {
    runs: n,
    seed,
    perYear: Array.from({ length: horizon }, () => new Array<number>(n)),
    finals: new Array<number>(n),
    successes: 0,
  };
}

/** Simulate runs [from, to) into the accumulator. Deterministic per run index. */
export function mcRun(plan: PlanInput, acc: McAccumulator, from: number, to: number): void {
  const horizon = acc.perYear.length;
  const { expReturn, returnSd, stockAllocation } = plan.assumptions;
  const portfolio = plan.mc.mode === 'bootstrap' ? historicalPortfolio(stockAllocation) : [];

  for (let i = from; i < to; i++) {
    const rng = mulberry32(acc.seed + i * 7919);
    const gen = plan.mc.mode === 'bootstrap'
      ? bootstrapReturns(portfolio, horizon, rng)
      : normalReturns(expReturn, returnSd, rng);
    const proj = project(plan, gen);
    if (proj.failedAtAge === null) acc.successes++;
    acc.finals[i] = proj.finalNetWorth;
    for (let y = 0; y < horizon; y++) acc.perYear[y][i] = proj.rows[y].netWorth;
  }
}

export function mcFinish(plan: PlanInput, acc: McAccumulator): McResult {
  const bands = { 10: [], 25: [], 50: [], 75: [], 90: [] } as Record<Percentile, number[]>;
  for (const year of acc.perYear) {
    year.sort((a, b) => a - b);
    for (const p of PERCENTILES) bands[p].push(quantileOfSorted(year, p / 100));
  }
  const sortedFinals = [...acc.finals].sort((a, b) => a - b);
  return {
    runs: acc.runs,
    successRate: acc.successes / acc.runs,
    bands,
    ages: acc.perYear.map((_, i) => plan.profile.currentAge + i),
    finalNetWorths: acc.finals,
    medianFinal: quantileOfSorted(sortedFinals, 0.5),
  };
}

export function runMonteCarlo(
  plan: PlanInput,
  opts: { runs?: number; seed?: number } = {},
): McResult {
  const acc = mcInit(plan, opts.runs, opts.seed);
  mcRun(plan, acc, 0, acc.runs);
  return mcFinish(plan, acc);
}

export function quantileOfSorted(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
