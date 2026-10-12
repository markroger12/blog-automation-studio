'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

type Site = { id: string; name: string; publicUrl: string; adminUrl: string; language: string; canPublish: boolean; queuePaused: boolean; detectedEditor: string | null; active: boolean; defaultWriter: string; profile: { sessionState: string; lastCheckedAt: string | null } | null; categories: { id: string; name: string }[] };

async function pollJob(id: string): Promise<{ status: string; result: string | null; lastError: string | null }> {
  for (let i = 0; i < 240; i++) {
    const { job } = await api<{ job: { status: string; result: string | null; lastError: string | null } }>(`/api/jobs/${id}`);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { status: 'TIMEOUT', result: null, lastError: 'No answer from the worker after 10 minutes. Is `npm run dev:all` running?' };
}

export function WebsitesClient({ sites, isAdmin }: { sites: Site[]; isAdmin: boolean }) {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function control(site: Site, body: Record<string, unknown>, label: string) {
    setBusy(site.id + label); setMsg((m) => ({ ...m, [site.id]: `${label}…` }));
    try {
      const r = await api<{ jobId?: string }>(`/api/websites/${site.id}/control`, { body });
      if (r.jobId) {
        setMsg((m) => ({ ...m, [site.id]: `${label}: waiting for worker${body.action === 'login' ? ' — sign in in the opened Chrome window' : ''}…` }));
        const j = await pollJob(r.jobId);
        setMsg((m) => ({ ...m, [site.id]: j.status === 'COMPLETED' ? `${label}: ${j.result}` : `${label} failed: ${j.lastError}` }));
        if (j.status === 'COMPLETED') setTimeout(() => window.location.reload(), 1200);
      } else window.location.reload();
    } catch (e) { setMsg((m) => ({ ...m, [site.id]: (e as Error).message })); } finally { setBusy(null); }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    setError(null);
    try { await api('/api/websites', { body: { ...fd, adminUrl: fd.adminUrl || undefined } }); window.location.reload(); } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="space-y-6">
      {sites.map((s) => (
        <div key={s.id} className={`card ${s.active ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{s.name} {!s.active && <span className="text-xs text-slate-500">(inactive)</span>}</p>
              <p className="text-xs text-slate-500">{s.publicUrl} · {s.language} · writer {s.defaultWriter} · editor {s.detectedEditor ?? 'not detected'} · {s.categories.length} categories</p>
              <p className="mt-1 text-sm">Session: <b>{s.profile?.sessionState ?? 'UNKNOWN'}</b> · Publishing: <b className={s.canPublish ? 'text-red-700' : 'text-emerald-700'}>{s.canPublish ? 'ALLOWED' : 'drafts only'}</b>{s.queuePaused && ' · queue paused'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={!!busy} onClick={() => control(s, { action: 'login' }, 'Login')}>Login (manual)</button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => control(s, { action: 'testSession' }, 'Test session')}>Test session</button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => control(s, { action: 'syncCategories' }, 'Sync categories')}>Sync categories</button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => control(s, { action: 'pauseQueue', paused: !s.queuePaused }, 'Queue')}>{s.queuePaused ? 'Resume queue' : 'Pause queue'}</button>
              {isAdmin && (s.canPublish
                ? <button className="btn-secondary" onClick={() => control(s, { action: 'setPublishing', enabled: false }, 'Publishing')}>Disable publishing</button>
                : <button className="btn-secondary" onClick={() => { const n = prompt(`Publishing lets the scheduler set posts live on ${s.name}. Type the site name to confirm:`); if (n) control(s, { action: 'setPublishing', enabled: true, confirmName: n }, 'Publishing'); }}>Allow publishing…</button>)}
            </div>
          </div>
          {msg[s.id] && <p className="mt-2 rounded bg-slate-50 p-2 text-xs">{msg[s.id]}</p>}
        </div>
      ))}
      {isAdmin && (
        <form onSubmit={add} className="card grid gap-3 md:grid-cols-2">
          <p className="font-semibold md:col-span-2">Add website</p>
          <div><label className="label" htmlFor="w-name">Name</label><input id="w-name" name="name" className="input" required /></div>
          <div><label className="label" htmlFor="w-url">Public URL</label><input id="w-url" name="publicUrl" className="input" placeholder="https://example.com" required /></div>
          <div><label className="label" htmlFor="w-admin">Admin URL (optional)</label><input id="w-admin" name="adminUrl" className="input" placeholder="https://example.com/wp-admin/" /></div>
          <div><label className="label" htmlFor="w-lang">Language</label><select id="w-lang" name="language" className="input"><option>English</option><option>German</option></select></div>
          <div><label className="label" htmlFor="w-country">Target country</label><input id="w-country" name="targetCountry" className="input" defaultValue="United States" /></div>
          <div><label className="label" htmlFor="w-writer">Default writer</label><select id="w-writer" name="defaultWriter" className="input"><option value="celebrity-v1">Celebrity 1.0</option><option value="celebrity-v2">Celebrity 2.0</option><option value="tigram">Tigram / General</option></select></div>
          <p className="text-xs text-slate-500 md:col-span-2">No passwords are stored. After adding, click “Login (manual)” and sign in yourself in the Chrome window the worker opens; the session is kept in a private profile under data/profiles.</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700 md:col-span-2">{error}</p>}
          <div><button className="btn-primary">Add website</button></div>
        </form>
      )}
    </div>
  );
}
