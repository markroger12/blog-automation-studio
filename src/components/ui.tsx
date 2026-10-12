import Link from 'next/link';
import { statusTone, type TaskStatus } from '@/lib/domain';

const tones = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status as TaskStatus] ?? 'neutral'}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
      {href && cta && <Link href={href} className="btn-primary mt-4">{cta}</Link>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}
