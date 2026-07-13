// Core data model for the FirePath simulation engine.
// Everything is in TODAY'S (inflation-adjusted) dollars and REAL rates of return. See DECISIONS.md D1.

export type AccountType = 'taxable' | 'trad' | 'roth' | 'hsa' | 'cash';
export type InvestedAccountType = Exclude<AccountType, 'cash'>;

export const ACCOUNT_TYPES: AccountType[] = ['taxable', 'trad', 'roth', 'hsa', 'cash'];
export const INVESTED_TYPES: InvestedAccountType[] = ['taxable', 'trad', 'roth', 'hsa'];

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  taxable: 'Taxable brokerage',
  trad: '401(k) / Trad IRA',
  roth: 'Roth IRA',
  hsa: 'HSA',
  cash: 'Cash',
};

/** A scheduled change to an account's planned contribution: a new level that takes
 *  effect at `fromAge` and holds until the next change (or retirement). */
export interface ContributionChange {
  id: string;
  fromAge: number;
  /** New annual contribution level from that age, in today's $. */
  annual: number;
}

export interface AccountInput {
  balance: number;
  /** Planned annual contribution while working (today's $). Funded only from actual surplus. */
  contribution: number;
  /** Age-based level changes (D28). Absent/empty = flat `contribution` until retirement. */
  changes?: ContributionChange[];
}

export type IncomeKind = 'w2' | 'se';

export interface IncomeStream {
  id: string;
  name: string;
  /** w2 = wages (FICA withheld); se = self-employment/1099 (SE tax). */
  kind: IncomeKind;
  annual: number;
  startAge: number;
  /** Inclusive last age the income is received. */
  endAge: number;
  /** Real annual growth rate of this stream (0.01 = +1%/yr above inflation). */
  growth: number;
}

export interface SocialSecurityInput {
  /** Estimated annual benefit in today's $ (user supplies; no bend-point math). */
  annual: number;
  claimAge: number;
  /** Partner's own benefit, keyed to the PARTNER's age (D21). Ignored for solo plans. */
  partner?: { annual: number; claimAge: number };
}

export interface SpendingPhase {
  id: string;
  /** Phase applies from this age (inclusive) until the next phase begins. */
  fromAge: number;
  annual: number;
}

export interface OneTimeExpense {
  id: string;
  name: string;
  age: number;
  /** Positive = expense (down payment, college). Negative = one-time windfall. */
  amount: number;
}

export interface ExpensesInput {
  /** Annual spending from now until the first phase begins. */
  currentAnnual: number;
  phases: SpendingPhase[];
  oneTimes: OneTimeExpense[];
}

export interface Assumptions {
  /** Expected real return of invested accounts (mean). */
  expReturn: number;
  /** Standard deviation of annual real returns. */
  returnSd: number;
  /** Expected CPI inflation. Display/reference only — the model is real (D1). */
  inflation: number;
  /** Real return on cash (0 = keeps pace with inflation). */
  cashReturn: number;
  /** Stock share (0..1) used to build portfolios from historical stock/bond data. */
  stockAllocation: number;
  /** Real annual growth of planned contributions ("savings rate growth"). */
  contributionGrowth: number;
  /** FI number = retirement spending × this multiplier (25 ⇒ 4% rule). */
  fiMultiplier: number;
}

export type FilingStatus = 'single' | 'married';

export interface TaxBracket {
  /** Upper bound of the bracket in today's $; Infinity for the top bracket. */
  upTo: number;
  rate: number;
}

export type StateTaxMode = 'none' | 'flat' | 'brackets';

export interface TaxSettings {
  filingStatus: FilingStatus;
  stateMode: StateTaxMode;
  stateFlatRate: number;
  stateBrackets: TaxBracket[];
  stateStdDeduction: number;
  /** Order accounts are tapped to cover shortfalls (cash is always tapped first). */
  withdrawalOrder: InvestedAccountType[];
}

export type McMode = 'normal' | 'bootstrap';

export interface McSettings {
  runs: number;
  mode: McMode;
}

export interface UserMilestone {
  id: string;
  name: string;
  age: number;
}

export interface Profile {
  currentAge: number;
  /** Partner's current age; null when planning solo. Informational + default filing status. */
  partnerAge: number | null;
  /** Age of planned "downshift" (drop to part-time / coast). Informational milestone; model it via income streams. */
  downshiftAge: number;
  /** Planned contributions stop at this age; FI number is based on spending at this age. */
  retireAge: number;
  /** Simulate through this age (inclusive). */
  lifeExpectancy: number;
}

export interface PlanInput {
  profile: Profile;
  /** Calendar year that "now" refers to; fixes age→year mapping and RMD birth-year rules. */
  planStartYear: number;
  accounts: Record<AccountType, AccountInput>;
  /** Cost basis of the current taxable balance (gains = balance − basis). */
  taxableCostBasis: number;
  /** Lifetime Roth contributions to date (withdrawable tax/penalty-free). */
  rothBasis: number;
  incomes: IncomeStream[];
  socialSecurity: SocialSecurityInput;
  expenses: ExpensesInput;
  assumptions: Assumptions;
  tax: TaxSettings;
  mc: McSettings;
  milestones: UserMilestone[];
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Chart identity color, assigned at creation and never reassigned (D25). */
  color: string;
  plan: PlanInput;
}

// ---------------------------------------------------------------------------
// Projection output

export interface TaxesPaid {
  federal: number;
  state: number;
  fica: number;
  penalties: number;
  total: number;
}

/** One simulated year. Balances are END of year (after flows, then growth). */
export interface YearRow {
  age: number;
  year: number;
  balances: Record<AccountType, number>;
  netWorth: number;
  /** taxable + trad + roth + hsa (cash excluded) — the FI-relevant number. */
  invested: number;
  /** Earned income by stream id (active streams only). */
  incomeByStream: Record<string, number>;
  socialSecurity: number;
  rmd: number;
  grossIncome: number;
  taxes: TaxesPaid;
  spending: number;
  oneTimeNet: number;
  contributions: Record<AccountType, number>;
  /** Surplus swept into taxable after planned contributions. */
  leftoverToTaxable: number;
  withdrawals: Record<AccountType, number>;
  /** Spending the plan could NOT fund this year (accounts empty). */
  unfundedSpending: number;
  failed: boolean;
}

export interface ProjectionResult {
  rows: YearRow[];
  /** First age where spending went unfunded, or null if the plan never breaks. */
  failedAtAge: number | null;
  finalNetWorth: number;
}

/** Real portfolio return for invested accounts for simulated year index i (0-based). */
export type ReturnGenerator = (yearIndex: number) => number;
