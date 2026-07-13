// parseExport is the gate on the one untrusted input path: files that parse but carry
// wrong types must be rejected with a path-named error, never coerced into the store.

import { describe, expect, it } from 'vitest';
import { SCENARIO_COLORS, blankPlan, makeScenario, seedPlan } from '../engine/seed';
import type { Scenario } from '../engine/types';
import { parseExport } from './import';

const START_YEAR = 2026;

/** A genuine export envelope, exactly as exportJson produces it (Infinity → null). */
function envelope(scenarios: Scenario[], activeId = scenarios[0].id): string {
  return JSON.stringify({ app: 'firepath', version: 1, exportedAt: 'x', scenarios, activeId });
}

/** Parse → mutate → re-stringify, for building doctored files. */
function doctor(text: string, mutate: (data: any) => void): string {
  const data = JSON.parse(text) as unknown;
  mutate(data);
  return JSON.stringify(data);
}

const demoExport = () => envelope([makeScenario('Demo', seedPlan(START_YEAR))]);

describe('parseExport', () => {
  it('round-trips a genuine export, reviving the Infinity bracket', () => {
    const result = parseExport(demoExport());
    if (!result.ok) throw new Error(result.error);
    expect(result.scenarios).toHaveLength(1);
    const plan = result.scenarios[0].plan;
    expect(plan.accounts.taxable.balance).toBe(120_000);
    expect(plan.socialSecurity.partner).toEqual({ annual: 18_000, claimAge: 67 });
    expect(plan.tax.stateBrackets.at(-1)!.upTo).toBe(Infinity);
    expect(result.activeId).toBe(result.scenarios[0].id);
  });

  it('accepts a solo plan (no partner) and multiple scenarios', () => {
    const a = makeScenario('A', blankPlan(START_YEAR));
    const b = makeScenario('B', seedPlan(START_YEAR), SCENARIO_COLORS[1]);
    const result = parseExport(envelope([a, b], b.id));
    if (!result.ok) throw new Error(result.error);
    expect(result.scenarios.map((s) => s.name)).toEqual(['A', 'B']);
    expect(result.scenarios[0].plan.socialSecurity.partner).toBeUndefined();
    expect(result.activeId).toBe(b.id);
  });

  it('rejects non-JSON and non-FirePath files', () => {
    expect(parseExport('definitely not json {{{')).toEqual({
      ok: false,
      error: 'Could not parse that file as JSON.',
    });
    expect(parseExport(JSON.stringify({ app: 'other', scenarios: [{}] }))).toEqual({
      ok: false,
      error: 'Not a FirePath export file.',
    });
    expect(parseExport(JSON.stringify({ app: 'firepath', scenarios: [] }))).toEqual({
      ok: false,
      error: 'Not a FirePath export file.',
    });
  });

  it('rejects wrong types with the exact path — strings where money belongs', () => {
    const result = parseExport(
      doctor(demoExport(), (d) => { d.scenarios[0].plan.accounts.taxable.balance = '120000'; }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'Invalid export — scenarios[0].plan.accounts.taxable.balance should be a finite number.',
    });
  });

  it('rejects null ages, bad enums, and malformed nested items', () => {
    const cases: [mutate: (d: any) => void, errorPart: string][] = [
      [(d) => { d.scenarios[0].plan.profile.currentAge = null; }, 'profile.currentAge'],
      [(d) => { d.scenarios[0].plan.tax.filingStatus = 'jointly'; }, 'tax.filingStatus'],
      [(d) => { d.scenarios[0].plan.mc.mode = 'quantum'; }, 'mc.mode'],
      [(d) => { d.scenarios[0].plan.expenses.oneTimes[0].amount = 'lots'; }, 'oneTimes[0].amount'],
      [(d) => { d.scenarios[0].plan.incomes[2].kind = 'crypto'; }, 'incomes[2].kind'],
      [(d) => { delete d.scenarios[0].plan.accounts.hsa; }, 'accounts.hsa'],
      [(d) => { d.scenarios[0].plan.tax.stateBrackets = []; }, 'stateBrackets'],
      [(d) => { d.scenarios[0].plan = 'not a plan'; }, 'scenarios[0].plan'],
    ];
    for (const [mutate, errorPart] of cases) {
      const result = parseExport(doctor(demoExport(), mutate));
      expect(result.ok, errorPart).toBe(false);
      if (!result.ok) expect(result.error, errorPart).toContain(errorPart);
    }
  });

  it('rejects a withdrawal order that is not a permutation of the invested accounts', () => {
    for (const bad of [['taxable', 'taxable', 'roth', 'hsa'], ['taxable', 'trad'], ['taxable', 'trad', 'roth', 'cash']]) {
      const result = parseExport(doctor(demoExport(), (d) => { d.scenarios[0].plan.tax.withdrawalOrder = bad; }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('withdrawalOrder');
    }
  });

  it('rejects duplicate scenario ids (they would collapse in IndexedDB)', () => {
    const a = makeScenario('A', blankPlan(START_YEAR));
    const b = { ...makeScenario('B', blankPlan(START_YEAR)), id: a.id };
    const result = parseExport(envelope([a, b]));
    expect(result).toEqual({ ok: false, error: 'Invalid export — scenario ids must be unique.' });
  });

  it('repairs metadata instead of rejecting: colors, timestamps, stale activeId', () => {
    const text = doctor(envelope([makeScenario('Old', seedPlan(START_YEAR))], 'gone'), (d) => {
      delete d.scenarios[0].color;      // pre-D25 export
      d.scenarios[0].updatedAt = 'yesterday';
    });
    const result = parseExport(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.scenarios[0].color).toBe(SCENARIO_COLORS[0]);
    expect(Number.isFinite(result.scenarios[0].updatedAt)).toBe(true);
    expect(result.activeId).toBe(result.scenarios[0].id); // unknown activeId falls back
  });

  it('round-trips contribution schedules; absent stays absent (pre-D28 exports)', () => {
    const result = parseExport(demoExport());
    if (!result.ok) throw new Error(result.error);
    const accounts = result.scenarios[0].plan.accounts;
    // The demo 401(k) carries a schedule; every other account has no `changes` key at all.
    expect(accounts.trad.changes).toHaveLength(1);
    expect(accounts.trad.changes![0]).toMatchObject({ fromAge: 50, annual: 10_000 });
    expect('changes' in accounts.taxable).toBe(false);
  });

  it('rejects malformed contribution changes with the exact path', () => {
    const cases: [mutate: (d: any) => void, errorPart: string][] = [
      [(d) => { d.scenarios[0].plan.accounts.trad.changes[0].fromAge = '50'; }, 'accounts.trad.changes[0].fromAge'],
      [(d) => { d.scenarios[0].plan.accounts.trad.changes[0].annual = null; }, 'accounts.trad.changes[0].annual'],
      [(d) => { d.scenarios[0].plan.accounts.trad.changes = 'soon'; }, 'accounts.trad.changes'],
    ];
    for (const [mutate, errorPart] of cases) {
      const result = parseExport(doctor(demoExport(), mutate));
      expect(result.ok, errorPart).toBe(false);
      if (!result.ok) expect(result.error, errorPart).toContain(errorPart);
    }
  });

  it('drops unknown fields instead of carrying them into the store', () => {
    const result = parseExport(doctor(demoExport(), (d) => {
      d.scenarios[0].plan.evil = { web: 'hook' };
      d.scenarios[0].plan.profile.extra = 42;
    }));
    if (!result.ok) throw new Error(result.error);
    expect('evil' in result.scenarios[0].plan).toBe(false);
    expect('extra' in result.scenarios[0].plan.profile).toBe(false);
  });
});
