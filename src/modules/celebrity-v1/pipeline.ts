import type { ArticleTask } from '@prisma/client';
import { parseJson } from '@/lib/db';
import { markdownToHtml } from '@/lib/content/sanitize';
import { parseFaqs, parseQuickBio, parseTitles, normalizeSlug } from '@/lib/content/parsers';
import { dependentClosure, type PipelineDefinition, type PipelineStage } from '@/worker/pipeline/types';
import {
  articleApprovalGate, assemblyStage, externalLinksStage, finalizeTask, humanizeStage, imagesStage, rankMathStage, seoCheckStage, titleApprovalGate, wordpressDraftStage,
} from '@/modules/shared/stages';
import { baseVariables, contextPrimerFromStages } from '@/modules/shared/variables';

type T = Partial<ArticleTask>;

const stages: PipelineStage[] = [
  {
    key: 'TITLES', label: 'Titles', kind: 'chatgpt', runningStatus: 'GENERATING_TITLES', progress: 8, dependsOn: [],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('TITLES', 'TITLES');
      const parsed = parseTitles(text);
      if (!parsed.recommended) throw new Error('No title options could be parsed from the TITLES response.');
      await ctx.updateTask({ titleOptions: JSON.stringify(parsed.options), recommendedTitle: parsed.recommended } as T);
      return { outcome: 'completed', prompt, output: text, data: parsed };
    },
  },
  titleApprovalGate(),
  {
    key: 'RESEARCH', label: 'Research', kind: 'chatgpt', runningStatus: 'RESEARCHING', progress: 22, dependsOn: ['TITLE_APPROVAL'],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('RESEARCH', 'RESEARCH');
      if (text.trim().length < 200) throw new Error('Research response was unexpectedly short.');
      await ctx.updateTask({ researchSnapshot: text } as T);
      return { outcome: 'completed', prompt, output: text };
    },
  },
  {
    key: 'LONG_ARTICLE', label: 'Long article', kind: 'chatgpt', runningStatus: 'WRITING_ARTICLE', progress: 34, dependsOn: ['RESEARCH'],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('LONG_ARTICLE', 'LONG_ARTICLE');
      return { outcome: 'completed', prompt, output: text, outputHtml: markdownToHtml(text) };
    },
  },
  {
    key: 'FINAL_ARTICLE', label: 'Final article', kind: 'chatgpt', runningStatus: 'OPTIMIZING', progress: 44, dependsOn: ['LONG_ARTICLE'],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('FINAL_ARTICLE', 'FINAL_ARTICLE');
      const html = markdownToHtml(text);
      const task = ctx.task;
      await ctx.updateTask({
        bodyHtml: html,
        seoTitle: task.seoTitle ?? (task.selectedTitle ?? '').slice(0, 60),
        slug: task.slug ?? normalizeSlug(task.primaryKeyword),
        focusKeyword: task.focusKeyword ?? task.primaryKeyword,
      } as T);
      return { outcome: 'completed', prompt, output: text, outputHtml: html };
    },
  },
  {
    key: 'FAQS', label: 'FAQs', kind: 'chatgpt', runningStatus: 'GENERATING_FAQS', progress: 50, dependsOn: ['FINAL_ARTICLE'],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('FAQS', 'FAQS');
      const faqs = parseFaqs(text);
      if (!faqs.length) throw new Error('No QUESTION/ANSWER pairs could be parsed.');
      if (faqs.length !== ctx.settings.content.faqCount) await ctx.addReviewReason(`FAQs: expected ${ctx.settings.content.faqCount}, received ${faqs.length}.`);
      const first = faqs[0];
      const meta = ctx.task.metaDescription ?? null;
      await ctx.updateTask({ faqs: JSON.stringify(faqs.slice(0, ctx.settings.content.faqCount)), metaDescription: meta ?? deriveMeta(ctx.task.bodyHtml ?? '', first?.answer) } as T);
      return { outcome: 'completed', prompt, output: text, data: faqs };
    },
  },
  {
    key: 'QUICK_BIO', label: 'Quick Bio', kind: 'chatgpt', runningStatus: 'GENERATING_BIO_TABLE', progress: 56, dependsOn: ['RESEARCH'],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('QUICK_BIO', 'QUICK_BIO');
      const { rows, issues } = parseQuickBio(text);
      if (!rows.length) throw new Error(`Quick Bio could not be parsed: ${issues.join('; ')}`);
      for (const i of issues) await ctx.log('warn', `Quick Bio: ${i}`);
      await ctx.updateTask({ quickBio: JSON.stringify(rows) } as T);
      return { outcome: 'completed', prompt, output: text, data: { rows, issues } };
    },
  },
  externalLinksStage(['FINAL_ARTICLE']),
  imagesStage(['FINAL_ARTICLE']),
  humanizeStage(['EXTERNAL_LINKS', 'IMAGES']),
  assemblyStage(['HUMANIZE', 'FAQS', 'QUICK_BIO'], { celebrity: true }),
  seoCheckStage(['ASSEMBLY'], { celebrity: true }),
  articleApprovalGate(['SEO_CHECK']),
  wordpressDraftStage(['ARTICLE_APPROVAL']),
  rankMathStage(['WORDPRESS_DRAFT']),
];

function deriveMeta(html: string, fallback?: string): string {
  const firstP = (html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? fallback ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (firstP.length <= 155) return firstP;
  const cut = firstP.slice(0, 152);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export const celebrityV1Pipeline: PipelineDefinition = {
  moduleKey: 'celebrity-v1',
  stages,
  regenerationPlan: (stageKey) => dependentClosure(stages, stageKey),
  variables: (ctx, extra) => ({ ...baseVariables(ctx), ...extra }),
  contextPrimer: (ctx, stageKey) => contextPrimerFromStages(ctx, stageKey, ['RESEARCH', 'FINAL_ARTICLE']),
  finalize: finalizeTask,
};

export { parseJson };
