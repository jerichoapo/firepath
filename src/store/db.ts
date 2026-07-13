// IndexedDB persistence via Dexie. Two tables: full scenario rows + a meta row
// for the active scenario id. All data stays on this machine.

import Dexie, { type EntityTable } from 'dexie';
import { makeScenario, nextColor, seedPlan } from '../engine/seed';
import type { Scenario } from '../engine/types';

interface MetaRow {
  key: string;
  value: string;
}

export const db = new Dexie('firepath') as Dexie & {
  scenarios: EntityTable<Scenario, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({ scenarios: 'id', meta: 'key' });

export interface StoreState {
  scenarios: Scenario[];
  activeId: string;
  /** One-time UI dismissals (demo banner, orientation card). Device-local; never exported/imported. */
  flags: Record<string, boolean>;
}

function parseFlags(raw: string | undefined): Record<string, boolean> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Load everything, seeding the demo plan on first run.
 *  The read-and-seed runs in ONE transaction: React StrictMode double-mounts the app in
 *  dev, and two concurrent loads against an empty database must not both seed. */
export async function loadStore(): Promise<StoreState> {
  let scenarios = await db.transaction('rw', db.scenarios, db.meta, async () => {
    const existing = await db.scenarios.toArray();
    if (existing.length > 0) return existing;
    const seed = makeScenario('Demo Plan', seedPlan(new Date().getFullYear()));
    await db.scenarios.put(seed);
    await db.meta.put({ key: 'activeId', value: seed.id });
    return [seed];
  });
  // Stores written before scenarios had identity colors: backfill in palette order.
  // The next autosave persists the assignment.
  const used = scenarios.map((s) => s.color).filter(Boolean);
  for (const s of scenarios) {
    if (!s.color) {
      s.color = nextColor(used);
      used.push(s.color);
    }
  }
  const activeId = (await db.meta.get('activeId'))?.value ?? scenarios[0].id;
  const active = scenarios.some((s) => s.id === activeId) ? activeId : scenarios[0].id;
  const flags = parseFlags((await db.meta.get('uiFlags'))?.value);
  return { scenarios, activeId: active, flags };
}

/** Persist the whole store (scenarios are small; simplicity wins).
 *
 *  Additive writes FIRST, deletions by difference after — never clear-then-rewrite.
 *  IndexedDB auto-commits a transaction whose task ends with no pending request, and
 *  this runs on pagehide: a clear() that commits alone truncates every scenario,
 *  while a cut-short put/delete merely resurrects a deleted row until the next save. */
export async function saveStore(state: StoreState): Promise<void> {
  await db.transaction('rw', db.scenarios, db.meta, async () => {
    await db.scenarios.bulkPut(state.scenarios);
    const keep = new Set(state.scenarios.map((s) => s.id));
    const stale = (await db.scenarios.toCollection().primaryKeys()).filter((id) => !keep.has(String(id)));
    if (stale.length > 0) await db.scenarios.bulkDelete(stale);
    await db.meta.put({ key: 'activeId', value: state.activeId });
    await db.meta.put({ key: 'uiFlags', value: JSON.stringify(state.flags) });
  });
}
