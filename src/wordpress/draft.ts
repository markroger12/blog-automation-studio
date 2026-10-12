import type { ArticleTask } from '@prisma/client';
import { parseJson } from '@/lib/db';
import { log } from '@/lib/logger';
import { LoginRequired, type PipelineContext } from '@/worker/pipeline/types';
import { assertMutationAllowed } from './publish-guard';
import { wpRest } from './rest';
import { detectLoginState, dismissOverlays, gotoBounded, openWordPressContext } from './session';

export interface DraftResult {
  postId: number;
  editUrl: string;
  reopened: boolean;
  status: string;
  rankMathSaved: boolean;
}

interface WpPost {
  id: number;
  status: string;
  link?: string;
  meta?: Record<string, unknown>;
  title?: { raw?: string };
}

type T = Partial<ArticleTask>;

/**
 * Creates (or reconciles and reopens) a DRAFT post through the authenticated admin session.
 * Never creates a second post when an earlier acknowledgement was lost: reconciles by stored
 * post ID first, then by the idempotency marker stored in post meta / slug search.
 */
export async function createOrReopenDraft(ctx: PipelineContext): Promise<DraftResult> {
  const task = await ctx.reload();
  const site = ctx.website!;
  const timeout = ctx.settings.browser.navigationTimeoutSec * 1000;
  const context = await openWordPressContext({
    slug: site.slug,
    headless: ctx.settings.browser.mode === 'headless',
    canPublish: false,
    schedulerFlow: false,
    navigationTimeoutMs: timeout,
    onBlocked: (e) => void log({ level: 'error', category: 'publish-guard', message: e.message, taskId: task.id }),
  });
  const page = await context.newPage();
  try {
    const adminUrl = site.adminUrl.replace(/\/$/, '');
    const state = await detectLoginState(page, `${adminUrl}/`, timeout);
    if (state !== 'ACTIVE') {
      await ctx.db.browserProfile.updateMany({ where: { id: site.profileId ?? '' }, data: { sessionState: 'LOGIN_REQUIRED', lastCheckedAt: new Date() } });
      throw new LoginRequired('WORDPRESS', `Log in to ${site.name} via Websites → Login, then resume.`);
    }
    await dismissOverlays(page, ctx.settings.advanced.selectorOverrides);
    const guard = { canPublish: false, schedulerFlow: false };
    const marker = `bas:${task.idempotencyKey}`;
    const tags = parseJson<string[]>(task.tags, []);
    let post: WpPost | null = null;
    let reopened = false;

    if (task.wpPostId) {
      const r = await wpRest<WpPost>(page, `wp/v2/posts/${task.wpPostId}?context=edit`);
      if (r.status === 200) {
        post = r.data;
        reopened = true;
      }
    }
    if (!post) {
      const r = await wpRest<WpPost[]>(page, `wp/v2/posts?context=edit&status=draft,pending,future,publish,private&per_page=20&search=${encodeURIComponent(task.slug ?? task.primaryKeyword)}`);
      if (r.status === 200 && Array.isArray(r.data)) {
        const match = r.data.find((p) => (p.meta && p.meta['_bas_idempotency'] === marker));
        if (match) {
          post = match;
          reopened = true;
          await ctx.log('warn', `Reconciled existing WordPress post #${match.id} by idempotency marker; no duplicate created.`);
        }
      }
    }
    if (post && post.status !== 'draft') {
      await ctx.addReviewReason(`WordPress: post #${post.id} is "${post.status}"; routine runs never modify scheduled/live posts.`);
      return { postId: post.id, editUrl: `${adminUrl}/post.php?post=${post.id}&action=edit`, reopened: true, status: post.status, rankMathSaved: false };
    }

    const tagIds = await ensureTags(page, tags);
    const category = task.categoryId ? await ctx.db.category.findUnique({ where: { id: task.categoryId } }) : null;
    const body = {
      title: task.selectedTitle ?? task.primaryKeyword,
      content: task.assembledHtml ?? '',
      status: 'draft',
      slug: task.slug ?? undefined,
      categories: category ? [category.externalId] : undefined,
      tags: tagIds.length ? tagIds : undefined,
      excerpt: task.metaDescription ?? undefined,
      meta: {
        rank_math_focus_keyword: task.focusKeyword ?? task.primaryKeyword,
        rank_math_title: task.seoTitle ?? undefined,
        rank_math_description: task.metaDescription ?? undefined,
      },
    };
    assertMutationAllowed(guard, { method: 'POST', url: '/wp-json/wp/v2/posts', body: JSON.stringify(body) });

    if (!post) {
      // Step 1: create a minimal draft immediately and persist the ID as soon as proven.
      const created = await wpRest<WpPost>(page, 'wp/v2/posts', { method: 'POST', body: { title: body.title, status: 'draft', content: '' } });
      if (created.status !== 201 || !created.data?.id) throw new Error(`WordPress draft creation failed (HTTP ${created.status}).`);
      post = created.data;
      await ctx.updateTask({ wpPostId: post.id, wpEditUrl: `${adminUrl}/post.php?post=${post.id}&action=edit` } as T);
    }
    // Step 2: fill content/metadata; the Rank Math meta keys are only writable if registered for REST.
    let saved = await wpRest<WpPost>(page, `wp/v2/posts/${post.id}`, { method: 'POST', body });
    let rankMathSaved = saved.status === 200;
    if (saved.status === 400) {
      const { meta: _meta, ...withoutMeta } = body;
      saved = await wpRest<WpPost>(page, `wp/v2/posts/${post.id}`, { method: 'POST', body: withoutMeta });
      rankMathSaved = false;
      await ctx.addReviewReason('Rank Math: focus keyword/title/description are not writable via REST on this site; set them in the editor.');
    }
    if (saved.status !== 200) throw new Error(`WordPress save failed (HTTP ${saved.status}).`);
    // Step 3: verify persisted state from a fresh read.
    const verify = await wpRest<WpPost>(page, `wp/v2/posts/${post.id}?context=edit`);
    if (verify.status !== 200 || verify.data.status !== 'draft') throw new Error(`Could not verify draft #${post.id} (status ${verify.data?.status ?? verify.status}).`);
    const editUrl = `${adminUrl}/post.php?post=${post.id}&action=edit`;
    await ctx.updateTask({ wpPostId: post.id, wpEditUrl: editUrl, wpDraftAt: new Date(), wpStatus: 'draft' } as T);
    await gotoBounded(page, editUrl, timeout).catch(() => undefined);
    return { postId: post.id, editUrl, reopened, status: 'draft', rankMathSaved };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function ensureTags(page: import('playwright').Page, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names.slice(0, 12)) {
    const found = await wpRest<{ id: number; name: string }[]>(page, `wp/v2/tags?search=${encodeURIComponent(name)}&per_page=20`);
    const exact = Array.isArray(found.data) ? found.data.find((t) => t.name.toLowerCase() === name.toLowerCase()) : undefined;
    if (exact) {
      ids.push(exact.id);
      continue;
    }
    const created = await wpRest<{ id: number }>(page, 'wp/v2/tags', { method: 'POST', body: { name } });
    if (created.status === 201) ids.push(created.data.id);
  }
  return ids;
}
