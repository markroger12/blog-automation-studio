import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) redirect('/login');
  return <main className="flex min-h-screen items-center justify-center p-6"><AuthForm mode="setup" /></main>;
}
