import type { ArticleTask } from '@prisma/client';
import { parseJson } from '@/lib/db';
import { assembleArticle } from '@/lib/content/assembly';
import { chooseInternalLink } from '@/lib/content/internal-links';
import { destinationMatchesAnchor, insertLinks, prefilterLink, type LinkDecision } from '@/lib/content/links';
import { parseLinkSuggestions, type Faq, type QuickBioRow } from '@/lib/content/parsers';
import { htmlToText } from '@/lib/content/sanitize';
import { analyzeSeo } from '@/lib/content/seo';
import { evaluateQuality } from '@/lib/content/quality';
import { safeFetch } from '@/lib/net/ssrf';
import { createOrReopenDraft } from '@/wordpress/draft';
import type { PipelineContext, PipelineStage } from '@/worker/pipeline/types';

type T = Partial<ArticleTask>;

export function externalLinksStage(dependsOn: string[]): PipelineStage {
  return {
    key: 'EXTERNAL_LINKS',
    label: 'External links',
    kind: 'chatgpt',
    runningStatus: 'OPTIMIZING',
    progress: 62,
    dependsOn,
    async run(ctx) {
      if (!ctx.settings.seo.externalLinks) return { outcome: 'skipped', reason: 'External links disabled in settings' };
      const body = ctx.task.bodyHtml ?? '';
      if (!body) return { outcome: 'skipped', reason: 'No article body available' };
      const { prompt, text } = await ctx.askChatGPT('EXTERNAL_LINKS', 'EXTERNAL_LINKS', { final_article: htmlToText(body) });
      const suggestions = parseLinkSuggestions(text);
      const decisions: LinkDecision[] = [];
      const verified: { anchor: string; url: string }[] = [];
      const seenAnchors = new Set<string>();
      for (const s of suggestions.slice(0, 7)) {
        const pre = prefilterLink(s, ctx.task.primaryKeyword);
        if (pre) {
          decisions.push({ ...s, accepted: false, reason: pre });
          continue;
        }
        if (seenAnchors.has(s.anchor.toLowerCase())) {
          decisions.push({ ...s, accepted: false, reason: 'Duplicate anchor' });
          continue;
        }
        try {
          const res = await safeFetch(s.url, { maxBytes: 1_500_000, timeoutMs: 12_000 });
          if (res.status >= 400) {
            decisions.push({ ...s, accepted: false, reason: `Destination returned HTTP ${res.status}` });
            continue;
          }
          const match = destinationMatchesAnchor(res.body.toString('utf8'), s.anchor);
          if (!match.ok) {
            decisions.push({ ...s, accepted: false, reason: `Destination title "${match.title}" does not match anchor` });
            continue;
          }
          seenAnchors.add(s.anchor.toLowerCase());
          verified.push({ anchor: s.anchor, url: res.finalUrl });
        } catch (e) {
          decisions.push({ ...s, accepted: false, reason: `Verification failed: ${(e as Error).message}` });
        }
      }
      const inserted = insertLinks(body, verified, ctx.settings.seo.maxExternalLinks);
      decisions.push(...inserted.decisions);
      if (!inserted.decisions.some((d) => d.accepted)) await ctx.log('warn', 'No external link passed verification; article kept without external links.');
      await ctx.updateTask({ bodyHtml: inserted.html } as T);
      return { outcome: 'completed', prompt, output: text, outputHtml: inserted.html, data: { decisions } };
    },
  };
}

export function imagesStage(dependsOn: string[]): PipelineStage {
  return {
    key: 'IMAGES',
    label: 'Images',
    kind: 'local',
    runningStatus: 'OPTIMIZING',
    progress: 66,
    dependsOn,
    async run(ctx) {
      if (!ctx.settings.seo.articleImages) return { outcome: 'skipped', reason: 'Article images disabled for this task' };
      await ctx.addReviewReason('Images: Image Studio (milestone M8) is not built yet — add a featured image manually in WordPress.');
      return { outcome: 'skipped', reason: 'Image Studio not yet implemented (M8). Article continues text-only.' };
    },
  };
}

export function humanizeStage(dependsOn: string[]): PipelineStage {
  return {
    key: 'HUMANIZE',
    label: 'Editorial humanizer',
    kind: 'chatgpt',
    runningStatus: 'OPTIMIZING',
    progress: 70,
    dependsOn,
    async run() {
      return { outcome: 'skipped', reason: 'Fact-locked humanizer is scheduled for milestone M9; original text kept unchanged.' };
    },
  };
}

export function assemblyStage(dependsOn: string[], opts: { celebrity: boolean }): PipelineStage {
  return {
    key: 'ASSEMBLY',
    label: 'Assembly',
    kind: 'local',
    runningStatus: 'OPTIMIZING',
    progress: 74,
    dependsOn,
    async run(ctx) {
      const task = await ctx.reload();
      if (!task.bodyHtml) throw new Error('Cannot assemble: article body is empty.');
      const faqs = parseJson<Faq[]>(task.faqs, []);
      const bio = opts.celebrity ? parseJson<QuickBioRow[]>(task.quickBio, []) : null;
      const fullName = bio?.find((r) => /^(full name|vollständiger name|name)$/i.test(r.attribute))?.details ?? null;
      let internalLink: { line: string; url: string; title: string } | null = null;
      if (task.websiteId) {
        const candidates = await ctx.db.internalLinkIndex.findMany({ where: { websiteId: task.websiteId, broken: false }, orderBy: { createdAt: 'desc' }, take: 300 });
        const pick = chooseInternalLink({ keyword: task.primaryKeyword, categoryName: task.categoryName, selfUrl: null, candidates });
        if (pick && ctx.website) {
          internalLink = { line: ctx.website.internalLinkLine, url: pick.candidate.url, title: pick.candidate.title };
          await ctx.db.suggestedInternalLink.deleteMany({ where: { taskId: task.id, placement: 'FOOTER_LINE' } });
          await ctx.db.suggestedInternalLink.create({ data: { taskId: task.id, targetUrl: pick.candidate.url, targetTitle: pick.candidate.title, anchor: pick.candidate.title, placement: 'FOOTER_LINE', score: pick.score, reason: pick.reason } });
        } else {
          await ctx.log('warn', 'No internal-link candidate found for this website (sync posts in Website Control).');
        }
      }
      const result = assembleArticle({
        bodyHtml: task.bodyHtml,
        language: task.language as 'English' | 'German',
        keyword: task.primaryKeyword,
        title: task.selectedTitle,
        quickBio: bio,
        quickBioName: fullName,
        faqs,
        internalLink,
      });
      await ctx.updateTask({ assembledHtml: result.html } as T);
      return { outcome: 'completed', outputHtml: result.html, data: { notes: result.notes } };
    },
  };
}

export function seoCheckStage(dependsOn: string[], opts: { celebrity: boolean }): PipelineStage {
  return {
    key: 'SEO_CHECK',
    label: 'SEO & quality check',
    kind: 'local',
    runningStatus: 'SEO_CHECKING',
    progress: 78,
    dependsOn,
    async run(ctx) {
      const task = await ctx.reload();
      const html = task.assembledHtml ?? '';
      const faqs = parseJson<Faq[]>(task.faqs, []);
      const bio = parseJson<QuickBioRow[]>(task.quickBio, []);
      const tags = parseJson<string[]>(task.tags, []);
      const report = analyzeSeo({
        html,
        keyword: task.focusKeyword ?? task.primaryKeyword,
        seoTitle: task.seoTitle,
        metaDescription: task.metaDescription,
        slug: task.slug,
        language: task.language as 'English' | 'German',
        isCelebrity: opts.celebrity,
        faqCount: faqs.length,
        expectedFaqs: opts.celebrity ? ctx.settings.content.faqCount : 7,
        quickBioRows: bio.length,
        minKeyword: ctx.settings.content.minKeywordOccurrences,
        maxKeyword: ctx.settings.content.maxKeywordOccurrences,
        densityCeiling: ctx.settings.content.keywordDensityCeiling,
        categoryName: task.categoryName,
        tags,
      });
      await ctx.db.sEOReport.create({ data: { taskId: task.id, source: 'INTERNAL', score: report.score, checks: JSON.stringify(report.checks), metrics: JSON.stringify(report.metrics) } });
      const quality = evaluateQuality({ seo: report, html, celebrity: opts.celebrity, threshold: ctx.settings.seo.reviewThreshold, expectedFaqs: opts.celebrity ? ctx.settings.content.faqCount : 7, faqCount: faqs.length, quickBioRows: bio.length });
      await ctx.db.articleQualityReport.create({ data: { taskId: task.id, passed: quality.passed, hardStops: JSON.stringify(quality.hardStops), warnings: JSON.stringify(quality.warnings), checks: JSON.stringify(report.checks) } });
      for (const r of quality.hardStops) await ctx.addReviewReason(`Quality: ${r}`);
      await ctx.updateTask({ seoScore: report.score } as T);
      return { outcome: 'completed', output: `SEO readiness ${report.score}/100`, data: { report, quality } };
    },
  };
}

export function titleApprovalGate(): PipelineStage {
  return {
    key: 'TITLE_APPROVAL',
    label: 'Title approval',
    kind: 'gate',
    runningStatus: 'AWAITING_TITLE_APPROVAL',
    progress: 12,
    dependsOn: ['TITLES'],
    async run(ctx) {
      const task = await ctx.reload();
      if (!ctx.settings.workflow.manualTitleApproval) {
        if (!task.selectedTitle) await ctx.updateTask({ selectedTitle: task.recommendedTitle } as T);
        return { outcome: 'completed', output: 'Auto-approved (manual title approval disabled)' };
      }
      if (task.titleApprovedAt && task.selectedTitle) return { outcome: 'completed', output: `Approved: ${task.selectedTitle}` };
      return { outcome: 'paused', status: 'AWAITING_TITLE_APPROVAL', message: 'Choose or edit a title, then approve.' };
    },
  };
}

export function articleApprovalGate(dependsOn: string[]): PipelineStage {
  return {
    key: 'ARTICLE_APPROVAL',
    label: 'Article approval',
    kind: 'gate',
    runningStatus: 'AWAITING_ARTICLE_APPROVAL',
    progress: 80,
    dependsOn,
    async run(ctx) {
      const task = await ctx.reload();
      if (!ctx.settings.workflow.manualArticleApproval) return { outcome: 'completed', output: 'Auto-approved (manual article approval disabled)' };
      if (task.articleApprovedAt) return { outcome: 'completed', output: 'Approved by owner' };
      return { outcome: 'paused', status: 'AWAITING_ARTICLE_APPROVAL', message: 'Review the article, then approve to create the WordPress draft.' };
    },
  };
}

export function wordpressDraftStage(dependsOn: string[]): PipelineStage {
  return {
    key: 'WORDPRESS_DRAFT',
    label: 'WordPress draft',
    kind: 'wordpress',
    runningStatus: 'CREATING_DRAFT',
    progress: 88,
    dependsOn,
    async run(ctx) {
      if (!ctx.settings.workflow.autoSendToWordPress) return { outcome: 'paused', status: 'NEEDS_REVIEW', message: 'Auto-send to WordPress is off. Use "Create draft" when ready.' };
      if (!ctx.website) return { outcome: 'paused', status: 'NEEDS_REVIEW', message: 'No website assigned. Assign a website to create the draft.' };
      const result = await createOrReopenDraft(ctx);
      return { outcome: 'completed', output: `Draft #${result.postId} ${result.reopened ? 'reopened' : 'created'}`, data: result };
    },
  };
}

export function rankMathStage(dependsOn: string[]): PipelineStage {
  return {
    key: 'RANKMATH',
    label: 'Rank Math',
    kind: 'wordpress',
    runningStatus: 'RUNNING_RANKMATH',
    progress: 95,
    dependsOn,
    async run(ctx) {
      const task = await ctx.reload();
      if (task.rankMathScore == null) {
        await ctx.log('info', 'Rank Math score was not readable from the editor; no score is shown (never invented).');
        return { outcome: 'completed', output: 'Rank Math fields saved; live score not available' };
      }
      if (task.rankMathScore < ctx.settings.seo.rankMathTargetScore) await ctx.addReviewReason(`Rank Math score ${task.rankMathScore} is below target ${ctx.settings.seo.rankMathTargetScore}.`);
      return { outcome: 'completed', output: `Rank Math score ${task.rankMathScore}` };
    },
  };
}

export async function finalizeTask(ctx: PipelineContext): Promise<void> {
  const task = await ctx.reload();
  const reasons = parseJson<string[]>(task.reviewReasons, []);
  const verified = !!task.wpPostId && !!task.wpEditUrl && !!task.wpDraftAt;
  if (!verified) {
    await ctx.updateTask({ status: 'NEEDS_REVIEW', percent: 100, message: 'Article ready locally; WordPress draft not verified.' } as T);
    return;
  }
  const hardReasons = reasons.filter((r) => r.startsWith('Quality:'));
  const status = hardReasons.length ? 'NEEDS_REVIEW' : 'DRAFT_CREATED';
  const now = new Date();
  await ctx.updateTask({
    status,
    percent: 100,
    stage: null,
    message: status === 'DRAFT_CREATED' ? 'Verified WordPress draft created.' : `Draft exists but needs review: ${hardReasons[0]}`,
    verifiedCompleteAt: status === 'DRAFT_CREATED' ? now : null,
  } as T);
  if (status === 'DRAFT_CREATED') {
    await ctx.db.productionMetric
      .create({ data: { taskId: task.id, websiteId: task.websiteId, moduleKey: task.moduleKey, kind: 'VERIFIED_DRAFT', dedupeKey: `verified:${task.id}:${task.wpPostId}` } })
      .catch(() => undefined);
  }
}
