import { prisma } from './db';
import { AppSettingsSchema, DEFAULT_SETTINGS, SETTINGS_KEY, SETTINGS_SCHEMA_VERSION, type AppSettings } from './settings-schema';

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return AppSettingsSchema.parse(JSON.parse(row.value));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(value: unknown): Promise<AppSettings> {
  const parsed = AppSettingsSchema.parse(value);
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(parsed), schemaVersion: SETTINGS_SCHEMA_VERSION },
    update: { value: JSON.stringify(parsed), schemaVersion: SETTINGS_SCHEMA_VERSION },
  });
  return parsed;
}

/** Seeds defaults only when missing; never overwrites owner settings. */
export async function seedSettingsIfMissing(): Promise<boolean> {
  const existing = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (existing) return false;
  await prisma.setting.create({ data: { key: SETTINGS_KEY, value: JSON.stringify(DEFAULT_SETTINGS), schemaVersion: SETTINGS_SCHEMA_VERSION } });
  return true;
}
