'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';

type Site = { id: string; name: string; language: string; targetCountry: string; defaultWriter: string; categories: { id: string; name: string }[] };
type Mod = { key: string; name: string; description: string; available: boolean };

export function TaskForm({ sites, modules }: { sites: Site[]; modules: Mod[] }) {
  const [moduleKey, setModuleKey] = useState(modules[0]?.key ?? 'celebrity-v1');
  const [websiteId, setWebsiteId] = useState<string>('');
  const site = useMemo(() => sites.find((s) => s.id === websiteId), [sites, websiteId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: string[]; skipped: { keyword: string; reason: string }[] } | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const keywords = String(fd.get('keywords') ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api<{ created: string[]; skipped: { keyword: string; reason: string }[] }>('/api/tasks', {
        body: {
          moduleKey, keywords, websiteId: websiteId || null, categoryId: (fd.get('categoryId') as string) || null,
          language: fd.get('language'), targetCountry: fd.get('targetCountry'), exampleTitle: fd.get('exampleTitle') || undefined,
          secondaryKeywords: String(fd.get('secondary') ?? '').split(',').map((s) => s.trim()).filter(Boolean), requestId,
        },
      });
      setResult(r);
      if (r.created.length === 1 && !r.skipped.length) window.location.href = `/tasks/${r.created[0]}`;
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card max-w-3xl space-y-4">
      <div>
        <span className="label">Writer</span>
        <div className="grid gap-2 md:grid-cols-3">
          {modules.map((m) => (
            <button type="button" key={m.key} disabled={!m.available} onClick={() => setModuleKey(m.key)} className={`rounded-lg border p-3 text-left text-sm ${moduleKey === m.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
              <p className="font-medium">{m.name}</p><p className="mt-1 text-xs text-slate-500">{m.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="site">Website</label>
          <select id="site" className="input" value={websiteId} onChange={(e) => { setWebsiteId(e.target.value); const s = sites.find((x) => x.id === e.target.value); if (s) setModuleKey(s.defaultWriter); }}>
            <option value="">None (local article only)</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" className="input" disabled={!site?.categories.length}>
            <option value="">{site?.categories.length ? 'Auto / site default' : 'Sync categories first'}</option>
            {site?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select id="language" name="language" className="input" key={site?.id ?? 'none'} defaultValue={site?.language ?? 'English'}><option>English</option><option>German</option></select>
        </div>
        <div>
          <label className="label" htmlFor="targetCountry">Target country</label>
          <input id="targetCountry" name="targetCountry" className="input" key={site?.id ?? 'none'} defaultValue={site?.targetCountry ?? 'United States'} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="keywords">Keywords (one per line — each becomes a task)</label>
        <textarea id="keywords" name="keywords" required rows={6} className="input font-mono" placeholder="Sydney Sweeney" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="exampleTitle">Example title (optional)</label><input id="exampleTitle" name="exampleTitle" className="input" /></div>
        <div><label className="label" htmlFor="secondary">Secondary keywords (comma separated)</label><input id="secondary" name="secondary" className="input" /></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p>Created {result.created.length} task(s). <a className="text-blue-700 underline" href="/tasks">Open queue</a></p>
          {result.skipped.map((s) => <p key={s.keyword} className="text-amber-700">Skipped “{s.keyword}”: {s.reason}</p>)}
        </div>
      )}
      <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create tasks'}</button>
    </form>
  );
}
