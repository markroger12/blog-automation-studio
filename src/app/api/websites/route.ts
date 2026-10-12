import { prisma } from '@/lib/db';
import { apiRoute, audit } from '@/lib/auth/server';
import { WebsiteInputSchema, createWebsite } from '@/lib/services/websites';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({}, async () => ({
  websites: await prisma.website.findMany({ orderBy: { name: 'asc' }, include: { profile: { select: { sessionState: true, lastCheckedAt: true } }, categories: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } }),
}));

export const POST = apiRoute({ role: 'ADMIN', schema: WebsiteInputSchema }, async ({ body, session }) => {
  const site = await createWebsite(prisma, body);
  await audit(session.sub, 'website.create', site.id, { name: site.name });
  return { website: site };
});
