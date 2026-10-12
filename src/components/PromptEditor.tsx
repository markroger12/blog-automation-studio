'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';

export function PromptEditor({ id, content, customized, canEdit }: { id: string; content: string; customized: boolean; canEdit: boolean }) {
  const [text, setText] = useState(content);
  const [status, setStatus] = useState<string | null>(null);
  async function save(body: unknown) {
    setStatus('Saving…');
    try { const r = await api<{ variables: string[] }>(`/api/prompts/${id}`, { method: 'PUT', body }); setStatus(`Saved ✔ variables: ${r.variables.join(', ') || 'none'}`); if ((body as { restoreDefault?: boolean }).restoreDefault) window.location.reload(); } catch (e) { setStatus((e as Error).message); }
  }
  return (
    <div className="space-y-2">
      <textarea className="input font-mono text-xs" rows={14} value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} aria-label="Prompt text" />
      {canEdit && <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={() => save({ content: text })} disabled={text === content}>Save exactly as written</button>
        {customized && <button className="btn-secondary" onClick={() => confirm('Replace your custom text with the shipped default? Your text is archived in history.') && save({ restoreDefault: true })}>Restore default</button>}
        {status && <span className="text-xs">{status}</span>}
      </div>}
    </div>
  );
}
