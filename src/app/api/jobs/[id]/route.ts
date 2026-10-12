import { prisma } from '@/lib/db';
import { apiRoute, HttpError } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({}, async ({ params }) => {
  const job = await prisma.queueJob.findUnique({ where: { id: params.id }, select: { id: true, kind: true, status: true, result: true, lastError: true, updatedAt: true } });
  if (!job) throw new HttpError(404, 'Job not found');
  return { job };
});
