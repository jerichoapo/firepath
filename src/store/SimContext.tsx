// Runs the deterministic projection synchronously (it's instant) and farms Monte Carlo +
// backtest out to the Web Worker, debounced, with results cached by scenario version.

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { BacktestResult } from '../engine/backtest';
import {
  allMilestones, coastFireAge, currentNetWorth, fiAge, fiNumber, isCoastFireNow, type Milestone,
} from '../engine/metrics';
import type { McResult } from '../engine/montecarlo';
import { project } from '../engine/projection';
import { fixedReturns } from '../engine/returns';
import type { PlanInput, ProjectionResult, Scenario } from '../engine/types';
import type { SimRequest, SimResponse } from '../workers/sim.worker';
import { usePlanStore } from './PlanContext';

let worker: Worker | null = null;
let nextId = 1;
export function getSimWorker(): Worker {
  worker ??= new Worker(new URL('../workers/sim.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export function postSim(req: Omit<SimRequest, 'id'>): number {
  const id = nextId++;
  getSimWorker().postMessage({ ...req, id });
  return id;
}

const mcCache = new Map<string, McResult>();
const btCache = new Map<string, BacktestResult>();
function remember<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

export interface SimState {
  plan: PlanInput;
  proj: ProjectionResult;
  fiN: number;
  fiAgeVal: number | null;
  coastNow: boolean;
  coastAgeVal: number | null;
  netWorthNow: number;
  milestones: Milestone[];
  mc: McResult | null;
  mcProgress: number;
  backtest: BacktestResult | null;
}

const Ctx = createContext<SimState | null>(null);

export function SimProvider({ children }: { children: ReactNode }) {
  const { active, plan } = usePlanStore();
  const version = `${active.id}:${active.updatedAt}:${plan.mc.runs}:${plan.mc.mode}`;

  const deterministic = useMemo(() => {
    const proj = project(plan, fixedReturns(plan.assumptions.expReturn));
    return {
      proj,
      fiN: fiNumber(plan),
      fiAgeVal: fiAge(plan, proj),
      coastNow: isCoastFireNow(plan),
      coastAgeVal: coastFireAge(plan, proj),
      netWorthNow: currentNetWorth(plan),
      milestones: allMilestones(plan, proj),
    };
  }, [plan]);

  const [mc, setMc] = useState<McResult | null>(null);
  const [mcProgress, setMcProgress] = useState(0);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);

  useEffect(() => {
    const cachedMc = mcCache.get(version);
    const cachedBt = btCache.get(version);
    setMc(cachedMc ?? null);
    setBacktest(cachedBt ?? null);
    if (cachedMc && cachedBt) return;

    let mcId = 0;
    let btId = 0;
    const onMessage = (e: MessageEvent<SimResponse>) => {
      const msg = e.data;
      if (msg.kind === 'progress' && msg.id === mcId) setMcProgress(msg.done / msg.total);
      if (msg.kind === 'mc' && msg.id === mcId) {
        remember(mcCache, version, msg.result);
        setMc(msg.result);
        setMcProgress(1);
      }
      if (msg.kind === 'backtest' && msg.id === btId) {
        remember(btCache, version, msg.result);
        setBacktest(msg.result);
      }
    };
    getSimWorker().addEventListener('message', onMessage);
    const timer = window.setTimeout(() => {
      setMcProgress(0);
      if (!cachedMc) mcId = postSim({ kind: 'mc', plan });
      if (!cachedBt) btId = postSim({ kind: 'backtest', plan });
    }, 400);
    return () => {
      clearTimeout(timer);
      getSimWorker().removeEventListener('message', onMessage);
    };
  }, [version, plan]);

  const value = useMemo<SimState>(
    () => ({ plan, ...deterministic, mc, mcProgress, backtest }),
    [plan, deterministic, mc, mcProgress, backtest],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSim(): SimState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSim outside SimProvider');
  return ctx;
}

const scenarioKey = (s: Scenario) => `${s.id}:${s.updatedAt}:${s.plan.mc.runs}:${s.plan.mc.mode}`;

/** Monte Carlo results for many scenarios at once (compare view), cached + progressive. */
export function useScenarioMcs(scenarios: Scenario[]): Record<string, McResult | null> {
  const [results, setResults] = useState<Record<string, McResult | null>>({});
  const keys = scenarios.map(scenarioKey).join('|');

  useEffect(() => {
    const pending = new Map<number, { id: string; key: string }>();
    const initial: Record<string, McResult | null> = {};
    for (const s of scenarios) {
      const cached = mcCache.get(scenarioKey(s));
      initial[s.id] = cached ?? null;
      if (!cached) {
        const reqId = postSim({ kind: 'mc', plan: s.plan, channel: `cmp:${s.id}` });
        pending.set(reqId, { id: s.id, key: scenarioKey(s) });
      }
    }
    setResults(initial);
    if (pending.size === 0) return;

    const onMessage = (e: MessageEvent<SimResponse>) => {
      const msg = e.data;
      if (msg.kind !== 'mc') return;
      const target = pending.get(msg.id);
      if (!target) return;
      remember(mcCache, target.key, msg.result);
      setResults((prev) => ({ ...prev, [target.id]: msg.result }));
    };
    getSimWorker().addEventListener('message', onMessage);
    return () => getSimWorker().removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return results;
}
