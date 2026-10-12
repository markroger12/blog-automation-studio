import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { PageHeader } from '@/components/ui';
import { WebsitesClient } from '@/components/WebsitesClient';

export default async function WebsitesPage() {
  const session = await getSession();
  const sites = await prisma.website.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { profile: { select: { sessionState: true, lastCheckedAt: true } }, categories: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
  return (
    <>
      <PageHeader title="Websites" description="Each site has its own persistent WordPress browser profile. Drafts only unless you explicitly allow publishing per site." />
      <WebsitesClient sites={JSON.parse(JSON.stringify(sites))} isAdmin={session?.role === 'ADMIN'} />
    </>
  );
}
