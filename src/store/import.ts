// Schema-checked JSON import — the one untrusted input path (D27).
//
// A file that *parses* but carries wrong types must never reach the store: replaceAll
// swaps in the whole state and the debounced autosave persists it, so a string where a
// balance belongs becomes NaN math saved over the user's data. Every field is checked
// and rebuilt (whitelist), so unknown keys are dropped and errors name the exact path.
// Money and structure are rejected, never coerced; only metadata is repaired
// (timestamps, missing colors, a stale activeId).

import { nextColor } from '../engine/seed';
import {
  ACCOUNT_TYPES, INVESTED_TYPES,
  type AccountInput, type AccountType, type Assumptions, type ExpensesInput,
  type IncomeStream, type InvestedAccountType, type OneTimeExpense, type PlanInput,
  type Profile, type Scenario, type SocialSecurityInput, type SpendingPhase,
  type TaxBracket, type TaxSettings, type UserMilestone,
} from '../engine/types';

export type ParseResult =
  | { ok: true; scenarios: Scenario[]; activeId: string }
  | { ok: false; error: string };

class Invalid extends Error {}
const invalid = (path: string, want: string) =>
  new Invalid(`Invalid export — ${path} should be ${want}.`);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, path: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw invalid(path, 'a finite number');
}
function str(v: unknown, path: string): string {
  if (typeof v === 'string') return v;
  throw invalid(path, 'a string');
}
function obj(v: unknown, path: string): Record<string, unknown> {
  if (isObj(v)) return v;
  throw invalid(path, 'an object');
}
function arr(v: unknown, path: string): unknown[] {
  if (Array.isArray(v)) return v;
  throw invalid(path, 'an array');
}
function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
  throw invalid(path, options.join(' | '));
}
/** Timestamps are metadata, not money — repair instead of reject. */
const timestamp = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : Date.now();

function profile(v: unknown, path: string): Profile {
  const o = obj(v, path);
  return {
    currentAge: num(o.currentAge, `${path}.currentAge`),
    partnerAge: o.partnerAge == null ? null : num(o.partnerAge, `${path}.partnerAge`),
    downshiftAge: num(o.downshiftAge, `${path}.downshiftAge`),
    retireAge: num(o.retireAge, `${path}.retireAge`),
    lifeExpectancy: num(o.lifeExpectancy, `${path}.lifeExpectancy`),
  };
}

function account(v: unknown, path: string): AccountInput {
  const o = obj(v, path);
  return {
    balance: num(o.balance, `${path}.balance`),
    contribution: num(o.contribution, `${path}.contribution`),
  };
}

function income(v: unknown, path: string): IncomeStream {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    kind: oneOf(o.kind, ['w2', 'se'], `${path}.kind`),
    annual: num(o.annual, `${path}.annual`),
    startAge: num(o.startAge, `${path}.startAge`),
    endAge: num(o.endAge, `${path}.endAge`),
    growth: num(o.growth, `${path}.growth`),
  };
}

function socialSecurity(v: unknown, path: string): SocialSecurityInput {
  const o = obj(v, path);
  let partner: SocialSecurityInput['partner'];
  if (o.partner != null) {
    const p = obj(o.partner, `${path}.partner`);
    partner = {
      annual: num(p.annual, `${path}.partner.annual`),
      claimAge: num(p.claimAge, `${path}.partner.claimAge`),
    };
  }
  return { annual: num(o.annual, `${path}.annual`), claimAge: num(o.claimAge, `${path}.claimAge`), partner };
}

function phase(v: unknown, path: string): SpendingPhase {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    fromAge: num(o.fromAge, `${path}.fromAge`),
    annual: num(o.annual, `${path}.annual`),
  };
}

function oneTime(v: unknown, path: string): OneTimeExpense {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    age: num(o.age, `${path}.age`),
    amount: num(o.amount, `${path}.amount`),
  };
}

function expenses(v: unknown, path: string): ExpensesInput {
  const o = obj(v, path);
  return {
    currentAnnual: num(o.currentAnnual, `${path}.currentAnnual`),
    phases: arr(o.phases, `${path}.phases`).map((p, i) => phase(p, `${path}.phases[${i}]`)),
    oneTimes: arr(o.oneTimes, `${path}.oneTimes`).map((p, i) => oneTime(p, `${path}.oneTimes[${i}]`)),
  };
}

function assumptions(v: unknown, path: string): Assumptions {
  const o = obj(v, path);
  const field = (k: keyof Assumptions) => num(o[k], `${path}.${k}`);
  return {
    expReturn: field('expReturn'),
    returnSd: field('returnSd'),
    inflation: field('inflation'),
    cashReturn: field('cashReturn'),
    stockAllocation: field('stockAllocation'),
    contributionGrowth: field('contributionGrowth'),
    fiMultiplier: field('fiMultiplier'),
  };
}

function bracket(v: unknown, path: string): TaxBracket {
  const o = obj(v, path);
  // JSON has no Infinity: the top bracket round-trips as null — revive it here.
  return {
    upTo: o.upTo == null ? Infinity : num(o.upTo, `${path}.upTo`),
    rate: num(o.rate, `${path}.rate`),
  };
}

function withdrawalOrder(v: unknown, path: string): InvestedAccountType[] {
  const list = arr(v, path).map((x, i) => oneOf(x, INVESTED_TYPES, `${path}[${i}]`));
  if (list.length !== INVESTED_TYPES.length || new Set(list).size !== list.length) {
    throw invalid(path, `a permutation of ${INVESTED_TYPES.join(', ')} (each exactly once)`);
  }
  return list;
}

function tax(v: unknown, path: string): TaxSettings {
  const o = obj(v, path);
  const brackets = arr(o.stateBrackets, `${path}.stateBrackets`);
  if (brackets.length === 0) throw invalid(`${path}.stateBrackets`, 'a non-empty array');
  return {
    filingStatus: oneOf(o.filingStatus, ['single', 'married'], `${path}.filingStatus`),
    stateMode: oneOf(o.stateMode, ['none', 'flat', 'brackets'], `${path}.stateMode`),
    stateFlatRate: num(o.stateFlatRate, `${path}.stateFlatRate`),
    stateBrackets: brackets.map((b, i) => bracket(b, `${path}.stateBrackets[${i}]`)),
    stateStdDeduction: num(o.stateStdDeduction, `${path}.stateStdDeduction`),
    withdrawalOrder: withdrawalOrder(o.withdrawalOrder, `${path}.withdrawalOrder`),
  };
}

function milestone(v: unknown, path: string): UserMilestone {
  const o = obj(v, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    age: num(o.age, `${path}.age`),
  };
}

function plan(v: unknown, path: string): PlanInput {
  const o = obj(v, path);
  const accountsObj = obj(o.accounts, `${path}.accounts`);
  const mc = obj(o.mc, `${path}.mc`);
  return {
    profile: profile(o.profile, `${path}.profile`),
    planStartYear: num(o.planStartYear, `${path}.planStartYear`),
    accounts: Object.fromEntries(
      ACCOUNT_TYPES.map((t) => [t, account(accountsObj[t], `${path}.accounts.${t}`)]),
    ) as Record<AccountType, AccountInput>,
    taxableCostBasis: num(o.taxableCostBasis, `${path}.taxableCostBasis`),
    rothBasis: num(o.rothBasis, `${path}.rothBasis`),
    incomes: arr(o.incomes, `${path}.incomes`).map((s, i) => income(s, `${path}.incomes[${i}]`)),
    socialSecurity: socialSecurity(o.socialSecurity, `${path}.socialSecurity`),
    expenses: expenses(o.expenses, `${path}.expenses`),
    assumptions: assumptions(o.assumptions, `${path}.assumptions`),
    tax: tax(o.tax, `${path}.tax`),
    mc: {
      runs: num(mc.runs, `${path}.mc.runs`),
      mode: oneOf(mc.mode, ['normal', 'bootstrap'], `${path}.mc.mode`),
    },
    milestones: arr(o.milestones, `${path}.milestones`).map((m, i) => milestone(m, `${path}.milestones[${i}]`)),
  };
}

function scenario(v: unknown, i: number): Scenario {
  const path = `scenarios[${i}]`;
  const o = obj(v, path);
  const id = str(o.id, `${path}.id`);
  if (!id) throw invalid(`${path}.id`, 'a non-empty string');
  return {
    id,
    name: str(o.name, `${path}.name`),
    createdAt: timestamp(o.createdAt),
    updatedAt: timestamp(o.updatedAt),
    // Pre-D25 exports have no color — backfilled below.
    color: typeof o.color === 'string' ? o.color : '',
    plan: plan(o.plan, `${path}.plan`),
  };
}

export function parseExport(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Could not parse that file as JSON.' };
  }

  try {
    if (!isObj(data) || data.app !== 'firepath' || !Array.isArray(data.scenarios) || data.scenarios.length === 0) {
      return { ok: false, error: 'Not a FirePath export file.' };
    }
    const scenarios = data.scenarios.map((s, i) => scenario(s, i));

    const ids = new Set(scenarios.map((s) => s.id));
    if (ids.size !== scenarios.length) {
      return { ok: false, error: 'Invalid export — scenario ids must be unique.' };
    }

    // Backfill missing identity colors in palette order (D25).
    const used = scenarios.map((s) => s.color).filter(Boolean);
    for (const s of scenarios) {
      if (!s.color) {
        s.color = nextColor(used);
        used.push(s.color);
      }
    }

    const activeId =
      typeof data.activeId === 'string' && ids.has(data.activeId) ? data.activeId : scenarios[0].id;
    return { ok: true, scenarios, activeId };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}
