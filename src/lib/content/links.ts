import * as cheerio from 'cheerio';
import type { LinkSuggestion } from './parsers';
import { normalizeForMatch } from './seo';

export interface LinkDecision {
  anchor: string;
  url: string;
  accepted: boolean;
  reason: string;
}

const BLOCKED_HOSTS = /(facebook|instagram|twitter|x\.com|tiktok|pinterest|amazon\.|ebay\.|bit\.ly|tinyurl|t\.co|celebritynetworth|networthspot|wealthygorilla|marriedbiography|famousbirthdays)/i;

export function prefilterLink(s: LinkSuggestion, keyword: string): string | null {
  let url: URL;
  try {
    url = new URL(s.url);
  } catch {
    return 'Invalid URL';
  }
  if (BLOCKED_HOSTS.test(url.hostname)) return `Blocked domain category (${url.hostname})`;
  if (normalizeForMatch(s.anchor) === normalizeForMatch(keyword)) return 'Anchor is the primary focus keyword';
  if (s.anchor.length < 3 || s.anchor.length > 80) return 'Anchor length out of range';
  return null;
}

/**
 * Inserts verified links at exact phrase occurrences in body text (not headings),
 * max 2 external links per paragraph, each phrase linked once.
 */
export function insertLinks(html: string, links: { anchor: string; url: string }[], maxLinks: number): { html: string; decisions: LinkDecision[] } {
  const $ = cheerio.load(`<div id="r">${html}</div>`);
  const decisions: LinkDecision[] = [];
  let inserted = 0;
  const wikiLimit = Math.max(1, Math.floor(maxLinks / 2));
  let wiki = 0;
  for (const link of links) {
    if (inserted >= maxLinks) {
      decisions.push({ ...link, accepted: false, reason: `Maximum of ${maxLinks} external links reached` });
      continue;
    }
    const isWiki = /wikipedia\.org/i.test(link.url);
    if (isWiki && wiki >= wikiLimit) {
      decisions.push({ ...link, accepted: false, reason: 'Wikipedia would exceed half of added links' });
      continue;
    }
    let placed = false;
    $('#r').find('p, li, td').each((_i, el) => {
      if (placed) return;
      const $el = $(el);
      if ($el.find('a').length >= 2) return;
      const textNodes = $el.contents().toArray().filter((n) => n.type === 'text');
      for (const node of textNodes) {
        const text = (node as unknown as { data: string }).data;
        const idx = text.indexOf(link.anchor);
        if (idx === -1) continue;
        const before = text.slice(0, idx);
        const after = text.slice(idx + link.anchor.length);
        const boundaryOk = !/[\p{L}\p{N}]$/u.test(before) && !/^[\p{L}\p{N}]/u.test(after);
        if (!boundaryOk) continue;
        const a = $('<a></a>').attr('href', link.url).attr('target', '_blank').attr('rel', 'noopener noreferrer').text(link.anchor);
        $(node).replaceWith([before, $.html(a), after].join(''));
        placed = true;
        break;
      }
    });
    if (placed) {
      inserted++;
      if (isWiki) wiki++;
      decisions.push({ ...link, accepted: true, reason: 'Exact phrase found in body text; destination verified' });
    } else {
      decisions.push({ ...link, accepted: false, reason: 'Exact anchor not found in eligible body text (headings and already-linked paragraphs are excluded)' });
    }
  }
  return { html: $('#r').html() ?? html, decisions };
}

/** Lightweight subject check: the destination page title/H1 should share words with the anchor. */
export function destinationMatchesAnchor(pageHtml: string, anchor: string): { ok: boolean; title: string } {
  const $ = cheerio.load(pageHtml);
  const title = `${$('title').first().text()} ${$('h1').first().text()} ${$('meta[property="og:title"]').attr('content') ?? ''}`.trim();
  const anchorWords = normalizeForMatch(anchor).split(' ').filter((w) => w.length > 2);
  const titleNorm = ` ${normalizeForMatch(title)} `;
  const hits = anchorWords.filter((w) => titleNorm.includes(` ${w} `)).length;
  return { ok: anchorWords.length === 0 ? true : hits / anchorWords.length >= 0.5, title: title.slice(0, 200) };
}
