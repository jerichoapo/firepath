// Simulation Web Worker: Monte Carlo (in abortable chunks) + historical backtest.
// A newer request of the same kind supersedes an in-flight one between chunks.

import { runBacktest, type BacktestResult } from '../engine/backtest';
import { mcFinish, mcInit, mcRun, type McResult } from '../engine/montecarlo';
import type { PlanInput } from '../engine/types';

export type SimRequest =
  | { id: number; kind: 'mc'; plan: PlanInput; seed?: number; channel?: string }
  | { id: number; kind: 'backtest'; plan: PlanInput; channel?: string };

export type SimResponse =
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'mc'; result: McResult }
  | { id: number; kind: 'backtest'; result: BacktestResult };

const MC_CHUNK = 500;
const latest: Record<string, number> = {};
const yieldToQueue = () => new Promise<void>((r) => setTimeout(r, 0));

self.onmessage = async (e: MessageEvent<SimRequest>) => {
  const req = e.data;
  const channel = req.channel ?? req.kind;
  latest[channel] = req.id;
  const post = (msg: SimResponse) => self.postMessage(msg);

  if (req.kind === 'backtest') {
    post({ id: req.id, kind: 'backtest', result: runBacktest(req.plan) });
    return;
  }

  const acc = mcInit(req.plan, undefined, req.seed);
  for (let from = 0; from < acc.runs; from += MC_CHUNK) {
    mcRun(req.plan, acc, from, Math.min(acc.runs, from + MC_CHUNK));
    post({ id: req.id, kind: 'progress', done: Math.min(acc.runs, from + MC_CHUNK), total: acc.runs });
    await yieldToQueue();
    if (latest[channel] !== req.id) return; // superseded — drop this job
  }
  post({ id: req.id, kind: 'mc', result: mcFinish(req.plan, acc) });
};
