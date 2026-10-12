import type { ArticleTask } from '@prisma/client';
import { markdownToHtml } from '@/lib/content/sanitize';
import { normalizeSlug } from '@/lib/content/parsers';
import { parseWriter2 } from '@/lib/content/writer2';
import { dependentClosure, type PipelineDefinition, type PipelineStage } from '@/worker/pipeline/types';
import { articleApprovalGate, assemblyStage, externalLinksStage, finalizeTask, humanizeStage, imagesStage, rankMathStage, seoCheckStage, wordpressDraftStage } from '@/modules/shared/stages';
import { baseVariables } from '@/modules/shared/variables';

type T = Partial<ArticleTask>;

const stages: PipelineStage[] = [
  {
    key: 'ARTICLE', label: 'Article (single response)', kind: 'chatgpt', runningStatus: 'WRITING_ARTICLE', progress: 40, dependsOn: [],
    async run(ctx) {
      const { prompt, text } = await ctx.askChatGPT('ARTICLE', 'ARTICLE');
      const parsed = parseWriter2(text);
      if (!parsed.article.trim()) throw new Error('Writer 2.0 response contained no article body.');
      let body = parsed.article;
      if (parsed.finalThoughts) body += `\n\n## ${ctx.task.language === 'German' ? 'Fazit' : 'Conclusion'}\n\n${parsed.finalThoughts}`;
      const html = markdownToHtml(body);
      for (const issue of parsed.issues) await ctx.log('warn', `Writer 2.0 parse: ${issue}`);
      if (parsed.faqs.length !== ctx.settings.content.faqCount) await ctx.addReviewReason(`FAQs: expected ${ctx.settings.content.faqCount}, received ${parsed.faqs.length}.`);
      await ctx.updateTask({
        selectedTitle: parsed.title ?? ctx.task.primaryKeyword,
        recommendedTitle: parsed.title,
        bodyHtml: html,
        faqs: JSON.stringify(parsed.faqs),
        quickBio: JSON.stringify(parsed.quickBio),
        metaDescription: parsed.metaDescription,
        slug: parsed.slug ?? normalizeSlug(ctx.task.primaryKeyword),
        seoTitle: (parsed.title ?? ctx.task.primaryKeyword).slice(0, 60),
        focusKeyword: ctx.task.primaryKeyword,
        tags: JSON.stringify(parsed.tags.slice(0, 12)),
        researchSnapshot: parsed.researchNotes,
      } as T);
      // Research notes are private stage state only — never published.
      return { outcome: 'completed', prompt, output: text, outputHtml: html, data: { ...parsed, researchNotes: parsed.researchNotes ? '[stored privately]' : null } };
    },
  },
  externalLinksStage(['ARTICLE']),
  imagesStage(['ARTICLE']),
  humanizeStage(['EXTERNAL_LINKS', 'IMAGES']),
  assemblyStage(['HUMANIZE'], { celebrity: true }),
  seoCheckStage(['ASSEMBLY'], { celebrity: true }),
  articleApprovalGate(['SEO_CHECK']),
  wordpressDraftStage(['ARTICLE_APPROVAL']),
  rankMathStage(['WORDPRESS_DRAFT']),
];

export const celebrityV2Pipeline: PipelineDefinition = {
  moduleKey: 'celebrity-v2',
  stages,
  regenerationPlan: (k) => dependentClosure(stages, k),
  variables: (ctx, extra) => ({ ...baseVariables(ctx), ...extra }),
  finalize: finalizeTask,
};
