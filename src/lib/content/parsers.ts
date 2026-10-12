import * as cheerio from 'cheerio';
import { sanitizeArticleHtml, stripModelWrappers, escapeHtml } from './sanitize';

export interface ParsedTitles {
  options: string[];
  recommended: string | null;
}

function cleanTitle(t: string): string {
  return t.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').replace(/\*\*/g, '').replace(/^["“„']|["”“']$/g, '').trim();
}

export function parseTitles(text: string): ParsedTitles {
  const lines = stripModelWrappers(text).split('\n').map((l) => l.trim()).filter(Boolean);
  let recommended: string | null = null;
  const options: string[] = [];
  for (const line of lines) {
    const rec = line.replace(/\*\*/g, '').match(/^(?:recommended title|empfohlener titel)\s*[:：]\s*(.+)$/i);
    if (rec) {
      recommended = cleanTitle(rec[1]);
      continue;
    }
    if (/^\s*(?:\d+[.)]|[-*•])\s+/.test(line)) {
      const t = cleanTitle(line);
      if (t && t.length <= 200) options.push(t);
    }
  }
  if (recommended && !options.includes(recommended)) options.push(recommended);
  return { options, recommended: recommended ?? options[0] ?? null };
}

export interface Faq {
  question: string;
  answer: string;
}

export function parseFaqs(text: string): Faq[] {
  const cleaned = stripModelWrappers(text).replace(/\*\*/g, '');
  const faqs: Faq[] = [];
  const re = /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:QUESTION|FRAGE|Q)\s*[:：]\s*([\s\S]*?)\n\s*(?:ANSWER|ANTWORT|A)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:\d+[.)]\s*)?(?:QUESTION|FRAGE|Q)\s*[:：]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const question = m[1].replace(/\s+/g, ' ').trim();
    const answer = m[2].replace(/\s+/g, ' ').trim();
    if (question && answer) faqs.push({ question, answer });
  }
  if (faqs.length) return faqs;
  // Fallback: Markdown "### Question?" followed by answer paragraph(s).
  const md = /(?:^|\n)#{2,4}\s*(.+\?)\s*\n+([\s\S]*?)(?=\n#{2,4}\s|$)/g;
  while ((m = md.exec(cleaned))) {
    const answer = m[2].replace(/\s+/g, ' ').trim();
    if (answer) faqs.push({ question: m[1].trim(), answer });
  }
  return faqs;
}

export interface QuickBioRow {
  attribute: string;
  details: string;
}

export function parseQuickBio(text: string): { rows: QuickBioRow[]; issues: string[] } {
  const issues: string[] = [];
  const cleaned = stripModelWrappers(text);
  const rows: QuickBioRow[] = [];
  if (/<table[\s>]/i.test(cleaned)) {
    const $ = cheerio.load(cleaned);
    const table = $('table').first();
    const headerCells = table.find('thead tr').first().find('th,td');
    if (headerCells.length && headerCells.length !== 2) issues.push(`Header has ${headerCells.length} columns; expected 2.`);
    table.find('tr').each((_i, tr) => {
      const cells = $(tr).find('th,td');
      if ($(tr).parent().is('thead')) return;
      if (cells.length !== 2) {
        if (cells.length) issues.push(`Row with ${cells.length} cells ignored.`);
        return;
      }
      const attribute = $(cells[0]).text().replace(/\s+/g, ' ').trim();
      const details = $(cells[1]).text().replace(/\s+/g, ' ').trim();
      if (/^(attribute|merkmal|attribut)$/i.test(attribute) && /^(details|angaben|einzelheiten)$/i.test(details)) return;
      if (attribute && details) rows.push({ attribute, details });
    });
  } else {
    // Markdown table fallback.
    for (const line of cleaned.split('\n')) {
      const cells = line.split('|').map((c) => c.trim()).filter((c, i, arr) => !(c === '' && (i === 0 || i === arr.length - 1)));
      if (cells.length !== 2 || /^-+$/.test(cells[0].replace(/:/g, ''))) continue;
      if (/^(attribute|merkmal|attribut)$/i.test(cells[0])) continue;
      rows.push({ attribute: cells[0].replace(/\*\*/g, ''), details: cells[1].replace(/\*\*/g, '') });
    }
    if (rows.length) issues.push('Quick Bio was returned as Markdown; converted to HTML.');
  }
  if (!rows.length) issues.push('No Quick Bio rows could be parsed.');
  return { rows, issues };
}

export function quickBioToHtml(rows: QuickBioRow[], language: 'English' | 'German'): string {
  const [a, d] = language === 'German' ? ['Merkmal', 'Angaben'] : ['Attribute', 'Details'];
  const body = rows.map((r) => `<tr><td>${escapeHtml(r.attribute)}</td><td>${escapeHtml(r.details)}</td></tr>`).join('');
  return sanitizeArticleHtml(`<table><thead><tr><th>${a}</th><th>${d}</th></tr></thead><tbody>${body}</tbody></table>`);
}

export interface LinkSuggestion {
  anchor: string;
  url: string;
}

export function parseLinkSuggestions(text: string): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];
  for (const raw of stripModelWrappers(text).split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    const m = line.match(/^(?:[-*]\s*)?LINK\s*[:：]\s*(.+?)\s*\|\s*(\S+)\s*$/i);
    if (!m) continue;
    const url = m[2].replace(/^<|>$/g, '').replace(/[).,]+$/, '');
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ anchor: m[1].replace(/^["“„]|["”“]$/g, '').trim(), url });
  }
  return out;
}

export interface GeneralArticleMeta {
  seoTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  body: string;
}

export function parseGeneralArticle(text: string): GeneralArticleMeta {
  const cleaned = stripModelWrappers(text);
  const lines = cleaned.split('\n');
  let seoTitle: string | null = null;
  let metaDescription: string | null = null;
  let slug: string | null = null;
  let bodyStart = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i].replace(/\*\*/g, '').trim();
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^SEO[ -]?TIT(?:LE|EL)\s*[:：]\s*(.+)$/i))) {
      seoTitle = m[1].trim();
      bodyStart = i + 1;
    } else if ((m = l.match(/^META[ -]?(?:DESCRIPTION|BESCHREIBUNG)\s*[:：]\s*(.+)$/i))) {
      metaDescription = m[1].trim();
      bodyStart = i + 1;
    } else if ((m = l.match(/^(?:URL[ -]?SLUG|SLUG)\s*[:：]\s*(.+)$/i))) {
      slug = normalizeSlug(m[1]);
      bodyStart = i + 1;
    }
  }
  return { seoTitle, metaDescription, slug, body: lines.slice(bodyStart).join('\n').trim() };
}

export function normalizeSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function parseCategory(text: string, categories: string[]): string | null {
  const line = stripModelWrappers(text).replace(/\*\*/g, '').split('\n').map((l) => l.trim()).find((l) => /^(CATEGORY|KATEGORIE)\s*[:：]/i.test(l));
  if (!line) return null;
  const value = line.replace(/^(CATEGORY|KATEGORIE)\s*[:：]\s*/i, '').trim().replace(/^["“„]|["”“]$/g, '');
  const exact = categories.find((c) => c === value);
  if (exact) return exact;
  const ci = categories.find((c) => c.toLowerCase() === value.toLowerCase());
  return ci ?? null;
}

export interface ImagePlanItem {
  slot: 'FEATURED' | 'BODY1' | 'BODY2';
  brief: string;
  alt: string;
}

export function parseImagePlan(text: string): ImagePlanItem[] {
  const out: ImagePlanItem[] = [];
  for (const raw of stripModelWrappers(text).split('\n')) {
    const m = raw.replace(/\*\*/g, '').trim().match(/^(FEATURED|BODY1|BODY2)\s*[:：]\s*(.+?)\s*\|\s*ALT\s*[:：]\s*(.+)$/i);
    if (m) out.push({ slot: m[1].toUpperCase() as ImagePlanItem['slot'], brief: m[2].trim(), alt: m[3].trim() });
  }
  return out;
}
