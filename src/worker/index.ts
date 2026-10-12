import crypto from 'node:crypto';
import os from 'node:os';
import type { QueueJob } from '@prisma/client';
import { prisma, applySqlitePragmas } from '@/lib/db';
import { log } from '@/lib/logger';
import { getSettings } from '@/lib/settings';
import { getRuntime } from '@/lib/runtime';
import { PAUSED_STATUSES, TERMINAL_STATUSES } from '@/lib/domain';
import { claimJob, completeJob, failJob, heartbeatJob, recoverExpiredLeases, releaseJob } from './queue/jobs';
import { acquireWorkerLock, heartbeatWorkerLock, releaseWorkerLock } from './queue/worker-lock';
import { runTask } from './pipeline/runner';
import { FatalStageError } from './pipeline/types';
import { handleControlJob } from './control';

const WORKER_VERSION = '3.0.0';
const LOCK_TTL = 30;
const workerId = `worker-${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
let stopping = false;
const running = new Map<string, Promise<void>>();

async function activeSlotCount(): Promise<number> {
  return prisma.articleTask.count({ where: { status: { notIn: ['QUEUED', ...TERMINAL_STATUSES, ...PAUSED_STATUSES] } } });
}

async function processArticleJob(job: QueueJob, leaseSec: number) {
  const settings = await getSettings();
  const hb = setInterval(() => void heartbeatJob(job.id, workerId, leaseSec), Math.max(5, leaseSec / 3) * 1000);
  try {
    const outcome = await runTask(prisma, job.taskId!, workerId, settings);
    if (outcome === 'parked') await releaseJob(job.id, workerId, new Date(Date.now() + 60_000), { refundAttempt: true });
    else await completeJob(job.id, workerId, { outcome });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const r = await failJob(job.id, workerId, msg, { fatal: e instanceof FatalStageError, retryBaseSec: settings.advanced.retryBaseDelaySec, retryMaxSec: settings.advanced.retryMaxDelaySec });
    await log({ level: 'error', category: 'worker', message: `Task ${job.taskId} stage error (${r}): ${msg}`, taskId: job.taskId });
    await prisma.articleTask.update({
      where: { id: job.taskId! },
      data: r === 'FAILED' ? { status: 'FAILED', message: msg.slice(0, 500), errors: JSON.stringify([msg.slice(0, 2000)]) } : { message: `Retrying after error: ${msg.slice(0, 300)}` },
    });
  } finally {
    clearInterval(hb);
  }
}

async function tick() {
  const settings = await getSettings();
  const runtime = await getRuntime(prisma);
  const leaseSec = settings.advanced.operationLeaseSeconds;
  const limit = settings.workflow.adaptiveConcurrency ? Math.min(runtime.concurrency, settings.workflow.maxTaskConcurrency) : settings.workflow.taskConcurrency;
  const localParallel = 3;
  while (!stopping && running.size < localParallel) {
    let slots = await activeSlotCount();
    const job = await claimJob({
      queues: ['article', 'control'],
      ownerId: workerId,
      leaseSeconds: leaseSec,
      filter: async (j) => {
        if (j.queue === 'control') return true;
        if (!j.taskId || running.has(j.taskId)) return false;
        const task = await prisma.articleTask.findUnique({ where: { id: j.taskId }, select: { status: true, websiteId: true } });
        if (!task) return false;
        if (task.status !== 'QUEUED') return true;
        if (slots >= limit || runtime.pausedNewClaims) return false;
        if (task.websiteId) {
          const site = await prisma.website.findUnique({ where: { id: task.websiteId }, select: { queuePaused: true, maxConcurrentTasks: true } });
          if (site?.queuePaused) return false;
          const siteActive = await prisma.articleTask.count({ where: { websiteId: task.websiteId, status: { notIn: ['QUEUED', ...TERMINAL_STATUSES, ...PAUSED_STATUSES] } } });
          if (site && siteActive >= site.maxConcurrentTasks) return false;
        }
        slots++;
        return true;
      },
    });
    if (!job) break;
    const key = job.taskId ?? job.id;
    const p = (job.queue === 'control' ? handleControlJob(job, workerId) : processArticleJob(job, leaseSec)).finally(() => running.delete(key));
    running.set(key, p);
  }
}

async function recover() {
  const expired = await recoverExpiredLeases(prisma);
  for (const { job, uncertain } of expired) {
    await prisma.recoveryIncident.create({
      data: {
        taskId: job.taskId,
        jobId: job.id,
        kind: uncertain ? (job.queue === 'chatgpt' ? 'UNCERTAIN_PROMPT' : 'UNCERTAIN_WP_CREATE') : 'STALE_LEASE',
        reason: `Lease expired for ${job.kind} owned by ${job.lockedBy ?? 'unknown'}${uncertain ? '; will reconcile before any resend.' : '; requeued (local work only).'}`,
        status: uncertain ? 'OPEN' : 'RESOLVED',
        resolution: uncertain ? null : 'Automatically requeued',
        resolvedAt: uncertain ? null : new Date(),
      },
    });
    await log({ level: 'warn', category: 'recovery', message: `Recovered expired lease on job ${job.id} (${job.kind})`, taskId: job.taskId });
  }
}

async function main() {
  await applySqlitePragmas();
  const res = await acquireWorkerLock(workerId, LOCK_TTL);
  if (!res.acquired) {
    console.error(`[worker] ${res.reason}`);
    process.exit(2);
  }
  await prisma.workerStatus.upsert({
    where: { id: 'worker' },
    create: { id: 'worker', kind: 'WORKER', version: WORKER_VERSION, status: 'RUNNING', capabilities: JSON.stringify(['article', 'control', 'wordpress']), diagnostics: JSON.stringify({ workerId, pid: process.pid }) },
    update: { version: WORKER_VERSION, status: 'RUNNING', lastSeenAt: new Date(), diagnostics: JSON.stringify({ workerId, pid: process.pid }) },
  });
  await log({ category: 'worker', message: `Worker ${workerId} started${res.tookOverStale ? ' (took over stale lock)' : ''}` });
  await recover();

  const lockTimer = setInterval(async () => {
    const ok = await heartbeatWorkerLock(workerId, LOCK_TTL).catch(() => false);
    await prisma.workerStatus.update({ where: { id: 'worker' }, data: { lastSeenAt: new Date(), status: 'RUNNING' } }).catch(() => undefined);
    if (!ok) {
      console.error('[worker] Lost the worker lock; stopping to avoid double processing.');
      void shutdown(3);
    }
  }, 10_000);
  const recoverTimer = setInterval(() => void recover().catch((e) => console.error(e)), 15_000);

  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    clearInterval(lockTimer);
    clearInterval(recoverTimer);
    await Promise.race([Promise.allSettled([...running.values()]), new Promise((r) => setTimeout(r, 8000))]);
    await prisma.workerStatus.update({ where: { id: 'worker' }, data: { status: 'STOPPED' } }).catch(() => undefined);
    await releaseWorkerLock(workerId).catch(() => undefined);
    await prisma.$disconnect();
    process.exit(code);
  };
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  while (!stopping) {
    try {
      await tick();
    } catch (e) {
      console.error('[worker] tick failed', e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

void main();
