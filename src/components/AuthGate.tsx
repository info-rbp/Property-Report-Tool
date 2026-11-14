import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { countOfflineOperations } from '../lib/offlineQueue';
import { ProInspectLogo } from './ProInspectLogo';

type Mode = 'checking' | 'login' | 'bootstrap' | 'forgot' | 'reset' | 'ready';
type Me = Awaited<ReturnType<typeof api.me>>;

function clearLocalReportingData(): void {
  localStorage.removeItem('proinspect:lastProperty');
  localStorage.removeItem('proinspect:lastReportId');
  // Cached property reports and queued local edits must not carry across user sessions.
  indexedDB.deleteDatabase('proinspect-report-cache-v1');
  indexedDB.deleteDatabase('proinspect-offline-work-v1');
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [identity, setIdentity] = useState<Me | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const resetToken = new URL(window.location.href).searchParams.get('reset_password');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (resetToken) { setMode('reset'); return; }
      try {
        const me = await api.me();
        if (!active) return;
        setIdentity(me);
        if (me.authMethod !== 'password') {
          const status = await api.authStatus();
          if (!active) return;
          setMode(status.bootstrapAvailable ? 'bootstrap' : 'login');
        } else {
          setMode('ready');
        }
      } catch (error) {
        if (!active) return;
        const failure = error as Error & { status?: number };
        if (failure.status && failure.status !== 401 && failure.status !== 403) {
          setMessage(failure.message || 'Unable to check your session.');
        }
        setMode(resetToken ? 'reset' : 'login');
      }
    };
    void load();
    return () => { active = false; };
  }, [resetToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (mode === 'bootstrap' || mode === 'reset') {
      if (password.length < (mode === 'bootstrap' ? 10 : 12) || password !== confirm) {
        setMessage(`Use at least ${mode === 'bootstrap' ? 10 : 12} characters and ensure both passwords match.`);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await api.login(email, password);
        // Reload so the report editor creates all network/data listeners with the new session.
        window.location.reload();
      } else if (mode === 'bootstrap') {
        await api.bootstrap(password);
        window.location.reload();
      } else if (mode === 'forgot') {
        const result = await api.requestPasswordReset(email);
        setMessage(result.message);
      } else if (mode === 'reset') {
        const result = await api.confirmPasswordReset(resetToken || '', password);
        window.history.replaceState(null, '', window.location.pathname);
        setPassword('');
        setConfirm('');
        setMode('login');
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setMessage('');
    setBusy(true);
    try {
      const pending = await countOfflineOperations();
      if (pending > 0) {
        setMessage('There are unsynchronised edits or photos on this device. Synchronise them before signing out.');
        return;
      }
      await api.logout();
      clearLocalReportingData();
      // Require ProInspect sign-in again, even if the Access migration fallback remains enabled.
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'ready') {
    return (
      <>
        {children}
        <div className="fixed bottom-4 right-4 z-50 flex max-w-xs flex-col items-end gap-2">
          {message && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow">{message}</div>}
          {identity?.authMethod === 'password' && (
            <button type="button" disabled={busy} onClick={() => void signOut()}
              className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-slate-700 disabled:opacity-50">
              Sign out
            </button>
          )}
        </div>
      </>
    );
  }

  if (mode === 'checking') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-700">Checking your ProInspect session…</div>;
  }

  const resetMode = mode === 'reset';
  const setupMode = mode === 'bootstrap';
  const forgotMode = mode === 'forgot';
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3">
          <ProInspectLogo size="md" showTagline={false} />
          <h1 className="text-xl font-bold text-slate-900">Property Report Creation</h1>
          <p className="text-center text-sm text-slate-600">
            {setupMode ? 'Create the first administrator password for your existing Cloudflare Access account.' :
              resetMode ? 'Choose a new password for your account.' :
              forgotMode ? 'Enter your email to receive a reset link.' : 'Sign in with your ProInspect account.'}
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {(mode === 'login' || forgotMode) && (
            <label className="block text-sm font-medium text-slate-800">Email address
              <input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600" placeholder="name@company.com.au" />
            </label>
          )}
          {setupMode && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{identity?.email}</p>}
          {(mode === 'login' || setupMode || resetMode) && (
            <label className="block text-sm font-medium text-slate-800">Password
              <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : setupMode ? 10 : 12}
                value={password} onChange={event => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600" />
            </label>
          )}
          {(setupMode || resetMode) && (
            <label className="block text-sm font-medium text-slate-800">Confirm password
              <input type="password" autoComplete="new-password" required minLength={setupMode ? 10 : 12} value={confirm}
                onChange={event => setConfirm(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600" />
            </label>
          )}
          {message && <p role="alert" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{message}</p>}
          <button disabled={busy} type="submit"
            className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy ? 'Processing…' : setupMode ? 'Create administrator account' : forgotMode ? 'Send reset link' : resetMode ? 'Update password' : 'Sign in'}
          </button>
        </form>
        {(mode === 'login' || forgotMode || resetMode) && (
          <button type="button" className="mt-5 w-full text-center text-sm font-medium text-blue-700 hover:underline"
            onClick={() => { setMessage(''); setMode(mode === 'login' ? 'forgot' : 'login'); }}>
            {mode === 'login' ? 'Forgot password?' : 'Back to sign in'}
          </button>
        )}
        {setupMode && <p className="mt-4 text-xs text-slate-500">This setup is available only to the currently authenticated Cloudflare Access user and can be completed once.</p>}
      </div>
    </div>
  );
}
