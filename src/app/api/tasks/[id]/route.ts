import { prisma } from '@/lib/db';
import { apiRoute, HttpError } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({}, async ({ params }) => {
  const task = await prisma.articleTask.findUnique({
    where: { id: params.id },
    include: { stages: { orderBy: { position: 'asc' } }, website: { select: { id: true, name: true } }, logs: { orderBy: { createdAt: 'desc' }, take: 100 } },
  });
  if (!task) throw new HttpError(404, 'Task not found');
  return { task };
});
