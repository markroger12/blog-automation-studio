import type { ArticleTask, PrismaClient } from '@prisma/client';
import { parseJson } from '@/lib/db';
import { sha256, normalizeForHash } from '@/lib/hash';
import { log as writeLog } from '@/lib/logger';
import { mergeSettings, SiteOverridesSchema, type AppSettings } from '@/lib/settings-schema';
import { renderTemplate } from '@/lib/template';
import { languageInstruction } from '@/lib/content/assembly';
import { enqueueJob } from '../queue/jobs';
import { getPipeline } from './registry';
import {
  FatalStageError,
  LoginRequired,
  TaskCancelled,
  WaitForExternal,
  type PipelineContext,
  type PipelineDefinition,
  type PipelineStage,
} from './types';

export type RunOutcome = 'done' | 'parked' | 'paused' | 'cancelled';

export interface StagePrivateState {
  generation?: number;
  [k: string]: unknown;
}

export async function resolvePrompt(db: PrismaClient, moduleKey: string, promptKey: string): Promise<{ content: string; version: string }> {
  const own = await db.promptTemplate.findUnique({ where: { moduleKey_stageKey: { moduleKey, stageKey: promptKey } } });
  const tpl = own ?? (await db.promptTemplate.findUnique({ where: { moduleKey_stageKey: { moduleKey: 'shared', stageKey: promptKey } } }));
  if (!tpl) throw new FatalStageError(`Prompt ${moduleKey}/${promptKey} is missing. Run \`npm run setup\` to seed default prompts.`);
  return { content: tpl.content, version: `${tpl.moduleKey}/${tpl.stageKey}@${sha256(tpl.content).slice(0, 12)}` };
}

export async function taskSettings(db: PrismaClient, task: ArticleTask, base: AppSettings): Promise<AppSettings> {
  const snap = parseJson<AppSettings | null>(task.configSnapshot, null);
  if (snap && Object.keys(snap).length) return snap;
  const website = task.websiteId ? await db.website.findUnique({ where: { id: task.websiteId } }) : null;
  const overrides = website ? SiteOverridesSchema.safeParse(parseJson(website.workflowSettings, {})) : null;
  const merged = mergeSettings(base, overrides?.success ? overrides.data : undefined);
  await db.articleTask.update({ where: { id: task.id }, data: { configSnapshot: JSON.stringify(merged) } });
  return merged;
}

export function buildContext(db: PrismaClient, initial: ArticleTask, pipeline: PipelineDefinition, settings: AppSettings, workerId: string, website: PipelineContext['website']): PipelineContext {
  let task = initial;
  const ctx: PipelineContext = {
    db,
    get task() {
      return task;
    },
    website,
    settings,
    workerId,
    async reload() {
      task = await db.articleTask.findUniqueOrThrow({ where: { id: task.id } });
      return task;
    },
    async updateTask(data) {
      const { id: _id, version: _v, ...rest } = data as ArticleTask;
      task = await db.articleTask.update({ where: { id: task.id }, data: { ...(rest as object), version: { increment: 1 } } });
      return task;
    },
    async getStageOutput(stageKey) {
      const s = await db.articleStage.findUnique({ where: { taskId_stageKey: { taskId: task.id, stageKey } } });
      if (!s || (s.status !== 'COMPLETED' && s.status !== 'SKIPPED')) return null;
      return { output: s.output, outputHtml: s.outputHtml, json: parseJson(s.outputJson, null) };
    },
    async askChatGPT(stageKey, promptKey, extra = {}, opts = {}) {
      const stage = await db.articleStage.findUniqueOrThrow({ where: { taskId_stageKey: { taskId: task.id, stageKey } } });
      const priv = parseJson<StagePrivateState>(stage.privateState, {});
      const generation = priv.generation ?? 0;
      const operationId = `chatgpt:${task.id}:${stageKey}:g${generation}:${promptKey}`;
      const existing = await db.chatGPTResponse.findUnique({ where: { operationId } });
      if (existing?.completedAt && existing.resultText != null) {
        return { prompt: existing.prompt, text: existing.resultText, html: existing.resultHtml, conversationUrl: existing.conversationUrl };
      }
      if (existing) {
        const job = await db.queueJob.findUnique({ where: { operationKey: operationId } });
        if (job?.status === 'FAILED') {
          const err = job.lastError ?? 'ChatGPT job failed';
          if (/^(LOGIN|HUMAN_CHECK)/.test(err)) throw new LoginRequired('CHATGPT', err);
          throw new Error(`ChatGPT ${promptKey} failed: ${err}`);
        }
        if (job?.status === 'CANCELLED') throw new TaskCancelled();
        throw new WaitForExternal(`Waiting for ChatGPT (${promptKey})`);
      }
      const { content, version } = await resolvePrompt(db, task.moduleKey, promptKey);
      const vars = { ...(await pipeline.variables(ctx, extra)), ...extra };
      let prompt = renderTemplate(content, vars);
      if (!promptKey.startsWith('IMAGE_GENERATION')) {
        prompt += `\n\n${languageInstruction((task.language as 'English' | 'German') ?? 'English', task.targetCountry)}`;
      }
      let newChat = opts.newChat ?? false;
      if (!newChat && !task.conversationUrl && pipeline.contextPrimer) {
        const primer = await pipeline.contextPrimer(ctx, stageKey);
        if (primer) prompt = `${primer}\n\n---\n\n${prompt}`;
      }
      if (!task.conversationUrl) newChat = true;
      await ctx.checkCancelled();
      await db.chatGPTResponse.create({
        data: { taskId: task.id, stageKey, attempt: generation + 1, operationId, prompt, promptHash: sha256(normalizeForHash(prompt)) },
      });
      await db.articleStage.update({ where: { id: stage.id }, data: { prompt, promptVersion: version } });
      await enqueueJob(
        {
          queue: 'chatgpt',
          kind: 'chatgpt.prompt',
          operationKey: operationId,
          taskId: task.id,
          websiteId: task.websiteId,
          priority: task.priority,
          sideEffect: 'EXTERNAL',
          maxAttempts: Math.max(1, settings.workflow.retryAttempts + 1),
          payload: {
            operationId,
            stageKey,
            promptKey,
            prompt,
            promptHash: sha256(normalizeForHash(prompt)),
            conversationUrl: newChat ? null : task.conversationUrl,
            newChat,
            attachments: opts.attachments ?? [],
          },
        },
        db,
      );
      await ctx.log('info', `Queued ChatGPT prompt ${promptKey} (${prompt.length} chars)`);
      throw new WaitForExternal(`Waiting for ChatGPT (${promptKey})`);
    },
    async checkCancelled() {
      const fresh = await db.articleTask.findUnique({ where: { id: task.id }, select: { cancelRequested: true } });
      if (fresh?.cancelRequested) throw new TaskCancelled();
    },
    async log(level, message, details) {
      await writeLog({ level, category: 'pipeline', message, taskId: task.id, stage: task.stage, details });
    },
    async addReviewReason(reason) {
      const current = parseJson<string[]>((await ctx.reload()).reviewReasons, []);
      if (!current.includes(reason)) {
        current.push(reason);
        await ctx.updateTask({ reviewReasons: JSON.stringify(current) } as Partial<ArticleTask>);
      }
    },
  };
  return ctx;
}

export async function ensureStageRecords(db: PrismaClient, taskId: string, stages: PipelineStage[]): Promise<void> {
  const existing = await db.articleStage.findMany({ where: { taskId }, select: { stageKey: true } });
  const have = new Set(existing.map((s) => s.stageKey));
  for (const [i, s] of stages.entries()) {
    if (have.has(s.key)) continue;
    await db.articleStage.upsert({
      where: { taskId_stageKey: { taskId, stageKey: s.key } },
      create: { taskId, stageKey: s.key, position: i, label: s.label, kind: s.kind },
      update: {},
    });
  }
}

async function recordMetric(db: PrismaClient, task: ArticleTask, stageKey: string, ms: number, generation: number) {
  await db.productionMetric
    .create({ data: { taskId: task.id, websiteId: task.websiteId, moduleKey: task.moduleKey, stageKey, kind: 'STAGE_DURATION', valueMs: ms, dedupeKey: `stage:${task.id}:${stageKey}:g${generation}` } })
    .catch(() => undefined);
}

/** Runs unfinished stages in order. Completed/skipped stages are never re-run. */
export async function runTask(db: PrismaClient, taskId: string, workerId: string, baseSettings: AppSettings): Promise<RunOutcome> {
  let task = await db.articleTask.findUniqueOrThrow({ where: { id: taskId } });
  if (task.cancelRequested || task.status === 'CANCELLED') {
    await db.articleTask.update({ where: { id: taskId }, data: { status: 'CANCELLED', message: 'Cancelled' } });
    return 'cancelled';
  }
  const pipeline = getPipeline(task.moduleKey);
  const settings = await taskSettings(db, task, baseSettings);
  task = await db.articleTask.findUniqueOrThrow({ where: { id: taskId } });
  const website = task.websiteId ? await db.website.findUnique({ where: { id: task.websiteId } }) : null;
  await ensureStageRecords(db, taskId, pipeline.stages);
  const ctx = buildContext(db, task, pipeline, settings, workerId, website);

  for (const stage of pipeline.stages) {
    const rec = await db.articleStage.findUniqueOrThrow({ where: { taskId_stageKey: { taskId, stageKey: stage.key } } });
    if (rec.status === 'COMPLETED' || rec.status === 'SKIPPED') continue;
    try {
      await ctx.checkCancelled();
    } catch {
      await ctx.updateTask({ status: 'CANCELLED', message: 'Cancelled by user; completed content preserved.' } as Partial<ArticleTask>);
      return 'cancelled';
    }
    const startedAt = rec.startedAt ?? new Date();
    await db.articleStage.update({ where: { id: rec.id }, data: { status: 'RUNNING', attempts: { increment: rec.status === 'RUNNING' ? 0 : 1 }, startedAt, error: null } });
    await ctx.updateTask({ status: stage.runningStatus, stage: stage.key, percent: stage.progress, message: `${stage.label}…` } as Partial<ArticleTask>);
    try {
      const result = await stage.run(ctx);
      const priv = parseJson<StagePrivateState>(rec.privateState, {});
      if (result.outcome === 'paused') {
        await db.articleStage.update({ where: { id: rec.id }, data: { status: 'PENDING' } });
        await ctx.updateTask({ status: result.status, message: result.message } as Partial<ArticleTask>);
        await ctx.log('info', `Paused at ${stage.key}: ${result.message}`);
        return 'paused';
      }
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      if (result.outcome === 'skipped') {
        await db.articleStage.update({ where: { id: rec.id }, data: { status: 'SKIPPED', output: result.reason, completedAt, durationMs } });
        await ctx.log('info', `Skipped ${stage.key}: ${result.reason}`);
        continue;
      }
      await db.articleStage.update({
        where: { id: rec.id },
        data: {
          status: 'COMPLETED',
          prompt: result.prompt ?? undefined,
          output: result.output ?? null,
          outputHtml: result.outputHtml ?? null,
          outputJson: result.data === undefined ? null : JSON.stringify(result.data),
          completedAt,
          durationMs,
        },
      });
      await recordMetric(db, ctx.task, stage.key, durationMs, priv.generation ?? 0);
    } catch (e) {
      if (e instanceof WaitForExternal) {
        await ctx.updateTask({ message: e.reason } as Partial<ArticleTask>);
        return 'parked';
      }
      if (e instanceof TaskCancelled) {
        await db.articleStage.update({ where: { id: rec.id }, data: { status: 'PENDING' } });
        await ctx.updateTask({ status: 'CANCELLED', message: 'Cancelled by user; completed content preserved.' } as Partial<ArticleTask>);
        return 'cancelled';
      }
      if (e instanceof LoginRequired) {
        await db.articleStage.update({ where: { id: rec.id }, data: { status: 'PENDING', error: e.message } });
        await ctx.updateTask({ status: 'LOGIN_REQUIRED', message: `${e.target === 'CHATGPT' ? 'ChatGPT' : 'WordPress'} needs you: ${e.message}` } as Partial<ArticleTask>);
        return 'paused';
      }
      await db.articleStage.update({ where: { id: rec.id }, data: { status: 'FAILED', error: (e as Error).message?.slice(0, 4000) } });
      throw e;
    }
  }
  await pipeline.finalize(ctx);
  return 'done';
}

/** Invalidates a stage and its genuine dependents, archiving prior outputs into ArticleStageHistory. */
export async function regenerateStage(db: PrismaClient, taskId: string, stageKey: string, reason: string): Promise<string[]> {
  const task = await db.articleTask.findUniqueOrThrow({ where: { id: taskId } });
  const pipeline = getPipeline(task.moduleKey);
  const keys = pipeline.regenerationPlan(stageKey, task);
  const stages = await db.articleStage.findMany({ where: { taskId, stageKey: { in: keys } } });
  for (const s of stages) {
    if (s.output || s.outputHtml || s.outputJson) {
      await db.articleStageHistory.create({
        data: { taskId, stageKey: s.stageKey, attempts: s.attempts, prompt: s.prompt, output: s.output, outputHtml: s.outputHtml, outputJson: s.outputJson, reason },
      });
    }
    const priv = parseJson<StagePrivateState>(s.privateState, {});
    await db.articleStage.update({
      where: { id: s.id },
      data: {
        status: 'PENDING',
        output: null,
        outputHtml: null,
        outputJson: null,
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        privateState: JSON.stringify({ ...priv, generation: (priv.generation ?? 0) + 1 }),
      },
    });
  }
  return keys;
}
