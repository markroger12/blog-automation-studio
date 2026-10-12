import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Badge, fmtDate, PageHeader } from '@/components/ui';

export default async function RecoveryPage() {
  const [incidents, stuck] = await Promise.all([
    prisma.recoveryIncident.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.queueJob.findMany({ where: { status: 'ACTIVE', leaseExpiresAt: { lt: new Date() } }, take: 50 }),
  ]);
  return (
    <>
      <PageHeader title="Recovery Center" description="Interrupted work the system detected. External actions with uncertain outcomes are reconciled (existing answer / existing draft) before anything is resent." />
      {stuck.length > 0 && <div className="card mb-4 text-sm text-amber-800">{stuck.length} job(s) have expired leases and will be recovered by the worker within 15 seconds.</div>}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Time</th><th>Kind</th><th>Status</th><th>Reason</th><th>Resolution</th><th>Task</th></tr></thead>
          <tbody>{incidents.map((i) => (
            <tr key={i.id}>
              <td className="text-xs">{fmtDate(i.createdAt)}</td><td className="text-xs">{i.kind}</td>
              <td><Badge tone={i.status === 'OPEN' ? 'warning' : 'success'}>{i.status.toLowerCase()}</Badge></td>
              <td className="text-sm">{i.reason}</td><td className="text-sm">{i.resolution ?? '—'}</td>
              <td>{i.taskId ? <Link className="text-xs text-blue-700 underline" href={`/tasks/${i.taskId}`}>open</Link> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {incidents.length === 0 && <p className="p-4 text-sm text-slate-500">No recovery incidents recorded.</p>}
      </div>
    </>
  );
}
