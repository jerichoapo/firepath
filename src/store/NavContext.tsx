// Active-tab state, lifted into context so the header and views can deep-link
// (e.g. the "Finish setup" chip → Plan tab; year cross-links → Cash Flow, F22).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type TabId =
  | 'plan' | 'projection' | 'montecarlo' | 'backtest' | 'compare' | 'timeline' | 'cashflow';

interface NavState {
  tab: TabId;
  setTab: (t: TabId) => void;
  /** The age the Cash Flow view shows — kept here so cross-links and returns both land where you were looking. */
  cashFlowAge: number | null;
  setCashFlowAge: (age: number) => void;
  /** Jump to the Cash Flow tab with a specific age selected (F22). */
  goToCashFlow: (age: number) => void;
}

const Ctx = createContext<NavState | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabId>('plan');
  const [cashFlowAge, setCashFlowAge] = useState<number | null>(null);
  const goToCashFlow = useCallback((age: number) => {
    setCashFlowAge(age);
    setTab('cashflow');
  }, []);
  const value = useMemo(
    () => ({ tab, setTab, cashFlowAge, setCashFlowAge, goToCashFlow }),
    [tab, cashFlowAge, goToCashFlow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav outside NavProvider');
  return ctx;
}
