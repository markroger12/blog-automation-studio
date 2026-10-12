import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { LanguageSchema } from '../domain';
import { profileDirForSlug, toSafeSlug } from '../paths';
import { enqueueJob } from '@/worker/queue/jobs';

const httpUrl = z.string().trim().url().max(300).refine((u) => /^https?:\/\//.test(u), 'Must be an http(s) URL');

export const WebsiteInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  publicUrl: httpUrl,
  adminUrl: httpUrl.optional(),
  language: LanguageSchema.default('English'),
  targetCountry: z.string().trim().min(2).max(60).default('United States'),
  timezone: z.string().trim().min(2).max(60).default('America/New_York'),
  internalLinkLine: z.string().trim().max(120).default('Also read:'),
  defaultWriter: z.enum(['celebrity-v1', 'celebrity-v2', 'tigram']).default('celebrity-v1'),
  editorType: z.enum(['AUTO', 'GUTENBERG', 'CLASSIC']).default('AUTO'),
  maxConcurrentTasks: z.number().int().min(1).max(5).default(2),
  defaultCategoryId: z.string().max(40).nullable().optional(),
});

export async function createWebsite(db: PrismaClient, input: z.infer<typeof WebsiteInputSchema>) {
  let slug = toSafeSlug(input.name) || 'site';
  for (let i = 2; await db.website.findUnique({ where: { slug } }); i++) slug = `${toSafeSlug(input.name)}-${i}`;
  const adminUrl = input.adminUrl ?? `${input.publicUrl.replace(/\/$/, '')}/wp-admin/`;
  const profile = await db.browserProfile.create({ data: { name: `${input.name} (WordPress)`, kind: 'WORDPRESS', directory: profileDirForSlug(slug) } });
  const { defaultCategoryId: _d, ...rest } = input;
  return db.website.create({ data: { ...rest, slug, adminUrl, profileId: profile.id, canPublish: false } });
}

export const ControlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('testSession') }),
  z.object({ action: z.literal('login') }),
  z.object({ action: z.literal('syncCategories') }),
  z.object({ action: z.literal('pauseQueue'), paused: z.boolean() }),
  z.object({ action: z.literal('setPublishing'), enabled: z.boolean(), confirmName: z.string().max(100).optional() }),
]);

export async function controlWebsite(db: PrismaClient, id: string, input: z.infer<typeof ControlSchema>) {
  const site = await db.website.findUniqueOrThrow({ where: { id } });
  switch (input.action) {
    case 'testSession':
    case 'login':
    case 'syncCategories': {
      const kind = `wp.${input.action}`;
      const open = await db.queueJob.findFirst({ where: { queue: 'control', kind, websiteId: id, status: { in: ['WAITING', 'ACTIVE'] } } });
      if (open) return { jobId: open.id, alreadyRunning: true };
      const job = await enqueueJob({ queue: 'control', kind, operationKey: `${kind}:${id}:${Date.now()}`, websiteId: id, maxAttempts: 1, payload: { websiteId: id } }, db);
      return { jobId: job.id };
    }
    case 'pauseQueue':
      await db.website.update({ where: { id }, data: { queuePaused: input.paused } });
      return { ok: true };
    case 'setPublishing':
      if (input.enabled && input.confirmName !== site.name) throw new Error(`Type the website name exactly ("${site.name}") to authorize publishing.`);
      await db.website.update({ where: { id }, data: { canPublish: input.enabled, canPublishAckAt: input.enabled ? new Date() : null } });
      return { ok: true };
  }
}
