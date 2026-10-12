import * as cheerio from 'cheerio';
import { countWords, htmlToText } from './sanitize';

export interface SeoCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  severity: 'hard' | 'warn' | 'info';
  detail: string;
  fix?: string;
}

export interface SeoInput {
  html: string;
  keyword: string;
  seoTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  language: 'English' | 'German';
  isCelebrity: boolean;
  faqCount: number;
  expectedFaqs: number;
  quickBioRows: number;
  minKeyword: number;
  maxKeyword: number;
  densityCeiling: number;
  categoryName: string | null;
  tags: string[];
}

export interface SeoReportResult {
  score: number;
  checks: SeoCheck[];
  metrics: {
    words: number;
    keywordExact: number;
    keywordNormalized: number;
    density: number;
    h2: number;
    h3: number;
    paragraphs: number;
    shortParagraphs: number;
    longParagraphs: number;
    sectionWords: { heading: string; words: number }[];
    links: number;
    images: number;
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeForMatch(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function countKeyword(text: string, keyword: string): { exact: number; normalized: number } {
  if (!keyword.trim()) return { exact: 0, normalized: 0 };
  const exact = (text.match(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(keyword)}(?![\\p{L}\\p{N}])`, 'giu')) ?? []).length;
  const nText = ` ${normalizeForMatch(text)} `;
  const nKw = normalizeForMatch(keyword);
  const normalized = nKw ? nText.split(` ${nKw} `).length - 1 : 0;
  return { exact, normalized: Math.max(normalized, exact) };
}

export function analyzeSeo(input: SeoInput): SeoReportResult {
  const $ = cheerio.load(input.html);
  const text = htmlToText(input.html);
  const words = countWords(text);
  const kw = countKeyword(text, input.keyword);
  const kwWords = Math.max(1, countWords(input.keyword));
  const density = words ? (kw.normalized * kwWords * 100) / words : 0;
  const h2 = $('h2').length;
  const h3 = $('h3').length;
  const paragraphs = $('p').toArray().map((p) => countWords($(p).text()));
  const shortParagraphs = paragraphs.filter((w) => w > 0 && w < 15).length;
  const longParagraphs = paragraphs.filter((w) => w > 150).length;
  const firstP = $('p').first().text();
  const lastH2 = $('h2').last();
  const conclusionText = lastH2.nextAll('p').text();
  const headingsText = $('h2,h3').toArray().map((h) => $(h).text()).join(' | ');
  const kwNorm = normalizeForMatch(input.keyword);
  const has = (s: string | null | undefined) => !!s && normalizeForMatch(s).includes(kwNorm);
  const emptyHeadings = $('h2,h3').toArray().filter((h) => !$(h).text().trim()).length;
  const sectionWords: { heading: string; words: number }[] = [];
  $('h2').each((_i, h) => {
    const heading = $(h).text().trim();
    const w = countWords($(h).nextUntil('h2').text());
    sectionWords.push({ heading, words: w });
  });
  const metaMax = input.language === 'German' ? 156 : 160;
  const checks: SeoCheck[] = [];
  const add = (c: SeoCheck) => checks.push(c);

  add({ id: 'kw-title', label: 'Keyword in SEO title', passed: has(input.seoTitle), weight: 10, severity: 'warn', detail: input.seoTitle ?? 'No SEO title', fix: 'Use the focus keyword naturally in the SEO title.' });
  add({ id: 'title-length', label: 'SEO title under 60 characters', passed: !!input.seoTitle && input.seoTitle.length <= 60, weight: 6, severity: 'warn', detail: `${input.seoTitle?.length ?? 0} characters`, fix: 'Shorten the SEO title.' });
  const md = input.metaDescription?.length ?? 0;
  add({ id: 'meta-length', label: `Meta description 100–${metaMax} characters`, passed: md >= 100 && md <= metaMax, weight: 8, severity: 'warn', detail: `${md} characters`, fix: 'Rewrite the meta description to the recommended length.' });
  add({ id: 'kw-meta', label: 'Keyword in meta description', passed: has(input.metaDescription), weight: 5, severity: 'warn', detail: input.metaDescription ?? 'No meta description' });
  add({ id: 'kw-slug', label: 'Keyword in URL slug', passed: !!input.slug && normalizeForMatch(input.slug.replace(/-/g, ' ')).includes(kwNorm), weight: 6, severity: 'warn', detail: input.slug ?? 'No slug' });
  add({ id: 'kw-intro', label: 'Keyword in introduction', passed: has(firstP), weight: 10, severity: 'warn', detail: firstP.slice(0, 120), fix: 'Mention the keyword naturally in the first paragraph.' });
  add({ id: 'kw-heading', label: 'Keyword in an H2/H3', passed: has(headingsText), weight: 6, severity: 'warn', detail: headingsText.slice(0, 200) });
  add({ id: 'kw-conclusion', label: 'Keyword in conclusion', passed: has(conclusionText), weight: 4, severity: 'info', detail: conclusionText.slice(0, 120) });
  add({
    id: 'kw-count',
    label: `Keyword occurrences (advisory ${input.minKeyword}–${input.maxKeyword})`,
    passed: kw.normalized >= Math.min(input.minKeyword, Math.ceil(words / 150)) && kw.normalized <= input.maxKeyword + 4,
    weight: 6,
    severity: 'info',
    detail: `${kw.exact} exact / ${kw.normalized} normalized`,
    fix: 'Advisory only — never insert unrelated mentions to reach a number.',
  });
  add({ id: 'density', label: `Keyword density ≤ ${input.densityCeiling}%`, passed: density <= input.densityCeiling, weight: 8, severity: 'warn', detail: `${density.toFixed(2)}%`, fix: 'Reduce repetitions; possible keyword stuffing.' });
  add({ id: 'structure', label: 'At least 3 H2 sections', passed: h2 >= 3, weight: 8, severity: 'hard', detail: `${h2} H2 / ${h3} H3` });
  add({ id: 'empty-headings', label: 'No empty headings', passed: emptyHeadings === 0, weight: 3, severity: 'warn', detail: `${emptyHeadings} empty` });
  add({ id: 'paragraphs', label: 'Paragraph length balanced', passed: longParagraphs === 0 && shortParagraphs <= Math.max(2, paragraphs.length / 5), weight: 4, severity: 'info', detail: `${shortParagraphs} short / ${longParagraphs} long of ${paragraphs.length}` });
  add({ id: 'length', label: 'Article length ≥ 600 words', passed: words >= 600, weight: 6, severity: 'warn', detail: `${words} words` });
  add({ id: 'faqs', label: `FAQ count = ${input.expectedFaqs}`, passed: input.faqCount === input.expectedFaqs, weight: 6, severity: input.isCelebrity ? 'hard' : 'warn', detail: `${input.faqCount} FAQs` });
  if (input.isCelebrity) {
    add({ id: 'quick-bio', label: 'Quick Bio has 8+ rows', passed: input.quickBioRows >= 8, weight: 6, severity: 'hard', detail: `${input.quickBioRows} rows` });
  }
  add({ id: 'category', label: 'Category assigned', passed: !!input.categoryName, weight: 2, severity: 'warn', detail: input.categoryName ?? 'None' });
  add({ id: 'tags', label: 'Tags present', passed: input.tags.length > 0, weight: 1, severity: 'info', detail: `${input.tags.length} tags` });

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + (c.passed ? c.weight : 0), 0);
  return {
    score: Math.round((got / total) * 100),
    checks,
    metrics: {
      words,
      keywordExact: kw.exact,
      keywordNormalized: kw.normalized,
      density: Number(density.toFixed(3)),
      h2,
      h3,
      paragraphs: paragraphs.length,
      shortParagraphs,
      longParagraphs,
      sectionWords,
      links: $('a').length,
      images: $('img').length,
    },
  };
}
