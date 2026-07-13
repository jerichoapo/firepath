# FirePath UX Fixes — Implementation Plan

Turns [UX_AUDIT.md](UX_AUDIT.md) (findings F1–F30) into eight phases. Each phase is a
coherent slice of the codebase, lands independently, and ends with a runnable end-to-end
test story — the app is always shippable between phases.

## Phasing principles

1. **Trust before delight.** Phases 1–3 fix everything that makes the app *lie* (vacuous
   success, dead inputs, unreconciled numbers). Fun and polish come after.
2. **One code area per phase** where possible, so diffs stay reviewable and regressions
   are attributable: validation module → engine → sim/header plumbing → PlanView → scenario
   store → charts.
3. **Shared primitives land in the phase that first needs them** (validation module in P1,
   nav context in P6, help popover in P5) and are reused later — nothing is built twice.
4. **Every phase has an E2E acceptance script.** Written as Given/When/Then checks; they
   become Playwright specs if Phase 0 is adopted, or a manual browser checklist if not.

### Phase exit gate (applies to every phase)

- [ ] `npm test` green (including any new engine tests)
- [ ] `npm run build` clean (tsc strict, no `any` in engine)
- [ ] Phase E2E acceptance checks pass against `npm run dev`
- [ ] New ambiguity resolutions appended to DECISIONS.md
- [ ] One commit per phase (`phase N: <summary>`), push to `main`

**Before Phase 0:** commit UX_AUDIT.md + this plan (`docs: UX audit and implementation plan`).

---

## Phase overview

| Phase | Theme | Findings | Effort | Engine changes? |
|-------|-------|----------|--------|-----------------|
| 0 | E2E test harness (Playwright) | — | ~2h | No |
| 1 | Plan validity & honest first run | F1 F2 F3 F5 | ~5h | New pure `validate.ts` |
| 2 | Dead inputs: kill or wire | F4 F24 F27 | ~5h | Partner SS (small) |
| 3 | Number reconciliation | F7 F8 F9 F23 | ~4h | Two pure helpers |
| 4 | Interaction & feedback mechanics | F11 F12 F14 F16 F18 F30 | ~4h | No |
| 5 | Plan-tab hero & help system | F6 F13 F28 | ~3h | No |
| 6 | Scenario workflow | F15 F17 F19 F25 | ~4h | No (store only) |
| 7 | Charts, tables & cross-navigation | F10 F20 F21 F22 F26 F29 | ~6h | MC failure ages |
| 8 | Contribution schedules & input efficacy | post-audit | ~8h | Age-varying contributions |

Total ≈ 4–5 working days. All 30 audit findings are covered; the three explicitly deferred
ideas are listed at the end.

---

## Phase 0 — E2E test harness *(recommended, skippable)*

**Why first:** 8 of the audit's top-10 fixes are UI-behavioral (menu closing, computing
states, validation warnings, stale-result rendering) — exactly what vitest can't see. One
spec file per phase gives every later phase automated regression cover.

**Scope (deliberately minimal):**
- `@playwright/test` as devDependency, chromium only, `npm run e2e` targeting the vite dev
  server (`webServer` config). No CI wiring — local runs only, same as `npm test`.
- Test fixtures: `freshApp` (clears IndexedDB `firepath` before load), `seedApp` (demo
  data), `blankApp` (blank scenario active).
- One smoke spec: app loads, all 7 tabs render, header shows the four metric chips,
  demo scenario is seeded on first run.

**E2E acceptance:** `npm run e2e` passes the smoke spec on a clean checkout.

**If skipped:** every phase below still lists its acceptance checks — run them manually
against the dev server. Nothing else in the plan depends on Playwright.

---

## Phase 1 — Plan validity & honest first run

**Goal:** a brand-new user's first five minutes never show a false claim. The app knows
when a plan is *incomplete* (can't be judged) or *invalid* (nonsensical inputs) and says so
instead of reporting success.

**Findings:** F1 (blank plan announces success) · F5 (no validation) · F2 (demo data
unlabeled) · F3 (no orientation).

**Design decisions:**
- New pure module `src/engine/validate.ts`:
  `planIssues(plan): PlanIssue[]` where `PlanIssue = { level: 'incomplete' | 'invalid', code, message, field? }`.
  - *Incomplete* when `fiNumber ≤ 0` (no retirement spending defined) — the single
    condition that makes FI age / success / Coast vacuous.
  - *Invalid*: `lifeExpectancy ≤ currentAge`; any income stream with `endAge < startAge`;
    any negative balance or basis.
- Debts-as-negative-balances is **rejected, not supported** (matches audit): clamp to ≥ 0.
- Header treats `incomplete` as: FI number / Projected FI / Success render "—", Coast badge
  replaced by a neutral "Finish setup: add spending" chip that deep-links to the Plan tab.
- Demo seed renamed **"Demo Plan"**; dismissible banner on first run ("This is a demo
  household… Replace with your numbers / Start blank") with both actions inline; dismissal
  stored in the Dexie `meta` table. Same mechanism powers a one-time 4-bullet "how FirePath
  works" card on the Plan tab (F3).

**Changes by file:**
- `src/engine/validate.ts` (new) + tests in `engine.test.ts`
- `src/components/ui.tsx` — `NumField` clamps typed values to `[min, max]` on commit
- `src/components/Header.tsx` — incomplete-state rendering
- `src/views/PlanView.tsx` — inline warning rows (invalid streams highlighted, negative
  inputs clamped with a brief note), orientation card
- `src/engine/seed.ts` — seed name; `src/App.tsx` or PlanView — demo banner
- `src/store/db.ts` / `PlanContext` — persisted dismissal flags in `meta`

**Unit tests:** `planIssues` on blank plan → incomplete; LE 25 / age 30 → invalid; stream
end 40 / start 50 → invalid; negative balance → invalid; seed plan → no issues.

**E2E acceptance:**
- Given a blank scenario, the header shows "—" for FI/success, no Coast badge, and a
  "Finish setup" chip; When spending + an account balance are entered, Then real metrics
  appear.
- Typing life expectancy 25 with age 30 → value clamps (or inline warning shows) and the
  chart never renders silently empty while metrics claim success.
- Typing −50000 into a balance → commits as 0 with a visible note.
- Fresh first run shows the demo banner naming "Demo Plan"; dismissing it, then reloading,
  keeps it dismissed; "Start blank" switches to an empty plan (which shows the incomplete
  state, proving F1×F2 compose).

**DECISIONS.md:** D19 — incompleteness = `fiNumber ≤ 0`; negative balances rejected until
debts are a real feature.

---

## Phase 2 — Dead inputs: kill or wire (the honesty phase)

**Goal:** every visible control provably changes something. One input is removed, one is
demoted to what it really is, one gains a real engine effect.

**Findings:** F4 (inflation / downshift age / partner age) · F24 (SWR framing) · F27
(Roth-ladder note).

**Design decisions (per input):**
- **Inflation → remove the slider.** Replace with static copy in the Assumptions card:
  *"All figures are today's dollars; returns are real (inflation-adjusted)."* The field
  stays in `PlanInput` so saved JSON round-trips; a display-only nominal toggle is deferred
  (see Deferred list) because it would have to sweep every chart/table or create
  mixed-mode confusion.
- **Downshift age → demote to a milestone annotation.** Move the input from Household to
  the Milestones card ("Downshift / part-time — timeline marker only"); the timeline keeps
  its 🌤️ marker. It never changed money behavior; now its placement says so.
- **Partner age → wire it.** Engine gains partner Social Security:
  `socialSecurity.partner?: { annual: number; claimAge: number }`, paid when the *partner's*
  age (primary age − age offset) reaches `partner.claimAge`, taxed at the same 85% share.
  PlanView shows the partner SS row only in Couple mode. Seed plan gains a partner benefit
  so the demo exercises it. **Note:** demo headline numbers (75% / 96% / 100% in the audit)
  will shift — expected, re-verify in Phase 3's explainer.
- F24: FI multiplier label becomes "25× spending (= 4.0% withdrawal rate)" — computed, so
  20× shows 5.0%.
- F27: one-line note in the Taxes card: *"No Roth conversion/ladder modeling — early
  tax-deferred withdrawals pay the 10% penalty here, which is conservative."*

**Changes by file:** `types.ts`, `projection.ts`, `seed.ts` (+ tests) · `PlanView.tsx`
(Assumptions copy, Household cleanup, Milestones input, SS partner row, SWR label, tax
note) · `TimelineView.tsx` (marker reads new location).

**Unit tests:** partner 3 years younger, claim 67 → benefit starts the year primary is 70
(hand-check the row); solo plans ignore `partner`; SS taxation unchanged for combined
benefit; JSON import of a pre-P2 export still loads (field absent → undefined).

**E2E acceptance:**
- Assumptions card has no inflation slider and shows the real-dollars statement.
- Couple mode: entering partner SS (30k @ 67) with partner 3 years younger makes Social
  Security in the projection table/Sankey step up twice, the second step 3 years after the
  first. Switching to Solo hides the row and removes the second step.
- Downshift age now lives with milestones; changing it moves only the timeline marker.
- FI multiplier slider at 25 shows "= 4.0%", at 20 shows "= 5.0%".

**DECISIONS.md:** D20 (inflation demoted to copy; nominal display deferred), D21 (partner
SS is the one couple-mode engine effect; everything else stays single-age).

---

## Phase 3 — Number reconciliation (the credibility phase)

**Goal:** every number on screen can explain itself, and no two numbers visibly contradict
each other.

**Findings:** F7 (75% vs 96% vs 100%) · F8 (FI line vs net-worth stack) · F9 (timeline
bands wrong) · F23 (savings rate).

**Design decisions:**
- New pure helper `portfolioStats(stockAllocation)` in `returns.ts` → `{ mean, sd }` of the
  historical blended portfolio (tested against the known ~7.1% real for 80/20).
- Header success chip gains a mode tag ("Monte Carlo · normal" / "· bootstrap") with a
  tooltip naming the return source (μ/σ inputs vs historical blocks).
- Monte Carlo view gets an **"About these numbers"** card: 3 rows — Normal MC (your
  μ=5%, σ=16%), Bootstrap MC (historical 5-yr blocks at your allocation), Backtest (every
  historical start) — each with its return source and its *live* success number.
  Both MC modes are computed for this card (results are cached per mode, so the extra cost
  is one MC run on first view).
- Stock-allocation slider caption shows the implied historical stats: "Historical at 80/20:
  7.1% real · σ 12.x%" — the user sees both return models they're carrying.
- F8: `NetWorthArea` draws an **"Invested (excl. cash)" boundary line** (netWorth − cash,
  thin dashed) — the series the FI line actually compares against — plus a legend entry.
  The visible crossing now matches the "FI @ 48" marker exactly.
- F9: timeline bands derive from actual flows: drawdown starts at the first age where
  `withdrawals + rmd > contributions + leftoverToTaxable`; bands renamed
  **"Saving / Drawing down."** Fallback to retireAge if no such year.

**Changes by file:** `returns.ts` (+ tests) · `Header.tsx` · `MonteCarloView.tsx` ·
`SimContext.tsx` (cache both modes for the explainer) · `NetWorthArea.tsx` ·
`TimelineView.tsx` · `PlanView.tsx` (allocation caption) · `metrics.ts` (savings rate
helper, + test).

**Unit tests:** `portfolioStats(0.8)` ≈ historical mean/σ (matches generate-script
sanity stats); drawdown-start derivation on the demo plan returns 50 (not 55);
`savingsRate(row)` = saved ÷ (gross − taxes), undefined when no income.

**E2E acceptance:**
- MC view shows the 3-row explainer; the Normal row equals the header chip; switching
  header mode tag updates accordingly.
- Projection chart: invested boundary line crosses the FI reference line at the same age
  as the FI marker (spot-check via tooltip at fiAge).
- Timeline on the demo plan shows "Drawing down" beginning at 50.
- Plan live rail shows "Savings rate this year: NN%" and it moves when income changes.

**DECISIONS.md:** D22 (drawdown bands are flow-derived, not retirement-age-derived).

---

## Phase 4 — Interaction & feedback mechanics

**Goal:** the app never feels broken in the hand — menus close, computing states look like
computing, results don't vanish, controls go both ways.

**Findings:** F11 (menu outside-click) · F12 ("…62%" reads as a result) · F14 (MC results
vanish) · F16 (one-directional reorder) · F18 (raw numbers) · F30 (theme glyph).

**Design decisions:**
- Data menu: outside-mousedown + Escape close; relabel **"Backup ▾"** (export/import/reset
  is what it holds).
- F12+F14 are one fix: `SimContext` keeps the **previous MC/backtest result** while
  recomputing and exposes `computing: boolean`. Views render the stale result at reduced
  opacity with a thin progress bar overlaid; the header keeps the stale success % dimmed
  with a pulsing dot; a plan with *no* prior result shows "computing…" (never a bare
  percent). Fan chart and histogram cards never unmount.
- F16: withdrawal order becomes a vertical priority list with ↑/↓ buttons (reads as an
  order, both directions, keyboard-accessible).
- F18: `NumField` shows thousands separators when not focused (`120,000`), raw digits
  while editing. Percent/age fields unaffected.
- F30: theme toggle becomes ☀️/🌙 with `aria-pressed` and a label naming the *current*
  state.

**Changes by file:** `Header.tsx` · `SimContext.tsx` · `MonteCarloView.tsx` /
`BacktestView.tsx` (dim-while-computing) · `PlanView.tsx` (withdrawal list) · `ui.tsx`
(NumField display formatting).

**E2E acceptance:**
- Open Backup menu, click the page body → menu closes; reopen, press Escape → closes.
- Change spending, watch the header: success chip shows the old % dimmed, never an
  interpolated "…NN%", then swaps to the new value; the fan chart remains visible
  (dimmed) throughout — no layout collapse.
- Withdrawal order: move an item down then up; both work; order persists after reload.
- A balance field reads `120,000` at rest, `120000` while editing; committed value
  unchanged.
- Theme button announces state (aria-pressed flips) and glyph changes.

---

## Phase 5 — Plan-tab hero & help system

**Goal:** the "what if I retire at X?" loop becomes the most fun interaction in the app,
and every caveat is actually reachable (keyboard/touch), not hidden in a `title` attribute.

**Findings:** F13 (retirement-age slider / FI dial) · F6 (basis fields ambush novices) ·
F28 (title-only tooltips).

**Design decisions:**
- **"Quick levers" strip** at the top of the Plan tab: retirement age (slider,
  currentAge → 80), annual spending, expected return — the three inputs that drive 90% of
  plan shape — with a live readout of projected FI age + success beside them (values
  already stream from SimContext; adjacency is the feature).
- Retirement age also gains its slider in Household (same field, both places patch the
  same value).
- F6: taxable cost basis + Roth basis move into a collapsed **"Advanced: basis tracking"**
  disclosure inside the Accounts card, with one plain-language sentence ("used to estimate
  taxes when you sell, or withdraw Roth early").
- F28: new `Help` component — focusable ⓘ button opening a positioned popover on
  click/focus (Escape closes, `aria-describedby` wired). Replaces every load-bearing
  `title=` in NumField/labels. Hover `title` remains only as a bonus, never the sole
  channel.

**Changes by file:** `ui.tsx` (Help popover; NumField adopts it) · `PlanView.tsx` (levers
strip, disclosure, field regrouping).

**E2E acceptance:**
- Dragging the retirement-age slider from 55 → 50 updates the header FI age and the levers
  readout live (debounced), no page jank.
- Basis fields are hidden until the disclosure is opened; state persists per session.
- Tab to an ⓘ and press Enter → popover opens and is readable; Escape closes it. Works
  with the mouse too. (Keyboard path is the acceptance test.)

---

## Phase 6 — Scenario workflow

**Goal:** comparing futures — the core FIRE activity — stops requiring three-tab round
trips and silent state switches, and scenario identity is stable.

**Findings:** F19 (index-based colors) · F15 (round-trips + silent active switch) · F17
(native confirm()) · F25 (stress presets).

**Design decisions:**
- `Scenario` gains `color: string`, assigned at creation from the categorical palette
  (first unused slot); existing stores are backfilled on load. Compare table and overlay
  chart read the stored color — deleting a scenario never repaints survivors (this is the
  app's own chart rule, F19).
- New lightweight **NavContext** (tab state lifted from App) — needed here for "Edit
  plan →" links and reused by Phase 7 cross-links.
- **Toast component** (single slot, auto-dismiss): after Duplicate/Create — "Now editing
  ‘Retire at 50’ — change something, then come back to compare." This also announces the
  active-scenario switch that currently happens silently.
- **Confirm popover** replaces `window.confirm`/`alert`: standard confirm for scenario
  delete; **type-to-confirm** (type the word RESET) for the two full-wipe resets, which
  currently differ from a benign delete by nothing but the sentence.
- **Stress-test menu** on the Scenarios tab: "SS −25%", "Returns −1%", "Spending +10%" —
  each duplicates the active scenario with the tweak applied and a suffixed name, then
  shows the toast. Pure showcase of existing compare machinery.

**Changes by file:** `types.ts` (color) · `seed.ts` (assign) · `PlanContext.tsx`
(backfill, add/duplicate) · `CompareView.tsx` (chips, presets, stored colors) · new
`ui.tsx` additions (Toast, Confirm) · `App.tsx` (NavContext) · `Header.tsx` (resets use
Confirm).

**E2E acceptance:**
- Create 3 scenarios, note colors; delete the first; the remaining two keep their exact
  colors in the table and overlay chart, after reload too.
- Duplicate → toast names the new scenario; "Edit plan →" on a chip lands on the Plan tab
  with that scenario active.
- "Reset to blank" requires typing RESET; cancel path leaves data intact; scenario delete
  is a one-click confirm popover (no native dialog anywhere).
- "Spending +10%" preset creates a scenario whose compare row shows a lower success rate
  than the base.

**DECISIONS.md:** D23 (scenario color is identity, stored at creation).

---

## Phase 7 — Charts, tables & cross-navigation

**Goal:** the analytical views answer follow-up questions ("*when* does it fail?", "what
happened at 53?") and meet the app's own chart-accessibility rules.

**Findings:** F26 (failure timing) · F29 (no table alternative) · F20 (Sankey clipping) ·
F21 (histogram bins) · F22 (cross-links) · F10 (fixed seed).

**Design decisions:**
- **F26 — failures by age (engine):** `McAccumulator` gains `failedAt: number[]`
  (per-run `proj.failedAtAge`, already computed in `mcRun`); `McResult` gains
  `failuresByAge: number[]` aligned to `ages`. Worker payload grows accordingly. UI: a
  thin "if it fails, when" strip under the fan chart (bars in `--c-bad`, caption
  "N% of runs fail; peak failure age NN").
- **F29 — Chart | Table toggle** (Segmented, per Card) on: fan chart (age × p10…p90),
  histogram (bin range × count), backtest (every start year × outcome — the worst-10
  table generalized). All three datasets already exist in memory.
- **F20:** Sankey node labels truncate at ~18 chars with "…"; full name via SVG `<title>`
  and the existing tooltip.
- **F21:** histogram tooltip labels bins as ranges ("$1.2M – $1.5M"); axis caption notes
  "bars labeled by bin start."
- **F22:** using Phase 6's NavContext plus a `selectedYear` signal: clicking a projection
  table row or a timeline milestone jumps to Cash Flow with that year selected. Rows/markers
  get pointer affordance + `aria-label` ("View cash flow at age 53").
- **F10:** a 🎲 "new draw" button beside the MC seed behavior — bumps the seed (kept in
  SimContext state, passed to the worker); default remains the fixed `DEFAULT_SEED` for
  reproducibility.

**Changes by file:** `montecarlo.ts` (+ tests) · `sim.worker.ts` · `SimContext.tsx` (seed
state) · `MonteCarloView.tsx` · `BacktestView.tsx` · `SankeyView.tsx` ·
`ProjectionView.tsx` · `TimelineView.tsx` · `chartTheme.tsx` (table-toggle styling if
shared).

**Unit tests:** a plan constructed to fail at a known age (reuse the age-41 failure
fixture) → `failuresByAge` counts land on the right index; sum of failures =
runs × (1 − successRate).

**E2E acceptance:**
- MC view on a stressed plan shows the failure strip; its total matches (1 − success%) of
  runs; a 100%-success plan hides the strip.
- Each of the three charts toggles to a table whose spot-checked cell matches its chart
  tooltip value.
- A 25-char income stream name renders truncated with "…" in the Sankey and shows in full
  on hover.
- Clicking the projection row for age 53 lands on Cash Flow with "Age 53" selected.
- 🎲 changes the success % slightly and the fan chart redraws; reloading returns to the
  deterministic default.

**DECISIONS.md:** D24 (seed re-roll is session-only; persistence keeps the fixed default).

---

## Phase 8 — Contribution schedules & input efficacy *(post-audit, user-requested)*

**Goal:** two promises. (a) Planned contributions can vary by age — "I put $32k in my
401(k) until 45, then $15k" — with the same phase mental model as Spending. (b) Every
number the user can type provably impacts exactly what it is supposed to impact, enforced
by tests that will fail if any future field ships dead or mis-wired.

### 8a — Age-varying contribution schedules

**Design decisions:**
- `AccountInput` gains optional `changes?: { id: string; fromAge: number; annual: number }[]`.
  The existing `contribution` field stays as the level in force from today until the first
  change — every existing plan, export, and test remains valid with no migration. Semantics
  are identical to `SpendingPhase`: a level that changes at an age and holds until the next
  change; all contributions still stop at `retireAge`.
- New pure helper `contributionAtAge(account, currentAge, age)` in the engine, mirroring
  `spendingAtAge`. The projection loop's `planned[t]` computation calls it; nothing else in
  the loop changes.
- **`contributionGrowth` compounds within the step in force, from that step's own start
  age** (the base level's start is `currentAge`). The number the user types is what goes in
  during that step's first year — matching how income-stream `growth` works, and unlike the
  current global `(1+g)^yearIndex` which would silently distort typed step amounts. This is
  a small behavior change for schedules only; unscheduled accounts are numerically identical
  to today (single step starting at currentAge ⇒ same exponent).
- Validation (warning level, not invalid): a change with `fromAge ≥ retireAge` never takes
  effect; `fromAge ≤ currentAge` is shadowed by the base level; two changes at the same age
  on one account. Engine sorts by `fromAge` and last-writer-wins so no input can crash it.
- Import validator (D27 pattern): `changes` is an optional array; each entry rebuilt
  (`fromAge`/`annual` finite numbers, `id` non-empty string); reject wrong types by path.
  Export round-trips.
- **UI (per agreed mockup):** the Accounts card keeps its 5-row grid. Each contribution
  cell gains a small timeline button ("Vary by age"). Expanded, the row shows the schedule:
  the base level pinned as "From age {currentAge} — now", then one row per change
  (from-age + amount + remove), then "+ Add change at age…". Collapsed, a scheduled account
  shows a summary ("$32k → $15k @45 → $8k @50") instead of a bare input. Accounts without
  schedules look exactly as they do today.
- **Funded-vs-planned footer** in the Accounts card: the engine funds contributions from
  actual surplus and silently scales them down (`pretaxScale`/`contribFactor`) — invisible
  today, dangerous once schedules make over-planning easy. Footer compares year-1 planned
  (Σ `contributionAtAge` at currentAge) against year-1 funded (Σ `rows[0].contributions`):
  "Planned $72k/yr · fully funded ✓" or "⚠ Income funds $61k of $72k planned" (warning
  color, help popover explaining the scaling).

**Changes by file:** `types.ts` · `projection.ts` (+ `contributionAtAge`) · `validate.ts`
· `store/import.ts` (+ tests) · `PlanView.tsx` (schedule editor, footer) · `seed.ts`
(demo plan gains one schedule so the feature is discoverable and exercised).

**Unit tests:** `contributionAtAge` step boundaries (inclusive fromAge, holds until next,
zero at retireAge); growth exponent resets per step; unscheduled account bit-identical to
pre-P8 projection; sabbatical ($0 step then resume); import round-trip + type rejection by
path; funded-vs-planned math on an over-planned fixture.

**E2E acceptance:**
- Demo plan: expand the 401(k) schedule, add "from 45 → $15k"; the live-rail net worth at
  retirement drops; the collapsed summary reads "$32k → $15k @45"; reload persists it.
- A $0 step at 40 and a resume step at 43 → projection table contributions column shows
  0 for ages 40–42, resumes at 43.
- Schedule an amount larger than income at that age → footer flips to the ⚠ funded state;
  removing the step restores "fully funded".
- Export → wipe → import restores the schedule exactly (summary + expanded rows).

### 8b — Input efficacy matrix ("every number does what it says")

**Design decisions:**
- **Engine-level sensitivity harness** (unit test, the strong guarantee): a table-driven
  test walks every leaf field of `PlanInput` with an explicit classification — each field
  is either **EFFECTIVE** (perturbing it must change a named observable: deterministic
  projection, MC result, backtest, timeline, or validation output) or **INERT-BY-DESIGN**
  (documented: `downshiftAge`, milestone names/ages, `mc.runs`/`mc.mode` w.r.t. the
  deterministic path, display-only `inflation`, stream/expense `name`s). The harness fails
  on any unclassified field — a future field cannot ship without declaring what it does,
  and a wiring regression (field stops mattering) fails the suite.
- Direction checks where sign is meaningful: more spending ⇒ FI number up, success down;
  higher return ⇒ final net worth up; later claim age ⇒ SS starts later.
- Scope-isolation checks (the subtle bugs): `returnSd` and `stockAllocation` must NOT move
  the deterministic projection; `stockAllocation` must move bootstrap MC and backtest but
  not normal-mode MC; `cashReturn` matters only when cash > 0; `kind` w2 vs se changes
  FICA vs SE tax, not gross income.
- **E2E input-impact spec**, one test per Plan-tab card (not per field — keeps CI sane):
  each test edits that card's fields through the real inputs and asserts a specific cheap
  deterministic readout moves (live-rail stats, header FI number, projection table cells),
  plus the card's negative assertion (e.g. editing downshift age / a milestone leaves the
  FI number byte-identical). MC-only knobs (trials, mode, σ) get one MC-based test with the
  existing keep-stale/`data-computing` wait helpers. Withdrawal order gets a drawdown
  fixture asserting reordering changes which account depletes first in the projection table.

**Changes by file:** new `src/engine/sensitivity.test.ts` · new `e2e/input-impact.spec.ts`
· fixes for anything the matrix catches (unknown until it runs — that's the point).

**E2E acceptance:** the new specs pass; any field the harness exposes as dead is either
wired or explicitly reclassified inert with a visible UI cue (the F4 rule: placement/copy
must say so).

**DECISIONS.md:** D28 (contribution schedules: level-change steps, per-step growth
compounding, retireAge cap); D29 (every `PlanInput` field carries an efficacy
classification enforced by the sensitivity harness).

**Exit gate:** standard (unit + build + e2e green, one commit per sub-phase or one for
both, push, live-verify in browser).

---

## Deferred (explicitly not in these phases)

| Idea | Source | Why deferred |
|------|--------|--------------|
| Nominal-dollars display toggle | F4 alternative | Must sweep every chart/table at once or it creates mixed-mode confusion; revisit as its own project after P3's real/nominal copy has landed. |
| Roth conversion-ladder modeling | F27 | Out of product scope per README; P2 adds the honest UI note at the moment it matters. |
| Debts / negative balances as a feature | F5 | Rejected at validation for now (D19); would touch withdrawal math and net-worth semantics. |

## Suggested cadence

Phases 1–3 first and in order — they are the trust repairs and each later phase renders
numbers that P1–P3 make honest. Phases 4–7 are independent of each other and can be
reordered or interleaved if priorities shift; only P7's cross-links depend on P6's
NavContext (extractable on its own in ~15 minutes if P7 runs first).
