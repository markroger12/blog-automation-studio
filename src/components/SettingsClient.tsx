'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

type Json = Record<string, unknown>;

function Field({ path, value, onChange }: { path: string[]; value: unknown; onChange: (p: string[], v: unknown) => void }) {
  const id = path.join('.');
  const label = path[path.length - 1].replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  if (path[0] === 'features' && path[1] === 'autoPublishing') return <p className="text-sm text-slate-500">Auto publishing: permanently off (publishing is only per-site, via the scheduler).</p>;
  if (typeof value === 'boolean') return <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={value} onChange={(e) => onChange(path, e.target.checked)} /> {label}</label>;
  if (typeof value === 'number') return <div><label className="label" htmlFor={id}>{label}</label><input id={id} type="number" className="input" value={value} onChange={(e) => onChange(path, Number(e.target.value))} /></div>;
  if (typeof value === 'string') return <div><label className="label" htmlFor={id}>{label}</label><input id={id} className="input" value={value} onChange={(e) => onChange(path, e.target.value)} /></div>;
  return <div><label className="label" htmlFor={id}>{label} (JSON)</label><textarea id={id} className="input font-mono text-xs" rows={3} defaultValue={JSON.stringify(value, null, 2)} onBlur={(e) => { try { onChange(path, JSON.parse(e.target.value)); } catch { /* keep */ } }} /></div>;
}

export function SettingsClient({ initial }: { initial: Json }) {
  const [s, setS] = useState<Json>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  function update(path: string[], v: unknown) {
    setS((prev) => { const next = structuredClone(prev); let o = next as Json; for (const p of path.slice(0, -1)) o = o[p] as Json; o[path[path.length - 1]] = v; return next; });
  }
  async function save() {
    setStatus('Saving…');
    try { const r = await api<{ settings: Json }>('/api/settings', { method: 'PUT', body: s }); setS(r.settings); setStatus('Saved ✔'); } catch (e) { setStatus((e as Error).message); }
  }
  async function rotate() {
    if (!confirm('Generate a new connection key? The current key stops working immediately.')) return;
    try { setKey((await api<{ key: string }>('/api/settings/extension-key', { method: 'POST' })).key); } catch (e) { setStatus((e as Error).message); }
  }
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="mb-2 font-semibold">ChatGPT extension connection key</h2>
        <p className="text-sm text-slate-500">Paste it into the extension popup. It is shown once; only a hash is stored.</p>
        {key && <pre className="mt-2 select-all rounded bg-slate-900 p-3 text-sm text-emerald-300">{key}</pre>}
        <button className="btn-secondary mt-3" onClick={rotate}>Generate new key</button>
      </div>
      {Object.entries(s).map(([section, val]) => typeof val === 'object' && val && !Array.isArray(val) ? (
        <div key={section} className="card">
          <h2 className="mb-3 font-semibold capitalize">{section}</h2>
          <div className="grid gap-3 md:grid-cols-2">{Object.entries(val as Json).map(([k, v]) => <Field key={k} path={[section, k]} value={v} onChange={update} />)}</div>
        </div>
      ) : null)}
      <div className="sticky bottom-0 flex items-center gap-3 bg-slate-50 py-3"><button className="btn-primary" onClick={save}>Save settings</button>{status && <span className="text-sm">{status}</span>}</div>
    </div>
  );
}
