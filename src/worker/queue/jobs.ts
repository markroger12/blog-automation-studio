import type { PrismaClient, QueueJob } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import type { QueueName } from '@/lib/domain';
import { computeBackoffMs } from './backoff';

export interface EnqueueInput {
  queue: QueueName;
  kind: string;
  operationKey: string;
  taskId?: string | null;
  relatedId?: string | null;
  websiteId?: string | null;
  payload?: unknown;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  sideEffect?: 'NONE' | 'EXTERNAL';
}

/** Idempotent: the same operationKey never creates a second job. */
export async function enqueueJob(input: EnqueueInput, db: PrismaClient = defaultPrisma): Promise<QueueJob> {
  const existing = await db.queueJob.findUnique({ where: { operationKey: input.operationKey } });
  if (existing) return existing;
  try {
    return await db.queueJob.create({
      data: {
        queue: input.queue,
        kind: input.kind,
        operationKey: input.operationKey,
        taskId: input.taskId ?? null,
        relatedId: input.relatedId ?? null,
        websiteId: input.websiteId ?? null,
        payload: JSON.stringify(input.payload ?? {}),
        priority: input.priority ?? 0,
        runAt: input.runAt ?? new Date(),
        maxAttempts: input.maxAttempts ?? 3,
        sideEffect: input.sideEffect ?? 'NONE',
      },
    });
  } catch (e) {
    const again = await db.queueJob.findUnique({ where: { operationKey: input.operationKey } });
    if (again) return again;
    throw e;
  }
}

export interface ClaimOptions {
  queues: QueueName[];
  ownerId: string;
  leaseSeconds: number;
  now?: Date;
  /** Return false to skip a candidate (site/global concurrency, backoff, affinity). */
  filter?: (job: QueueJob) => boolean | Promise<boolean>;
  candidates?: number;
  /** Optional ordering preference, e.g. conversation affinity. Higher first. */
  preference?: (job: QueueJob) => number;
  tabId?: string | null;
}

/**
 * Atomically claims one job. Uses compare-and-set on (id, status=WAITING) so two claimers
 * can never own the same job even across processes sharing the SQLite file.
 */
export async function claimJob(opts: ClaimOptions, db: PrismaClient = defaultPrisma): Promise<QueueJob | null> {
  const now = opts.now ?? new Date();
  const candidates = await db.queueJob.findMany({
    where: { queue: { in: opts.queues }, status: 'WAITING', runAt: { lte: now } },
    orderBy: [{ priority: 'desc' }, { runAt: 'asc' }, { createdAt: 'asc' }],
    take: opts.candidates ?? 25,
  });
  const ordered = opts.preference
    ? [...candidates].sort((a, b) => (opts.preference!(b) - opts.preference!(a)))
    : candidates;
  for (const job of ordered) {
    if (opts.filter && !(await opts.filter(job))) continue;
    const leaseExpiresAt = new Date(now.getTime() + opts.leaseSeconds * 1000);
    const res = await db.queueJob.updateMany({
      where: { id: job.id, status: 'WAITING' },
      data: {
        status: 'ACTIVE',
        lockedBy: opts.ownerId,
        heartbeatAt: now,
        leaseExpiresAt,
        attempts: { increment: 1 },
        tabId: opts.tabId ?? null,
      },
    });
    if (res.count === 1) return db.queueJob.findUnique({ where: { id: job.id } });
  }
  return null;
}

export async function heartbeatJob(jobId: string, ownerId: string, leaseSeconds: number, db: PrismaClient = defaultPrisma): Promise<boolean> {
  const now = new Date();
  const res = await db.queueJob.updateMany({
    where: { id: jobId, lockedBy: ownerId, status: 'ACTIVE' },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000) },
  });
  return res.count === 1;
}

export async function completeJob(jobId: string, ownerId: string, result: unknown = {}, db: PrismaClient = defaultPrisma): Promise<boolean> {
  const res = await db.queueJob.updateMany({
    where: { id: jobId, lockedBy: ownerId, status: 'ACTIVE' },
    data: { status: 'COMPLETED', result: JSON.stringify(result ?? {}), completedAt: new Date(), leaseExpiresAt: null, lastError: null },
  });
  return res.count === 1;
}

/** Puts an ACTIVE job back to WAITING without counting it as a failure (e.g. parked waiting for ChatGPT). */
export async function releaseJob(jobId: string, ownerId: string, runAt: Date, opts: { refundAttempt?: boolean; payload?: unknown } = {}, db: PrismaClient = defaultPrisma): Promise<boolean> {
  const res = await db.queueJob.updateMany({
    where: { id: jobId, lockedBy: ownerId, status: 'ACTIVE' },
    data: {
      status: 'WAITING',
      runAt,
      lockedBy: null,
      leaseExpiresAt: null,
      tabId: null,
      ...(opts.refundAttempt ? { attempts: { decrement: 1 } } : {}),
      ...(opts.payload !== undefined ? { payload: JSON.stringify(opts.payload) } : {}),
    },
  });
  return res.count === 1;
}

export interface FailOptions {
  fatal?: boolean;
  retryBaseSec: number;
  retryMaxSec: number;
  now?: Date;
}

export async function failJob(jobId: string, ownerId: string, error: string, opts: FailOptions, db: PrismaClient = defaultPrisma): Promise<'RETRY' | 'FAILED' | 'LOST'> {
  const job = await db.queueJob.findUnique({ where: { id: jobId } });
  if (!job || job.lockedBy !== ownerId || job.status !== 'ACTIVE') return 'LOST';
  const now = opts.now ?? new Date();
  if (!opts.fatal && job.attempts < job.maxAttempts) {
    const delay = computeBackoffMs(job.attempts, opts.retryBaseSec, opts.retryMaxSec);
    await db.queueJob.updateMany({
      where: { id: jobId, lockedBy: ownerId, status: 'ACTIVE' },
      data: { status: 'WAITING', runAt: new Date(now.getTime() + delay), lockedBy: null, leaseExpiresAt: null, lastError: error.slice(0, 4000), tabId: null },
    });
    return 'RETRY';
  }
  await db.queueJob.updateMany({
    where: { id: jobId, lockedBy: ownerId, status: 'ACTIVE' },
    data: { status: 'FAILED', lastError: error.slice(0, 4000), completedAt: now, leaseExpiresAt: null },
  });
  return 'FAILED';
}

export async function cancelJobsForTask(taskId: string, db: PrismaClient = defaultPrisma): Promise<number> {
  const res = await db.queueJob.updateMany({ where: { taskId, status: 'WAITING' }, data: { status: 'CANCELLED', completedAt: new Date() } });
  return res.count;
}

export async function wakeJobs(where: { taskId: string; queue?: QueueName }, db: PrismaClient = defaultPrisma): Promise<number> {
  const res = await db.queueJob.updateMany({
    where: { taskId: where.taskId, status: 'WAITING', ...(where.queue ? { queue: where.queue } : {}) },
    data: { runAt: new Date() },
  });
  return res.count;
}

export interface ExpiredLease {
  job: QueueJob;
  uncertain: boolean;
}

/**
 * Finds ACTIVE jobs whose lease expired. Local-only jobs are returned to WAITING.
 * Jobs with possible external side effects are also returned to WAITING but flagged
 * `reconcile: true` in their payload so the handler must reconcile before acting again.
 */
export async function recoverExpiredLeases(db: PrismaClient = defaultPrisma, now = new Date()): Promise<ExpiredLease[]> {
  const expired = await db.queueJob.findMany({ where: { status: 'ACTIVE', leaseExpiresAt: { lt: now } } });
  const out: ExpiredLease[] = [];
  for (const job of expired) {
    const uncertain = job.sideEffect === 'EXTERNAL';
    const payload = safeParse(job.payload);
    const res = await db.queueJob.updateMany({
      where: { id: job.id, status: 'ACTIVE', leaseExpiresAt: { lt: now } },
      data: {
        status: 'WAITING',
        lockedBy: null,
        leaseExpiresAt: null,
        tabId: null,
        runAt: now,
        payload: JSON.stringify(uncertain ? { ...payload, reconcile: true } : payload),
        lastError: `Lease expired while owned by ${job.lockedBy ?? 'unknown'}`,
      },
    });
    if (res.count === 1) out.push({ job, uncertain });
  }
  return out;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
