import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { LanguageSchema, normalizeKeyword } from '../domain';
import { sha256 } from '../hash';
import { getManifest } from '@/modules/manifests';
import { enqueueArticleRun } from '@/worker/tasks';
import { cancelJobsForTask } from '@/worker/queue/jobs';
import { regenerateStage } from '@/worker/pipeline/runner';

export const CreateTasksSchema = z.object({
  moduleKey: z.string().min(1).max(40),
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
  websiteId: z.string().max(40).nullable().optional(),
  categoryId: z.string().max(40).nullable().optional(),
  language: LanguageSchema.optional(),
  targetCountry: z.string().trim().min(2).max(60).optional(),
  exampleTitle: z.string().trim().max(200).optional(),
  secondaryKeywords: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  priority: z.number().int().min(-10).max(10).default(0),
  requestId: z.string().max(60).default(''),
  allowDuplicates: z.boolean().default(false),
});

export async function createTasks(db: PrismaClient, input: z.infer<typeof CreateTasksSchema>, userId: string) {
  const manifest = getManifest(input.moduleKey);
  if (!manifest?.available) throw new Error(`Unknown or unavailable writer: ${input.moduleKey}`);
  const site = input.websiteId ? await db.website.findUnique({ where: { id: input.websiteId } }) : null;
  if (input.websiteId && !site) throw new Error('Website not found');
  const category = input.categoryId && site ? await db.category.findFirst({ where: { id: input.categoryId, websiteId: site.id } }) : null;
  const created: string[] = [];
  const skipped: { keyword: string; reason: string; taskId?: string }[] = [];
  const seen = new Set<string>();
  for (const raw of input.keywords) {
    const norm = normalizeKeyword(raw);
    if (!norm) continue;
    if (seen.has(norm)) { skipped.push({ keyword: raw, reason: 'Duplicate in this batch' }); continue; }
    seen.add(norm);
    if (!input.allowDuplicates) {
      const dup = await db.articleTask.findFirst({ where: { normalizedKeyword: norm, websiteId: site?.id ?? null, status: { not: 'CANCELLED' } }, select: { id: true } });
      if (dup) { skipped.push({ keyword: raw, reason: 'Already exists for this website', taskId: dup.id }); continue; }
    }
    const idempotencyKey = sha256([input.moduleKey, site?.id ?? '-', norm, input.language ?? site?.language ?? 'English', input.requestId || Date.now()].join('|'));
    const existing = await db.articleTask.findUnique({ where: { idempotencyKey } });
    if (existing) { skipped.push({ keyword: raw, reason: 'Already submitted', taskId: existing.id }); continue; }
    const task = await db.articleTask.create({
      data: {
        moduleKey: input.moduleKey,
        websiteId: site?.id ?? null,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        primaryKeyword: raw.trim(),
        normalizedKeyword: norm,
        exampleTitle: input.exampleTitle || null,
        secondaryKeywords: JSON.stringify(input.secondaryKeywords),
        language: input.language ?? site?.language ?? 'English',
        targetCountry: input.targetCountry ?? site?.targetCountry ?? 'United States',
        priority: input.priority + (site?.queuePriority ?? 0),
        idempotencyKey,
        createdById: userId,
      },
    });
    await enqueueArticleRun(db, task.id, { priority: task.priority, websiteId: task.websiteId });
    created.push(task.id);
  }
  return { created, skipped };
}

export const TaskActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('retry') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('approveTitle'), title: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal('approveArticle') }),
  z.object({ action: z.literal('createDraft') }),
  z.object({ action: z.literal('regenerate'), stageKey: z.string().min(2).max(40) }),
]);

export async function taskAction(db: PrismaClient, taskId: string, input: z.infer<typeof TaskActionSchema>) {
  const task = await db.articleTask.findUniqueOrThrow({ where: { id: taskId } });
  switch (input.action) {
    case 'cancel':
      await db.articleTask.update({ where: { id: taskId }, data: { cancelRequested: true, ...(['QUEUED', 'AWAITING_TITLE_APPROVAL', 'AWAITING_ARTICLE_APPROVAL', 'NEEDS_REVIEW', 'LOGIN_REQUIRED', 'FAILED'].includes(task.status) ? { status: 'CANCELLED', message: 'Cancelled by owner' } : { message: 'Cancelling…' }) } });
      await cancelJobsForTask(taskId, db);
      return { ok: true };
    case 'approveTitle':
      if (task.status !== 'AWAITING_TITLE_APPROVAL') throw new Error('Task is not waiting for title approval');
      await db.articleTask.update({ where: { id: taskId }, data: { selectedTitle: input.title, titleApprovedAt: new Date(), status: 'QUEUED', message: 'Title approved' } });
      break;
    case 'approveArticle':
      if (task.status !== 'AWAITING_ARTICLE_APPROVAL') throw new Error('Task is not waiting for article approval');
      await db.articleTask.update({ where: { id: taskId }, data: { articleApprovedAt: new Date(), status: 'QUEUED', message: 'Article approved' } });
      break;
    case 'createDraft':
      if (!task.websiteId) throw new Error('Assign a website first');
      await db.articleTask.update({ where: { id: taskId }, data: { articleApprovedAt: task.articleApprovedAt ?? new Date(), status: 'QUEUED', message: 'Draft requested', configSnapshot: JSON.stringify({ forceWordPress: true }) } });
      break;
    case 'regenerate': {
      const keys = await regenerateStage(db, taskId, input.stageKey, 'Owner requested regeneration');
      await db.articleTask.update({ where: { id: taskId }, data: { status: 'QUEUED', cancelRequested: false, message: `Regenerating ${keys.join(', ')}` } });
      break;
    }
    case 'retry':
    case 'resume':
      if (task.status === 'CANCELLED' && !task.cancelRequested) throw new Error('Cancelled tasks cannot be resumed');
      await db.articleTask.update({ where: { id: taskId }, data: { status: 'QUEUED', cancelRequested: false, message: input.action === 'retry' ? 'Retry requested' : 'Resumed' } });
      // Login-paused ChatGPT jobs become claimable again.
      await db.queueJob.updateMany({ where: { taskId, queue: 'chatgpt', status: 'WAITING' }, data: { runAt: new Date() } });
      if (input.action === 'retry') await db.queueJob.updateMany({ where: { taskId, queue: 'chatgpt', status: 'FAILED' }, data: { status: 'WAITING', attempts: 0, runAt: new Date() } });
      break;
  }
  const t = await db.articleTask.findUniqueOrThrow({ where: { id: taskId } });
  await enqueueArticleRun(db, taskId, { priority: t.priority, websiteId: t.websiteId, reason: input.action });
  return { ok: true };
}
