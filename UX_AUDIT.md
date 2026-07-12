# FirePath UX Audit

*Perspective: an experienced product/UX designer who is also a FIRE practitioner — someone who
has actually run their own numbers in ProjectionLab, cFIREsim, and spreadsheets, reviewing
FirePath as shipped (commit `85146cd`). Every issue below was reproduced in the running app
or verified in code. Severity: 🔴 breaks trust or blocks understanding · 🟡 causes friction
or confusion · 🟢 polish/opportunity.*

---

## Executive summary

FirePath's engine is credible and the information architecture (Plan → Projection → Monte
Carlo → Backtest → Scenarios → Timeline → Cash Flow) mirrors how FIRE people actually think.
The five biggest experience problems, in order:

1. **A blank plan announces success.** Zero data in → "Projected FI: Age 30 · Success 100% ·
   ⛵ Coast FIRE." The app congratulates you before you've typed a number. (F1)
2. **Three inputs do nothing.** Inflation, downshift age, and partner age are accepted and
   silently ignored by the engine. Dead controls are the fastest way to lose a
   spreadsheet-literate audience. (F4)
3. **The three success numbers don't reconcile.** Normal Monte Carlo says 75%, bootstrap says
   96%, backtest says 100% — same plan, no explanation anywhere of *why* or *which to trust*.
   Every FIRE forum thread about this app would be that question. (F7)
4. **No input validation.** Life expectancy below current age renders a silently empty chart;
   income streams can end before they start; balances can be negative. Garbage in, blank out,
   no feedback. (F5)
5. **The hero interaction is missing.** The single most-asked FIRE question is "what if I
   retire at X instead of Y?" — retirement age has no slider and no immediate FI-date
   feedback loop, while less important fields (SS claim age) do. (F13)

---

## A. First-run experience & empty states

### F1 🔴 The blank plan reports vacuous success
**Observed:** With all zeros, header shows *FI at 30 · 2026*, *Success 100%*, green *Coast
FIRE* badge. FI number is $0, so "invested ≥ FI number" is trivially true; with no expenses,
no Monte Carlo run can fail.
**Why it matters:** The first thing a from-scratch user sees is the product being wrong. It
also poisons the mental model of what the badge/metrics mean.
**Recommend:** Treat "no expenses OR no FI number" as an *incomplete plan* state: header
metrics render as "—" with a "Finish setting up: add spending and income" prompt; suppress
the Coast badge and success % until `fiNumber > 0` and at least one expense exists.

### F2 🔴 Demo data is not labeled as demo data
**Observed:** First run seeds "Base Plan" (a full fictional couple) with no indication that
these aren't *your* numbers or that you're expected to replace them. ProjectionLab is loud
about "Sandbox mode / example persona."
**Recommend:** A dismissible banner: "This is a demo household so you can explore. Replace it
with your numbers, or start blank." with both actions inline. Rename the seed scenario to
"Demo Plan" so the label carries the message everywhere (header dropdown, compare table).

### F3 🟡 No orientation for the seven tabs
Nothing tells a new user the intended loop (enter plan → check projection → stress-test →
compare scenarios). A one-time 4-bullet "how to use this" card on the Plan tab (dismissable,
lives in the meta table) would cover 80% of onboarding for near-zero code.

---

## B. Inputs that don't do what they promise

### F4 🔴 Three dead inputs: inflation, downshift age, partner age
**Observed/code:** `assumptions.inflation` is never read by the engine (everything is real
dollars — correct design, dead knob). `profile.downshiftAge` only places a timeline marker;
it changes no income, contribution, or spending behavior. `profile.partnerAge` drives only
the Solo/Couple toggle default.
**Why it matters:** A FIRE user *will* drag the inflation slider and expect the projection to
move. When nothing changes, they conclude the app is broken — worse than not having the knob.
The tooltip disclosure ("reference only") is title-attribute-only and effectively invisible.
**Recommend (pick per input):**
- *Inflation:* either remove it and state "all figures are today's dollars, returns are real"
  prominently in the Assumptions card, or make it real: use it to derive a nominal-display
  toggle (see F16). Don't keep a slider that does nothing.
- *Downshift age:* make it do what it says — default new plans' part-time behavior to it, or
  demote it from an input to a computed label on the timeline. An input that is actually a
  *milestone annotation* belongs with milestones, not in Household between two load-bearing
  ages.
- *Partner age:* either give it one real effect (e.g., a second SS claim row keyed to partner
  age — small engine change, big honesty win) or fold it into a plain "Planning as a couple"
  checkbox with copy explaining the single-age simplification.

### F5 🔴 No input validation anywhere
**Observed:** Life expectancy 25 with current age 30 → zero-row projection, empty chart, no
message, header still claims FI/success (see F1). Income endAge < startAge → stream silently
contributes nothing. Balance −$50,000 → accepted; net worth −$50k; engine withdrawal math
(`min(balance, need)`) misbehaves on negative balances. `NumField` passes min/max to the DOM
but typed values are committed unclamped.
**Recommend:** Clamp on commit in `NumField` (it already receives min/max); add three
cross-field rules with inline, non-blocking warnings: `lifeExpectancy > currentAge ≥ 16`,
`endAge ≥ startAge` per stream (highlight the row), `balance ≥ 0` (or explicitly support
debts as a feature — until then, reject). Silent nonsense is the worst of the three options.

### F6 🟡 Advanced tax fields ambush novices
"Taxable cost basis" and "Roth contribution basis" sit mid-card with ⓘ tooltips as the only
explanation, and both silently clamp to balance in the engine. Group them under a collapsed
"Advanced (basis tracking)" disclosure with one sentence of plain-language framing ("used to
estimate taxes when you sell / withdraw early"). Sensible defaults already exist — hide the
complexity until sought.

---

## C. Trust & number reconciliation (the FIRE-nerd killers)

### F7 🔴 75% vs 96% vs 100% — three success rates, zero explanation
**Observed:** Same seed plan: normal MC 75%, bootstrap MC 96%, backtest 100%. Cause: normal
mode uses the user's 5% real / 16% σ; historical modes use the 80/20 portfolio whose real
return averaged ~7.1%. This is *defensible* but *never explained*, and the header always
shows the normal-MC number with no mode indicator.
**Recommend:**
- Header success chip gains a suffix/tooltip: "Monte Carlo (normal, μ=5%)".
- One "About these numbers" callout on the Monte Carlo view: a 3-row mini-table of
  Normal / Bootstrap / Backtest with their return sources and current results side by side —
  turn the discrepancy from a bug-report into the *lesson* (your assumption is more
  conservative than history).
- Show the historical portfolio's mean/σ next to the stock-allocation slider so users see
  the two return models they're implicitly carrying.

### F8 🟡 FI markers measure invested assets; the chart stacks net worth
`fiAge` fires when *invested* (ex-cash) crosses the FI number, but the stacked chart the FI
line is drawn on includes cash — so the visible stack crosses the dashed line *before* the
"FI @ 48" marker. Attentive users will call this a bug. Either draw an "invested" boundary
line on the stack (cash is already the top band — the boundary is just below it), or state in
the legend/subtitle: "FI compares invested assets (excludes cash)."

### F9 🟡 The Timeline's Accumulation/Drawdown bands are wrong for the app's own demo
Bands split at retirement age (55), but the demo household is net-drawing-down from 50–54
(part-time income < spending — verified in engine trace). Derive the bands from actual flows
(first year with net withdrawals = drawdown start) or rename to something honest like
"Working years / Retired."

### F10 🟢 Fixed Monte Carlo seed
Deterministic results are good for comparability, but power users expect a "re-roll" to feel
the sampling noise. Low-cost: a "new draw" icon-button that bumps the seed; keep the default
fixed.

---

## D. Interaction bugs & friction

### F11 🔴 The Data menu doesn't close on outside click
Verified: opens via "Data ▾", stays open after clicking anywhere else; only re-clicking the
button closes it. Add the standard outside-mousedown + Escape handlers. While in there:
"Data" is a vague label for export/import/reset — "Backup & reset" or splitting Export/Import
out as icons would read faster.

### F12 🔴 Header success shows "…62%" while computing — reads as a result
The progress interpolation (`…${progress}%`) uses the same position, size, and % suffix as
the actual success rate. Mid-drag, a user watching the header sees "62%" flash by and anchors
on it. Show a spinner/skeleton or "computing…" without a percent; or keep the *stale result
dimmed* until the new one lands (preferred — no layout jump, see F14).

### F13 🔴 Retirement age — the hero variable — has no slider and no spotlight
SS claim age, spending, and every assumption got sliders; the number every FIRE user drags
first (retire age, then downshift age) is a bare text field buried in Household. Give
retirement age a slider (bounded currentAge+1 → 75) and consider a compact "FI dial" strip on
the Plan tab: retire age + spending + return sliders together, since those three drive 90% of
the plan shape. This is the "experimentation is actually fun" moment ProjectionLab nails.

### F14 🟡 Monte Carlo results vanish during recompute
`mc` is nulled on any plan/settings change, so the fan chart and histogram cards unmount and
the layout collapses to a progress bar, then re-expands. Keep the previous result rendered at
~50% opacity with a thin progress indicator overlaid; swap in place.

### F15 🟡 Scenario workflow requires three-tab round trips
Duplicate (Scenarios) → edit (Plan) → compare (Scenarios). Two cheap improvements: an "Edit
plan →" link on each scenario chip, and after Duplicate, a toast: "Now editing *Retire at 50*
— change something, then come back to compare." Also: creating/duplicating silently switches
the *active* scenario, which changes every number in the header without announcement — the
toast fixes that too.

### F16 🟡 Withdrawal-order reordering only moves items left
One-directional "←" controls mean moving an item right requires moving every other item left.
Add "→" (or up/down arrows in a vertical list, which also reads more like a priority order).

### F17 🟢 Native confirm()/alert() dialogs
Functional but off-brand and un-styled for destructive actions (reset all, delete scenario).
A small in-app confirm popover would also enable "type-to-confirm" for the two full-wipe
resets, which currently differ from a benign scenario delete by nothing but the sentence.

### F18 🟢 Raw number entry
Six-figure balances display as `120000` while editing and in the fields at rest. Format with
thousands separators when unfocused (`120,000`) — an established pattern the existing
NumField local-text architecture supports cleanly.

---

## E. Information design & charts

### F19 🟡 Scenario colors follow list position, not identity
`scenarioColor(i)` is index-based: delete scenario #1 and every other scenario changes color
across the compare table and overlay chart mid-session. Assign a color at scenario creation
(store it on the scenario) so identity is stable — this is also the #1 rule of the app's own
chart-design system.

### F20 🟡 Sankey node labels can clip
Left/right margins are fixed (150/170 px); user-entered stream names longer than ~20
characters (or "Extra savings → Taxable") clip at the SVG edge with no ellipsis or tooltip
fallback on the text itself. Truncate with "…" at ~18 chars (full name in the existing
tooltip) or measure-and-widen margins.

### F21 🟢 Histogram bin labels
X labels are bin *lower bounds* rendered as plain values ("$1.2M"), which read as exact
outcomes. Label as ranges in the tooltip (already done) and consider "$1.2–1.5M" on hover; at
minimum, caption says "top 5% grouped" — good — extend it: "bars labeled by bin start."

### F22 🟢 Missing cross-links between views
The timeline milestones, backtest worst-years, and projection table rows are all natural
links into the Cash Flow view's year selector ("what happened at 53?"). One `onSelectYear`
navigation would make the whole app feel connected. (ProjectionLab's click-a-bar-drill-in is
the pattern.)

---

## F. Missing FIRE-native content (gaps an enthusiast notices in 5 minutes)

### F23 🟡 No savings rate anywhere
The community's *first* metric. The engine already computes surplus per year — surface
"Savings rate this year: 34%" in the header or Plan live-panel. Trivial to derive
(saved ÷ after-tax income), high signal.

### F24 🟡 No SWR framing next to the FI multiplier
"25× spending" and "4% rule" are the same fact in two dialects; show both: "FI multiplier:
25× (= 4.0% withdrawal rate)." Costs one formatted string, removes one mental conversion.

### F25 🟢 No quick stress presets
Common FIRE stress tests are one-click-able: "Social Security −25%", "returns −1%", "spending
+10%". Each is just a scenario-duplicate with a tweak — a "stress test" menu on the Scenarios
tab would showcase the compare machinery.

### F26 🟢 Failure timing is invisible
Success % says *whether* runs fail, never *when*. A small "failures by age" strip under the
fan chart (or shading the fan below $0) answers the natural follow-up: "if it breaks, does it
break at 70 or at 90?" The data (`failedAtAge`) already exists per run — it's just not
aggregated into the result payload yet.

### F27 🟢 Roth-ladder honesty note
Early retirees will notice pre-59.5 tax-deferred withdrawals eat a 10% penalty and ask where
the conversion ladder is. It's deliberately out of scope (README says so) — but the *UI*
should say so at the moment it matters: a one-line note in the Taxes card ("No Roth
conversion/ladder modeling — early tax-deferred withdrawals pay the 10% penalty here, which
is conservative").

---

## G. Accessibility

### F28 🟡 Tooltips are title-attribute-only
All ⓘ explanations use `title`, which never fires on touch or keyboard focus and delays
~1s on hover. Since tooltips carry load-bearing caveats (dead inputs, basis semantics), move
to a focusable popover or, cheaper, an expandable help line under the field label.

### F29 🟡 No data-table alternative for MC/backtest charts
Projection has its year table (great); the fan chart, histogram, and backtest bars are
chart-or-nothing. Per the app's own chart-accessibility rule, add a "view as table" toggle —
percentile values per age and per-start-year outcomes are both already computed and trivially
tabular.

### F30 🟢 Minor: dark-mode toggle glyph "◐" is unlabeled state
It has a title, but shows no current state (am I in dark or toggling to dark?). Sun/moon icon
pair or `aria-pressed` + label fixes it.

---

## What's already working well (keep these)

- **The tab order tells the right story** — inputs → certainty → uncertainty → history →
  comparison → life → mechanics. It matches the FIRE decision loop.
- **Backtest is genuinely educational**: the worst-start-years table surfacing 1955–1962
  (real stagflation sequence risk) with "same plan, different luck" framing is the best
  sequence-risk explainer format there is.
- **The header as a persistent verdict** (NW / FI number / FI date / success / Coast badge)
  is exactly the right always-on summary; every fix above feeds it.
- **Live deterministic feedback** while typing is fast and never blocks; the worker split is
  invisible, as it should be.
- **The engine is honest** about funded-vs-planned contributions (surplus-capped) — most
  hobby calculators get this wrong and inflate outcomes.
- **Failure states in-year** (red table rows, Sankey shortfall banner) treat plan failure as
  information, not shame.

---

## Prioritized fix list

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | F1 + F2: incomplete-plan state + demo banner | S | Trust at first touch |
| 2 | F4: kill or wire the three dead inputs | S–M | Trust for the core audience |
| 3 | F5: input clamping + 3 cross-field warnings | S | Prevents silent nonsense |
| 4 | F7: reconcile the three success numbers (labels + mini-table) | S | The credibility question |
| 5 | F11 + F12: menu outside-click; non-ambiguous computing state | S | Daily-touch friction |
| 6 | F13: retirement-age slider / FI dial | S | The hero interaction |
| 7 | F14: keep stale MC results during recompute | S | Perceived stability |
| 8 | F19: stable scenario colors | S | Compare-view integrity |
| 9 | F23 + F24: savings rate + SWR framing | S | FIRE-native fluency |
| 10 | F28 + F29: real tooltips; table views for charts | M | Accessibility debt |

*Effort: S = under an hour each, M = a few hours. Nothing here requires engine changes except
the optional partner-SS row (F4) and failure-age aggregation (F26).*
