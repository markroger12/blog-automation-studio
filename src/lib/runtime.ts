import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

/** Runtime state shared between worker and agent routes (adaptive concurrency + account-level ChatGPT backoff). */
export const RuntimeStateSchema = z.object({
  concurrency: z.number().int().min(1).max(5).default(3),
  chatgptBackoffUntil: z.string().nullable().default(null),
  consecutive429: z.number().int().min(0).default(0),
  last429At: z.string().nullable().default(null),
  lastBackoffReason: z.string().nullable().default(null),
  pausedNewClaims: z.boolean().default(false),
});
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;
const KEY = 'runtime';

export async function getRuntime(db: PrismaClient): Promise<RuntimeState> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  try {
    return RuntimeStateSchema.parse(row ? JSON.parse(row.value) : {});
  } catch {
    return RuntimeStateSchema.parse({});
  }
}

export async function updateRuntime(db: PrismaClient, patch: Partial<RuntimeState>): Promise<RuntimeState> {
  const next = RuntimeStateSchema.parse({ ...(await getRuntime(db)), ...patch });
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  return next;
}

export function inChatgptBackoff(state: RuntimeState, now = new Date()): boolean {
  return !!state.chatgptBackoffUntil && new Date(state.chatgptBackoffUntil).getTime() > now.getTime();
}
