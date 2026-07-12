// Simplified US tax math. Every simplification is documented in DECISIONS.md D7.

import {
  FEDERAL_2026, MEDICARE_RATE, OASDI_RATE, SE_TAXABLE_SHARE, SE_TAX_RATE, SS_WAGE_BASE,
} from './taxConfig';
import type { TaxBracket, TaxSettings } from './types';

/** Progressive tax on `amount` using cumulative brackets. */
export function bracketTax(amount: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (amount <= lower) break;
    tax += (Math.min(amount, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

/** LTCG stack on top of ordinary taxable income: gains fill the LTCG brackets above it. */
export function ltcgTax(ordinaryTaxable: number, gains: number, brackets: TaxBracket[]): number {
  return bracketTax(ordinaryTaxable + gains, brackets) - bracketTax(ordinaryTaxable, brackets);
}

/** Employee FICA on W-2 wages + SE tax on 1099 income. Returns { fica, halfSeDeduction }. */
export function payrollTax(w2: number, se: number): { fica: number; halfSeDeduction: number } {
  const w2Fica = Math.min(w2, SS_WAGE_BASE) * OASDI_RATE + w2 * MEDICARE_RATE;
  const seTax = Math.max(0, se) * SE_TAXABLE_SHARE * SE_TAX_RATE;
  return { fica: w2Fica + seTax, halfSeDeduction: seTax / 2 };
}

export interface IncomeTaxInputs {
  /** Ordinary income before standard deduction (wages − pretax contribs + taxable SS + trad withdrawals + RMD + taxed Roth earnings − ½ SE tax). */
  ordinaryIncome: number;
  /** Realized long-term capital gains. */
  ltcgIncome: number;
}

export function federalTax({ ordinaryIncome, ltcgIncome }: IncomeTaxInputs, filing: 'single' | 'married'): number {
  const cfg = FEDERAL_2026;
  const deduction = cfg.standardDeduction[filing];
  // The deduction offsets ordinary income first; any remainder shelters gains.
  const ordinaryTaxable = Math.max(0, ordinaryIncome - deduction);
  const leftoverDeduction = Math.max(0, deduction - ordinaryIncome);
  const taxableGains = Math.max(0, ltcgIncome - leftoverDeduction);
  return bracketTax(ordinaryTaxable, cfg.ordinaryBrackets[filing])
    + ltcgTax(ordinaryTaxable, taxableGains, cfg.ltcgBrackets[filing]);
}

/** States are modeled as taxing ordinary income + gains identically. */
export function stateTax({ ordinaryIncome, ltcgIncome }: IncomeTaxInputs, tax: TaxSettings): number {
  if (tax.stateMode === 'none') return 0;
  const taxable = Math.max(0, ordinaryIncome + ltcgIncome - tax.stateStdDeduction);
  if (tax.stateMode === 'flat') return taxable * tax.stateFlatRate;
  return bracketTax(taxable, tax.stateBrackets);
}
