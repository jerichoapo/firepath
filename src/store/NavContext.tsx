// Active-tab state, lifted into context so the header and views can deep-link
// (e.g. the "Finish setup" chip → Plan tab; later: year cross-links → Cash Flow).

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type TabId =
  | 'plan' | 'projection' | 'montecarlo' | 'backtest' | 'compare' | 'timeline' | 'cashflow';

interface NavState {
  tab: TabId;
  setTab: (t: TabId) => void;
}

const Ctx = createContext<NavState | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabId>('plan');
  const value = useMemo(() => ({ tab, setTab }), [tab]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav outside NavProvider');
  return ctx;
}
