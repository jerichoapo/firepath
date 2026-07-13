// The input-efficacy matrix (D29): every leaf field of PlanInput carries an explicit
// classification — EFFECTIVE (perturbing it must move a named observable), INERT
// (documented why it is allowed to change nothing), or IDENTITY (referential ids).
//
// The coverage test enumerates the actual shape of the seed plan and fails on any
// unclassified field, so a future input cannot ship dead: adding a field forces a
// declaration of what it does, and a wiring regression (a field that stops mattering)
// fails the suite. `frozen` lists are the scope-isolation guarantees — the subtle bugs,
// like volatility moving the deterministic path or stock allocation leaking into
// normal-mode Monte Carlo.

import { describe, expect, it } from 'vitest';
import { runBacktest } from './backtest';
import { allMilestones, coastNumberAt, fiNumber } from './metrics';
import { runMonteCarlo } from './montecarlo';
import { project } from './projection';
import { fixedReturns } from './returns';
import { seedPlan } from './seed';
import { ACCOUNT_TYPES, type PlanInput } from './types';

const START_YEAR = 2026;

type ObservableKey =
  | 'det'          // deterministic projection rows (the workhorse)
  | 'metrics'      // fiNumber + coast number — derived, not part of the projection
  | 'mcNormal'     // Monte Carlo, normal mode (μ/σ inputs)
  | 'mcBootstrap'  // Monte Carlo, bootstrap mode (historical blocks at the allocation)
  | 'mcPlanConfig' // Monte Carlo honoring plan.mc.* (for the mc config fields themselves)
  | 'backtest'     // every historical start year
  | 'milestones';  // the timeline artifact (markers with names + ages)

function mcHash(p: PlanInput, mode: 'normal' | 'bootstrap'): string {
  const c = structuredClone(p);
  c.mc.mode = mode;
  const r = runMonteCarlo(c, { runs: 200, seed: 7 });
  return JSON.stringify([r.successRate, r.bands[50], r.failuresByAge]);
}

// The deterministic path mirrors the app's wiring: expReturn reaches project() through
// the ReturnGenerator (SimContext builds fixedReturns(plan.assumptions.expReturn)).
const detProject = (p: PlanInput) => project(p, fixedReturns(p.assumptions.expReturn));

const OBSERVABLES: Record<ObservableKey, (p: PlanInput) => string> = {
  det: (p) => JSON.stringify(detProject(p).rows),
  metrics: (p) => JSON.stringify([fiNumber(p), coastNumberAt(p, p.profile.currentAge)]),
  mcNormal: (p) => mcHash(p, 'normal'),
  mcBootstrap: (p) => mcHash(p, 'bootstrap'),
  mcPlanConfig: (p) => {
    const r = runMonteCarlo(p, { seed: 7 }); // no overrides: plan.mc.runs/mode in charge
    return JSON.stringify([r.successRate, r.bands[50], r.failuresByAge]);
  },
  backtest: (p) => {
    const r = runBacktest(p);
    return JSON.stringify([r.successRate, r.starts.map((s) => s.failedAtAge)]);
  },
  milestones: (p) => JSON.stringify(allMilestones(p, detProject(p)).map((m) => [m.name, m.age])),
};

interface FieldSpec {
  /** Canonical leaf path, array indices erased: "incomes[].annual". */
  path: string;
  /** Observables that MUST move when this field moves. Empty ⇒ the field is INERT. */
  moves: ObservableKey[];
  /** Observables that MUST NOT move — scope-isolation guarantees. */
  frozen?: ObservableKey[];
  /** Why an inert field is allowed to change nothing (required when moves is empty). */
  inert?: string;
  /** Perturb exactly this field (on a clone of the base plan). */
  set: (p: PlanInput) => void;
  /** Base plan override when the seed's shape can't expose the effect. */
  base?: () => PlanInput;
}

/** Ids are referential (React keys, issue targeting, incomeByStream keys) — perturbing
 *  them "changes" hashes without changing behavior, so they are exempt, not tested. */
const IDENTITY_PATHS = [
  'incomes[].id',
  'expenses.phases[].id',
  'expenses.oneTimes[].id',
  'milestones[].id',
  'accounts.trad.changes[].id',
];

const rothFirst = (): PlanInput => {
  const p = seedPlan(START_YEAR);
  p.tax.withdrawalOrder = ['roth', 'trad', 'taxable', 'hsa'];
  return p;
};
const bracketState = (): PlanInput => {
  const p = seedPlan(START_YEAR);
  p.tax.stateMode = 'brackets';
  p.tax.stateBrackets = [{ upTo: 50_000, rate: 0.03 }, { upTo: Infinity, rate: 0.08 }];
  return p;
};
// mc.runs is clamped to [MC_MIN_RUNS, MC_MAX_RUNS] by mcInit — perturb INSIDE the legal
// range or both sides clamp to the same value (the harness caught exactly that).
const smallMc = (): PlanInput => {
  const p = seedPlan(START_YEAR);
  p.mc.runs = 500;
  return p;
};

const ENTRIES: FieldSpec[] = [
  // --- profile
  { path: 'profile.currentAge', moves: ['det', 'metrics'], set: (p) => { p.profile.currentAge = 38; } },
  { path: 'profile.partnerAge', moves: ['det'], set: (p) => { p.profile.partnerAge = 30; } },
  { path: 'profile.downshiftAge', moves: ['milestones'], frozen: ['det', 'metrics'], set: (p) => { p.profile.downshiftAge = 45; } },
  { path: 'profile.retireAge', moves: ['det', 'metrics'], set: (p) => { p.profile.retireAge = 50; } },
  { path: 'profile.lifeExpectancy', moves: ['det'], set: (p) => { p.profile.lifeExpectancy = 80; } },
  { path: 'planStartYear', moves: ['det'], set: (p) => { p.planStartYear = 2020; } },

  // --- accounts (balance and contribution for every account type)
  ...ACCOUNT_TYPES.flatMap((t): FieldSpec[] => [
    { path: `accounts.${t}.balance`, moves: ['det'], set: (p) => { p.accounts[t].balance += 200_000; } },
    { path: `accounts.${t}.contribution`, moves: ['det'], set: (p) => { p.accounts[t].contribution += 9_000; } },
  ]),
  { path: 'accounts.trad.changes[].fromAge', moves: ['det'], set: (p) => { p.accounts.trad.changes![0].fromAge = 45; } },
  { path: 'accounts.trad.changes[].annual', moves: ['det'], set: (p) => { p.accounts.trad.changes![0].annual = 25_000; } },

  // --- basis
  { path: 'taxableCostBasis', moves: ['det'], set: (p) => { p.taxableCostBasis = 10_000; } },
  { path: 'rothBasis', moves: ['det'], base: rothFirst, set: (p) => { p.rothBasis = 5_000; } },

  // --- income streams
  { path: 'incomes[].annual', moves: ['det'], set: (p) => { p.incomes[0].annual = 150_000; } },
  { path: 'incomes[].startAge', moves: ['det'], set: (p) => { p.incomes[3].startAge = 52; } },
  { path: 'incomes[].endAge', moves: ['det'], set: (p) => { p.incomes[0].endAge = 45; } },
  { path: 'incomes[].growth', moves: ['det'], set: (p) => { p.incomes[0].growth = 0.04; } },
  { path: 'incomes[].kind', moves: ['det'], set: (p) => { p.incomes[0].kind = 'se'; } },
  {
    path: 'incomes[].name', moves: [], frozen: ['det', 'metrics'],
    inert: 'display label (Sankey nodes, tables); flows key off the stream id',
    set: (p) => { p.incomes[0].name = 'renamed'; },
  },

  // --- Social Security
  { path: 'socialSecurity.annual', moves: ['det'], set: (p) => { p.socialSecurity.annual = 40_000; } },
  { path: 'socialSecurity.claimAge', moves: ['det', 'milestones'], set: (p) => { p.socialSecurity.claimAge = 70; } },
  { path: 'socialSecurity.partner.annual', moves: ['det'], set: (p) => { p.socialSecurity.partner!.annual = 36_000; } },
  { path: 'socialSecurity.partner.claimAge', moves: ['det'], set: (p) => { p.socialSecurity.partner!.claimAge = 70; } },

  // --- spending. currentAnnual moving det but NOT the FI number (the retirement phase
  // governs it) is the F13 semantics, protected here as an isolation guarantee.
  { path: 'expenses.currentAnnual', moves: ['det'], frozen: ['metrics'], set: (p) => { p.expenses.currentAnnual = 100_000; } },
  { path: 'expenses.phases[].fromAge', moves: ['det', 'metrics'], set: (p) => { p.expenses.phases[0].fromAge = 60; } },
  { path: 'expenses.phases[].annual', moves: ['det', 'metrics'], set: (p) => { p.expenses.phases[0].annual = 100_000; } },
  { path: 'expenses.oneTimes[].age', moves: ['det'], set: (p) => { p.expenses.oneTimes[0].age = 42; } },
  { path: 'expenses.oneTimes[].amount', moves: ['det'], set: (p) => { p.expenses.oneTimes[0].amount = 200_000; } },
  {
    path: 'expenses.oneTimes[].name', moves: [], frozen: ['det', 'metrics'],
    inert: 'display label (timeline/cash-flow annotations)',
    set: (p) => { p.expenses.oneTimes[0].name = 'renamed'; },
  },

  // --- assumptions
  { path: 'assumptions.expReturn', moves: ['det', 'metrics'], frozen: ['backtest', 'mcBootstrap'], set: (p) => { p.assumptions.expReturn = 0.07; } },
  { path: 'assumptions.returnSd', moves: ['mcNormal'], frozen: ['det', 'backtest', 'mcBootstrap'], set: (p) => { p.assumptions.returnSd = 0.30; } },
  {
    path: 'assumptions.inflation', moves: [], frozen: ['det', 'metrics', 'mcNormal', 'backtest'],
    inert: 'reference copy only — the model is real dollars/real returns (D1, D20)',
    set: (p) => { p.assumptions.inflation = 0.10; },
  },
  { path: 'assumptions.cashReturn', moves: ['det'], set: (p) => { p.assumptions.cashReturn = 0.03; } },
  { path: 'assumptions.stockAllocation', moves: ['mcBootstrap', 'backtest'], frozen: ['det', 'mcNormal'], set: (p) => { p.assumptions.stockAllocation = 0.2; } },
  { path: 'assumptions.contributionGrowth', moves: ['det'], set: (p) => { p.assumptions.contributionGrowth = 0.05; } },
  { path: 'assumptions.fiMultiplier', moves: ['metrics'], frozen: ['det'], set: (p) => { p.assumptions.fiMultiplier = 30; } },

  // --- taxes
  { path: 'tax.filingStatus', moves: ['det'], set: (p) => { p.tax.filingStatus = 'single'; } },
  { path: 'tax.stateMode', moves: ['det'], set: (p) => { p.tax.stateMode = 'none'; } },
  { path: 'tax.stateFlatRate', moves: ['det'], set: (p) => { p.tax.stateFlatRate = 0.10; } },
  { path: 'tax.stateBrackets[].upTo', moves: ['det'], base: bracketState, set: (p) => { p.tax.stateBrackets[0].upTo = 20_000; } },
  { path: 'tax.stateBrackets[].rate', moves: ['det'], base: bracketState, set: (p) => { p.tax.stateBrackets[0].rate = 0.06; } },
  { path: 'tax.stateStdDeduction', moves: ['det'], set: (p) => { p.tax.stateStdDeduction = 50_000; } },
  { path: 'tax.withdrawalOrder[]', moves: ['det'], set: (p) => { p.tax.withdrawalOrder = ['roth', 'trad', 'taxable', 'hsa']; } },

  // --- Monte Carlo config: moves MC when the plan's own settings are honored, never the
  // deterministic path.
  { path: 'mc.runs', moves: ['mcPlanConfig'], frozen: ['det'], base: smallMc, set: (p) => { p.mc.runs = 700; } },
  { path: 'mc.mode', moves: ['mcPlanConfig'], frozen: ['det'], base: smallMc, set: (p) => { p.mc.mode = 'bootstrap'; } },

  // --- milestones: timeline artifact only, never money math.
  { path: 'milestones[].name', moves: ['milestones'], frozen: ['det', 'metrics'], set: (p) => { p.milestones[0].name = 'renamed'; } },
  { path: 'milestones[].age', moves: ['milestones'], frozen: ['det', 'metrics'], set: (p) => { p.milestones[0].age = 60; } },
];

/** Enumerate canonical leaf paths ("incomes[].annual") of a live plan object. */
function leafPaths(v: unknown, prefix: string, out: Set<string>): void {
  if (Array.isArray(v)) {
    for (const x of v) leafPaths(x, `${prefix}[]`, out);
  } else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) leafPaths(x, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.add(prefix);
  }
}

describe('input efficacy matrix (D29)', () => {
  it('every leaf field of the plan is classified — no field ships without a job', () => {
    const enumerated = new Set<string>();
    leafPaths(seedPlan(START_YEAR), '', enumerated);
    const classified = new Set([...ENTRIES.map((e) => e.path), ...IDENTITY_PATHS]);

    const unclassified = [...enumerated].filter((p) => !classified.has(p)).sort();
    const stale = [...classified].filter((p) => !enumerated.has(p)).sort();
    expect(unclassified, 'new fields must be added to ENTRIES (or IDENTITY_PATHS)').toEqual([]);
    expect(stale, 'ENTRIES names fields that no longer exist').toEqual([]);
  });

  it('inert entries carry a documented reason; effective entries name an observable', () => {
    for (const e of ENTRIES) {
      if (e.moves.length === 0) expect(e.inert, e.path).toBeTruthy();
      else expect(e.inert, e.path).toBeUndefined();
    }
  });

  for (const e of ENTRIES) {
    it(`${e.path} → moves [${e.moves.join(', ') || `inert: ${e.inert}`}]${e.frozen?.length ? ` freezes [${e.frozen.join(', ')}]` : ''}`, () => {
      const base = e.base?.() ?? seedPlan(START_YEAR);
      const mutated = structuredClone(base);
      e.set(mutated);
      for (const key of e.moves) {
        expect(OBSERVABLES[key](mutated), `${e.path} must move ${key}`).not.toBe(OBSERVABLES[key](base));
      }
      for (const key of e.frozen ?? []) {
        expect(OBSERVABLES[key](mutated), `${e.path} must NOT move ${key}`).toBe(OBSERVABLES[key](base));
      }
    });
  }
});

describe('direction and conditional-scope checks', () => {
  it('more retirement spending ⇒ FI number up, final net worth down', () => {
    const base = seedPlan(START_YEAR);
    const spendy = structuredClone(base);
    spendy.expenses.phases[0].annual += 20_000;
    expect(fiNumber(spendy)).toBeGreaterThan(fiNumber(base));
    expect(project(spendy, fixedReturns(0.05)).finalNetWorth)
      .toBeLessThan(project(base, fixedReturns(0.05)).finalNetWorth);
  });

  it('higher expected return ⇒ higher final net worth', () => {
    const p = seedPlan(START_YEAR);
    expect(project(p, fixedReturns(0.07)).finalNetWorth)
      .toBeGreaterThan(project(p, fixedReturns(0.05)).finalNetWorth);
  });

  it('a later claim age starts Social Security later, not smaller', () => {
    const base = seedPlan(START_YEAR);
    base.socialSecurity.partner = undefined; // isolate the primary benefit
    const late = structuredClone(base);
    late.socialSecurity.claimAge = 70;
    const at = (p: PlanInput, age: number) =>
      project(p, fixedReturns(0.05)).rows.find((r) => r.age === age)!.socialSecurity;
    expect(at(base, 68)).toBe(24_000);
    expect(at(late, 68)).toBe(0);
    expect(at(late, 70)).toBe(24_000);
  });

  it('1099 income pays SE tax where W-2 pays employee FICA — more, on the same gross', () => {
    const w2 = seedPlan(START_YEAR);
    const se = structuredClone(w2);
    se.incomes[0].kind = 'se';
    const fica = (p: PlanInput) => project(p, fixedReturns(0.05)).rows[0].taxes.fica;
    expect(fica(se)).toBeGreaterThan(fica(w2));
  });

  it('cash return is inert exactly when there is no cash', () => {
    const p = seedPlan(START_YEAR);
    p.accounts.cash.balance = 0;
    p.accounts.cash.contribution = 0;
    const moved = structuredClone(p);
    moved.assumptions.cashReturn = 0.05;
    expect(OBSERVABLES.det(moved)).toBe(OBSERVABLES.det(p));
  });

  it('state brackets are inert while the state mode is flat', () => {
    const p = seedPlan(START_YEAR); // stateMode: 'flat'
    const moved = structuredClone(p);
    moved.tax.stateBrackets = [{ upTo: 10_000, rate: 0.2 }, { upTo: Infinity, rate: 0.9 }];
    expect(OBSERVABLES.det(moved)).toBe(OBSERVABLES.det(p));
  });
});
