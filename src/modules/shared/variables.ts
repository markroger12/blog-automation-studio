import { parseJson } from '@/lib/db';
import type { PipelineContext } from '@/worker/pipeline/types';

export function baseVariables(ctx: PipelineContext): Record<string, unknown> {
  const t = ctx.task;
  const c = ctx.settings.content;
  const secondary = parseJson<string[]>(t.secondaryKeywords, []);
  const low = Math.max(4, c.quickBioRows - 1);
  return {
    keyword: t.primaryKeyword,
    example_title: t.exampleTitle ?? '',
    selected_title: t.selectedTitle ?? t.recommendedTitle ?? t.primaryKeyword,
    secondary_keywords: secondary.join(', '),
    country: t.targetCountry,
    language: t.language,
    min_keyword_occurrences: c.minKeywordOccurrences,
    max_keyword_occurrences: c.maxKeywordOccurrences,
    max_words: t.moduleKey === 'celebrity-v2' ? Math.max(c.maxArticleWordCount, 2000) : c.maxArticleWordCount,
    faq_count: c.faqCount,
    bio_rows_range: `${low}–${c.quickBioRows + 1}`,
    link_count: Math.min(7, Math.max(5, ctx.settings.seo.maxExternalLinks)),
    wikipedia_site: t.language === 'German' ? 'de.wikipedia.org' : 'en.wikipedia.org',
    word_range: c.generalWordRange,
  };
}

/** Source-faithful primer used only when the saved conversation is unrecoverable. */
export async function contextPrimerFromStages(ctx: PipelineContext, stageKey: string, sources: string[]): Promise<string | null> {
  const parts: string[] = [];
  for (const key of sources) {
    if (key === stageKey) break;
    const out = await ctx.getStageOutput(key);
    if (out?.output) parts.push(`### ${key}\n${out.output.slice(0, 12000)}`);
  }
  if (!parts.length) return null;
  await ctx.log('info', `Starting a new ChatGPT conversation with a context primer from: ${sources.join(', ')}`);
  return `Context from earlier work on this article (use it as the established research; do not contradict it):\n\n${parts.join('\n\n')}`;
}
