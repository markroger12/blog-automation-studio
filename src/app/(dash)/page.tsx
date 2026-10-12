import Link from 'next/link';
import { prisma } from '@/lib/db';
import { systemHealth } from '@/lib/health';
import { Badge, Empty, fmtDate, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { TERMINAL_STATUSES, PAUSED_STATUSES } from '@/lib/domain';

export default async function Dashboard() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [health, queued, active, review, drafts24, failed24, recent] = await Promise.all([
    systemHealth(),
    prisma.articleTask.count({ where: { status: 'QUEUED' } }),
    prisma.articleTask.count({ where: { status: { notIn: ['QUEUED', ...TERMINAL_STATUSES, ...PAUSED_STATUSES] } } }),
    prisma.articleTask.count({ where: { status: { in: PAUSED_STATUSES } } }),
    prisma.articleTask.count({ where: { status: 'DRAFT_CREATED', wpDraftAt: { gte: since } } }),
    prisma.articleTask.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
    prisma.articleTask.findMany({ orderBy: { updatedAt: 'desc' }, take: 10, include: { website: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Dashboard" description="Live state from the local database. Nothing here is estimated." actions={<Link href="/tasks/new" className="btn-primary">New article</Link>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Worker</p>
          <p className="mt-1">{health.worker.alive ? <Badge tone="success">running</Badge> : <Badge tone="danger">not running</Badge>}</p>
          {!health.worker.alive && <p className="mt-2 text-xs text-slate-500">Start it with <code>npm run dev:all</code>.</p>}
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">ChatGPT extension</p>
          <p className="mt-1">{!health.extension.paired ? <Badge tone="warning">not paired</Badge> : health.extension.connected ? <Badge tone="success">connected</Badge> : <Badge tone="danger">offline</Badge>}</p>
          <p className="mt-2 text-xs text-slate-500">Last seen {fmtDate(health.extension.lastSeenAt)} · {health.chatgpt.waiting} prompt(s) waiting</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">ChatGPT account</p>
          <p className="mt-1">{health.chatgpt.backoff ? <Badge tone="warning">backoff until {fmtDate(health.chatgpt.backoffUntil)}</Badge> : health.chatgpt.pausedNewClaims ? <Badge tone="danger">paused</Badge> : <Badge tone="success">ok</Badge>}</p>
          {health.chatgpt.reason && <p className="mt-2 text-xs text-slate-500">{health.chatgpt.reason}</p>}
        </div>
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <Stat label="Queued" value={queued} />
        <Stat label="In progress" value={active} />
        <Stat label="Needs attention" value={review} />
        <Stat label="Drafts (24h)" value={drafts24} hint="Verified WordPress drafts" />
        <Stat label="Failed (24h)" value={failed24} />
      </div>
      <h2 className="mb-2 font-semibold">Recent tasks</h2>
      {recent.length === 0 ? (
        <Empty title="No tasks yet" href="/tasks/new" cta="Create your first article">Add a website first if you want WordPress drafts.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Keyword</th><th>Website</th><th>Status</th><th>Progress</th><th>Updated</th></tr></thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td><Link className="text-blue-700 hover:underline" href={`/tasks/${t.id}`}>{t.primaryKeyword}</Link></td>
                  <td>{t.website?.name ?? '—'}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.percent}%</td>
                  <td>{fmtDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
