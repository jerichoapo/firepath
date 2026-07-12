# PRODUCT_NOTES — What ProjectionLab Is (research summary)

Researched 2026-07-12 by browsing projectionlab.com: home page, /monte-carlo, /cash-flow,
/tax-analytics, /pricing, and the Help Center (Getting Started, Projections, Milestones
categories, and the simulation-engine article). The in-app sandbox requires an account, so
findings below come from marketing pages, help articles, and screenshots on those pages.
These notes drive FirePath's design; FirePath clones the *concepts and experience*, not the
branding or copy.

## One-line pitch

"Simulate your financial future and chart a course toward your best life" — a privacy-first,
no-account-linking, FIRE-oriented planning simulator where experimentation is meant to be fun
and anxiety-reducing, not a spreadsheet chore.

## Core concepts

- **Current Finances**: the onboarding step. "About You" (individual vs couple, birth year,
  location, display currency) plus current accounts: savings/cash, taxable investments, IRAs/
  401(k)s, real assets, debts. Everything is manually entered — a selling point ("No link to
  your accounts", "You are not the product").
- **Plans**: a plan is a living model of your whole life's finances — income streams, expenses,
  milestones, and strategy settings projected from "now" to end of life. Premium supports
  multiple plans side by side.
- **Milestones**: life decisions placed on the timeline — retirement, career changes, buying a
  home, moving, kids, "buy X every Y years". Milestones can be age-triggered or condition-
  triggered (e.g., "when FI is reached"); users cite multi-condition milestones as decision
  trees. Milestones anchor the storytelling: charts and drill-ins reference them.
- **What-If / Compare Mode**: duplicate a plan, tweak it, and compare outcomes side by side.
  This is the scenario-planning loop (career change, retire earlier, new child...).
- **Progress**: journaling actual net worth over time vs the original projection (out of scope
  for FirePath v1 — explicitly a projection tool, not a tracker).

## Simulation engine (from the help article)

- Simulates **one full year at a time**. Each simulated year handles income, tax withholding,
  expenses, debt payments, dividends, taxes, RMDs, rental income, etc.
- **Yearly surplus or shortfall is computed automatically** — users don't hand-define savings;
  leftover cash follows configurable flow priorities ("Save Anything Leftover" → cash/investing),
  and shortfalls trigger drawdown per a withdrawal strategy.
- Output is **year-by-year**: a data point for "today", then one per simulated year. Stacked
  bar/area charts show year-end snapshots; **clicking a year opens a drill-in summary** of
  exactly what happened (income, taxes, flows, balances).
- **Today's Currency vs Actual Currency**: results can display in real (inflation-adjusted)
  or nominal dollars. Fixed-income items like pensions/SS interact with this carefully.
- Growth models are pluggable: fixed rates, historical sequences, custom sequences, or Monte
  Carlo distributions. Stock/bond allocation and dividend yield are configurable.

## Chance of Success (Monte Carlo)

- Monte Carlo trials with configurable trial count; success framed as a % "chance of success".
- **Backtesting against real historical data** is a first-class alternative to random draws
  (sequence-of-returns risk is part of the pitch: "analyze the sequence of returns").
- Users can drill into individual trials, plot custom metrics, and customize how success rates
  are characterized (outcome categories, risk tolerance).
- Marketing highlights: "test against market volatility", "model black swan events".

## Cash Flow (Sankey)

- Per-year **Sankey diagram**: income sources → total earned income → tax withholding (broken
  down per stream) → inflows → expenses, tax-deferred contributions, leftover to cash/savings.
  Example from docs: $65K salary + $10K side hustle → $17.66K withholding → $57.34K inflows →
  $50K expenses, $1.95K 401(k), $5.39K leftover cash.
- A time view shows how yearly cash flow morphs across accumulation → drawdown phases.

## Tax Analytics

- Estimated taxes per simulated year, by type, with effective bracket visualization and
  marginal-rate analysis per income category. US federal + state presets, plus international.
- Strategies: Roth conversions, 72t/SEPP, contribution/drawdown sequencing, withdrawal
  strategies, capital-gains harvesting; an "Optimize" module auto-searches strategy combos
  (Premium). FirePath explicitly does NOT clone optimization — taxes are applied to whatever
  the plan does.

## UX patterns worth cloning

- **Top-tab navigation** between Plan / Cash Flow / Tax Analytics / Chance of Success views.
- Summary metrics always in view; charts are the hero, inputs feel like building blocks.
- Year-by-year interactivity: click/hover a year → detailed breakdown.
- Sandbox mode with **pre-populated example personas** so the app demos itself in ~1 minute
  before you commit your own numbers (FirePath: generic seed plan + reset-to-blank).
- Sliders and quick-adjust controls; "experimentation is actually fun" — instant feedback.
- Dark-mode-friendly, modern, chart-forward aesthetic.
- Privacy messaging is a feature: local, no accounts, no data leaving the machine.
- Prominent disclaimer: educational/informational, not financial advice.

## Pricing tiers (for scope calibration)

Free: forecasting, Monte Carlo, historical backtesting, flexible modeling. Premium ($129/yr):
cash-flow Sankey, tax estimation/analytics, what-if scenarios + compare mode, withdrawal
strategies, multiple plans, estate planning, Roth conversions, ACA. Pro: advisor features.
FirePath targets roughly "free + the Premium features named in the FirePath brief" (Sankey,
tax estimates, scenarios/compare, withdrawal ordering) and skips estate/optimize/international.

## What FirePath deliberately simplifies

- One household, US-only taxes (federal + simple state), annual granularity.
- No Roth conversion/72t optimization, no estate planning, no progress journaling,
  no rental/real-asset modeling, no debt amortization (model debts as one-time expenses).
- Milestones are computed (Coast FIRE, FI, downshift, retirement, SS, RMD) + user-defined
  age-based markers — no condition-triggered decision trees.
