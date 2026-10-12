import { prisma } from '@/lib/db';
import { apiRoute, audit } from '@/lib/auth/server';
import { createExtensionKey } from '@/lib/agent/service';

/** Returns the plaintext key exactly once; only its hash is stored. Generating a new key revokes the old one. */
export const POST = apiRoute({ role: 'ADMIN' }, async ({ session }) => {
  const key = await createExtensionKey(prisma);
  await audit(session.sub, 'extension.key.rotate', key.slice(0, 10));
  return { key };
});

export const DELETE = apiRoute({ role: 'ADMIN' }, async ({ session }) => {
  await prisma.extensionKey.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(session.sub, 'extension.key.revoke', 'all');
  return { ok: true };
});
