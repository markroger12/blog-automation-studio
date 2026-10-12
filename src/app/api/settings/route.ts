import { apiRoute, audit } from '@/lib/auth/server';
import { getSettings, saveSettings } from '@/lib/settings';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const GET = apiRoute({}, async () => ({ settings: await getSettings() }));
export const PUT = apiRoute({ role: 'ADMIN', schema: z.record(z.unknown()) }, async ({ body, session }) => {
  const settings = await saveSettings(body);
  await audit(session.sub, 'settings.update', 'app');
  return { settings };
});
