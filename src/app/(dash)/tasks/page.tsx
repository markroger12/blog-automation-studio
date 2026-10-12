import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Empty, fmtDate, PageHeader, StatusBadge } from '@/components/ui';
import { AutoRefresh } from '@/components/AutoRefresh';
import { TASK_STATUSES } from '@/lib/domain';

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && (TASK_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const tasks = await prisma.articleTask.findMany({
    where: { ...(status ? { status } : {}), ...(sp.q ? { primaryKeyword: { contains: sp.q.slice(0, 200) } } : {}) },
    orderBy: { updatedAt: 'desc' }, take: 200, include: { website: { select: { name: true } } },
  });
  return (
    <>
      <AutoRefresh seconds={5} />
      <PageHeader title="Tasks" description="Queue and history. Refreshes every 5 seconds." actions={<Link href="/tasks/new" className="btn-primary">New article</Link>} />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search keyword" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ''} className="input max-w-xs"><option value="">All statuses</option>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {tasks.length === 0 ? <Empty title="No matching tasks" href="/tasks/new" cta="New article" /> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Keyword</th><th>Writer</th><th>Website</th><th>Status</th><th>Stage</th><th>SEO</th><th>Draft</th><th>Updated</th></tr></thead>
            <tbody>{tasks.map((t) => (
              <tr key={t.id}>
                <td><Link className="text-blue-700 hover:underline" href={`/tasks/${t.id}`}>{t.primaryKeyword}</Link><p className="text-xs text-slate-500">{t.message}</p></td>
                <td className="text-xs">{t.moduleKey}</td>
                <td>{t.website?.name ?? '—'}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="text-xs">{t.stage ?? '—'} · {t.percent}%</td>
                <td>{t.seoScore ?? '—'}</td>
                <td>{t.wpEditUrl ? <a className="text-blue-700 underline" href={t.wpEditUrl} target="_blank" rel="noreferrer">#{t.wpPostId}</a> : '—'}</td>
                <td className="text-xs">{fmtDate(t.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
