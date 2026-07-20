// Pure logic of the cloud sync layer (D31): the push/pull/conflict decision and the
// canonical content hash. The network/auth plumbing is exercised live, not mocked here.

import { describe, expect, it } from 'vitest';
import { contentHash, decideSync, stableStringify, type SyncSnapshot } from './cloud';

const snap = (over: Partial<SyncSnapshot>): SyncSnapshot => ({
  localHash: 'L',
  lastSyncedHash: null,
  lastSyncedAt: null,
  cloudHash: null,
  cloudUpdatedAt: null,
  ...over,
});

describe('decideSync', () => {
  it('pushes when no cloud row exists (first device)', () => {
    expect(decideSync(snap({}))).toBe('push');
  });

  it('does nothing when cloud already matches local', () => {
    expect(decideSync(snap({ cloudHash: 'L', cloudUpdatedAt: 't9', lastSyncedAt: 't1' }))).toBe('none');
  });

  it('pushes when only this device changed', () => {
    expect(
      decideSync(snap({ cloudHash: 'A', cloudUpdatedAt: 't1', lastSyncedHash: 'A', lastSyncedAt: 't1' })),
    ).toBe('push');
  });

  it('does nothing when nothing changed anywhere', () => {
    expect(
      decideSync(snap({ localHash: 'A', cloudHash: 'B', cloudUpdatedAt: 't1', lastSyncedHash: 'A', lastSyncedAt: 't1' })),
    ).toBe('none'); // cloud hash differs only by jsonb quirks the hash canonicalizes away in practice
  });

  it('pulls when only the cloud changed', () => {
    expect(
      decideSync(snap({ localHash: 'A', lastSyncedHash: 'A', lastSyncedAt: 't1', cloudHash: 'B', cloudUpdatedAt: 't2' })),
    ).toBe('pull');
  });

  it('conflicts when both sides changed', () => {
    expect(
      decideSync(snap({ localHash: 'X', lastSyncedHash: 'A', lastSyncedAt: 't1', cloudHash: 'B', cloudUpdatedAt: 't2' })),
    ).toBe('conflict');
  });

  it('conflicts when a fresh device meets an existing, different cloud copy', () => {
    expect(decideSync(snap({ cloudHash: 'B', cloudUpdatedAt: 't2' }))).toBe('conflict');
  });
});

describe('contentHash', () => {
  const envelope = (extra: object) =>
    JSON.stringify({ app: 'firepath', version: 1, scenarios: [{ id: 's1', plan: { a: 1, b: [1, 2] } }], activeId: 's1', ...extra });

  it('ignores the envelope exportedAt timestamp', () => {
    expect(contentHash(envelope({ exportedAt: '2026-01-01' }))).toBe(contentHash(envelope({ exportedAt: '2026-07-19' })));
  });

  it('is invariant to object key order (Postgres jsonb re-sorts keys)', () => {
    const a = JSON.stringify({ activeId: 's1', scenarios: [{ plan: { b: 2, a: 1 }, id: 's1' }] });
    const b = JSON.stringify({ scenarios: [{ id: 's1', plan: { a: 1, b: 2 } }], activeId: 's1' });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('changes when content changes', () => {
    const a = JSON.stringify({ activeId: 's1', scenarios: [{ id: 's1', plan: { a: 1 } }] });
    const b = JSON.stringify({ activeId: 's1', scenarios: [{ id: 's1', plan: { a: 2 } }] });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it('tolerates invalid JSON without throwing', () => {
    expect(contentHash('not json')).toBe('invalid');
  });
});

describe('stableStringify', () => {
  it('sorts keys at every depth and keeps array order', () => {
    expect(stableStringify({ b: { d: 1, c: [2, { z: 1, y: 2 }] }, a: null })).toBe(
      '{"a":null,"b":{"c":[2,{"y":2,"z":1}],"d":1}}',
    );
  });
});
