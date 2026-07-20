import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Btn, ToastProvider } from './components/ui';
import { fmtCompact, fmtPct } from './lib/format';
import { CloudBoot } from './store/CloudBoot';
import { loadStore, type StoreState } from './store/db';
import { NavProvider, useNav, type TabId } from './store/NavContext';
import { PlanProvider, usePlanStore } from './store/PlanContext';
import { SimProvider, useSim } from './store/SimContext';
import { BacktestView } from './views/BacktestView';
import { CompareView } from './views/CompareView';
import { MonteCarloView } from './views/MonteCarloView';
import { PlanView } from './views/PlanView';
import { ProjectionView } from './views/ProjectionView';
import { SankeyView } from './views/SankeyView';
import { TimelineView } from './views/TimelineView';

const TABS: { id: TabId; label: string; view: () => JSX.Element }[] = [
  { id: 'plan', label: 'Plan', view: PlanView },
  { id: 'projection', label: 'Projection', view: ProjectionView },
  { id: 'montecarlo', label: 'Monte Carlo', view: MonteCarloView },
  { id: 'backtest', label: 'Backtest', view: BacktestView },
  { id: 'compare', label: 'Scenarios', view: CompareView },
  { id: 'timeline', label: 'Timeline', view: TimelineView },
  { id: 'cashflow', label: 'Cash Flow', view: SankeyView },
];

export default function App() {
  const [store, setStore] = useState<StoreState | null>(null);
  useEffect(() => {
    void loadStore().then(setStore);
  }, []);

  if (!store) {
    return <div className="grid h-screen place-items-center text-sm text-[var(--c-muted)]">Loading your plans…</div>;
  }

  return (
    <PlanProvider initial={store}>
      <SimProvider>
        <NavProvider>
          <ToastProvider>
            <CloudBoot />
            <Shell />
          </ToastProvider>
        </NavProvider>
      </SimProvider>
    </PlanProvider>
  );
}

function Shell() {
  const { tab, setTab } = useNav();
  const View = TABS.find((t) => t.id === tab)!.view;
  // On phones the tab strip scrolls; keep the active tab in view even when it was
  // activated from elsewhere (a projection-row click can select the Cash Flow tab).
  const navScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    navScroll.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);
  return (
    <>
      <Header />
      {/* Mobile: the header above is static, so the nav pins to the very top. */}
      <nav className="sticky top-0 z-10 border-b border-[var(--c-border)] bg-[var(--c-page)]/95 backdrop-blur sm:top-[49px]">
        <MobileVerdict />
        <div className="relative">
          <div ref={navScroll} data-testid="nav-tabs" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:py-2.5 ${
                  tab === t.id
                    ? 'border-[var(--c-accent)] text-[var(--c-accent)]'
                    : 'border-transparent text-[var(--c-ink-2)] hover:text-[var(--c-ink)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Off-screen tabs exist on phones; iOS hides scrollbars, so hint with a fade. */}
          <div
            aria-hidden="true"
            data-testid="nav-fade"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:hidden"
            style={{ background: 'linear-gradient(to left, var(--c-page), transparent)' }}
          />
        </div>
      </nav>
      <DemoBanner />
      <main className="mx-auto max-w-7xl px-4 py-4">
        <View />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-6 pt-2 text-[11px] text-[var(--c-muted)]">
        FirePath is a local-only educational modeling tool, not financial advice. All data stays in your browser.
      </footer>
    </>
  );
}

/** One-line verdict riding the mobile sticky bar (P1): the header's full metric strip
 *  is static on phones and scrolls away, but the type→verdict loop must survive that.
 *  Hidden from sm up, where the sticky header already keeps the metrics on screen. */
function MobileVerdict() {
  const sim = useSim();
  if (sim.incomplete) return null;
  return (
    <div
      data-testid="mobile-verdict"
      className="flex items-center gap-4 overflow-x-auto border-b border-[var(--c-border)]/60 px-4 py-1.5 text-[11px] tabular-nums text-[var(--c-ink-2)] sm:hidden"
    >
      <span className="whitespace-nowrap">
        FI <b className="text-[var(--c-ink)]">{fmtCompact(sim.fiN)}</b>
      </span>
      <span className="whitespace-nowrap">
        {sim.fiAgeVal != null
          ? <>reached <b className="text-[var(--c-ink)]">@ {sim.fiAgeVal}</b></>
          : <b className="text-[var(--c-bad)]">not reached</b>}
      </span>
      <span className={`whitespace-nowrap transition-opacity ${sim.mcComputing ? 'opacity-50' : ''}`}>
        <b className="text-[var(--c-ink)]">{sim.mc ? fmtPct(sim.mc.successRate) : '…'}</b> success
      </span>
    </div>
  );
}

/** First-run notice that the seeded numbers are a demo, not the user's (F2). */
function DemoBanner() {
  const store = usePlanStore();
  if (store.flags.demoBannerDismissed || store.active.name !== 'Demo Plan') return null;
  return (
    <div className="border-b border-[var(--c-border)] bg-[var(--c-accent)]/8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-xs">
        <p className="min-w-52 flex-1">
          👋 <b>This is a demo household</b> so you can explore every feature. Replace the
          numbers with yours on the Plan tab — or wipe it and start from scratch.
        </p>
        <Btn onClick={() => { store.resetToBlank(); store.setFlag('demoBannerDismissed'); }}>
          Start blank
        </Btn>
        <Btn variant="primary" onClick={() => store.setFlag('demoBannerDismissed')}>
          Explore the demo
        </Btn>
      </div>
    </div>
  );
}
