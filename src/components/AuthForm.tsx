'use client';
import { useState } from 'react';

export function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details?.map?.((d: { message: string }) => d.message).join('; ') || data.error || 'Failed');
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === 'setup' ? 'Create the administrator account' : 'Sign in'}</h1>
      {mode === 'setup' && (
        <p className="text-sm text-slate-500">First run: this account controls websites, prompts, settings, and publishing permissions.</p>
      )}
      {mode === 'setup' && (
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" minLength={mode === 'setup' ? 10 : 1} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} required />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}</button>
    </form>
  );
}
