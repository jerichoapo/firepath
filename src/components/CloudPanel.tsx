// Account & sync modal (D31). Lazy-loaded from the Header so the signed-out bundle
// stays lean. Email+password auth via Supabase; status + conflict resolution live here.

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  getCloudState, resolveConflict, signIn, signOutCloud, signUp, subscribeCloud, syncNow,
} from '../store/cloud';
import { Btn } from './ui';

const field =
  'w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2.5 py-2 text-base outline-none focus:border-[var(--c-accent)] sm:text-sm';

export default function CloudPanel({ onClose }: { onClose: () => void }) {
  const cloud = useSyncExternalStore(subscribeCloud, getCloudState);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setNotice(`⚠ ${err}`);
  };

  const doSignUp = async () => {
    setBusy(true);
    setNotice(null);
    const res = await signUp(email.trim(), password);
    setBusy(false);
    if (res.error) setNotice(`⚠ ${res.error}`);
    else if (res.needsConfirm) setNotice('✉ Check your email for a confirmation link, then sign in here.');
  };

  const signedIn = cloud.phase !== 'signedOut' && cloud.phase !== 'connecting' && cloud.email != null;
  const statusLine =
    cloud.phase === 'syncing' ? 'Syncing…'
    : cloud.phase === 'synced' ? `Synced ✓${cloud.lastSyncAt ? ` · ${new Date(cloud.lastSyncAt).toLocaleTimeString()}` : ''}`
    : cloud.phase === 'error' ? `⚠ ${cloud.error ?? 'Sync failed'}`
    : cloud.phase === 'conflict' ? 'Action needed'
    : 'Connecting…';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cloud sync account"
        className="w-full max-w-sm rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">Cloud sync</h2>
            <p className="mt-0.5 text-xs text-[var(--c-muted)]">
              {signedIn ? cloud.email : 'Sign in to back up and sync your scenarios across devices.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-2 box-content p-2 text-[var(--c-muted)] hover:text-[var(--c-ink)]"
          >
            ✕
          </button>
        </div>

        {!signedIn ? (
          <form onSubmit={doSignIn} className="grid gap-2">
            <label className="block text-xs">
              <span className="mb-1 block text-[var(--c-ink-2)]">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-[var(--c-ink-2)]">Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                className={field}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {notice && <p className="text-[11px] leading-relaxed text-[var(--c-ink-2)]">{notice}</p>}
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <Btn onClick={() => void doSignUp()} disabled={busy || !email || password.length < 8} title="Create a new account with these credentials">
                Create account
              </Btn>
              <button
                type="submit"
                disabled={busy || !email || !password}
                className="min-h-10 rounded-lg bg-[var(--c-accent)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40 sm:min-h-0"
              >
                {busy ? 'Working…' : 'Sign in'}
              </button>
            </div>
            <p className="mt-1 border-t border-[var(--c-border)] pt-2 text-[11px] leading-relaxed text-[var(--c-muted)]">
              Your plan is stored as one private document only your account can read (row-level
              security). This device keeps working offline; the cloud copy follows your edits.
            </p>
          </form>
        ) : cloud.phase === 'conflict' ? (
          <div className="grid gap-2">
            <p className="text-xs leading-relaxed text-[var(--c-ink-2)]">
              Both this device and the cloud copy changed since they last synced
              {cloud.conflictCloudAt ? ` (cloud copy from ${new Date(cloud.conflictCloudAt).toLocaleString()})` : ''}.
              Which one should win?
            </p>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Btn variant="danger" onClick={() => void resolveConflict('cloud')} title="Replace this device's scenarios with the cloud copy">
                Use cloud copy
              </Btn>
              <Btn variant="danger" onClick={() => void resolveConflict('local')} title="Overwrite the cloud copy with this device's scenarios">
                Keep this device's
              </Btn>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--c-muted)]">
              Tip: Backup ▾ → Export first if you want a file copy of the losing side.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <p className="text-xs tabular-nums text-[var(--c-ink-2)]" data-testid="cloud-status">{statusLine}</p>
            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--c-border)] pt-2.5">
              <Btn onClick={() => void syncNow()} disabled={cloud.phase === 'syncing'} title="Compare with the cloud copy now">
                Sync now
              </Btn>
              <Btn onClick={() => void signOutCloud()} title="Sign out on this device — local data stays">
                Sign out
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
