import { describe, expect, it } from 'vitest';
import { runBacktest } from './backtest';
import { HISTORICAL } from './data/historical';
import { coastNumberAt, drawdownStartAge, fiAge, fiNumber, isCoastFireNow, savingsRate } from './metrics';
import { runMonteCarlo } from './montecarlo';
import { contributionAtAge, contributionSteps, project, spendingAtAge } from './projection';
import { bootstrapReturns, fixedReturns, historicalPortfolio, mulberry32, portfolioStats } from './returns';
import { bracketTax, federalTax, ltcgTax, payrollTax } from './tax';
import { FEDERAL_2026 } from './taxConfig';
import { SCENARIO_COLORS, blankPlan, nextColor, seedPlan } from './seed';
import type { PlanInput } from './types';
import { isIncomplete, planIssues } from './validate';

const START_YEAR = 2026;

/** A plan with every flow zeroed except what the test sets. */
function bare(overrides: Partial<PlanInput> = {}): PlanInput {
  const p = blankPlan(START_YEAR);
  p.profile = { currentAge: 40, partnerAge: null, downshiftAge: 50, retireAge: 60, lifeExpectancy: 70 };
  return { ...p, ...overrides };
}

describe('tax math', () => {
  it('bracketTax matches a hand-computed 2026 single case', () => {
    // 12,400×10% + (50,000−12,400)×12% = 5,752
    expect(bracketTax(50_000, FEDERAL_2026.ordinaryBrackets.single)).toBeCloseTo(5_752, 5);
  });

  it('LTCG stacks on top of ordinary income', () => {
    const b = FEDERAL_2026.ltcgBrackets.single;
    expect(ltcgTax(0, 40_000, b)).toBe(0); // inside the 0% band
    expect(ltcgTax(100_000, 20_000, b)).toBeCloseTo(3_000, 5); // fully in 15%
  });

  it('standard deduction shelters ordinary income first, remainder shelters gains', () => {
    // ordinary 10k (< 16.1k deduction) leaves 6.1k to shelter gains:
    // taxable gains 53.9k → (53,900 − 49,450) × 15% = 667.50
    expect(federalTax({ ordinaryIncome: 10_000, ltcgIncome: 60_000 }, 'single')).toBeCloseTo(667.5, 2);
  });

  it('payroll tax caps OASDI and computes SE tax', () => {
    const { fica } = payrollTax(200_000, 0);
    expect(fica).toBeCloseTo(184_500 * 0.062 + 200_000 * 0.0145, 2);
    const se = payrollTax(0, 10_000);
    expect(se.fica).toBeCloseTo(10_000 * 0.9235 * 0.153, 2);
    expect(se.halfSeDeduction).toBeCloseTo(se.fica / 2, 6);
  });
});

describe('deterministic projection', () => {
  it('matches closed-form compound growth with no flows', () => {
    const p = bare();
    p.accounts.taxable.balance = 100_000;
    const proj = project(p, fixedReturns(0.05));
    // 31 simulated years (ages 40..70 inclusive)
    expect(proj.rows).toHaveLength(31);
    proj.rows.forEach((row, i) => {
      expect(row.balances.taxable).toBeCloseTo(100_000 * 1.05 ** (i + 1), 6);
    });
    expect(proj.failedAtAge).toBeNull();
  });

  it('start-of-year contributions earn the full year: B1 = (B0 + c)·(1+r)', () => {
    const p = bare();
    p.accounts.taxable = { balance: 100_000, contribution: 10_000 };
    // Plenty of income to fund the contribution; expenses zero.
    p.incomes = [{ id: 'w', name: 'w', kind: 'w2', annual: 50_000, startAge: 40, endAge: 59, growth: 0 }];
    const proj = project(p, fixedReturns(0.05));
    const r0 = proj.rows[0];
    expect(r0.contributions.taxable).toBeCloseTo(10_000, 6);
    // Internal consistency: end balance = (start + contribution + leftover sweep) × 1.05
    expect(r0.balances.taxable).toBeCloseTo((100_000 + 10_000 + r0.leftoverToTaxable) * 1.05, 6);
    // Leftover = income − taxes − contribution
    expect(r0.leftoverToTaxable).toBeCloseTo(50_000 - r0.taxes.total - 10_000, 4);
  });

  it('withdraws cash first, then taxable, tracking cost basis', () => {
    const p = bare();
    p.profile.currentAge = 60; // no early-withdrawal penalties
    p.profile.retireAge = 60;
    p.profile.lifeExpectancy = 62;
    p.accounts.cash.balance = 20_000;
    p.accounts.taxable.balance = 100_000;
    p.taxableCostBasis = 50_000;
    p.expenses.currentAnnual = 50_000;
    const proj = project(p, fixedReturns(0));
    const r0 = proj.rows[0];
    expect(r0.withdrawals.cash).toBeCloseTo(20_000, 2);
    // Realized gains ≈ 15k — inside the single 0% LTCG band → no tax, no gross-up.
    expect(r0.taxes.total).toBeCloseTo(0, 2);
    expect(r0.withdrawals.taxable).toBeCloseTo(30_000, 2);
    expect(r0.balances.taxable).toBeCloseTo(70_000, 2);
  });

  it('grosses up tax-deferred withdrawals for ordinary income tax (hand-solved)', () => {
    const p = bare();
    p.profile.currentAge = 65;
    p.profile.retireAge = 65;
    p.profile.lifeExpectancy = 66;
    p.accounts.trad.balance = 1_000_000;
    p.expenses.currentAnnual = 60_000;
    const proj = project(p, fixedReturns(0));
    // Fixed point: W = 60,000 + tax(W−16,100) ⇒ W = 65,704.55 in the 12% bracket.
    expect(proj.rows[0].withdrawals.trad).toBeCloseTo(65_704.55, 0);
    expect(proj.rows[0].taxes.federal).toBeCloseTo(5_704.55, 0);
  });

  it('applies the 10% penalty to early tax-deferred withdrawals', () => {
    const p = bare();
    p.profile.currentAge = 50;
    p.profile.retireAge = 50;
    p.profile.lifeExpectancy = 51;
    p.accounts.trad.balance = 1_000_000;
    p.expenses.currentAnnual = 60_000;
    const proj = project(p, fixedReturns(0));
    const r0 = proj.rows[0];
    expect(r0.taxes.penalties).toBeCloseTo(r0.withdrawals.trad * 0.1, 2);
  });

  it('lets Roth contribution basis out early without tax, then taxes earnings', () => {
    const p = bare();
    p.profile.currentAge = 50;
    p.profile.retireAge = 50;
    p.profile.lifeExpectancy = 52;
    p.accounts.roth.balance = 100_000;
    p.rothBasis = 55_000;
    p.expenses.currentAnnual = 50_000;
    p.tax.withdrawalOrder = ['roth', 'taxable', 'trad', 'hsa'];
    const proj = project(p, fixedReturns(0));
    // Year 1: 50k of basis out — tax-free, no penalty.
    expect(proj.rows[0].taxes.total).toBeCloseTo(0, 2);
    // Year 2: 5k basis left; the rest is earnings → ordinary tax (below deduction ⇒ 0) + 10% penalty.
    const r1 = proj.rows[1];
    const earnings = r1.withdrawals.roth - 5_000;
    expect(earnings).toBeGreaterThan(40_000);
    expect(r1.taxes.penalties).toBeCloseTo(earnings * 0.1, 2);
  });

  it('forces RMDs at the SECURE-2.0 age and sweeps the excess to taxable', () => {
    const p = bare();
    p.profile.currentAge = 75; // born 1951 ⇒ RMD age 73, already past it
    p.profile.retireAge = 75;
    p.profile.lifeExpectancy = 76;
    p.accounts.trad.balance = 246_000; // divisor at 75 = 24.6 ⇒ RMD = 10,000
    const proj = project(p, fixedReturns(0));
    const r0 = proj.rows[0];
    expect(r0.rmd).toBeCloseTo(10_000, 2);
    expect(r0.balances.trad).toBeCloseTo(236_000, 2);
    // No spending: RMD minus tax (0 — below deduction) sweeps into taxable.
    expect(r0.balances.taxable).toBeCloseTo(10_000, 2);
  });

  it('marks failure when spending cannot be funded', () => {
    const p = bare();
    p.accounts.taxable.balance = 150_000;
    p.expenses.currentAnnual = 100_000;
    const proj = project(p, fixedReturns(0));
    expect(proj.failedAtAge).toBe(41); // 150k funds year 1 and part of year 2
    expect(proj.rows.at(-1)!.netWorth).toBe(0);
  });

  it('spendingAtAge respects phases', () => {
    const p = bare();
    p.expenses.currentAnnual = 70_000;
    p.expenses.phases = [
      { id: 'a', fromAge: 55, annual: 80_000 },
      { id: 'b', fromAge: 70, annual: 65_000 },
    ];
    expect(spendingAtAge(p, 40)).toBe(70_000);
    expect(spendingAtAge(p, 55)).toBe(80_000);
    expect(spendingAtAge(p, 69)).toBe(80_000);
    expect(spendingAtAge(p, 85)).toBe(65_000);
  });
});

describe('FI metrics', () => {
  it('computes FI number and Coast FIRE analytically', () => {
    const p = bare();
    p.profile = { currentAge: 35, partnerAge: null, downshiftAge: 50, retireAge: 55, lifeExpectancy: 90 };
    p.expenses.currentAnnual = 40_000;
    p.accounts.taxable.balance = 500_000;
    expect(fiNumber(p)).toBe(1_000_000);
    // Coast number at 35 = 1M / 1.05^20 = 376,889.48
    expect(coastNumberAt(p, 35)).toBeCloseTo(1_000_000 / 1.05 ** 20, 4);
    expect(isCoastFireNow(p)).toBe(true);
  });

  it('finds the FI age from a projection', () => {
    const p = bare();
    p.profile = { currentAge: 40, partnerAge: null, downshiftAge: 50, retireAge: 60, lifeExpectancy: 70 };
    p.expenses.currentAnnual = 0;
    p.expenses.phases = [{ id: 'r', fromAge: 60, annual: 20_000 }];
    p.accounts.taxable.balance = 400_000;
    // FI number = 500k; 400k×1.05^t ≥ 500k ⇒ t = 5 (1.05^5 = 1.276 → 510.5k)
    const proj = project(p, fixedReturns(0.05));
    expect(fiNumber(p)).toBe(500_000);
    expect(fiAge(p, proj)).toBe(44); // row for age 44 is the 5th year-end
  });
});

describe('Monte Carlo', () => {
  it('is deterministic for a fixed seed and produces ordered bands', () => {
    const p = seedPlan(START_YEAR);
    p.mc.runs = 500;
    const a = runMonteCarlo(p, { seed: 42 });
    const b = runMonteCarlo(p, { seed: 42 });
    expect(a.successRate).toBe(b.successRate);
    expect(a.bands[50]).toEqual(b.bands[50]);
    expect(a.successRate).toBeGreaterThan(0);
    expect(a.successRate).toBeLessThanOrEqual(1);
    for (let i = 0; i < a.ages.length; i++) {
      expect(a.bands[10][i]).toBeLessThanOrEqual(a.bands[25][i]);
      expect(a.bands[25][i]).toBeLessThanOrEqual(a.bands[50][i]);
      expect(a.bands[50][i]).toBeLessThanOrEqual(a.bands[75][i]);
      expect(a.bands[75][i]).toBeLessThanOrEqual(a.bands[90][i]);
    }
  });

  it('a certain-failure plan has 0% success; a fully-funded plan 100%', () => {
    const broke = bare();
    broke.expenses.currentAnnual = 100_000; // no income, no assets
    expect(runMonteCarlo(broke, { runs: 500, seed: 1 }).successRate).toBe(0);

    const rich = bare();
    rich.accounts.taxable.balance = 10_000_000;
    rich.expenses.currentAnnual = 50_000;
    expect(runMonteCarlo(rich, { runs: 500, seed: 1 }).successRate).toBe(1);
  });

  it('bootstrap mode draws only values present in the historical portfolio', () => {
    const portfolio = historicalPortfolio(0.8);
    const set = new Set(portfolio.map((x) => x.toFixed(12)));
    const gen = bootstrapReturns(portfolio, 60, mulberry32(7));
    for (let i = 0; i < 60; i++) expect(set.has(gen(i).toFixed(12))).toBe(true);
  });
});

describe('backtest', () => {
  it('runs one start per historical year with enough remaining data', () => {
    const p = seedPlan(START_YEAR); // ages 35..92 ⇒ 58-year horizon
    const bt = runBacktest(p);
    expect(bt.horizonYears).toBe(58);
    expect(bt.starts).toHaveLength(HISTORICAL.length - 58 + 1);
    expect(bt.starts[0].startYear).toBe(1871);
    expect(bt.starts.at(-1)!.startYear).toBe(1871 + bt.starts.length - 1);
    expect(bt.successRate).toBeGreaterThan(0);
    expect(bt.worst.length).toBeLessThanOrEqual(10);
  });

  it('historical data is complete and sane', () => {
    expect(HISTORICAL).toHaveLength(154);
    for (const h of HISTORICAL) {
      expect(h.stock).toBeGreaterThan(-0.6);
      expect(h.stock).toBeLessThan(0.7);
      expect(h.bond).toBeGreaterThan(-0.4);
      expect(h.bond).toBeLessThan(0.5);
    }
  });
});

describe('reconciliation helpers', () => {
  it('portfolioStats matches the known historical record', () => {
    const stocks = portfolioStats(1);
    expect(stocks.mean).toBeCloseTo(0.0828, 2); // generate-script sanity stat
    expect(stocks.sd).toBeCloseTo(0.174, 2);
    const bonds = portfolioStats(0);
    const blend = portfolioStats(0.8);
    expect(blend.mean).toBeCloseTo(0.8 * stocks.mean + 0.2 * bonds.mean, 10); // mean is linear
    expect(blend.sd).toBeLessThan(stocks.sd); // diversification lowers σ
  });

  it('drawdown starts after the LAST saving year — one-off blips do not trigger it', () => {
    // Demo: down payment at 38 (blip), downshift deficit from 50, retirement input 55.
    const proj = project(seedPlan(START_YEAR), fixedReturns(0.05));
    expect(drawdownStartAge(proj)).toBe(50);
  });

  it('savings rate = saved ÷ after-tax income; null without income', () => {
    const p = bare();
    p.incomes = [{ id: 'w', name: 'Job', kind: 'w2', annual: 100_000, startAge: 40, endAge: 59, growth: 0 }];
    expect(savingsRate(project(p, fixedReturns(0)).rows[0])).toBeCloseTo(1, 6); // no spending → saves it all

    const noIncome = bare();
    noIncome.expenses.currentAnnual = 40_000;
    expect(savingsRate(project(noIncome, fixedReturns(0)).rows[0])).toBeNull();
  });
});

describe('partner Social Security', () => {
  it("starts when the partner reaches THEIR claim age (age-offset from primary)", () => {
    const p = bare();
    p.profile.partnerAge = 37; // 3 years younger than the 40-year-old primary
    p.socialSecurity = { annual: 0, claimAge: 67, partner: { annual: 30_000, claimAge: 67 } };
    const proj = project(p, fixedReturns(0));
    const ss = (age: number) => proj.rows.find((r) => r.age === age)!.socialSecurity;
    expect(ss(69)).toBe(0);
    expect(ss(70)).toBe(30_000); // partner turns 67 when the primary is 70
  });

  it('is ignored for solo plans even when partner data exists', () => {
    const p = bare();
    p.profile.partnerAge = null;
    p.socialSecurity = { annual: 0, claimAge: 67, partner: { annual: 30_000, claimAge: 67 } };
    const proj = project(p, fixedReturns(0));
    expect(proj.rows.every((r) => r.socialSecurity === 0)).toBe(true);
  });

  it('taxes a split household benefit identically to a combined one', () => {
    const split = bare();
    split.profile.partnerAge = split.profile.currentAge; // same age → same start year
    split.socialSecurity = { annual: 20_000, claimAge: 67, partner: { annual: 20_000, claimAge: 67 } };
    const combined = bare();
    combined.profile.partnerAge = combined.profile.currentAge;
    combined.socialSecurity = { annual: 40_000, claimAge: 67 };
    const a = project(split, fixedReturns(0)).rows;
    const b = project(combined, fixedReturns(0)).rows;
    for (let i = 0; i < a.length; i++) {
      expect(a[i].socialSecurity).toBeCloseTo(b[i].socialSecurity, 8);
      expect(a[i].taxes.total).toBeCloseTo(b[i].taxes.total, 6);
    }
  });
});

describe('plan validity', () => {
  it('flags a blank plan as incomplete (FI metrics would be vacuous)', () => {
    const issues = planIssues(blankPlan(START_YEAR));
    expect(issues.map((i) => i.code)).toEqual(['no-spending']);
    expect(isIncomplete(issues)).toBe(true);
  });

  it('accepts the demo plan without issues', () => {
    expect(planIssues(seedPlan(START_YEAR))).toEqual([]);
  });

  it('rejects a life expectancy at or below current age', () => {
    const p = bare();
    p.expenses.currentAnnual = 40_000; // complete, so only the invalid issue fires
    p.profile.lifeExpectancy = p.profile.currentAge;
    const issues = planIssues(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'invalid', code: 'life-expectancy' });
  });

  it('flags income streams that end before they start, by id', () => {
    const p = bare();
    p.expenses.currentAnnual = 40_000;
    p.incomes = [{ id: 'x1', name: 'Backwards', kind: 'w2', annual: 10_000, startAge: 50, endAge: 45, growth: 0 }];
    const issues = planIssues(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'invalid', code: 'stream-ages', streamId: 'x1' });
  });

  it('rejects negative balances and negative basis', () => {
    const p = bare();
    p.expenses.currentAnnual = 40_000;
    p.accounts.taxable.balance = -50_000;
    p.rothBasis = -1;
    expect(planIssues(p).map((i) => i.code)).toEqual(['negative-balance', 'negative-balance']);
  });
});

describe('contribution schedules (D28)', () => {
  it('each step holds until the next; growth compounds within the step from its own start age', () => {
    const p = bare(); // ages 40 → retire 60
    p.assumptions.contributionGrowth = 0.02;
    p.accounts.trad = {
      balance: 0,
      contribution: 20_000,
      changes: [
        { id: 'c1', fromAge: 45, annual: 10_000 },
        { id: 'c2', fromAge: 50, annual: 0 }, // sabbatical
        { id: 'c3', fromAge: 53, annual: 30_000 },
      ],
    };
    const at = (age: number) => contributionAtAge(p, 'trad', age);
    expect(at(39)).toBe(0); // before current age
    expect(at(40)).toBeCloseTo(20_000, 6); // typed value in the step's first year
    expect(at(44)).toBeCloseTo(20_000 * 1.02 ** 4, 6);
    expect(at(45)).toBeCloseTo(10_000, 6); // NOT 10k × 1.02^5 — growth resets per step
    expect(at(49)).toBeCloseTo(10_000 * 1.02 ** 4, 6);
    expect(at(50)).toBe(0);
    expect(at(52)).toBe(0);
    expect(at(53)).toBeCloseTo(30_000, 6);
    expect(at(59)).toBeCloseTo(30_000 * 1.02 ** 6, 6);
    expect(at(60)).toBe(0); // retirement stops everything
  });

  it('changes at or before current age are shadowed; the later duplicate wins', () => {
    const p = bare();
    p.accounts.roth = {
      balance: 0,
      contribution: 6_000,
      changes: [
        { id: 'past', fromAge: 35, annual: 99_999 },
        { id: 'dup1', fromAge: 45, annual: 1_000 },
        { id: 'dup2', fromAge: 45, annual: 2_000 },
      ],
    };
    expect(contributionSteps(p, 'roth').map((s) => s.annual)).toEqual([6_000, 1_000, 2_000]);
    expect(contributionAtAge(p, 'roth', 40)).toBe(6_000); // past change ignored
    expect(contributionAtAge(p, 'roth', 44)).toBe(6_000);
    expect(contributionAtAge(p, 'roth', 45)).toBe(2_000); // last writer at the same age
  });

  it('an unscheduled account is identical to the legacy flat-contribution formula', () => {
    const p = bare();
    p.assumptions.contributionGrowth = 0.03;
    p.accounts.trad.contribution = 15_000;
    p.incomes = [{ id: 'w', name: 'w', kind: 'w2', annual: 300_000, startAge: 40, endAge: 59, growth: 0 }];
    const proj = project(p, fixedReturns(0));
    for (const r of proj.rows) {
      const legacy = r.age >= 60 ? 0 : 15_000 * 1.03 ** (r.age - 40);
      expect(contributionAtAge(p, 'trad', r.age)).toBeCloseTo(legacy, 8);
      expect(r.contributions.trad).toBeCloseTo(legacy, 6); // income amply funds it
    }
  });

  it('a $0 sabbatical step zeroes those years in the projection and resumes after', () => {
    const p = bare();
    p.accounts.trad = {
      balance: 0,
      contribution: 20_000,
      changes: [
        { id: 's', fromAge: 42, annual: 0 },
        { id: 'r', fromAge: 44, annual: 20_000 },
      ],
    };
    p.incomes = [{ id: 'w', name: 'w', kind: 'w2', annual: 200_000, startAge: 40, endAge: 59, growth: 0 }];
    const proj = project(p, fixedReturns(0));
    const contrib = (age: number) => proj.rows.find((r) => r.age === age)!.contributions.trad;
    expect(contrib(41)).toBeCloseTo(20_000, 6);
    expect(contrib(42)).toBe(0);
    expect(contrib(43)).toBe(0);
    expect(contrib(44)).toBeCloseTo(20_000, 6);
    // Less pre-tax sheltering in sabbatical years ⇒ more tax on the same income.
    const taxes = (age: number) => proj.rows.find((r) => r.age === age)!.taxes.total;
    expect(taxes(42)).toBeGreaterThan(taxes(41));
  });

  it('warns on inert changes: after retirement, in the past, duplicate ages', () => {
    const p = bare();
    p.expenses.currentAnnual = 40_000; // complete plan → only schedule warnings fire
    p.accounts.hsa = {
      balance: 0,
      contribution: 4_000,
      changes: [
        { id: 'late', fromAge: 60, annual: 1_000 },
        { id: 'past', fromAge: 40, annual: 1_000 },
        { id: 'd1', fromAge: 50, annual: 1_000 },
        { id: 'd2', fromAge: 50, annual: 2_000 },
      ],
    };
    const warnings = planIssues(p).filter((i) => i.level === 'warning');
    expect(warnings.map((w) => [w.code, w.changeId])).toEqual([
      ['change-after-retirement', 'late'],
      ['change-in-past', 'past'],
      ['change-duplicate-age', 'd2'],
    ]);
    expect(warnings.every((w) => w.accountType === 'hsa')).toBe(true);
    expect(isIncomplete(planIssues(p))).toBe(false); // warnings never gate the verdict
  });

  it('the demo schedule is clean: no warnings on the seed plan', () => {
    expect(planIssues(seedPlan(START_YEAR))).toEqual([]);
  });
});

describe('scenario identity colors', () => {
  it('assigns the first unused palette slot', () => {
    expect(nextColor([])).toBe(SCENARIO_COLORS[0]);
    expect(nextColor([SCENARIO_COLORS[0]])).toBe(SCENARIO_COLORS[1]);
    // A freed middle slot is reused before extending — deletion never shifts survivors.
    expect(nextColor([SCENARIO_COLORS[0], SCENARIO_COLORS[2]])).toBe(SCENARIO_COLORS[1]);
  });

  it('cycles once the palette is exhausted', () => {
    expect(nextColor([...SCENARIO_COLORS])).toBe(SCENARIO_COLORS[0]);
  });
});

describe('failure timing (failuresByAge)', () => {
  it('bins every failure at the exact failure age when paths are deterministic', () => {
    const p = bare();
    p.accounts.taxable.balance = 150_000;
    p.expenses.currentAnnual = 100_000;
    p.assumptions.expReturn = 0;
    p.assumptions.returnSd = 0; // σ = 0 ⇒ every run follows the same path, failing at 41
    const mc = runMonteCarlo(p, { runs: 600 });
    expect(mc.successRate).toBe(0);
    expect(mc.failuresByAge[41 - p.profile.currentAge]).toBe(600);
    expect(mc.failuresByAge.reduce((s, x) => s + x, 0)).toBe(600);
  });

  it('failures sum to runs − successes on the demo plan', () => {
    const mc = runMonteCarlo(seedPlan(START_YEAR), { runs: 500 });
    const failures = mc.failuresByAge.reduce((s, x) => s + x, 0);
    expect(failures).toBe(Math.round(mc.runs * (1 - mc.successRate)));
    expect(mc.failuresByAge).toHaveLength(mc.ages.length);
  });
});
