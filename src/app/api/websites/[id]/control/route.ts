import { prisma } from '@/lib/db';
import { apiRoute, audit, HttpError } from '@/lib/auth/server';
import { ControlSchema, controlWebsite } from '@/lib/services/websites';

export const POST = apiRoute({ schema: ControlSchema }, async ({ body, params, session }) => {
  if (body.action === 'setPublishing' && session.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can change publishing permission');
  const r = await controlWebsite(prisma, params.id, body);
  await audit(session.sub, `website.${body.action}`, params.id, body);
  return r;
});
