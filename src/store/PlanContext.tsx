import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef,
  type ReactNode,
} from 'react';
import { blankPlan, makeScenario, nextColor, seedPlan, uid } from '../engine/seed';
import type { PlanInput, Scenario } from '../engine/types';
import { saveStore, type StoreState } from './db';
import { parseExport } from './import';

type Action =
  | { type: 'select'; id: string }
  | { type: 'updatePlan'; update: (plan: PlanInput) => PlanInput }
  | { type: 'add'; scenario: Scenario }
  | { type: 'duplicate'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'flag'; key: string }
  | { type: 'replaceAll'; state: Pick<StoreState, 'scenarios' | 'activeId'> };

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'select':
      return { ...state, activeId: action.id };
    case 'updatePlan':
      return {
        ...state,
        scenarios: state.scenarios.map((s) =>
          s.id === state.activeId
            ? { ...s, plan: action.update(s.plan), updatedAt: Date.now() }
            : s,
        ),
      };
    case 'add': {
      // Identity color is assigned here, from the live scenario set — first unused slot.
      const scenario = { ...action.scenario, color: nextColor(state.scenarios.map((s) => s.color)) };
      return { ...state, scenarios: [...state.scenarios, scenario], activeId: scenario.id };
    }
    case 'duplicate': {
      const src = state.scenarios.find((s) => s.id === action.id);
      if (!src) return state;
      const copy = makeScenario(`${src.name} (copy)`, structuredClone(src.plan), nextColor(state.scenarios.map((s) => s.color)));
      return { ...state, scenarios: [...state.scenarios, copy], activeId: copy.id };
    }
    case 'rename':
      return {
        ...state,
        scenarios: state.scenarios.map((s) =>
          s.id === action.id ? { ...s, name: action.name, updatedAt: Date.now() } : s,
        ),
      };
    case 'delete': {
      const remaining = state.scenarios.filter((s) => s.id !== action.id);
      if (remaining.length === 0) {
        const fresh = makeScenario('Blank Plan', blankPlan(new Date().getFullYear()));
        return { ...state, scenarios: [fresh], activeId: fresh.id };
      }
      return {
        ...state,
        scenarios: remaining,
        activeId: state.activeId === action.id ? remaining[0].id : state.activeId,
      };
    }
    case 'flag':
      return { ...state, flags: { ...state.flags, [action.key]: true } };
    case 'replaceAll':
      // Partial by design: flags are device-local and survive imports/resets.
      return { ...state, ...action.state };
  }
}

export interface PlanStore {
  scenarios: Scenario[];
  active: Scenario;
  plan: PlanInput;
  /** One-time UI dismissals; set via setFlag, persisted with the store. */
  flags: Record<string, boolean>;
  dispatch: (a: Action) => void;
  /** Convenience: immutable patch of the active plan. */
  update: (fn: (plan: PlanInput) => PlanInput) => void;
  setFlag: (key: string) => void;
  exportJson: () => string;
  importJson: (text: string) => string | null;
  resetToSeed: () => void;
  resetToBlank: () => void;
}

const Ctx = createContext<PlanStore | null>(null);

export function PlanProvider({ initial, children }: { initial: StoreState; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Debounced autosave of the whole store.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveStore(state), 400);
    return () => clearTimeout(timer.current);
  }, [state]);

  // Flush the pending save when the page goes away — otherwise an edit (or a whole
  // import) made in the 400ms before closing the tab is silently lost.
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      void saveStore(latest.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const update = useCallback(
    (fn: (plan: PlanInput) => PlanInput) => dispatch({ type: 'updatePlan', update: fn }),
    [],
  );

  const value = useMemo<PlanStore>(() => {
    const active = state.scenarios.find((s) => s.id === state.activeId) ?? state.scenarios[0];
    return {
      scenarios: state.scenarios,
      active,
      plan: active.plan,
      flags: state.flags,
      dispatch,
      update,
      setFlag: (key: string) => dispatch({ type: 'flag', key }),
      exportJson: () =>
        JSON.stringify(
          {
            app: 'firepath',
            version: 1,
            exportedAt: new Date().toISOString(),
            scenarios: state.scenarios,
            activeId: state.activeId,
          },
          null,
          2,
        ),
      importJson: (text) => {
        // Every field is schema-checked and rebuilt before it can reach replaceAll —
        // the autosave would otherwise persist a corrupted store (D27).
        const parsed = parseExport(text);
        if (!parsed.ok) return parsed.error;
        dispatch({ type: 'replaceAll', state: { scenarios: parsed.scenarios, activeId: parsed.activeId } });
        return null;
      },
      resetToSeed: () => {
        const seed = makeScenario('Demo Plan', seedPlan(new Date().getFullYear()));
        dispatch({ type: 'replaceAll', state: { scenarios: [seed], activeId: seed.id } });
      },
      resetToBlank: () => {
        const fresh = makeScenario('Blank Plan', blankPlan(new Date().getFullYear()));
        dispatch({ type: 'replaceAll', state: { scenarios: [fresh], activeId: fresh.id } });
      },
    };
  }, [state, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanStore(): PlanStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanStore outside PlanProvider');
  return ctx;
}

export { uid };
