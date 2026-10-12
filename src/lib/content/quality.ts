import * as cheerio from 'cheerio';
import type { SeoReportResult } from './seo';

export interface QualityInput {
  seo: SeoReportResult;
  html: string;
  celebrity: boolean;
  threshold: number;
  expectedFaqs: number;
  faqCount: number;
  quickBioRows: number;
}

export interface QualityResult {
  passed: boolean;
  hardStops: string[];
  warnings: string[];
}

/** Hard stops block COMPLETE (task stays NEEDS_REVIEW even with a draft); warnings are informational. */
export function evaluateQuality(input: QualityInput): QualityResult {
  const hardStops: string[] = [];
  const warnings: string[] = [];
  const $ = cheerio.load(input.html);
  if (input.seo.score < input.threshold) hardStops.push(`SEO readiness ${input.seo.score} is below review threshold ${input.threshold}.`);
  if (input.faqCount !== input.expectedFaqs) hardStops.push(`Expected ${input.expectedFaqs} FAQs, found ${input.faqCount}.`);
  if (input.celebrity) {
    const table = $('table').first();
    if (!table.length) hardStops.push('Quick Bio table is missing.');
    else {
      const bad = table.find('tbody tr').toArray().filter((tr) => $(tr).find('td,th').length !== 2).length;
      if (bad) hardStops.push(`Quick Bio has ${bad} malformed row(s).`);
      if (input.quickBioRows < 8) hardStops.push(`Quick Bio has only ${input.quickBioRows} rows (expected ~11–13).`);
    }
  }
  if ($('h2').length < 3) hardStops.push('Fewer than 3 H2 sections.');
  if (/\{\{|\}\}|```|\[P\d+\]|\{L\d+\}/.test(input.html)) hardStops.push('Unresolved template/markup tokens remain in the article.');
  if (/as an ai (language )?model|i cannot browse|als ki-sprachmodell/i.test($.text())) hardStops.push('Chatbot self-reference found in article text.');
  for (const c of input.seo.checks) if (!c.passed && c.severity !== 'hard') warnings.push(`${c.label}: ${c.detail}`);
  return { passed: hardStops.length === 0, hardStops, warnings };
}
