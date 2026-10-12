import os from 'node:os';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';

const LOCK_ID = 'primary';

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface LockInfo {
  workerId: string;
  pid: number;
  hostname: string;
  heartbeatAt: Date;
  expiresAt: Date;
}

export type AcquireResult = { acquired: true; tookOverStale: boolean } | { acquired: false; holder: LockInfo; reason: string };

/**
 * Atomic single-worker ownership of the data directory. A lock is stale when its TTL expired,
 * or when it was created on this host by a PID that no longer exists.
 */
export async function acquireWorkerLock(
  workerId: string,
  ttlSeconds: number,
  db: PrismaClient = defaultPrisma,
  opts: { pid?: number; hostname?: string; now?: Date; pidAlive?: (pid: number) => boolean } = {},
): Promise<AcquireResult> {
  const pid = opts.pid ?? process.pid;
  const hostname = opts.hostname ?? os.hostname();
  const now = opts.now ?? new Date();
  const pidAlive = opts.pidAlive ?? isPidAlive;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const existing = await db.workerLock.findUnique({ where: { id: LOCK_ID } });
  if (!existing) {
    try {
      await db.workerLock.create({ data: { id: LOCK_ID, workerId, pid, hostname, heartbeatAt: now, expiresAt, acquiredAt: now } });
      return { acquired: true, tookOverStale: false };
    } catch {
      return acquireWorkerLock(workerId, ttlSeconds, db, opts);
    }
  }
  if (existing.workerId === workerId) {
    await db.workerLock.update({ where: { id: LOCK_ID }, data: { heartbeatAt: now, expiresAt } });
    return { acquired: true, tookOverStale: false };
  }
  const expired = existing.expiresAt.getTime() < now.getTime();
  const deadLocalPid = existing.hostname === hostname && !pidAlive(existing.pid);
  if (!expired && !deadLocalPid) {
    return { acquired: false, holder: existing, reason: `Another worker (${existing.workerId}, PID ${existing.pid} on ${existing.hostname}) owns this data directory until ${existing.expiresAt.toISOString()}.` };
  }
  const res = await db.workerLock.updateMany({
    where: { id: LOCK_ID, workerId: existing.workerId, heartbeatAt: existing.heartbeatAt },
    data: { workerId, pid, hostname, heartbeatAt: now, expiresAt, acquiredAt: now },
  });
  if (res.count !== 1) {
    const holder = await db.workerLock.findUnique({ where: { id: LOCK_ID } });
    return { acquired: false, holder: holder ?? existing, reason: 'Lost the race to take over a stale worker lock.' };
  }
  return { acquired: true, tookOverStale: true };
}

export async function heartbeatWorkerLock(workerId: string, ttlSeconds: number, db: PrismaClient = defaultPrisma, now = new Date()): Promise<boolean> {
  const res = await db.workerLock.updateMany({
    where: { id: LOCK_ID, workerId },
    data: { heartbeatAt: now, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) },
  });
  return res.count === 1;
}

export async function releaseWorkerLock(workerId: string, db: PrismaClient = defaultPrisma): Promise<void> {
  await db.workerLock.deleteMany({ where: { id: LOCK_ID, workerId } });
}

/** Used by the dashboard: never assume a worker is alive just because a row exists. */
export async function getWorkerLiveness(db: PrismaClient = defaultPrisma, now = new Date()): Promise<{ alive: boolean; lock: LockInfo | null; reason: string }> {
  const lock = await db.workerLock.findUnique({ where: { id: LOCK_ID } });
  if (!lock) return { alive: false, lock: null, reason: 'No worker has claimed the data directory. Start it with `npm run dev:all`.' };
  if (lock.expiresAt.getTime() < now.getTime()) return { alive: false, lock, reason: `Worker heartbeat expired at ${lock.expiresAt.toISOString()}.` };
  if (lock.hostname === os.hostname() && !isPidAlive(lock.pid)) return { alive: false, lock, reason: `Worker process ${lock.pid} is no longer running.` };
  return { alive: true, lock, reason: 'Worker heartbeat is current.' };
}
