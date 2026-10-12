import { requirePageSession } from '@/lib/auth/server';
import { Nav } from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePageSession();
  return (
    <div className="flex min-h-screen">
      <Nav user={{ name: s.name, role: s.role }} />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
