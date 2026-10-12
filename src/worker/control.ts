import type { QueueJob } from '@prisma/client';
import { prisma, parseJson } from '@/lib/db';
import { log } from '@/lib/logger';
import { completeJob, failJob } from './queue/jobs';
import { checkSession, openLoginWindow, syncCategories } from '@/wordpress/site-tools';

/** Control jobs: only the worker opens automation browsers (session tests, logins, category sync). */
export async function handleControlJob(job: QueueJob, workerId: string): Promise<void> {
  const payload = parseJson<{ websiteId?: string }>(job.payload, {});
  try {
    let result: unknown;
    switch (job.kind) {
      case 'wp.testSession':
        result = await checkSession(payload.websiteId!);
        break;
      case 'wp.login':
        result = await openLoginWindow(payload.websiteId!);
        break;
      case 'wp.syncCategories':
        result = await syncCategories(payload.websiteId!);
        break;
      default:
        throw new Error(`Unknown control job ${job.kind}`);
    }
    await completeJob(job.id, workerId, result);
  } catch (e) {
    await log({ level: 'error', category: 'control', message: `${job.kind} failed: ${(e as Error).message}` });
    await failJob(job.id, workerId, (e as Error).message, { fatal: true, retryBaseSec: 5, retryMaxSec: 60 });
  }
}

export { prisma };
