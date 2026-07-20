// Boots cloud sync when configured (D31). Renders nothing. Lives inside PlanProvider
// so it can hand the sync engine a bridge to the validated export/import paths, and
// re-notify the engine on every store change (the engine debounces actual pushes).

import { useEffect, useRef } from 'react';
import { usePlanStore, type PlanStore } from './PlanContext';
import { cloudEnabled, hasStoredSession, initCloud, notifyLocalChange, setBridge } from './cloud';

export function CloudBoot() {
  const store = usePlanStore();
  const latest = useRef<PlanStore>(store);
  latest.current = store;

  useEffect(() => {
    if (!cloudEnabled) return;
    // The ref indirection keeps the bridge stable while always reading fresh state.
    setBridge({
      exportJson: () => latest.current.exportJson(),
      importJson: (text) => latest.current.importJson(text),
    });
    // Only devices with a persisted session pay for the supabase-js chunk at startup;
    // everyone else loads it on demand from the account panel.
    if (hasStoredSession()) void initCloud();
  }, []);

  useEffect(() => {
    if (cloudEnabled) notifyLocalChange(store.exportJson());
  }, [store]);

  return null;
}
