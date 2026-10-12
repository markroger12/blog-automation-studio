import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { wpRest } from './rest';
import { detectLoginState, dismissOverlays, firstVisible, gotoBounded, openWordPressContext, closeWordPressContext } from './session';
import { selectorsFor } from './selectors';

async function site(websiteId: string) {
  return prisma.website.findUniqueOrThrow({ where: { id: websiteId } });
}

async function record(websiteId: string, check: string, ok: boolean, message: string) {
  await prisma.siteHealthObservation.create({ data: { websiteId, check, ok, message } });
}

export async function checkSession(websiteId: string) {
  const w = await site(websiteId);
  const settings = await getSettings();
  const ctx = await openWordPressContext({ slug: w.slug, headless: true, canPublish: false, navigationTimeoutMs: settings.browser.navigationTimeoutSec * 1000 });
  const page = await ctx.newPage();
  try {
    const state = await detectLoginState(page, w.adminUrl, settings.browser.navigationTimeoutSec * 1000);
    let editor: string | null = null;
    if (state === 'ACTIVE') {
      await gotoBounded(page, `${w.adminUrl.replace(/\/$/, '')}/post-new.php`, settings.browser.navigationTimeoutSec * 1000);
      await dismissOverlays(page);
      if (await firstVisible(page, selectorsFor('gutenbergRoot'), 15000)) editor = 'GUTENBERG';
      else if (await firstVisible(page, selectorsFor('classicEditor'), 3000)) editor = 'CLASSIC';
    }
    if (w.profileId) await prisma.browserProfile.update({ where: { id: w.profileId }, data: { sessionState: state, lastCheckedAt: new Date() } });
    await prisma.website.update({ where: { id: w.id }, data: { detectedEditor: editor } });
    await record(w.id, 'SESSION', state === 'ACTIVE', state === 'ACTIVE' ? `Logged in; editor ${editor ?? 'unknown'}` : 'Login required');
    return { state, editor };
  } finally {
    await page.close().catch(() => undefined);
    await closeWordPressContext(w.slug);
  }
}

/** Opens a visible window on the site's login page. The owner signs in manually; nothing is typed or stored. */
export async function openLoginWindow(websiteId: string) {
  const w = await site(websiteId);
  await closeWordPressContext(w.slug);
  const ctx = await openWordPressContext({ slug: w.slug, headless: false, canPublish: false });
  const page = await ctx.newPage();
  await gotoBounded(page, w.adminUrl, 60_000);
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (await firstVisible(page, selectorsFor('adminBar'), 2000)) {
      if (w.profileId) await prisma.browserProfile.update({ where: { id: w.profileId }, data: { sessionState: 'ACTIVE', lastLoginAt: new Date(), lastCheckedAt: new Date() } });
      await record(w.id, 'SESSION', true, 'Manual login completed');
      await closeWordPressContext(w.slug);
      return { state: 'ACTIVE' };
    }
    if (page.isClosed()) break;
  }
  await closeWordPressContext(w.slug);
  return { state: 'LOGIN_REQUIRED' };
}

export async function syncCategories(websiteId: string) {
  const w = await site(websiteId);
  const settings = await getSettings();
  const ctx = await openWordPressContext({ slug: w.slug, headless: true, canPublish: false });
  const page = await ctx.newPage();
  try {
    const state = await detectLoginState(page, w.adminUrl, settings.browser.navigationTimeoutSec * 1000);
    if (state !== 'ACTIVE') throw new Error('Login required — use Login first.');
    const all: { id: number; name: string; slug: string; parent: number }[] = [];
    for (let p = 1; p <= 20; p++) {
      const r = await wpRest<{ id: number; name: string; slug: string; parent: number }[]>(page, `wp/v2/categories?per_page=100&page=${p}&context=edit`);
      if (r.status !== 200 || !Array.isArray(r.data) || !r.data.length) break;
      all.push(...r.data);
      if (r.data.length < 100) break;
    }
    for (const c of all) {
      const name = c.name.replace(/&amp;/g, '&');
      await prisma.category.upsert({
        where: { websiteId_externalId: { websiteId: w.id, externalId: c.id } },
        create: { websiteId: w.id, externalId: c.id, name, slug: c.slug, parentExternalId: c.parent || null },
        update: { name, slug: c.slug, parentExternalId: c.parent || null, syncedAt: new Date() },
      });
    }
    // Index published posts for internal linking.
    const posts = await wpRest<{ id: number; link: string; title: { rendered: string }; slug: string; modified_gmt: string }[]>(page, 'wp/v2/posts?per_page=100&status=publish&_fields=id,link,title,slug,modified_gmt');
    if (posts.status === 200 && Array.isArray(posts.data)) {
      for (const p of posts.data) {
        await prisma.internalLinkIndex.upsert({
          where: { websiteId_url: { websiteId: w.id, url: p.link } },
          create: { websiteId: w.id, wpPostId: p.id, url: p.link, title: p.title.rendered.replace(/<[^>]+>/g, ''), slug: p.slug, updatedRemoteAt: new Date(`${p.modified_gmt}Z`) },
          update: { title: p.title.rendered.replace(/<[^>]+>/g, ''), slug: p.slug, updatedRemoteAt: new Date(`${p.modified_gmt}Z`), broken: false },
        });
      }
    }
    await record(w.id, 'CATEGORIES', true, `Synced ${all.length} categories`);
    return { categories: all.length, posts: Array.isArray(posts.data) ? posts.data.length : 0 };
  } finally {
    await page.close().catch(() => undefined);
    await closeWordPressContext(w.slug);
  }
}
