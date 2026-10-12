import { notFound } from 'next/navigation';
import { prisma, parseJson } from '@/lib/db';
import { sanitizeArticleHtml } from '@/lib/content/sanitize';
import { Badge, fmtDate, PageHeader, StatusBadge } from '@/components/ui';
import { AutoRefresh } from '@/components/AutoRefresh';
import { TaskActions } from '@/components/TaskActions';

const stageTone = { COMPLETED: 'success', RUNNING: 'info', FAILED: 'danger', SKIPPED: 'neutral', PENDING: 'neutral' } as const;

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.articleTask.findUnique({
    where: { id },
    include: { stages: { orderBy: { position: 'asc' } }, website: { select: { name: true } }, logs: { orderBy: { createdAt: 'desc' }, take: 60 }, seoReports: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!task) notFound();
  const reviews = parseJson<string[]>(task.reviewReasons, []);
  const errors = parseJson<string[]>(task.errors, []);
  const faqs = parseJson<{ question: string; answer: string }[]>(task.faqs, []);
  const seoChecks = task.seoReports[0] ? parseJson<{ id: string; label: string; ok?: boolean; passed?: boolean; detail?: string }[]>(task.seoReports[0].checks, []) : [];
  const seo = seoChecks.length ? { checks: seoChecks.map((c) => ({ ...c, ok: c.ok ?? c.passed ?? false })) } : null;
  const live = !['DRAFT_CREATED', 'FAILED', 'CANCELLED'].includes(task.status);
  return (
    <>
      {live && <AutoRefresh seconds={4} />}
      <PageHeader title={task.selectedTitle ?? task.primaryKeyword} description={`${task.moduleKey} · ${task.website?.name ?? 'no website'} · ${task.language} · ${task.targetCountry}`} actions={<StatusBadge status={task.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-2 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${task.percent}%` }} /></div>
            <p className="text-sm">{task.message ?? '—'}</p>
            {task.wpEditUrl && <p className="mt-2 text-sm">WordPress draft: <a className="text-blue-700 underline" href={task.wpEditUrl} target="_blank" rel="noreferrer">#{task.wpPostId} ({task.wpStatus ?? 'draft'})</a></p>}
            {reviews.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">{reviews.map((r) => <li key={r}>{r}</li>)}</ul>}
            {errors.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-red-700">{errors.map((r) => <li key={r}>{r}</li>)}</ul>}
          </div>
          <TaskActions taskId={task.id} status={task.status} titleOptions={parseJson<string[]>(task.titleOptions, [])} selectedTitle={task.selectedTitle ?? task.recommendedTitle} stages={task.stages.map((s) => ({ key: s.stageKey, label: s.label, status: s.status }))} hasWebsite={!!task.websiteId} />
          <div className="card">
            <h2 className="mb-2 font-semibold">Article preview</h2>
            {task.assembledHtml || task.bodyHtml ? (
              <div className="article-preview" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(task.assembledHtml ?? task.bodyHtml ?? '') }} />
            ) : <p className="text-sm text-slate-500">No article text yet.</p>}
            {!task.assembledHtml && faqs.length > 0 && <p className="mt-2 text-xs text-slate-500">{faqs.length} FAQs parsed (inserted at assembly).</p>}
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Metadata</h2>
            <dl className="grid grid-cols-[160px_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">SEO title</dt><dd>{task.seoTitle ?? '—'}</dd>
              <dt className="text-slate-500">Meta description</dt><dd>{task.metaDescription ?? '—'}</dd>
              <dt className="text-slate-500">Slug</dt><dd>{task.slug ?? '—'}</dd>
              <dt className="text-slate-500">Focus keyword</dt><dd>{task.focusKeyword ?? '—'}</dd>
              <dt className="text-slate-500">Category</dt><dd>{task.categoryName ?? '—'}</dd>
              <dt className="text-slate-500">Tags</dt><dd>{parseJson<string[]>(task.tags, []).join(', ') || '—'}</dd>
              <dt className="text-slate-500">Local SEO score</dt><dd>{task.seoScore ?? '—'} <span className="text-xs text-slate-500">(app heuristic, not Rank Math)</span></dd>
              <dt className="text-slate-500">Rank Math score</dt><dd>{task.rankMathScore ?? 'Not read from WordPress'}</dd>
            </dl>
          </div>
          {seo?.checks && (
            <div className="card">
              <h2 className="mb-2 font-semibold">SEO checks</h2>
              <ul className="space-y-1 text-sm">{seo.checks.map((c) => <li key={c.id}>{c.ok ? '✔' : '✖'} {c.label}{c.detail ? <span className="text-slate-500"> — {c.detail}</span> : null}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-2 font-semibold">Stages</h2>
            <ol className="space-y-2 text-sm">
              {task.stages.map((s) => (
                <li key={s.id}>
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-2"><span>{s.label}</span><Badge tone={stageTone[s.status as keyof typeof stageTone] ?? 'neutral'}>{s.status.toLowerCase()}</Badge></summary>
                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                      {s.durationMs != null && <p>Duration {(s.durationMs / 1000).toFixed(1)}s · attempts {s.attempts}</p>}
                      {s.error && <p className="text-red-700">{s.error}</p>}
                      {s.prompt && <details><summary>Prompt</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{s.prompt}</pre></details>}
                      {s.output && <details><summary>Raw output</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{s.output}</pre></details>}
                    </div>
                  </details>
                </li>
              ))}
              {task.stages.length === 0 && <li className="text-slate-500">Waiting for the worker to start this task.</li>}
            </ol>
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Log</h2>
            <ul className="max-h-[480px] space-y-1 overflow-auto text-xs">
              {task.logs.map((l) => <li key={l.id} className={l.level === 'error' ? 'text-red-700' : l.level === 'warn' ? 'text-amber-700' : ''}>{fmtDate(l.createdAt)} · {l.message}</li>)}
              {task.logs.length === 0 && <li className="text-slate-500">No log entries yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
