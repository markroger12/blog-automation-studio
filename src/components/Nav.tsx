'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, FileText, Globe, LayoutDashboard, LifeBuoy, ListChecks, LogOut, MessageSquareText, ScrollText, Settings, ShieldAlert, Stethoscope } from 'lucide-react';

const items = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/tasks/new', label: 'New article', icon: FileText },
  { href: '/websites', label: 'Websites', icon: Globe },
  { href: '/prompts', label: 'Prompts', icon: MessageSquareText },
  { href: '/recovery', label: 'Recovery', icon: ShieldAlert },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { href: '/settings', label: 'Settings', icon: Settings, admin: true },
  { href: '/automation-chrome', label: 'Setup & help', icon: LifeBuoy },
];

export function Nav({ user }: { user: { name: string; role: string } }) {
  const path = usePathname();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-4 font-semibold"><Activity className="h-5 w-5 text-blue-600" /> Blog Studio 3.0</div>
      <nav className="flex-1 space-y-0.5 px-2">
        {items.filter((i) => !i.admin || user.role === 'ADMIN').map((i) => {
          const active = i.href === '/' ? path === '/' : path === i.href || (path.startsWith(`${i.href}/`) && i.href !== '/tasks') || (i.href === '/tasks' && /^\/tasks\/(?!new)/.test(path));
          return (
            <Link key={i.href} href={i.href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
              <i.icon className="h-4 w-4" /> {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3 text-sm">
        <p className="font-medium">{user.name}</p>
        <p className="text-xs text-slate-500">{user.role}</p>
        <button onClick={logout} className="mt-2 flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"><LogOut className="h-3 w-3" /> Sign out</button>
      </div>
    </aside>
  );
}
