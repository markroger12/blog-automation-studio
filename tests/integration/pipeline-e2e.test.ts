import { beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestDb } from '../helpers/db';
import { seedPrompts } from '@/modules/prompts/seed';
import { runTask } from '@/worker/pipeline/runner';
import { DEFAULT_SETTINGS } from '@/lib/settings-schema';
import { parseJson } from '@/lib/db';

let db: PrismaClient;
beforeAll(async () => { db = makeTestDb(); await seedPrompts(db); }, 60_000);

const para = (s: string) => Array.from({ length: 4 }, (_, i) => `${s} sentence ${i + 1} with Jane Doe details about the career and life story.`).join(' ');
const ANSWERS: Record<string, string> = {
  TITLES: '1. Jane Doe Biography: Age, Career and Life\n2. Who Is Jane Doe?\nRecommended Title: Jane Doe Biography: Age, Career and Life',
  RESEARCH: `Research notes about Jane Doe. ${para('Research').repeat(3)}`,
  LONG_ARTICLE: `${para('Intro')}\n\n## Early Life\n\n${para('Early')}\n\n## Career\n\n${para('Career')}\n\n## Personal Life\n\n${para('Personal')}\n\n## Conclusion\n\n${para('End')}`,
  FINAL_ARTICLE: `${para('Jane Doe intro')}\n\n## Early Life of Jane Doe\n\n${para('Early')}\n\n## Career Highlights\n\n${para('Career')}\n\n### Breakthrough\n\n${para('Break')}\n\n## Personal Life\n\n${para('Personal')}\n\n## Conclusion\n\n${para('Jane Doe end')}`,
  FAQS: Array.from({ length: 5 }, (_, i) => `QUESTION: Question ${i + 1} about Jane Doe?\nANSWER: Answer ${i + 1}.`).join('\n'),
  QUICK_BIO: '| Attribute | Details |\n|---|---|\n' + Array.from({ length: 12 }, (_, i) => `| Field ${i + 1} | Value ${i + 1} |`).join('\n'),
  EXTERNAL_LINKS: 'LINK: Career Highlights | https://en.wikipedia.org/wiki/Example',
};

/** Simulates the extension: answers every waiting ChatGPT job, as the agent protocol would. */
async function answerWaiting() {
  const jobs = await db.queueJob.findMany({ where: { queue: 'chatgpt', status: 'WAITING' } });
  for (const j of jobs) {
    const p = JSON.parse(j.payload);
    const text = ANSWERS[p.promptKey] ?? 'OK';
    await db.chatGPTResponse.update({ where: { operationId: p.operationId }, data: { resultText: text, conversationUrl: 'https://chatgpt.com/c/test', completedAt: new Date() } });
    await db.queueJob.update({ where: { id: j.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }
  return jobs.length;
}

describe('Celebrity 1.0 pipeline end-to-end (fake ChatGPT answers, no website)', () => {
  it('produces an assembled local article without duplicate prompts across restarts', async () => {
    const task = await db.articleTask.create({ data: { moduleKey: 'celebrity-v1', primaryKeyword: 'Jane Doe', normalizedKeyword: 'jane doe', idempotencyKey: 'e2e-1' } });
    let outcome = '';
    for (let i = 0; i < 30; i++) {
      outcome = await runTask(db, task.id, 'w-test', DEFAULT_SETTINGS);
      if (outcome !== 'parked') break;
      await answerWaiting();
    }
    const t = await db.articleTask.findUniqueOrThrow({ where: { id: task.id }, include: { stages: true } });
    expect(t.selectedTitle).toBe('Jane Doe Biography: Age, Career and Life');
    expect(t.assembledHtml).toContain('<table');
    expect(t.assembledHtml).toMatch(/Frequently Asked Questions/);
    expect(parseJson<unknown[]>(t.faqs, [])).toHaveLength(5);
    expect(t.seoScore).toBeGreaterThan(0);
    expect(['NEEDS_REVIEW', 'DRAFT_CREATED', 'AWAITING_ARTICLE_APPROVAL']).toContain(t.status);
    expect(t.wpPostId).toBeNull();
    const responses = await db.chatGPTResponse.groupBy({ by: ['operationId'], where: { taskId: task.id }, _count: { _all: true } });
    expect(responses.every((r) => r._count._all === 1)).toBe(true);
    // Re-running after completion must not send anything new.
    const before = await db.queueJob.count({ where: { taskId: task.id, queue: 'chatgpt' } });
    await runTask(db, task.id, 'w-test', DEFAULT_SETTINGS);
    expect(await db.queueJob.count({ where: { taskId: task.id, queue: 'chatgpt' } })).toBe(before);
  }, 60_000);
});
