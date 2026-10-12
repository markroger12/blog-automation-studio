import { prisma } from '@/lib/db';
import { apiRoute, audit, HttpError } from '@/lib/auth/server';
import { WebsiteInputSchema } from '@/lib/services/websites';

export const PATCH = apiRoute({ role: 'ADMIN', schema: WebsiteInputSchema.partial() }, async ({ body, params, session }) => {
  if (body.defaultCategoryId) {
    const c = await prisma.category.findFirst({ where: { id: body.defaultCategoryId, websiteId: params.id } });
    if (!c) throw new HttpError(400, 'Category does not belong to this website');
  }
  const site = await prisma.website.update({ where: { id: params.id }, data: body });
  await audit(session.sub, 'website.update', site.id, body);
  return { website: site };
});

export const DELETE = apiRoute({ role: 'ADMIN' }, async ({ params, session }) => {
  const active = await prisma.articleTask.count({ where: { websiteId: params.id, status: { notIn: ['DRAFT_CREATED', 'FAILED', 'CANCELLED'] } } });
  if (active) throw new HttpError(409, `${active} task(s) still use this website. Cancel or finish them first.`);
  await prisma.website.update({ where: { id: params.id }, data: { active: false, queuePaused: true } });
  await audit(session.sub, 'website.deactivate', params.id);
  return { ok: true, note: 'Website deactivated; history and browser profile are preserved.' };
});
