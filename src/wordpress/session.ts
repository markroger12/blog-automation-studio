import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { browserLaunchTarget } from '@/lib/browser';
import { ensureDir, profileDirForSlug } from '@/lib/paths';
import { assertMutationAllowed, isPostMutationUrl, PublishBlockedError } from './publish-guard';
import { selectorsFor } from './selectors';

export interface OpenOptions {
  slug: string;
  headless: boolean;
  channel?: 'chrome' | 'msedge' | 'chromium';
  canPublish: boolean;
  schedulerFlow?: boolean;
  navigationTimeoutMs?: number;
  onBlocked?: (e: PublishBlockedError) => void;
}

const open = new Map<string, Promise<BrowserContext>>();

/** One persistent context per website profile; never two concurrent contexts on one profile dir. */
export async function openWordPressContext(opts: OpenOptions): Promise<BrowserContext> {
  const dir = ensureDir(profileDirForSlug(opts.slug));
  const existing = open.get(dir);
  if (existing) return existing;
  const { label: _label, ...target } = browserLaunchTarget(opts.channel);
  const p = chromium
    .launchPersistentContext(dir, {
      headless: opts.headless,
      ...target,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    })
    .then(async (ctx) => {
      ctx.setDefaultNavigationTimeout(opts.navigationTimeoutMs ?? 60_000);
      await installPublishGuard(ctx, { canPublish: opts.canPublish, schedulerFlow: !!opts.schedulerFlow }, opts.onBlocked);
      ctx.on('close', () => open.delete(dir));
      return ctx;
    });
  open.set(dir, p);
  p.catch(() => open.delete(dir));
  return p;
}

export async function closeWordPressContext(slug: string): Promise<void> {
  const dir = profileDirForSlug(slug);
  const p = open.get(dir);
  open.delete(dir);
  if (p) await (await p).close().catch(() => undefined);
}

/** Network-level guard: aborts any editor request that would publish/schedule without authorization. */
export async function installPublishGuard(ctx: BrowserContext, guard: { canPublish: boolean; schedulerFlow: boolean }, onBlocked?: (e: PublishBlockedError) => void) {
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' && isPostMutationUrl(req.url())) {
      try {
        assertMutationAllowed(guard, { method: req.method(), url: req.url(), body: req.postData() });
      } catch (e) {
        if (e instanceof PublishBlockedError) {
          onBlocked?.(e);
          return route.abort('blockedbyclient');
        }
        throw e;
      }
    }
    return route.continue();
  });
}

export function profileExists(slug: string): boolean {
  return fs.existsSync(profileDirForSlug(slug));
}

export async function firstVisible(page: Page, selectors: readonly string[], timeoutMs = 3000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const s of selectors) {
      if (await page.locator(s).first().isVisible().catch(() => false)) return s;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

/** Hide only known host overlays — never <html> or <body>. */
export async function dismissOverlays(page: Page, overrides: Record<string, string[]> = {}) {
  const sels = selectorsFor('hostOverlays', overrides);
  await page.evaluate((list) => {
    for (const s of list) document.querySelectorAll<HTMLElement>(s).forEach((el) => {
      if (el !== document.documentElement && el !== document.body) el.style.setProperty('display', 'none', 'important');
    });
  }, sels).catch(() => undefined);
  for (const s of selectorsFor('welcomeGuideClose', overrides)) {
    const b = page.locator(s).first();
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => undefined);
  }
}

export async function gotoBounded(page: Page, url: string, timeoutMs: number) {
  await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs });
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => undefined);
}

export async function detectLoginState(page: Page, adminUrl: string, timeoutMs: number): Promise<'ACTIVE' | 'LOGIN_REQUIRED'> {
  await gotoBounded(page, adminUrl, timeoutMs);
  if (/wp-login\.php/.test(page.url())) return 'LOGIN_REQUIRED';
  const login = await firstVisible(page, selectorsFor('loginForm'), 1500);
  if (login) return 'LOGIN_REQUIRED';
  const admin = await firstVisible(page, selectorsFor('adminBar'), 8000);
  return admin ? 'ACTIVE' : 'LOGIN_REQUIRED';
}
