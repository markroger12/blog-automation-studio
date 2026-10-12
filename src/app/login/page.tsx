import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  if ((await prisma.user.count()) === 0) redirect('/setup');
  return <main className="flex min-h-screen items-center justify-center p-6"><AuthForm mode="login" /></main>;
}
