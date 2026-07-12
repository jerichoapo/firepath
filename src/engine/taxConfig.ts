// All current-year US tax rules live in this ONE file so they are easy to update.
// Figures are 2026 ESTIMATES (post-2025 inflation adjustment). This is an educational
// model, not tax advice. Brackets are assumed inflation-indexed, so they stay valid in
// today's dollars for every simulated year (DECISIONS.md D1/D7).

import type { FilingStatus, TaxBracket } from './types';

export interface FederalTaxYear {
  standardDeduction: Record<FilingStatus, number>;
  ordinaryBrackets: Record<FilingStatus, TaxBracket[]>;
  /** Long-term capital gains brackets (thresholds are TAXABLE income incl. gains). */
  ltcgBrackets: Record<FilingStatus, TaxBracket[]>;
}

export const FEDERAL_2026: FederalTaxYear = {
  standardDeduction: { single: 16_100, married: 32_200 },
  ordinaryBrackets: {
    single: [
      { upTo: 12_400, rate: 0.10 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    married: [
      { upTo: 24_800, rate: 0.10 },
      { upTo: 100_800, rate: 0.12 },
      { upTo: 211_400, rate: 0.22 },
      { upTo: 403_550, rate: 0.24 },
      { upTo: 512_450, rate: 0.32 },
      { upTo: 768_700, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
  ltcgBrackets: {
    single: [
      { upTo: 49_450, rate: 0 },
      { upTo: 545_500, rate: 0.15 },
      { upTo: Infinity, rate: 0.20 },
    ],
    married: [
      { upTo: 98_900, rate: 0 },
      { upTo: 613_700, rate: 0.15 },
      { upTo: Infinity, rate: 0.20 },
    ],
  },
};

/** Social Security wage base (employee OASDI portion caps here). */
export const SS_WAGE_BASE = 184_500;
/** Employee FICA: 6.2% OASDI (capped) + 1.45% Medicare (uncapped). */
export const OASDI_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
/** Self-employment tax applies to 92.35% of net SE income. */
export const SE_TAXABLE_SHARE = 0.9235;
export const SE_TAX_RATE = OASDI_RATE * 2 + MEDICARE_RATE * 2; // 15.3%

/** Share of Social Security benefits treated as taxable ordinary income (top-tier approximation). */
export const SS_TAXABLE_SHARE = 0.85;

/** Early-withdrawal penalty on pre-59.5 tax-deferred + Roth-earnings distributions. */
export const EARLY_WITHDRAWAL_PENALTY = 0.10;
export const PENALTY_FREE_AGE = 59.5;

/** SECURE 2.0: RMDs start at 73, or 75 for those born 1960 or later. */
export function rmdStartAge(birthYear: number): number {
  return birthYear >= 1960 ? 75 : 73;
}

/** IRS Uniform Lifetime Table (2022+). Ages past the table clamp to the last divisor. */
export const RMD_DIVISORS: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
  104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
};

export function rmdDivisor(age: number): number {
  return RMD_DIVISORS[Math.min(age, 110)] ?? RMD_DIVISORS[110];
}
