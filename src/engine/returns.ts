// Return generators: one deterministic, two stochastic, one historical.
// All produce REAL annual portfolio returns consumed by project() (see types.ts).

import type { ReturnGenerator } from './types';
import { HISTORICAL, type HistoricalYear } from './data/historical';

/** Years per sampled block in bootstrap mode — long enough to preserve momentum/streaks. */
export const BOOTSTRAP_BLOCK_YEARS = 5;

/** mulberry32: tiny seedable PRNG, plenty good for simulation reproducibility. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export const fixedReturns = (r: number): ReturnGenerator => () => r;

export function normalReturns(mean: number, sd: number, rng: () => number): ReturnGenerator {
  return () => mean + sd * gaussian(rng);
}

/** Real return of a stock/bond portfolio for each historical year, in year order. */
export function historicalPortfolio(stockAllocation: number, data: HistoricalYear[] = HISTORICAL): number[] {
  return data.map((d) => stockAllocation * d.stock + (1 - stockAllocation) * d.bond);
}

/** Mean and sample σ of the blended historical record — what bootstrap/backtest implicitly assume. */
export function portfolioStats(stockAllocation: number, data: HistoricalYear[] = HISTORICAL): { mean: number; sd: number } {
  const r = historicalPortfolio(stockAllocation, data);
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1));
  return { mean, sd };
}

/** Historical sequence starting at index `start` (for backtesting). */
export function historicalReturns(portfolio: number[], start: number): ReturnGenerator {
  return (i) => portfolio[start + i];
}

/**
 * Block bootstrap: stitch randomly-chosen BOOTSTRAP_BLOCK_YEARS-long slices of the
 * historical portfolio series, preserving multi-year momentum within each block.
 */
export function bootstrapReturns(portfolio: number[], horizon: number, rng: () => number): ReturnGenerator {
  const seq: number[] = [];
  while (seq.length < horizon) {
    const start = Math.floor(rng() * (portfolio.length - BOOTSTRAP_BLOCK_YEARS + 1));
    seq.push(...portfolio.slice(start, start + BOOTSTRAP_BLOCK_YEARS));
  }
  return (i) => seq[i];
}
