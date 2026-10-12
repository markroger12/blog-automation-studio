import { prisma } from '@/lib/db';
import { apiRoute, audit } from '@/lib/auth/server';
import { CreateTasksSchema, createTasks } from '@/lib/services/tasks';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListQuery = z.object({ status: z.string().max(40).optional(), websiteId: z.string().max(40).optional(), q: z.string().max(200).optional(), take: z.coerce.number().int().min(1).max(200).default(100) });

export const GET = apiRoute({ schema: ListQuery }, async ({ body }) => {
  const tasks = await prisma.articleTask.findMany({
    where: { ...(body.status ? { status: body.status } : {}), ...(body.websiteId ? { websiteId: body.websiteId } : {}), ...(body.q ? { primaryKeyword: { contains: body.q } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: body.take,
    select: { id: true, primaryKeyword: true, moduleKey: true, status: true, stage: true, percent: true, message: true, updatedAt: true, wpEditUrl: true, seoScore: true, website: { select: { name: true } } },
  });
  return { tasks };
});

export const POST = apiRoute({ schema: CreateTasksSchema }, async ({ body, session }) => {
  const r = await createTasks(prisma, body, session.sub);
  await audit(session.sub, 'task.create', body.moduleKey, { created: r.created.length, skipped: r.skipped.length });
  return r;
});
