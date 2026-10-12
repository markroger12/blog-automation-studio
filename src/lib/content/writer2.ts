import { stripModelWrappers } from './sanitize';
import { parseFaqs, parseQuickBio, normalizeSlug, type Faq, type QuickBioRow } from './parsers';

export interface Writer2Output {
  title: string | null;
  article: string;
  quickBio: QuickBioRow[];
  faqs: Faq[];
  finalThoughts: string | null;
  metaDescription: string | null;
  slug: string | null;
  tags: string[];
  internalLinkAnchors: string[];
  researchNotes: string | null;
  issues: string[];
}

type SectionKey = 'title' | 'article' | 'quickBio' | 'faqs' | 'finalThoughts' | 'meta' | 'slug' | 'tags' | 'anchors' | 'notes';

const LABELS: { key: SectionKey; re: RegExp }[] = [
  { key: 'title', re: /^(?:h1|article title|titel|title|überschrift)$/i },
  { key: 'article', re: /^(?:main article|article|main body|article body|hauptartikel|artikel)$/i },
  { key: 'quickBio', re: /^(?:quick bio(?: table)?|kurzbiografie|steckbrief)$/i },
  { key: 'faqs', re: /^(?:(?:five|5)\s+)?faqs?|frequently asked questions|häufig gestellte fragen$/i },
  { key: 'finalThoughts', re: /^(?:final thoughts|conclusion|fazit|schlussgedanken)$/i },
  { key: 'meta', re: /^(?:meta description|meta-beschreibung|metabeschreibung)$/i },
  { key: 'slug', re: /^(?:suggested url slug|url slug|slug)$/i },
  { key: 'tags', re: /^(?:tags|schlagwörter)$/i },
  { key: 'anchors', re: /^(?:internal[- ]link anchors|internal links|interne links)$/i },
  { key: 'notes', re: /^(?:research notes|recherchenotizen|sources|quellen)$/i },
];

function matchLabel(line: string): { key: SectionKey; rest: string } | null {
  const stripped = line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^\*\*(.+?)\*\*/, '$1')
    .trim();
  const m = stripped.match(/^([^:：]{2,40}?)\s*(?:\(.*?\))?\s*[:：]\s*(.*)$/);
  const candidates = m ? [{ label: m[1].replace(/\*\*/g, '').trim(), rest: m[2].replace(/^\*\*\s*/, '').trim() }] : [];
  candidates.push({ label: stripped.replace(/\*\*/g, '').replace(/[:：]$/, '').trim(), rest: '' });
  for (const c of candidates) {
    for (const l of LABELS) if (l.re.test(c.label)) return { key: l.key, rest: c.rest };
  }
  return null;
}

/** Parses the flexible labelled single-response output of Celebrity Writer 2.0. */
export function parseWriter2(text: string): Writer2Output {
  const lines = stripModelWrappers(text).split('\n');
  const sections: Partial<Record<SectionKey, string[]>> = {};
  let current: SectionKey | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    const label = matchLabel(line);
    // A heading like "## Early Life" inside the article must not be treated as a label.
    if (label && !(current === 'article' && label.key !== 'quickBio' && label.key !== 'faqs' && label.key !== 'finalThoughts' && label.key !== 'meta' && label.key !== 'slug' && label.key !== 'tags' && label.key !== 'anchors' && label.key !== 'notes')) {
      current = label.key;
      sections[current] = sections[current] ?? [];
      if (label.rest) sections[current]!.push(label.rest);
      continue;
    }
    if (current) sections[current]!.push(line);
    else preamble.push(line);
  }
  const join = (k: SectionKey) => (sections[k] ?? []).join('\n').trim();
  const issues: string[] = [];
  let article = join('article');
  if (!article) {
    article = preamble.join('\n').trim();
    if (article) issues.push('No "Main Article" label found; used unlabelled text as the article body.');
  }
  article = article.replace(/^#{1,3}\s*(?:introduction|einleitung)\s*\n/i, '');
  const title = (join('title').split('\n').find((l) => l.trim()) ?? '').replace(/^#\s*/, '').replace(/\*\*/g, '').trim() || null;
  const bio = parseQuickBio(join('quickBio'));
  if (!sections.quickBio) issues.push('Quick Bio section missing.');
  else issues.push(...bio.issues);
  const faqs = parseFaqs(join('faqs'));
  if (!faqs.length) issues.push('FAQ section missing or unparseable.');
  const tags = join('tags')
    .split(/[,\n]/)
    .map((t) => t.replace(/^[-*#\d.)\s]+/, '').trim())
    .filter(Boolean);
  const anchors = join('anchors')
    .split('\n')
    .map((t) => t.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
  const slugRaw = join('slug').split('\n')[0] ?? '';
  return {
    title,
    article,
    quickBio: bio.rows,
    faqs,
    finalThoughts: join('finalThoughts') || null,
    metaDescription: join('meta').replace(/\s+/g, ' ').trim() || null,
    slug: slugRaw ? normalizeSlug(slugRaw) : null,
    tags,
    internalLinkAnchors: anchors,
    researchNotes: join('notes') || null,
    issues,
  };
}
