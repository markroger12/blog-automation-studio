import { prisma } from '@/lib/db';
import { apiRoute, audit } from '@/lib/auth/server';
import { TaskActionSchema, taskAction } from '@/lib/services/tasks';

export const POST = apiRoute({ schema: TaskActionSchema }, async ({ body, params, session }) => {
  const r = await taskAction(prisma, params.id, body);
  await audit(session.sub, `task.${body.action}`, params.id, body);
  return r;
});
