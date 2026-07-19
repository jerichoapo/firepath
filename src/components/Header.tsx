// Always-visible summary bar: scenario switcher, headline metrics, theme, export/import.

import { useEffect, useRef, useState } from 'react';
import { blankPlan } from '../engine/seed';
import { makeScenario } from '../engine/seed';
import { fmtCompact, fmtPct } from '../lib/format';
import { useNav } from '../store/NavContext';
import { usePlanStore } from '../store/PlanContext';
import { useSim } from '../store/SimContext';
import { Confirm, useToast } from './ui';

const ghostBtn = 'min-h-10 rounded-lg border border-[var(--c-border)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--c-grid)]/40 sm:min-h-0';
const menuItemCls = 'block w-full rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-[var(--c-grid)]/40';

function Metric({ label, value, tone, title, computing }: {
  label: string; value: string; tone?: 'good' | 'bad'; title?: string;
  /** Value is stale (a fresh one is computing) — dim it and pulse a dot beside it (F12). */
  computing?: boolean;
}) {
  const color = tone === 'good' ? 'text-[var(--c-good)]' : tone === 'bad' ? 'text-[var(--c-bad)]' : '';
  return (
    <div className="min-w-0 shrink-0 sm:shrink" title={title}>
      <p className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{label}</p>
      <p
        data-computing={computing || undefined}
        className={`truncate text-sm font-semibold tabular-nums transition-opacity ${color} ${computing ? 'opacity-50' : ''}`}
      >
        {value}
        {computing && <span aria-hidden="true" className="ml-1 inline-block animate-pulse text-[var(--c-accent)]">●</span>}
      </p>
    </div>
  );
}

export function Header() {
  const store = usePlanStore();
  const sim = useSim();
  const { setTab } = useNav();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  // An incomplete plan (no retirement spending) makes FI/success/Coast vacuous — show "—" (F1).
  const dash = sim.incomplete;

  // The open menu closes on outside mousedown or Escape, like every menu the user knows (F11).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    const next = document.documentElement.classList.toggle('dark');
    localStorage.setItem('firepath-theme', next ? 'dark' : 'light');
    setDark(next);
  };

  const download = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `firepath-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMenuOpen(false);
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    let text: string;
    try {
      text = await f.text();
    } catch {
      toast({ text: '⚠ Could not read that file.' });
      setMenuOpen(false);
      return;
    }
    const err = store.importJson(text);
    if (err) toast({ text: `⚠ ${err}` });
    setMenuOpen(false);
  };

  const fiLabel = sim.fiAgeVal != null
    ? `Age ${sim.fiAgeVal} · ${sim.plan.planStartYear + sim.fiAgeVal - sim.plan.profile.currentAge}`
    : 'Not reached';

  return (
    // Sticky only from sm up: the mobile header is two rows tall, and pinning it would
    // eat a quarter of the phone viewport (the nav below sticks on its own instead).
    <header className="border-b border-[var(--c-border)] bg-[var(--c-surface)]/95 backdrop-blur sm:sticky sm:top-0 sm:z-20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <img src="/flame.svg" alt="" className="h-6 w-6" />
          <h1 className="text-base font-bold tracking-tight">FirePath</h1>
        </div>

        <select
          aria-label="Active scenario"
          className="max-w-44 rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-base font-medium outline-none sm:text-xs"
          value={store.active.id}
          onChange={(e) => store.dispatch({ type: 'select', id: e.target.value })}
        >
          {store.scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Mobile: the metric strip takes its own full-width row and scrolls sideways —
            without shrink-0 chips + order-last, flexbox crushes every verdict to 0px. */}
        <div className="order-last flex w-full items-center gap-4 overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:gap-5">
          <Metric label="Net worth today" value={fmtCompact(sim.netWorthNow)} />
          <Metric label="FI number" value={dash ? '—' : fmtCompact(sim.fiN)} />
          <Metric label="Projected FI" value={dash ? '—' : fiLabel} tone={!dash && sim.fiAgeVal != null ? 'good' : !dash ? 'bad' : undefined} />
          <Metric
            label={`Success · ${sim.plan.mc.mode === 'normal' ? 'normal MC' : 'bootstrap MC'}`}
            title={
              sim.plan.mc.mode === 'normal'
                ? `Monte Carlo with your assumptions: μ ${(sim.plan.assumptions.expReturn * 100).toFixed(1)}% real, σ ${(sim.plan.assumptions.returnSd * 100).toFixed(1)}%. Compare all three models on the Monte Carlo tab.`
                : `Monte Carlo sampling 5-year blocks of 1871–2024 history at your ${Math.round(sim.plan.assumptions.stockAllocation * 100)}% stock allocation. Compare all three models on the Monte Carlo tab.`
            }
            value={dash ? '—' : sim.mc ? fmtPct(sim.mc.successRate) : 'computing…'}
            tone={!dash && sim.mc ? (sim.mc.successRate >= 0.8 ? 'good' : sim.mc.successRate < 0.6 ? 'bad' : undefined) : undefined}
            computing={!dash && sim.mcComputing}
          />
          {dash ? (
            <button
              type="button"
              onClick={() => setTab('plan')}
              className="whitespace-nowrap rounded-full bg-[var(--c-accent)]/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--c-accent)] hover:bg-[var(--c-accent)]/20"
              title="FI metrics appear once the plan has annual spending."
            >
              ✎ Finish setup: add spending
            </button>
          ) : (
            <span
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                sim.coastNow
                  ? 'bg-[var(--c-good)]/15 text-[var(--c-good)]'
                  : 'bg-[var(--c-grid)]/60 text-[var(--c-muted)]'
              }`}
              title={
                sim.coastNow
                  ? 'Invested assets already compound to your FI number by retirement age with no further contributions.'
                  : sim.coastAgeVal != null
                    ? `Projected to reach Coast FIRE at age ${sim.coastAgeVal}.`
                    : 'Not on track to reach Coast FIRE before retirement age.'
              }
            >
              ⛵ {sim.coastNow ? 'Coast FIRE' : sim.coastAgeVal != null ? `Coast @ ${sim.coastAgeVal}` : 'No coast yet'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={dark}
            aria-label={dark ? 'Dark theme on — switch to light' : 'Light theme on — switch to dark'}
            title={dark ? 'Dark theme on — switch to light' : 'Light theme on — switch to dark'}
            className={ghostBtn}
          >
            {dark ? '🌙' : '☀️'}
          </button>
          <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Export, import, and reset"
            className={ghostBtn}
          >
            Backup ▾
          </button>
          {menuOpen && (
            <div role="menu" aria-label="Backup menu" className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 shadow-xl">
              {[
                { label: '⬇ Export plan JSON', run: download },
                { label: '⬆ Import plan JSON', run: () => file.current?.click() },
                {
                  label: '✦ New blank scenario',
                  run: () => {
                    store.dispatch({ type: 'add', scenario: makeScenario('New Scenario', blankPlan(new Date().getFullYear())) });
                    setMenuOpen(false);
                  },
                },
              ].map((item) => (
                <button key={item.label} type="button" role="menuitem" onClick={item.run} className={menuItemCls}>
                  {item.label}
                </button>
              ))}
              {/* Full wipes are gated behind type-to-confirm — they must not feel like a
                  benign delete (F17). */}
              <Confirm
                title="Replace ALL scenarios with the demo plan?"
                body="Every scenario on this device is deleted. Export a backup first if in doubt."
                confirmLabel="Reset"
                typeWord="RESET"
                className="block w-full"
                onConfirm={() => { store.resetToSeed(); setMenuOpen(false); }}
              >
                {(open) => (
                  <button type="button" role="menuitem" onClick={open} className={menuItemCls}>
                    ⟳ Reset to demo plan
                  </button>
                )}
              </Confirm>
              <Confirm
                title="Replace ALL scenarios with an empty plan?"
                body="Every scenario on this device is deleted. Export a backup first if in doubt."
                confirmLabel="Reset"
                typeWord="RESET"
                className="block w-full"
                onConfirm={() => { store.resetToBlank(); setMenuOpen(false); }}
              >
                {(open) => (
                  <button type="button" role="menuitem" onClick={open} className={menuItemCls}>
                    ○ Reset to blank plan
                  </button>
                )}
              </Confirm>
            </div>
          )}
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              // Read fully BEFORE resetting: clearing the input releases the FileList,
              // and an in-flight f.text() can then die racing Chromium's cleanup.
              // Reset after (win or lose) so re-selecting the same fixed file fires again.
              const input = e.currentTarget;
              void onImport(input.files?.[0]).finally(() => {
                input.value = '';
              });
            }}
          />
        </div>
      </div>
    </header>
  );
}
