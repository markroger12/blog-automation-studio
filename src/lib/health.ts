import { prisma } from './db';
import { getWorkerLiveness } from '@/worker/queue/worker-lock';
import { getRuntime, inChatgptBackoff } from './runtime';

export async function systemHealth() {
  const [worker, extensions, runtime, waitingChatgpt, activeKey] = await Promise.all([
    getWorkerLiveness(),
    prisma.workerStatus.findMany({ where: { kind: 'EXTENSION' }, orderBy: { lastSeenAt: 'desc' } }),
    getRuntime(prisma),
    prisma.queueJob.count({ where: { queue: 'chatgpt', status: 'WAITING' } }),
    prisma.extensionKey.findFirst({ where: { revokedAt: null } }),
  ]);
  const ext = extensions[0];
  const extAlive = !!ext && Date.now() - ext.lastSeenAt.getTime() < 90_000;
  return {
    worker,
    extension: { paired: !!activeKey, connected: extAlive, lastSeenAt: ext?.lastSeenAt ?? null, version: ext?.version ?? null },
    chatgpt: { backoff: inChatgptBackoff(runtime), backoffUntil: runtime.chatgptBackoffUntil, pausedNewClaims: runtime.pausedNewClaims, reason: runtime.lastBackoffReason, waiting: waitingChatgpt, concurrency: runtime.concurrency },
  };
}
