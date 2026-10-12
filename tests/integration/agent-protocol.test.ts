import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestDb } from '../helpers/db';
import { authenticateAgent, claim, complete, createExtensionKey, fail, progress } from '@/lib/agent/service';
import { enqueueJob, recoverExpiredLeases } from '@/worker/queue/jobs';
import { getRuntime, updateRuntime } from '@/lib/runtime';

let db: PrismaClient;
let n = 0;
beforeAll(() => { db = makeTestDb(); }, 60_000);
beforeEach(async () => {
  await db.queueJob.deleteMany();
  await updateRuntime(db, { chatgptBackoffUntil: null, consecutive429: 0, pausedNewClaims: false, concurrency: 3 });
});

async function seedPrompt(conversationUrl: string | null = null) {
  n++;
  const task = await db.articleTask.create({ data: { moduleKey: 'celebrity-v1', primaryKeyword: `k${n}`, normalizedKeyword: `k${n}`, idempotencyKey: `idem-${n}`, conversationUrl } });
  const operationId = `chatgpt:${task.id}:TITLES:g0:TITLES`;
  await db.chatGPTResponse.create({ data: { taskId: task.id, stageKey: 'TITLES', operationId, prompt: 'P', promptHash: 'h' } });
  await enqueueJob({ queue: 'chatgpt', kind: 'chatgpt.prompt', operationKey: operationId, taskId: task.id, sideEffect: 'EXTERNAL', payload: { operationId, prompt: 'Prompt text', conversationUrl, newChat: !conversationUrl } }, db);
  await enqueueJob({ queue: 'article', kind: 'article.run', operationKey: `article:${task.id}:run:1`, taskId: task.id, runAt: new Date(Date.now() + 3600_000) }, db);
  return { task, operationId };
}
const A = { instanceId: 'inst-test', tabId: '1' };
const B = { instanceId: 'inst-test', tabId: '2' };

describe('agent protocol', () => {
  it('authenticates only current keys', async () => {
    const k1 = await createExtensionKey(db);
    await expect(authenticateAgent(db, `Bearer ${k1}`)).resolves.toBeUndefined();
    const k2 = await createExtensionKey(db);
    await expect(authenticateAgent(db, `Bearer ${k1}`)).rejects.toThrow(/revoked/);
    await expect(authenticateAgent(db, `Bearer ${k2}`)).resolves.toBeUndefined();
    await expect(authenticateAgent(db, null)).rejects.toThrow();
  });

  it('two tabs never claim the same job; claim→progress→complete wakes the article job', async () => {
    const { task, operationId } = await seedPrompt();
    const [a, b] = await Promise.all([claim(db, A), claim(db, B)]);
    const winner = a.job ? A : B;
    expect([a.job, b.job].filter(Boolean)).toHaveLength(1);
    const job = (a.job ?? b.job)!;
    expect(job.newChat).toBe(true);
    await progress(db, { ...winner, jobId: job.jobId, phase: 'streaming', conversationUrl: 'https://chatgpt.com/c/abc' });
    expect((await db.articleTask.findUniqueOrThrow({ where: { id: task.id } })).conversationUrl).toBe('https://chatgpt.com/c/abc');
    await expect(complete(db, { ...(winner === A ? B : A), jobId: job.jobId, text: 'x', recovered: false })).rejects.toThrow(/no longer owns/);
    await complete(db, { ...winner, jobId: job.jobId, text: 'Answer', conversationUrl: 'https://chatgpt.com/c/abc', recovered: false, elapsedMs: 1000 });
    expect((await db.chatGPTResponse.findUniqueOrThrow({ where: { operationId } })).resultText).toBe('Answer');
    const art = await db.queueJob.findFirstOrThrow({ where: { taskId: task.id, queue: 'article' } });
    expect(art.runAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('same tab re-claims its active job after a service-worker restart', async () => {
    await seedPrompt();
    const first = await claim(db, A);
    const again = await claim(db, A);
    expect(again.job?.jobId).toBe(first.job?.jobId);
  });

  it('429 sets account-wide backoff, lowers concurrency and blocks claims', async () => {
    await seedPrompt();
    const c = await claim(db, A);
    const r = await fail(db, { ...A, jobId: c.job!.jobId, code: 'USAGE_LIMIT', message: 'limit', retryAfterSec: 120 });
    expect(r.backoffUntil).toBeTruthy();
    const rt = await getRuntime(db);
    expect(rt.consecutive429).toBe(1);
    expect(rt.concurrency).toBe(2);
    expect((await claim(db, B)).backoffUntil).toBeTruthy();
    const j = await db.queueJob.findUniqueOrThrow({ where: { id: c.job!.jobId } });
    expect(j.status).toBe('WAITING');
    expect(JSON.parse(j.payload).reconcile).toBe(true);
  });

  it('login challenge pauses the task without failing the job', async () => {
    const { task } = await seedPrompt();
    const c = await claim(db, A);
    await fail(db, { ...A, jobId: c.job!.jobId, code: 'LOGIN', message: 'signed out' });
    expect((await db.articleTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('LOGIN_REQUIRED');
    expect((await db.queueJob.findUniqueOrThrow({ where: { id: c.job!.jobId } })).status).toBe('WAITING');
  });

  it('stale conversation restarts in a new chat', async () => {
    const { task } = await seedPrompt('https://chatgpt.com/c/old');
    const c = await claim(db, A);
    expect(c.job!.newChat).toBe(false);
    await fail(db, { ...A, jobId: c.job!.jobId, code: 'CONVERSATION_LOST', message: 'gone' });
    const again = await claim(db, B);
    expect(again.job!.newChat).toBe(true);
    expect((await db.articleTask.findUniqueOrThrow({ where: { id: task.id } })).conversationUrl).toBeNull();
  });

  it('tab shutdown: expired lease is recovered with reconcile so the prompt is not blindly resent', async () => {
    await seedPrompt('https://chatgpt.com/c/live');
    const c = await claim(db, A);
    await db.queueJob.update({ where: { id: c.job!.jobId }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await recoverExpiredLeases(db);
    const again = await claim(db, B);
    expect(again.job!.jobId).toBe(c.job!.jobId);
    expect(again.job!.reconcile).toBe(true);
  });

  it('cancellation is signalled through progress', async () => {
    const { task } = await seedPrompt();
    const c = await claim(db, A);
    await db.articleTask.update({ where: { id: task.id }, data: { cancelRequested: true } });
    expect((await progress(db, { ...A, jobId: c.job!.jobId, phase: 'x' })).cancel).toBe(true);
  });
});
