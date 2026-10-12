import Link from 'next/link';
import { prisma } from '@/lib/db';
import { fmtDate, PageHeader } from '@/components/ui';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ level?: string; category?: string }> }) {
  const sp = await searchParams;
  const logs = await prisma.log.findMany({
    where: { ...(sp.level ? { level: sp.level } : {}), ...(sp.category ? { category: sp.category } : {}) },
    orderBy: { createdAt: 'desc' }, take: 300,
  });
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Logs" description="Secrets, cookies, and keys are redacted before storage." />
      <form className="mb-4 flex gap-2">
        <select name="level" defaultValue={sp.level ?? ''} className="input max-w-[160px]"><option value="">All levels</option>{['debug', 'info', 'warn', 'error'].map((l) => <option key={l}>{l}</option>)}</select>
        <input name="category" defaultValue={sp.category} placeholder="category" className="input max-w-[200px]" />
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th><th>Task</th></tr></thead>
          <tbody>{logs.map((l) => (
            <tr key={l.id} className={l.level === 'error' ? 'bg-red-50/50' : l.level === 'warn' ? 'bg-amber-50/50' : ''}>
              <td className="whitespace-nowrap text-xs">{fmtDate(l.createdAt)}</td><td className="text-xs">{l.level}</td><td className="text-xs">{l.category}</td>
              <td className="text-sm">{l.message}</td><td>{l.taskId ? <Link className="text-xs text-blue-700 underline" href={`/tasks/${l.taskId}`}>open</Link> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {logs.length === 0 && <p className="p-4 text-sm text-slate-500">No log entries.</p>}
      </div>
    </>
  );
}
