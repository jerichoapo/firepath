# DECISIONS — ambiguity resolutions and rationale

Running log of judgment calls made while building FirePath. Newest at the bottom.

## D1. Everything is modeled in today's (real) dollars
All inputs, projections, and charts are in inflation-adjusted "today's dollars", and returns
are **real** returns. This is the convention most FIRE planning uses (ProjectionLab calls it
"Today's Currency") and it removes an entire class of UI confusion. The inflation assumption
is still used where nominal rules leak in: tax brackets are assumed to be inflation-indexed
(true since 2018+, so brackets stay fixed in real dollars — no adjustment needed), and the
historical dataset stores real returns directly. Consequence: a "flat" salary means constant
purchasing power, and the expected-return slider means real return (default 5%, ~7% nominal
minus ~2% inflation).

## D2. Annual time step, ages not calendar years
The engine simulates whole years indexed by the primary person's age (like ProjectionLab's
365-day steps and year-end snapshots). Calendar year = current year + (age − currentAge),
shown alongside age in tables/charts. Sub-year granularity is out of scope (ProjectionLab
doesn't do it either).

## D3. Fixed five-account model
Exactly five accounts — taxable brokerage, tax-deferred (401k/Trad IRA combined), Roth IRA,
HSA, cash — rather than an arbitrary account list. The brief enumerates exactly these; a fixed
set keeps the UI, withdrawal ordering, and tax treatment simple and testable. Employer match
can be baked into the contribution number by the user.

## D4. Surplus/shortfall is computed, contributions are planned but funded only if affordable
Like ProjectionLab, the engine auto-computes each year's cash flow. Planned per-account
contributions happen only while earned income exists and age < retirement age, are capped by
actual surplus (scaled down pro-rata when income can't cover them), and any surplus beyond
planned contributions sweeps to the taxable account ("save anything leftover"). Shortfalls
trigger withdrawals in the configured order. This keeps "savings rate" honest instead of
letting contributions run on a negative cash flow.

## D5. Single portfolio return applied to all invested accounts
One expected-real-return + volatility assumption drives taxable/trad/Roth/HSA growth (cash
gets its own real rate, default 0%). Per-account asset allocation is out of scope; the
stock/bond split assumption exists only where a portfolio must be constructed from historical
stock+bond series (backtest and block-bootstrap modes). Deterministic and normal-Monte-Carlo
modes use the user's mean/σ directly.

## D6. Historical dataset: Shiller-derived, embedded at build time
Annual real stock total returns, real 10-year-Treasury total returns, and CPI inflation for
1871–2024, generated once (scripts/generateHistoricalData.mjs) from the Shiller monthly
dataset (datahub/datasets mirror of ie_data.xls) and committed as a static JSON file. Jan→Jan
observations; dividends assumed paid annually; bond total return via the standard
constant-maturity par-bond approximation from GS10 yields. 2023–2024 rows come from hardcoded
Jan-2024/Jan-2025 observations (CSV mirror's derived columns end mid-2023) using the same
formulas. No runtime fetching.

## D7. Simplified-but-shaped tax model (documented per-rule in engine/tax.ts)
Federal: 2026 ordinary brackets + standard deduction + LTCG 0/15/20 stacking, single or MFJ.
State: none, flat %, or user-defined brackets. Social Security: 85% of benefit is taxable
(the top-tier approximation; real phase-in rules are out of scope). Tax-deferred withdrawals
are ordinary income; taxable withdrawals realize gains pro-rata against tracked cost basis;
Roth withdrawals draw contribution basis first (tax/penalty-free), then earnings (ordinary tax
+ 10% penalty before 59.5); trad withdrawals before 59.5 add a 10% penalty (no SEPP/ladder
modeling); HSA withdrawals are assumed qualified-medical (tax-free) at any age. RMDs start at
the SECURE-2.0 age (73, or 75 if born 1960+) using the Uniform Lifetime Table; forced excess
is reinvested in taxable. NIIT, IRMAA, AMT, credits, FICA on the employer side: out of scope.
FICA (7.65% on W-2, 14.13% effective SE tax on 1099) IS modeled since it's large and simple.

## D8. Withdrawal order: cash buffer first, then configurable
Cash is always spent first when there's a shortfall (it's the checking account), then the
user-configurable order among taxable → tax-deferred → Roth → HSA (default exactly that).
Gross-up for taxes on withdrawals is solved by a 3-pass fixed-point iteration per year, which
converges well within $1 for realistic inputs.

## D9. Growth timing: flows first, then returns (documented in engine)
Each simulated year applies cash flows (income, contributions, withdrawals) at the start of
the year, then applies that year's return to the post-flow balance. A hand-check with fixed
return r and start-of-year contribution c must satisfy B₁ = (B₀ + c)·(1+r) exactly, which the
unit tests assert against closed-form compound growth.

## D10. FI metrics defined as pure functions
FI number = spending in the first year of full retirement × configurable multiplier (default
25×). FI age = first age where invested assets (taxable+trad+Roth+HSA, cash excluded) ≥ FI
number in the deterministic projection. Coast FIRE at age a = invested(a) × (1+r)^(retireAge−a)
≥ FI number, i.e., you could stop contributing today and still hit the number. Success
probability = share of Monte Carlo runs where the plan funds every year's spending through
life expectancy (a run fails the moment a withdrawal can't be covered).

## D11. Income modeling
Income streams have start/end ages and an optional real growth rate; "savings rate growth"
from the brief is implemented as that per-stream real growth plus contributions growing at the
same rate as the salary that funds them is NOT assumed — planned contributions instead grow at
a single global "contribution growth" assumption (default 0%) to keep the knobs orthogonal.
Social Security is one manual estimate + claiming age (no bend-point math, no spousal rules).

## D12. Monte Carlo defaults
5,000 runs default (10,000 max, 500 min), seeded mulberry32 PRNG so results are reproducible
and testable. Normal mode: i.i.d. N(μ, σ) real returns. Block bootstrap mode: 5-year blocks
(named constant) sampled with replacement from the historical portfolio-return series built
from the user's stock/bond split — preserves momentum/mean-reversion streaks. Inflation is not
separately simulated (everything is real; D1).

## D13. Tech choices
React 18 + Vite 6 + TypeScript strict. Tailwind CSS v4 (via @tailwindcss/vite, class-based
dark mode). Recharts for all charts including the Sankey (avoids a D3 dependency). Dexie 4 for
IndexedDB persistence with a 400 ms debounced autosave. Vitest for engine tests. Zero runtime
network calls; zero telemetry.

## D14. Scenario data model
The Dexie DB stores independent scenario rows (full PlanInput copies, like ProjectionLab's
What-If plans) plus a tiny meta row holding the active scenario id and UI prefs. Duplicating a
scenario copies the whole input set. Comparison view recomputes deterministic + Monte Carlo
results per scenario on demand rather than persisting any derived output (derive, don't store).

## D15. Seed persona
First run seeds "Base Plan": a 35/34 couple, $95K+$60K salaries, $12K/yr 1099 side income,
typical balances ($120K taxable, $210K trad, $60K Roth, $18K HSA, $30K cash), downshift at 50,
retire at 55, SS at 67, spending $72K now / $80K ages 55–70 / $65K after, one-time home
down-payment and college expenses, plus two user milestones. Generic, plausible, and
demonstrates every feature (phases, one-times, SS, milestones) without being anyone's real
numbers. One click "Reset to blank plan" zeroes everything.

## D16. Partner age is informational
The partner-age input drives the couple/solo toggle (defaulting filing status expectations)
and appears in the household card, but income streams, Social Security, and penalties are
keyed to the primary person's age. A couple models the partner's income as its own stream
and can fold both SS benefits into the single household estimate. Full dual-person age
tracking (two RMD clocks, two SS claims, survivor spending) is deliberate scope cut — it
roughly doubles engine complexity for marginal planning value at this fidelity.

## D17. The Sankey shows funded flows at gross values
Income sources appear gross (before withholding); taxes, spending, per-account
contributions (including pre-tax), and the leftover sweep appear as outflows of a single
"household cash flow" hub, so inflow always equals outflow. In a failure year the spending
node shrinks to what was actually fundable and a warning banner shows the gap (a Sankey
cannot draw money that doesn't exist).

## D18. UI inputs commit on change, not on blur
Text/number fields and the scenario rename commit to state on every keystroke (debounced
400 ms into IndexedDB). Blur-only commits lose edits when focus never lands (automation,
some keyboard flows) and add a stale-value class of bugs for zero benefit at this scale.

## D19. Plan validity gates the verdict; debts are rejected, not modeled
A plan with no retirement spending has an FI number of $0, which makes "FI reached",
"Coast FIRE", and "100% success" trivially true — so `fiNumber ≤ 0` marks the plan
*incomplete* and the header/simulation views show "—" plus a "finish setup" prompt instead
of a verdict. Cross-field contradictions (life expectancy ≤ current age, income streams
ending before they start, negative balances or basis) are *invalid*: flagged inline and
non-blocking, per src/engine/validate.ts. Numeric fields clamp to their min/max on
blur/Enter — never mid-keystroke, preserving D18's commit-on-change — so partial numbers
don't jump while typing. Negative balances are clamped to $0 rather than accepted: debt
modeling would change withdrawal math and net-worth semantics, and half-supporting it is
worse than not supporting it. UI dismissals (demo banner, orientation card) persist in the
Dexie meta table as device-local flags, deliberately excluded from JSON export/import.

## D20. The inflation input is gone; the convention is stated instead
Everything in FirePath is today's dollars with real returns (D1), so an inflation slider
can never move a number — and a knob that does nothing reads as a broken app. The slider
is removed and replaced by a visible statement in the Assumptions card. The `inflation`
field stays in the data model so old exports round-trip. A nominal-dollars *display*
toggle (which would make inflation meaningful again) is deferred: it must sweep every
chart and table at once or it creates mixed-mode confusion.

## D21. Partner Social Security is the one couple-mode engine effect (refines D16)
`socialSecurity.partner {annual, claimAge}` pays a second benefit keyed to the PARTNER's
own age (primary age − age gap), taxed at the same 85% share as part of the combined
household benefit. This makes partner age a real input rather than decoration, at ~5 lines
of engine cost. Everything else in D16 stands: one RMD clock, one penalty age, one
retirement age — full dual-person tracking remains out of scope. The downshift-age input
moved from Household to the Milestones card and is labeled as a timeline marker, which is
all it ever was.
