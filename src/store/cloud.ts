// Cloud sync (D31): an OPTIONAL Supabase account layered on top of local-first storage.
//
// The cloud holds ONE row per user (plans: user_id → jsonb): the same export envelope
// Backup uses, so parseExport (D27) validates every byte that comes back down. IndexedDB
// stays the working copy — the app never waits on the network. Reconciliation is
// deliberately whole-document: push when only this device changed, pull when only the
// cloud changed, and ask the user when both changed. Plans are single-author documents;
// merging field-by-field would invent states nobody wrote.
//
// supabase-js is dynamic-imported so signed-out visitors ship none of it.

import type { Session, SupabaseClient } from '@supabase/supabase-js';

// Public-by-design client config (safety lives in row-level security, not in hiding
// these). Env vars override for local experiments.
const env = import.meta.env as Record<string, string | undefined>;
export const CLOUD_URL = env.VITE_SUPABASE_URL ?? 'https://zvrngbqluqbtkshivopk.supabase.co';
export const CLOUD_KEY = env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_hugQ-zhYyyOb3qggya3pMQ_WajG3HtN';
export const cloudEnabled = CLOUD_URL !== '' && CLOUD_KEY !== '';

const projectRef = (): string => {
  try {
    return new URL(CLOUD_URL).hostname.split('.')[0];
  } catch {
    return '';
  }
};

/** True when supabase-js has a persisted session in localStorage — checked WITHOUT
 *  loading the library, so the common signed-out visit stays lean. */
export function hasStoredSession(): boolean {
  return cloudEnabled && localStorage.getItem(`sb-${projectRef()}-auth-token`) != null;
}

// ---------------------------------------------------------------------------
// Content identity

/** Deterministic stringify with sorted keys. Postgres jsonb re-orders object keys,
 *  so hashing raw JSON text would make every pulled document look "changed". */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Hash of the export's CONTENT (scenarios + activeId). The envelope's exportedAt
 *  changes on every call and must not count as a difference. */
export function contentHash(exportText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(exportText);
  } catch {
    return 'invalid';
  }
  const o = (parsed ?? {}) as Record<string, unknown>;
  const s = stableStringify({ scenarios: o.scenarios, activeId: o.activeId });
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Sync decision (pure — unit-tested)

export interface SyncSnapshot {
  localHash: string;
  /** Content hash recorded at the last successful sync (null on a fresh device). */
  lastSyncedHash: string | null;
  /** Cloud updated_at recorded at the last successful sync. */
  lastSyncedAt: string | null;
  /** null = no cloud row yet. */
  cloudHash: string | null;
  cloudUpdatedAt: string | null;
}

export type SyncAction = 'push' | 'pull' | 'conflict' | 'none';

export function decideSync(s: SyncSnapshot): SyncAction {
  if (s.cloudHash == null) return 'push'; // first device to sync
  if (s.cloudHash === s.localHash) return 'none'; // already identical
  const cloudAdvanced = s.cloudUpdatedAt !== s.lastSyncedAt; // someone pushed since we synced
  const localChanged = s.localHash !== s.lastSyncedHash;
  if (!cloudAdvanced) return localChanged ? 'push' : 'none';
  if (!localChanged) return 'pull';
  return 'conflict'; // both sides moved (includes a fresh device meeting an existing account)
}

// ---------------------------------------------------------------------------
// Status store (subscribed by Header dot + CloudPanel via useSyncExternalStore)

export interface CloudState {
  phase: 'signedOut' | 'connecting' | 'syncing' | 'synced' | 'error' | 'conflict';
  email: string | null;
  /** Human-readable failure when phase === 'error'; sync retries on next change. */
  error: string | null;
  lastSyncAt: number | null;
  /** When phase === 'conflict': the cloud copy's timestamp, for the user's choice. */
  conflictCloudAt: string | null;
}

let state: CloudState = { phase: 'signedOut', email: null, error: null, lastSyncAt: null, conflictCloudAt: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<CloudState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const getCloudState = (): CloudState => state;
export function subscribeCloud(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Engine

/** How the sync engine talks to the plan store — set once at boot by CloudBoot. */
export interface CloudBridge {
  exportJson: () => string;
  /** Schema-validated whole-store replace; returns an error string or null. */
  importJson: (text: string) => string | null;
}

interface PlanRow {
  data: unknown;
  updated_at: string;
}

let bridge: CloudBridge | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;
let initialized = false;
let reconciling = false;
let pushTimer: number | undefined;
let pendingConflictRow: PlanRow | null = null;

const HASH_KEY = () => `firepath-cloud-${projectRef()}-hash`;
const AT_KEY = () => `firepath-cloud-${projectRef()}-at`;

const markers = {
  get: () => ({ hash: localStorage.getItem(HASH_KEY()), at: localStorage.getItem(AT_KEY()) }),
  set: (hash: string, at: string) => {
    localStorage.setItem(HASH_KEY(), hash);
    localStorage.setItem(AT_KEY(), at);
  },
  clear: () => {
    localStorage.removeItem(HASH_KEY());
    localStorage.removeItem(AT_KEY());
  },
};

export function setBridge(b: CloudBridge): void {
  bridge = b;
}

function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then((m) => m.createClient(CLOUD_URL, CLOUD_KEY));
  return clientPromise;
}

function onSession(session: Session | null): void {
  if (session) {
    setState({ email: session.user.email ?? null });
  } else {
    markers.clear();
    pendingConflictRow = null;
    setState({ phase: 'signedOut', email: null, error: null, conflictCloudAt: null });
  }
}

/** Idempotent boot: load the client, adopt any persisted session, reconcile. */
export async function initCloud(): Promise<void> {
  if (!cloudEnabled || initialized) return;
  initialized = true;
  setState({ phase: 'connecting' });
  const client = await getClient();
  client.auth.onAuthStateChange((event, session) => {
    onSession(session);
    if (event === 'SIGNED_IN') void reconcile();
  });
  const { data } = await client.auth.getSession();
  onSession(data.session);
  if (data.session) await reconcile();
}

export async function signIn(email: string, password: string): Promise<string | null> {
  await initCloud();
  const client = await getClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

/** Returns {error} or {needsConfirm} — true when the project requires email confirmation. */
export async function signUp(email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }> {
  await initCloud();
  const client = await getClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { error: error.message, needsConfirm: false };
  return { error: null, needsConfirm: data.session == null };
}

export async function signOutCloud(): Promise<void> {
  const client = await getClient();
  await client.auth.signOut(); // onAuthStateChange clears markers + state
}

/** Debounced by the caller's edits: push local content when it drifts from the cloud. */
export function notifyLocalChange(exportText: string): void {
  if (!cloudEnabled || state.phase === 'signedOut' || state.phase === 'connecting' || state.phase === 'conflict') return;
  if (contentHash(exportText) === markers.get().hash) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), 1500);
}

/** Full pull-compare-act pass. Safe to call repeatedly. */
export async function reconcile(): Promise<void> {
  if (!bridge || reconciling) return;
  reconciling = true;
  setState({ phase: 'syncing', error: null });
  try {
    const client = await getClient();
    const { data: sess } = await client.auth.getSession();
    if (!sess.session) return; // onAuthStateChange already set signedOut
    const { data, error } = await client.from('plans').select('data, updated_at').maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as PlanRow | null;
    const local = bridge.exportJson();
    const m = markers.get();
    const action = decideSync({
      localHash: contentHash(local),
      lastSyncedHash: m.hash,
      lastSyncedAt: m.at,
      cloudHash: row ? contentHash(JSON.stringify(row.data)) : null,
      cloudUpdatedAt: row?.updated_at ?? null,
    });
    if (action === 'push') await push();
    else if (action === 'pull' && row) applyCloudRow(row);
    else if (action === 'conflict' && row) {
      pendingConflictRow = row;
      setState({ phase: 'conflict', conflictCloudAt: row.updated_at });
    } else {
      if (row) markers.set(contentHash(JSON.stringify(row.data)), row.updated_at);
      setState({ phase: 'synced', lastSyncAt: Date.now() });
    }
  } catch (e) {
    setState({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
  } finally {
    reconciling = false;
  }
}

function applyCloudRow(row: PlanRow): void {
  if (!bridge) return;
  const text = JSON.stringify(row.data);
  const err = bridge.importJson(text);
  if (err) {
    // Never clobber local with an invalid document — surface and stand down.
    setState({ phase: 'error', error: `Cloud copy rejected: ${err}` });
    return;
  }
  markers.set(contentHash(text), row.updated_at);
  setState({ phase: 'synced', lastSyncAt: Date.now(), conflictCloudAt: null });
}

async function push(): Promise<void> {
  if (!bridge) return;
  setState({ phase: 'syncing', error: null });
  try {
    const client = await getClient();
    const { data: sess } = await client.auth.getSession();
    const userId = sess.session?.user.id;
    if (!userId) return;
    const text = bridge.exportJson();
    const updatedAt = new Date().toISOString();
    const { error } = await client
      .from('plans')
      .upsert({ user_id: userId, data: JSON.parse(text) as unknown, updated_at: updatedAt });
    if (error) throw new Error(error.message);
    markers.set(contentHash(text), updatedAt);
    pendingConflictRow = null;
    setState({ phase: 'synced', lastSyncAt: Date.now(), conflictCloudAt: null });
  } catch (e) {
    setState({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** The user's answer to the both-sides-changed prompt. */
export async function resolveConflict(keep: 'cloud' | 'local'): Promise<void> {
  if (keep === 'cloud' && pendingConflictRow) {
    applyCloudRow(pendingConflictRow);
    pendingConflictRow = null;
  } else {
    await push();
  }
}

export const syncNow = reconcile;
