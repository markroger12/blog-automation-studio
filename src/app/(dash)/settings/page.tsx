import { requirePageSession } from '@/lib/auth/server';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui';
import { SettingsClient } from '@/components/SettingsClient';

export default async function SettingsPage() {
  await requirePageSession('ADMIN');
  const settings = await getSettings();
  return (<><PageHeader title="Settings" description="Validated on save; invalid values are rejected with the exact field." /><SettingsClient initial={JSON.parse(JSON.stringify(settings))} /></>);
}
