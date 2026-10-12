'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

type Props = { taskId: string; status: string; titleOptions: string[]; selectedTitle: string | null; stages: { key: string; label: string; status: string }[]; hasWebsite: boolean };

export function TaskActions({ taskId, status, titleOptions, selectedTitle, stages, hasWebsite }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(selectedTitle ?? titleOptions[0] ?? '');
  const [regen, setRegen] = useState('');
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try { await api(`/api/tasks/${taskId}/action`, { body }); window.location.reload(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const finished = ['DRAFT_CREATED', 'CANCELLED'].includes(status);
  return (
    <div className="space-y-3">
      {status === 'AWAITING_TITLE_APPROVAL' && (
        <div className="card space-y-2">
          <p className="font-medium">Approve a title</p>
          {titleOptions.map((t) => <label key={t} className="flex gap-2 text-sm"><input type="radio" checked={title === t} onChange={() => setTitle(t)} /> {t}</label>)}
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Edit title" />
          <button className="btn-primary" disabled={busy || title.length < 3} onClick={() => act({ action: 'approveTitle', title })}>Approve title</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === 'AWAITING_ARTICLE_APPROVAL' && <button className="btn-primary" disabled={busy} onClick={() => act({ action: 'approveArticle' })}>Approve article → create draft</button>}
        {status === 'NEEDS_REVIEW' && hasWebsite && <button className="btn-primary" disabled={busy} onClick={() => act({ action: 'createDraft' })}>Create WordPress draft</button>}
        {['FAILED', 'LOGIN_REQUIRED', 'NEEDS_REVIEW'].includes(status) && <button className="btn-secondary" disabled={busy} onClick={() => act({ action: status === 'FAILED' ? 'retry' : 'resume' })}>{status === 'FAILED' ? 'Retry' : 'Resume'}</button>}
        {!finished && <button className="btn-danger" disabled={busy} onClick={() => confirm('Cancel this task?') && act({ action: 'cancel' })}>Cancel</button>}
      </div>
      <div className="flex gap-2">
        <select className="input max-w-xs" value={regen} onChange={(e) => setRegen(e.target.value)} aria-label="Stage to regenerate">
          <option value="">Regenerate a stage…</option>
          {stages.filter((s) => s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'SKIPPED').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn-secondary" disabled={busy || !regen} onClick={() => act({ action: 'regenerate', stageKey: regen })}>Regenerate (+ dependents)</button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
