import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { claimJob, completeJob, enqueueJob, failJob, recoverExpiredLeases } from '@/worker/queue/jobs';
import { acquireWorkerLock } from '@/worker/queue/worker-lock';
import { chatgptBackoffMs, computeBackoffMs } from '@/worker/queue/backoff';
import { dependentClosure } from '@/worker/pipeline/types';
import { celebrityV1Pipeline } from '@/modules/celebrity-v1/pipeline';

let db: PrismaClient;
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bas-q-'));
  const url = `file:${path.join(dir, 'test.db')}`;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  db = new PrismaClient({ datasources: { db: { url } } });
}, 60_000);

describe('queue', () => {
  it('enqueue is idempotent and claims are exclusive', async () => {
    const a = await enqueueJob({ queue: 'article', kind: 'x', operationKey: 'op1' }, db);
    const b = await enqueueJob({ queue: 'article', kind: 'x', operationKey: 'op1' }, db);
    expect(a.id).toBe(b.id);
    const [c1, c2] = await Promise.all([
      claimJob({ queues: ['article'], ownerId: 'w1', leaseSeconds: 60 }, db),
      claimJob({ queues: ['article'], ownerId: 'w2', leaseSeconds: 60 }, db),
    ]);
    expect([c1, c2].filter(Boolean)).toHaveLength(1);
    const owner = (c1 ?? c2)!;
    expect(await completeJob(owner.id, owner.lockedBy === 'w1' ? 'w2' : 'w1', {}, db)).toBe(false);
    expect(await completeJob(owner.id, owner.lockedBy!, {}, db)).toBe(true);
  });
  it('retries with backoff then fails', async () => {
    await enqueueJob({ queue: 'article', kind: 'x', operationKey: 'op2', maxAttempts: 2 }, db);
    let j = await claimJob({ queues: ['article'], ownerId: 'w', leaseSeconds: 60 }, db);
    expect(await failJob(j!.id, 'w', 'boom', { retryBaseSec: 0, retryMaxSec: 0 }, db)).toBe('RETRY');
    j = await claimJob({ queues: ['article'], ownerId: 'w', leaseSeconds: 60 }, db);
    expect(await failJob(j!.id, 'w', 'boom', { retryBaseSec: 0, retryMaxSec: 0 }, db)).toBe('FAILED');
  });
  it('recovers expired leases and flags external side effects for reconciliation', async () => {
    await enqueueJob({ queue: 'chatgpt', kind: 'p', operationKey: 'op3', sideEffect: 'EXTERNAL' }, db);
    const j = await claimJob({ queues: ['chatgpt'], ownerId: 'tab', leaseSeconds: 1 }, db);
    expect(j).not.toBeNull();
    const rec = await recoverExpiredLeases(db, new Date(Date.now() + 5000));
    expect(rec.find((r) => r.job.id === j!.id)?.uncertain).toBe(true);
    const after = await db.queueJob.findUniqueOrThrow({ where: { id: j!.id } });
    expect(after.status).toBe('WAITING');
    expect(JSON.parse(after.payload).reconcile).toBe(true);
  });
});

describe('worker lock', () => {
  it('allows one owner and takes over stale/dead locks', async () => {
    expect((await acquireWorkerLock('A', 30, db, { pid: 111, hostname: 'h', pidAlive: () => true })).acquired).toBe(true);
    expect((await acquireWorkerLock('B', 30, db, { pid: 222, hostname: 'h', pidAlive: () => true })).acquired).toBe(false);
    const r = await acquireWorkerLock('B', 30, db, { pid: 222, hostname: 'h', pidAlive: () => false });
    expect(r).toMatchObject({ acquired: true, tookOverStale: true });
    const later = new Date(Date.now() + 60_000);
    expect((await acquireWorkerLock('C', 30, db, { pid: 3, hostname: 'other', now: later })).acquired).toBe(true);
  });
});

describe('backoff and regeneration graph', () => {
  it('computes capped backoff and ChatGPT ladder', () => {
    expect(computeBackoffMs(1, 10, 100)).toBe(10_000);
    expect(computeBackoffMs(10, 10, 100)).toBe(100_000);
    expect(chatgptBackoffMs(1)).toBe(4000);
    expect(chatgptBackoffMs(9)).toBe(300_000);
    expect(chatgptBackoffMs(1, 90)).toBe(90_000);
  });
  it('regenerating FAQS does not invalidate research or quick bio', () => {
    const keys = dependentClosure(celebrityV1Pipeline.stages, 'FAQS');
    expect(keys).toContain('ASSEMBLY');
    expect(keys).not.toContain('RESEARCH');
    expect(keys).not.toContain('QUICK_BIO');
    expect(keys).not.toContain('EXTERNAL_LINKS');
  });
});
