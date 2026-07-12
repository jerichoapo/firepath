// Always-visible summary bar: scenario switcher, headline metrics, theme, export/import.

import { useRef, useState } from 'react';
import { blankPlan } from '../engine/seed';
import { makeScenario } from '../engine/seed';
import { fmtCompact, fmtPct } from '../lib/format';
import { useNav } from '../store/NavContext';
import { usePlanStore } from '../store/PlanContext';
import { useSim } from '../store/SimContext';
import { Btn } from './ui';

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-[var(--c-good)]' : tone === 'bad' ? 'text-[var(--c-bad)]' : '';
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-[var(--c-muted)]">{label}</p>
      <p className={`truncate text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function Header() {
  const store = usePlanStore();
  const sim = useSim();
  const { setTab } = useNav();
  const file = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // An incomplete plan (no retirement spending) makes FI/success/Coast vacuous — show "—" (F1).
  const dash = sim.incomplete;

  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('firepath-theme', dark ? 'dark' : 'light');
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
    const err = store.importJson(await f.text());
    if (err) alert(err);
    setMenuOpen(false);
  };

  const fiLabel = sim.fiAgeVal != null
    ? `Age ${sim.fiAgeVal} · ${sim.plan.planStartYear + sim.fiAgeVal - sim.plan.profile.currentAge}`
    : 'Not reached';

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--c-border)] bg-[var(--c-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <img src="/flame.svg" alt="" className="h-6 w-6" />
          <h1 className="text-base font-bold tracking-tight">FirePath</h1>
        </div>

        <select
          aria-label="Active scenario"
          className="max-w-44 rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-xs font-medium outline-none"
          value={store.active.id}
          onChange={(e) => store.dispatch({ type: 'select', id: e.target.value })}
        >
          {store.scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex flex-1 items-center gap-5 overflow-x-auto">
          <Metric label="Net worth today" value={fmtCompact(sim.netWorthNow)} />
          <Metric label="FI number" value={dash ? '—' : fmtCompact(sim.fiN)} />
          <Metric label="Projected FI" value={dash ? '—' : fiLabel} tone={!dash && sim.fiAgeVal != null ? 'good' : !dash ? 'bad' : undefined} />
          <Metric
            label="Success"
            value={dash ? '—' : sim.mc ? fmtPct(sim.mc.successRate) : `…${Math.round(sim.mcProgress * 100)}%`}
            tone={!dash && sim.mc ? (sim.mc.successRate >= 0.8 ? 'good' : sim.mc.successRate < 0.6 ? 'bad' : undefined) : undefined}
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

        <div className="relative flex items-center gap-1.5">
          <Btn onClick={toggleTheme} title="Toggle dark mode">◐</Btn>
          <Btn onClick={() => setMenuOpen((v) => !v)} title="Data menu">Data ▾</Btn>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 shadow-xl">
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
                {
                  label: '⟳ Reset to demo plan',
                  run: () => {
                    if (confirm('Replace ALL scenarios with the demo plan?')) store.resetToSeed();
                    setMenuOpen(false);
                  },
                },
                {
                  label: '○ Reset to blank plan',
                  run: () => {
                    if (confirm('Replace ALL scenarios with an empty plan?')) store.resetToBlank();
                    setMenuOpen(false);
                  },
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.run}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-[var(--c-grid)]/40"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
      </div>
    </header>
  );
}
