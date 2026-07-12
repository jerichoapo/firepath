import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { loadStore, type StoreState } from './store/db';
import { PlanProvider } from './store/PlanContext';
import { SimProvider } from './store/SimContext';
import { BacktestView } from './views/BacktestView';
import { CompareView } from './views/CompareView';
import { MonteCarloView } from './views/MonteCarloView';
import { PlanView } from './views/PlanView';
import { ProjectionView } from './views/ProjectionView';
import { SankeyView } from './views/SankeyView';
import { TimelineView } from './views/TimelineView';

const TABS = [
  { id: 'plan', label: 'Plan', view: PlanView },
  { id: 'projection', label: 'Projection', view: ProjectionView },
  { id: 'montecarlo', label: 'Monte Carlo', view: MonteCarloView },
  { id: 'backtest', label: 'Backtest', view: BacktestView },
  { id: 'compare', label: 'Scenarios', view: CompareView },
  { id: 'timeline', label: 'Timeline', view: TimelineView },
  { id: 'cashflow', label: 'Cash Flow', view: SankeyView },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function App() {
  const [store, setStore] = useState<StoreState | null>(null);
  const [tab, setTab] = useState<TabId>('plan');
  useEffect(() => {
    void loadStore().then(setStore);
  }, []);

  if (!store) {
    return <div className="grid h-screen place-items-center text-sm text-[var(--c-muted)]">Loading your plans…</div>;
  }

  const View = TABS.find((t) => t.id === tab)!.view;
  return (
    <PlanProvider initial={store}>
      <SimProvider>
        <Header />
        <nav className="sticky top-[49px] z-10 border-b border-[var(--c-border)] bg-[var(--c-page)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  tab === t.id
                    ? 'border-[var(--c-accent)] text-[var(--c-accent)]'
                    : 'border-transparent text-[var(--c-ink-2)] hover:text-[var(--c-ink)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-4">
          <View />
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-6 pt-2 text-[11px] text-[var(--c-muted)]">
          FirePath is a local-only educational modeling tool, not financial advice. All data stays in your browser.
        </footer>
      </SimProvider>
    </PlanProvider>
  );
}
