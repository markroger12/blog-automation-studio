import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { chromeExecutable } from '../helpers/db';

const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/fake-chatgpt.html'), 'utf8');
const content = fs.readFileSync(path.join(__dirname, '../../extension/content.js'), 'utf8');
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, executablePath: chromeExecutable() });
}, 60_000);
afterAll(async () => browser?.close());

async function open(mode: string, preload?: [string, string][], url = 'https://chatgpt.com/'): Promise<Page> {
  const page = await browser.newPage();
  await page.route('https://chatgpt.com/**', (r) => r.fulfill({ contentType: 'text/html', body: fixture }));
  await page.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ body: '' }));
  await page.addInitScript(([m, p]) => { (window as never as Record<string, unknown>).__FAKE_MODE = m; (window as never as Record<string, unknown>).__PRELOAD = p; }, [mode, preload ?? null] as const);
  await page.goto(url);
  await page.addScriptTag({ content });
  return page;
}

type R = { ok: boolean; result?: { text: string; conversationUrl: string; recovered: boolean }; code?: string; message?: string; retryAfterSec?: number };
const run = (page: Page, job: Record<string, unknown>) =>
  page.evaluate(async (j) => {
    try {
      return { ok: true, result: await (window as never as { __basAgent: { runJob: (j: unknown) => Promise<never> } }).__basAgent.runJob(j) };
    } catch (e) {
      const err = e as { code?: string; message: string; retryAfterSec?: number };
      return { ok: false, code: err.code, message: err.message, retryAfterSec: err.retryAfterSec };
    }
  }, job) as Promise<R>;

const baseJob = { jobId: 'j1', prompt: 'Write about Jane Doe.', promptTail: 'Write about Jane Doe.', newChat: true, reconcile: false, timeoutMs: 15000 };

describe('extension content script against fake ChatGPT', () => {
  it('sends a prompt and returns markdown with conversation URL', async () => {
    const page = await open('normal');
    const r = await run(page, baseJob);
    expect(r.ok).toBe(true);
    expect(r.result!.text).toContain('## Early Life');
    expect(r.result!.text).toContain('**Spokane**');
    expect(r.result!.text).toContain('| Full Name | Jane Doe |');
    expect(r.result!.text).toContain('- One');
    expect(r.result!.conversationUrl).toMatch(/\/c\/fake-/);
    await page.close();
  }, 30_000);

  it('handles long prompts (50k chars) with verified insertion', async () => {
    const page = await open('normal');
    const prompt = `${'Lorem ipsum dolor sit amet. '.repeat(1800)}END-MARKER`;
    const r = await run(page, { ...baseJob, prompt, promptTail: prompt.slice(-160) });
    expect(r.ok).toBe(true);
    expect(r.result!.text).toContain(`Echo length ${prompt.length}`);
    await page.close();
  }, 30_000);

  it('reports LOGIN and HUMAN_CHECK without sending', async () => {
    for (const [mode, code] of [['login', 'LOGIN'], ['challenge', 'HUMAN_CHECK']]) {
      const page = await open(mode);
      const r = await run(page, baseJob);
      expect(r).toMatchObject({ ok: false, code });
      await page.close();
    }
  }, 30_000);

  it('detects usage limits with retry-after', async () => {
    const page = await open('limit');
    const r = await run(page, baseJob);
    expect(r).toMatchObject({ ok: false, code: 'USAGE_LIMIT', retryAfterSec: 120 });
    await page.close();
  }, 30_000);

  it('recovers an already-sent prompt without resending', async () => {
    const page = await open('normal', [['user', '<div>Write about Jane Doe.</div>'], ['assistant', '<div class="markdown"><p>Recovered answer text.</p></div>']], 'https://chatgpt.com/c/existing');
    const r = await run(page, { ...baseJob, newChat: false, reconcile: true });
    expect(r.ok).toBe(true);
    expect(r.result!.recovered).toBe(true);
    expect(r.result!.text).toBe('Recovered answer text.');
    expect(await page.evaluate(() => (window as never as { __sendCount: number }).__sendCount)).toBe(0);
    await page.close();
  }, 30_000);
});
