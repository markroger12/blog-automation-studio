import * as cheerio from 'cheerio';
import { escapeHtml, markdownToHtml, sanitizeArticleHtml } from './sanitize';
import { quickBioToHtml, type Faq, type QuickBioRow } from './parsers';

export type Lang = 'English' | 'German';

export function localeHeadings(language: Lang, name: string) {
  return language === 'German'
    ? { quickBio: `Kurzbiografie von ${name}`, faq: 'Häufig gestellte Fragen', conclusion: 'Fazit' }
    : { quickBio: `Quick Bio of ${name}`, faq: 'Frequently Asked Questions', conclusion: 'Conclusion' };
}

const CONCLUSION_RE = /^(conclusion|final thoughts|fazit|schlussfolgerung|schlussgedanken|zusammenfassung)\b/i;
const FAQ_RE = /^(faqs?|frequently asked questions|häufig gestellte fragen)\b/i;
const QUICKBIO_RE = /^(quick bio|kurzbiografie|steckbrief)\b/i;
const JUNK_LABEL_RE = /^(introduction|einleitung|main article|hauptartikel|article body|research notes?)\s*:?\s*$/i;

export interface AssemblyInput {
  bodyHtml: string;
  language: Lang;
  keyword: string;
  title: string | null;
  quickBio?: QuickBioRow[] | null;
  quickBioName?: string | null;
  faqs: Faq[];
  internalLink?: { line: string; url: string; title: string } | null;
}

export interface AssemblyResult {
  html: string;
  notes: string[];
}

/** Assembles: Introduction → Quick Bio → body sections → FAQs → Conclusion → final internal-link line. */
export function assembleArticle(input: AssemblyInput): AssemblyResult {
  const notes: string[] = [];
  const $ = cheerio.load(`<div id="root">${sanitizeArticleHtml(input.bodyHtml)}</div>`);
  const root = $('#root');
  // Remove duplicate title headings and scaffold labels.
  root.find('h2,h3,p').each((_i, el) => {
    const t = $(el).text().trim();
    if (input.title && el.tagName !== 'p' && t.toLowerCase() === input.title.toLowerCase()) {
      $(el).remove();
      notes.push('Removed duplicate title heading.');
    } else if (JUNK_LABEL_RE.test(t)) {
      $(el).remove();
      notes.push(`Removed scaffold label "${t}".`);
    }
  });
  // Remove model-produced FAQ/Quick Bio sections — structured versions are inserted below.
  root.find('h2').each((_i, el) => {
    const t = $(el).text().trim();
    if (FAQ_RE.test(t) || QUICKBIO_RE.test(t)) {
      $(el).nextUntil('h2').remove();
      $(el).remove();
      notes.push(`Replaced model "${t}" section with structured content.`);
    }
  });
  // Deduplicate identical paragraphs.
  const seen = new Set<string>();
  root.find('p').each((_i, el) => {
    const key = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) {
      $(el).remove();
      notes.push('Removed duplicated paragraph.');
    } else seen.add(key);
  });

  const nodes = root.children().toArray();
  const firstH2 = nodes.findIndex((n) => n.type === 'tag' && n.tagName === 'h2');
  const intro = firstH2 === -1 ? nodes : nodes.slice(0, firstH2);
  const rest = firstH2 === -1 ? [] : nodes.slice(firstH2);
  let conclusionIdx = -1;
  rest.forEach((n, i) => {
    if (n.type === 'tag' && n.tagName === 'h2' && CONCLUSION_RE.test($(n).text().trim())) conclusionIdx = i;
  });
  const body = conclusionIdx === -1 ? rest : rest.slice(0, conclusionIdx);
  const conclusion = conclusionIdx === -1 ? [] : rest.slice(conclusionIdx);
  const html = (ns: typeof nodes) => ns.map((n) => $.html(n)).join('');
  const h = localeHeadings(input.language, input.quickBioName || input.keyword);

  let out = html(intro);
  if (input.quickBio && input.quickBio.length) {
    out += `<h2>${escapeHtml(h.quickBio)}</h2>${quickBioToHtml(input.quickBio, input.language)}`;
  }
  out += html(body);
  if (input.faqs.length) {
    out += `<h2>${escapeHtml(h.faq)}</h2>`;
    out += input.faqs.map((f) => `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`).join('');
  }
  if (conclusion.length) {
    const [head, ...tail] = conclusion;
    out += `<h2>${escapeHtml(h.conclusion)}</h2>${html(tail)}`;
    void head;
  } else {
    notes.push('No conclusion section found in the article body.');
  }
  if (input.internalLink && input.internalLink.url) {
    out += `<p>${escapeHtml(input.internalLink.line)} <a href="${escapeHtml(input.internalLink.url)}">${escapeHtml(input.internalLink.title)}</a></p>`;
  }
  return { html: sanitizeArticleHtml(out), notes };
}

export function markdownBodyToHtml(markdown: string): string {
  return markdownToHtml(markdown);
}

export function languageInstruction(language: Lang, country: string): string {
  if (language === 'German') {
    const where = country && country !== 'Germany' ? `in ${country === 'Austria' ? 'Österreich' : country === 'Switzerland' ? 'der Schweiz' : country}` : 'in Deutschland';
    return `Schreibe vollständig auf Deutsch für Leserinnen und Leser ${where}.`;
  }
  return `Write in English for readers in the ${country === 'United States' ? 'United States' : country}.`;
}
