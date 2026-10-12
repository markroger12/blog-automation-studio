import type { ArticleTask } from '@prisma/client';
import { markdownToHtml } from '@/lib/content/sanitize';
import { normalizeSlug, parseCategory, parseFaqs, parseGeneralArticle } from '@/lib/content/parsers';
import { dependentClosure, type PipelineDefinition, type PipelineStage } from '@/worker/pipeline/types';
import { articleApprovalGate, assemblyStage, externalLinksStage, finalizeTask, humanizeStage, imagesStage, rankMathStage, seoCheckStage, wordpressDraftStage } from '@/modules/shared/stages';
import { baseVariables } from '@/modules/shared/variables';

type T = Partial<ArticleTask>;

/** Splits "## Frequently Asked Questions" + ### questions out of the body into structured FAQs. */
export function extractFaqSection(markdown: string): { body: string; faqMarkdown: string | null } {
  const re = /\n##\s*(?:FAQs?|Frequently Asked Questions|Häufig gestellte Fragen)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i;
  const m = markdown.match(re);
  if (!m) return { body: markdown, faqMarkdown: null };
  return { body: markdown.replace(m[0], '\n'), faqMarkdown: `\n${m[1]}` };
}

const stages: PipelineStage[] = [
  {
    key: 'ARTICLE', label: 'Article', kind: 'chatgpt', runningStatus: 'WRITING_ARTICLE', progress: 40, dependsOn: [],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('ARTICLE', 'ARTICLE');
      const meta = parseGeneralArticle(text);
      if (!meta.body) throw new Error('General article response contained no body.');
      if (!meta.seoTitle || !meta.metaDescription || !meta.slug) await ctx.addReviewReason('Metadata: SEO TITLE / META DESCRIPTION / URL SLUG lines were incomplete.');
      const { body, faqMarkdown } = extractFaqSection(meta.body);
      const faqs = faqMarkdown ? parseFaqs(faqMarkdown) : [];
      const html = markdownToHtml(body);
      await ctx.updateTask({
        seoTitle: meta.seoTitle ?? ctx.task.primaryKeyword.slice(0, 60),
        selectedTitle: meta.seoTitle ?? ctx.task.primaryKeyword,
        metaDescription: meta.metaDescription,
        slug: meta.slug ?? normalizeSlug(ctx.task.primaryKeyword),
        focusKeyword: ctx.task.primaryKeyword,
        bodyHtml: html,
        faqs: JSON.stringify(faqs),
      } as T);
      return { outcome: 'completed', prompt, output: text, outputHtml: html, data: { ...meta, body: undefined, faqCount: faqs.length } };
    },
  },
  {
    key: 'CATEGORY', label: 'Category', kind: 'chatgpt', runningStatus: 'OPTIMIZING', progress: 50, dependsOn: ['ARTICLE'],
    async run(ctx) {
      if (!ctx.task.websiteId) return { outcome: 'skipped', reason: 'No website assigned' };
      if (ctx.task.categoryId) return { outcome: 'skipped', reason: `Category chosen by owner: ${ctx.task.categoryName}` };
      const cats = await ctx.db.category.findMany({ where: { websiteId: ctx.task.websiteId }, orderBy: { name: 'asc' } });
      if (!cats.length) {
        await ctx.addReviewReason('Category: no synchronized categories for this website — sync categories, then choose one.');
        return { outcome: 'skipped', reason: 'No synchronized categories' };
      }
      const { prompt, text } = await ctx.askChatGPT('CATEGORY', 'CATEGORY', { categories: cats.map((c) => `- ${c.name}`).join('\n') });
      const name = parseCategory(text, cats.map((c) => c.name));
      const chosen = cats.find((c) => c.name === name) ?? cats.find((c) => c.id === ctx.website?.defaultCategoryId) ?? null;
      if (!name) await ctx.addReviewReason(chosen ? `Category: invalid ChatGPT answer; used site default "${chosen.name}".` : 'Category: invalid ChatGPT answer and no site default — choose one.');
      if (chosen) await ctx.updateTask({ categoryId: chosen.id, categoryName: chosen.name } as T);
      return { outcome: 'completed', prompt, output: text, data: { category: chosen?.name ?? null } };
    },
  },
  externalLinksStage(['ARTICLE']),
  imagesStage(['ARTICLE']),
  humanizeStage(['EXTERNAL_LINKS', 'IMAGES']),
  assemblyStage(['HUMANIZE', 'CATEGORY'], { celebrity: false }),
  seoCheckStage(['ASSEMBLY'], { celebrity: false }),
  articleApprovalGate(['SEO_CHECK']),
  wordpressDraftStage(['ARTICLE_APPROVAL']),
  rankMathStage(['WORDPRESS_DRAFT']),
];

export const tigramPipeline: PipelineDefinition = {
  moduleKey: 'tigram',
  stages,
  regenerationPlan: (k) => dependentClosure(stages, k),
  variables: (ctx, extra) => ({ ...baseVariables(ctx), ...extra }),
  finalize: finalizeTask,
};
