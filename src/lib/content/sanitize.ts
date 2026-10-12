import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

export const ALLOWED_TAGS = [
  'p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'figure', 'figcaption', 'img', 'hr', 'span', 'code',
];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'width', 'height', 'data-wp-media-id', 'data-slot'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      figure: ['data-slot'],
      span: ['data-mark'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs };
        if (out.target === '_blank') out.rel = 'noopener noreferrer';
        return { tagName, attribs: out };
      },
      h1: 'h2',
      b: 'strong',
      i: 'em',
    },
    exclusiveFilter: (frame) => ['h2', 'h3', 'h4', 'p'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
  });
}

/** Strip code fences and chatbot scaffolding that sometimes wraps the article. */
export function stripModelWrappers(text: string): string {
  let t = text.replace(/\r\n/g, '\n').trim();
  const fence = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1].trim();
  t = t.replace(/^```[a-zA-Z]*\s*$/gm, '').trim();
  const prefaces = [
    /^(sure|certainly|absolutely|of course|here(?:'s| is)|below is|gerne|hier ist|natürlich)[^\n]{0,160}:\s*\n+/i,
    /^(sure|certainly|absolutely|of course)[!.,][^\n]{0,160}\n+/i,
  ];
  for (const re of prefaces) t = t.replace(re, '');
  t = t.replace(/\n+(?:let me know|i hope this|feel free to|would you like|lass mich wissen|möchtest du)[^\n]*$/i, '');
  t = t.replace(/【[^】]*】/g, '').replace(/\[\d+\]†?/g, '');
  return t.trim();
}

export function markdownToHtml(markdown: string): string {
  const cleaned = stripModelWrappers(markdown);
  const html = marked.parse(cleaned, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeArticleHtml(html);
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
