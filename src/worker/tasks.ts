import type { PrismaClient } from '@prisma/client';
import { enqueueJob } from './queue/jobs';

/** Ensures exactly one WAITING/ACTIVE article job exists for a task. */
export async function enqueueArticleRun(db: PrismaClient, taskId: string, opts: { priority?: number; websiteId?: string | null; reason?: string } = {}) {
  const open = await db.queueJob.findFirst({ where: { taskId, queue: 'article', status: { in: ['WAITING', 'ACTIVE'] } } });
  if (open) {
    if (open.status === 'WAITING') await db.queueJob.update({ where: { id: open.id }, data: { runAt: new Date() } });
    return open;
  }
  const runs = await db.queueJob.count({ where: { taskId, queue: 'article' } });
  return enqueueJob(
    {
      queue: 'article',
      kind: 'article.run',
      operationKey: `article:${taskId}:run:${runs + 1}`,
      taskId,
      websiteId: opts.websiteId ?? null,
      priority: opts.priority ?? 0,
      maxAttempts: 4,
      payload: { reason: opts.reason ?? 'start' },
    },
    db,
  );
}
