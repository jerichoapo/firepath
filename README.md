# 🔥 FirePath

A **local-first financial independence (FIRE) planner** — model your financial future,
stress-test it against 150 years of market history, and compare competing life scenarios,
entirely on your own machine.

No accounts. No bank connections. No server. No telemetry. Your numbers never leave
`localhost` — everything persists to your browser's IndexedDB, with one-click JSON
export/import for backup.

> **Disclaimer:** FirePath is an educational modeling tool, not financial, investment, or
> tax advice. Taxes and market behavior are simplified approximations (see below). Talk to
> a professional before making real decisions.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

The app opens with a generic demo household so every feature has something to show.
Replace the numbers with your own, or use **Data ▾ → Reset to blank plan**.

```bash
npm test           # engine unit tests (vitest)
npm run build      # typecheck + production build
```

## What it does

| Tab | What you get |
|---|---|
| **Plan** | Every input: ages, five account types (taxable / 401k-Trad / Roth / HSA / cash) with balances + contributions, income streams with start/end ages, Social Security estimate + claiming age, spending phases, one-time expenses, return/inflation assumptions (sliders), tax settings, withdrawal order, custom milestones. A live projection updates as you drag. |
| **Projection** | Deterministic year-by-year stacked net-worth chart by account, FI-number and FI-age markers, and a full drill-in table (income, taxes, spending, saved, withdrawn, balances per year). |
| **Monte Carlo** | 500–10,000 trials in a Web Worker (UI never blocks). Normal-distribution returns or **block bootstrap** sampling 5-year slices of real history to preserve momentum. Success probability, 10/25/50/75/90 percentile fan chart, ending-net-worth distribution. |
| **Backtest** | Your plan replayed starting in **every historical year (1871–2024)** with enough remaining data, using real Shiller-derived stock/bond/inflation series. Success rate + the worst start years — sequence-of-returns risk made visible. |
| **Scenarios** | Create, duplicate, rename, delete full plan copies ("Job Change", "New Child", "Retire 5 Years Earlier"). Side-by-side table (FI age, success %, net worth at 45/50/65) and overlaid Monte Carlo median lines. |
| **Timeline** | A horizontal life timeline of computed milestones (Coast FIRE, FI number reached, downshift, retirement, Social Security, RMDs) plus your own markers. |
| **Cash Flow** | A Sankey diagram for any simulated year: income sources → household cash flow → taxes / spending / per-account savings, with a tax breakdown. |

Headline metrics — net worth, FI number, projected FI date, Monte Carlo success %, and a
Coast FIRE badge — stay pinned in the header. Dark mode included.

## Key modeling assumptions

Everything is documented in [DECISIONS.md](DECISIONS.md); the load-bearing ones:

- **Today's dollars, real returns.** All inputs/outputs are inflation-adjusted; the
  expected-return slider means *real* return (D1).
- **Annual steps.** One simulated year per age, flows first, then growth — contributions
  earn a full year (D2, D9).
- **Cash flow is computed, not assumed.** Planned contributions happen only when income
  actually covers them; extra surplus sweeps into taxable; shortfalls trigger withdrawals
  in your configured order, cash buffer first (D4, D8).
- **FI number** = retirement-age spending × your multiplier (default 25×). **Coast FIRE**
  = current invested assets compound to the FI number by retirement age with zero further
  contributions (D10).
- **Success** = a Monte Carlo/backtest path funds every year's spending through life
  expectancy without running dry.
- **Historical data** = annual real S&P total returns, 10-year Treasury total returns, and
  CPI (1871–2024) derived from Robert Shiller's dataset and embedded as static JSON —
  never fetched at runtime (D6).

## Tax model (simplified on purpose)

Federal 2026-estimate brackets + standard deduction, LTCG 0/15/20 stacking, FICA/SE tax,
85%-taxable Social Security, RMDs at the SECURE-2.0 age with the Uniform Lifetime Table,
10% early-withdrawal penalties, Roth contribution-basis access, taxable cost-basis
tracking, and an optional flat or bracketed state tax. All rules live in
[src/engine/taxConfig.ts](src/engine/taxConfig.ts) for easy updating.

**Not modeled:** AMT, NIIT, IRMAA, ACA subsidies, credits, itemized deductions, Roth
conversions/ladders, 72(t), spousal Social Security rules, state LTCG preferences,
contribution limits. Numbers are planning-grade estimates, not tax prep.

## Architecture

```
src/engine/    Pure, fully-tested TypeScript simulation engine — zero React, zero `any`.
               One projection loop (projection.ts) powers deterministic, Monte Carlo,
               and backtest modes via injected return generators (returns.ts).
src/workers/   Web Worker running Monte Carlo (abortable chunks) + backtests.
src/store/     Dexie/IndexedDB persistence + React contexts (plan state, sim results).
src/views/     One component per tab; charts via Recharts (including the Sankey).
scripts/       One-time generator for the embedded historical dataset.
```

Tech: Vite · React 18 · TypeScript (strict) · Tailwind CSS 4 · Recharts · Dexie · Vitest.

## Privacy

FirePath makes zero network requests after `npm install`. Plans live in your browser's
IndexedDB under the `firepath` database. Export JSON backups from the **Data ▾** menu.
