import type { PrismaClient, QueueJob } from '@prisma/client';
import { z } from 'zod';
import { parseJson } from '../db';
import { randomToken, sha256 } from '../hash';
import { log } from '../logger';
import { getRuntime, inChatgptBackoff, updateRuntime } from '../runtime';
import { EXTENSION_FAIL_CODES } from '../domain';
import { claimJob, completeJob, failJob, heartbeatJob, releaseJob, wakeJobs } from '@/worker/queue/jobs';
import { chatgptBackoffMs } from '@/worker/queue/backoff';

export const AGENT_PROTOCOL_VERSION = 1;
export const AGENT_LEASE_SECONDS = 90;
export const KEY_PREFIX = 'bas_';

export class AgentAuthError extends Error {}

export async function createExtensionKey(db: PrismaClient): Promise<string> {
  const key = `${KEY_PREFIX}${randomToken(32)}`;
  await db.$transaction([
    db.extensionKey.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } }),
    db.extensionKey.create({ data: { keyHash: sha256(key), prefix: key.slice(0, 10) } }),
  ]);
  return key;
}

export async function authenticateAgent(db: PrismaClient, authorization: string | null): Promise<void> {
  const key = authorization?.match(/^Bearer\s+(bas_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!key) throw new AgentAuthError('Missing extension connection key');
  const row = await db.extensionKey.findUnique({ where: { keyHash: sha256(key) } });
  if (!row || row.revokedAt) throw new AgentAuthError('Invalid or revoked extension connection key');
}

const Ident = z.object({ instanceId: z.string().min(4).max(80).regex(/^[\w-]+$/), tabId: z.coerce.string().min(1).max(40) });
export const HelloSchema = z.object({ instanceId: Ident.shape.instanceId, version: z.string().max(40), tabs: z.number().int().min(0).max(10).default(0), userAgent: z.string().max(400).optional() });
export const ClaimSchema = Ident;
export const ProgressSchema = Ident.extend({ jobId: z.string().min(1).max(60), phase: z.string().max(40), conversationUrl: z.string().url().max(500).nullable().optional(), chars: z.number().int().min(0).optional() });
export const CompleteSchema = Ident.extend({
  jobId: z.string().min(1).max(60),
  text: z.string().min(1).max(500_000),
  html: z.string().max(1_000_000).optional(),
  conversationUrl: z.string().url().max(500).nullable().optional(),
  recovered: z.boolean().default(false),
  elapsedMs: z.number().int().min(0).optional(),
});
export const FailSchema = Ident.extend({
  jobId: z.string().min(1).max(60),
  code: z.enum(EXTENSION_FAIL_CODES),
  message: z.string().max(2000).default(''),
  retryAfterSec: z.number().int().min(0).max(3600).optional(),
  conversationUrl: z.string().url().max(500).nullable().optional(),
});

const owner = (i: { instanceId: string; tabId: string }) => `ext:${i.instanceId}:${i.tabId}`;

function isChatgptUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  try {
    const h = new URL(u).hostname;
    return h === 'chatgpt.com' || h === 'chat.openai.com';
  } catch {
    return false;
  }
}

export function promptTail(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(-160);
}

export async function hello(db: PrismaClient, input: z.infer<typeof HelloSchema>) {
  await db.workerStatus.upsert({
    where: { id: `extension:${input.instanceId}` },
    create: { id: `extension:${input.instanceId}`, kind: 'EXTENSION', version: input.version, status: 'CONNECTED', diagnostics: JSON.stringify({ tabs: input.tabs, userAgent: input.userAgent }) },
    update: { version: input.version, status: 'CONNECTED', lastSeenAt: new Date(), diagnostics: JSON.stringify({ tabs: input.tabs, userAgent: input.userAgent }) },
  });
  const rt = await getRuntime(db);
  return { protocol: AGENT_PROTOCOL_VERSION, leaseSeconds: AGENT_LEASE_SECONDS, heartbeatSeconds: 20, backoffUntil: inChatgptBackoff(rt) ? rt.chatgptBackoffUntil : null };
}

export interface ClaimedJob {
  jobId: string;
  operationId: string;
  prompt: string;
  promptTail: string;
  conversationUrl: string | null;
  newChat: boolean;
  reconcile: boolean;
  attachments: unknown[];
  leaseSeconds: number;
}

export async function claim(db: PrismaClient, input: z.infer<typeof ClaimSchema>): Promise<{ job: ClaimedJob | null; backoffUntil: string | null }> {
  await db.workerStatus.updateMany({ where: { id: `extension:${input.instanceId}` }, data: { lastSeenAt: new Date(), status: 'CONNECTED' } });
  const rt = await getRuntime(db);
  if (inChatgptBackoff(rt)) return { job: null, backoffUntil: rt.chatgptBackoffUntil };
  // Tab already owns an active job (e.g. service worker restarted): hand the same job back.
  const mine = await db.queueJob.findFirst({ where: { queue: 'chatgpt', status: 'ACTIVE', lockedBy: owner(input) } });
  const job = mine ?? (await claimJob({ queues: ['chatgpt'], ownerId: owner(input), leaseSeconds: AGENT_LEASE_SECONDS }, db));
  if (!job) return { job: null, backoffUntil: null };
  await db.queueJob.update({ where: { id: job.id }, data: { tabId: input.tabId } });
  const p = parseJson<Record<string, unknown>>(job.payload, {});
  const prompt = String(p.prompt ?? '');
  return {
    backoffUntil: null,
    job: {
      jobId: job.id,
      operationId: String(p.operationId ?? job.operationKey),
      prompt,
      promptTail: promptTail(prompt),
      conversationUrl: isChatgptUrl(p.conversationUrl as string) ? (p.conversationUrl as string) : null,
      newChat: !!p.newChat || !isChatgptUrl(p.conversationUrl as string),
      reconcile: !!p.reconcile || job.attempts > 1,
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      leaseSeconds: AGENT_LEASE_SECONDS,
    },
  };
}

async function ownedJob(db: PrismaClient, input: { jobId: string; instanceId: string; tabId: string }): Promise<QueueJob> {
  const job = await db.queueJob.findUnique({ where: { id: input.jobId } });
  if (!job || job.status !== 'ACTIVE' || job.lockedBy !== owner(input)) throw new AgentAuthError('This tab no longer owns the job (lease lost or task cancelled). Stop and claim again.');
  return job;
}

export async function progress(db: PrismaClient, input: z.infer<typeof ProgressSchema>) {
  const job = await ownedJob(db, input);
  if (job.taskId) {
    const t = await db.articleTask.findUnique({ where: { id: job.taskId }, select: { cancelRequested: true } });
    if (t?.cancelRequested) return { ok: true, cancel: true };
  }
  await heartbeatJob(job.id, owner(input), AGENT_LEASE_SECONDS, db);
  if (isChatgptUrl(input.conversationUrl) && /\/c\//.test(input.conversationUrl)) {
    const p = parseJson<Record<string, unknown>>(job.payload, {});
    if (p.sentConversationUrl !== input.conversationUrl) {
      await db.queueJob.update({ where: { id: job.id }, data: { payload: JSON.stringify({ ...p, conversationUrl: input.conversationUrl, sentConversationUrl: input.conversationUrl, newChat: false }) } });
      if (job.taskId) await db.articleTask.update({ where: { id: job.taskId }, data: { conversationUrl: input.conversationUrl } });
    }
  }
  return { ok: true, cancel: false };
}

export async function complete(db: PrismaClient, input: z.infer<typeof CompleteSchema>) {
  const job = await ownedJob(db, input);
  const p = parseJson<Record<string, unknown>>(job.payload, {});
  const operationId = String(p.operationId ?? job.operationKey);
  const text = input.text.trim();
  if (text.length < 2) throw new Error('Empty response');
  const conv = isChatgptUrl(input.conversationUrl) ? input.conversationUrl : null;
  await db.chatGPTResponse.update({
    where: { operationId },
    data: { resultText: text, resultHtml: input.html ?? null, conversationUrl: conv, recovered: input.recovered, elapsedMs: input.elapsedMs ?? null, fingerprint: sha256(text), completedAt: new Date() },
  });
  if (job.taskId) {
    await db.articleTask.update({ where: { id: job.taskId }, data: { ...(conv ? { conversationUrl: conv } : {}), chatgptInteractions: { increment: 1 } } });
    await db.productionMetric.upsert({
      where: { dedupeKey: `chatgpt:${operationId}` },
      create: { dedupeKey: `chatgpt:${operationId}`, kind: 'CHATGPT_RESPONSE', taskId: job.taskId, stageKey: String(p.stageKey ?? ''), valueMs: input.elapsedMs ?? null },
      update: {},
    });
  }
  const ok = await completeJob(job.id, owner(input), { chars: text.length, recovered: input.recovered }, db);
  const rt = await getRuntime(db);
  if (rt.consecutive429) await updateRuntime(db, { consecutive429: 0 });
  if (job.taskId) await wakeJobs({ taskId: job.taskId, queue: 'article' }, db);
  if (input.recovered) await log({ level: 'info', category: 'recovery', message: `Recovered existing ChatGPT answer for ${operationId} without resending`, taskId: job.taskId });
  return { ok };
}

export async function fail(db: PrismaClient, input: z.infer<typeof FailSchema>) {
  const job = await ownedJob(db, input);
  const who = owner(input);
  const p = parseJson<Record<string, unknown>>(job.payload, {});
  const sent = !!p.sentConversationUrl || !!input.conversationUrl;
  await log({ level: input.code === 'ERROR' ? 'error' : 'warn', category: 'extension', message: `ChatGPT ${input.code}: ${input.message}`, taskId: job.taskId });
  switch (input.code) {
    case 'USAGE_LIMIT': {
      const rt = await getRuntime(db);
      const n = rt.consecutive429 + 1;
      const until = new Date(Date.now() + chatgptBackoffMs(n, input.retryAfterSec));
      await updateRuntime(db, { consecutive429: n, last429At: new Date().toISOString(), chatgptBackoffUntil: until.toISOString(), lastBackoffReason: input.message.slice(0, 200), concurrency: Math.max(1, rt.concurrency - 1) });
      await releaseJob(job.id, who, until, { refundAttempt: true, payload: { ...p, reconcile: true } }, db);
      return { ok: true, backoffUntil: until.toISOString() };
    }
    case 'LOGIN':
    case 'HUMAN_CHECK':
      // Keep the job resumable: park it, and fail the article stage with a login-required marker.
      await releaseJob(job.id, who, new Date(Date.now() + 60_000), { refundAttempt: true, payload: { ...p, reconcile: sent } }, db);
      await updateRuntime(db, { pausedNewClaims: true, lastBackoffReason: `${input.code}: ${input.message}`.slice(0, 200) });
      if (job.taskId) await db.articleTask.update({ where: { id: job.taskId }, data: { status: 'LOGIN_REQUIRED', message: `ChatGPT ${input.code === 'LOGIN' ? 'sign-in' : 'human verification'} required in the Automation Chrome window.` } });
      return { ok: true };
    case 'CONVERSATION_LOST':
      await releaseJob(job.id, who, new Date(), { refundAttempt: true, payload: { ...p, conversationUrl: null, newChat: true, reconcile: false } }, db);
      if (job.taskId) await db.articleTask.update({ where: { id: job.taskId }, data: { conversationUrl: null } });
      return { ok: true };
    case 'CANCELLED':
      await db.queueJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', completedAt: new Date(), leaseExpiresAt: null } });
      return { ok: true };
    default: {
      if (sent) await db.queueJob.update({ where: { id: job.id }, data: { payload: JSON.stringify({ ...p, reconcile: true }) } });
      const r = await failJob(job.id, who, `ERROR: ${input.message}`, { retryBaseSec: 15, retryMaxSec: 300 }, db);
      if (job.taskId) await wakeJobs({ taskId: job.taskId, queue: 'article' }, db);
      return { ok: true, result: r };
    }
  }
}
