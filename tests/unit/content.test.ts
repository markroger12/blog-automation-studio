import { describe, expect, it } from 'vitest';
import { renderTemplate, TemplateError } from '@/lib/template';
import { parseTitles, parseFaqs, parseQuickBio, parseLinkSuggestions, parseGeneralArticle, parseCategory } from '@/lib/content/parsers';
import { parseWriter2 } from '@/lib/content/writer2';
import { markdownToHtml, sanitizeArticleHtml } from '@/lib/content/sanitize';
import { assembleArticle } from '@/lib/content/assembly';
import { countKeyword } from '@/lib/content/seo';
import { insertLinks } from '@/lib/content/links';
import { assertMutationAllowed, PublishBlockedError } from '@/wordpress/publish-guard';
import { isPrivateIp, assertPublicUrl } from '@/lib/net/ssrf';
import { safeJoin } from '@/lib/paths';

describe('template engine', () => {
  it('renders vars and blocks', () => {
    expect(renderTemplate('A {{x}}{{#if y}} Y={{y}}{{/if}}{{#unless z}} noZ{{/unless}}', { x: 1, y: 'b' })).toBe('A 1 Y=b noZ');
  });
  it('rejects unresolved placeholders', () => {
    expect(() => renderTemplate('Hi {{name}}', {})).toThrow(TemplateError);
  });
});

describe('parsers', () => {
  it('parses titles and recommended line', () => {
    const r = parseTitles('1. Alpha Title\n2. **Beta Title**\nRecommended Title: Beta Title');
    expect(r.options).toEqual(['Alpha Title', 'Beta Title']);
    expect(r.recommended).toBe('Beta Title');
  });
  it('parses FAQ pairs', () => {
    const f = parseFaqs('QUESTION: Who is X?\nANSWER: An actor.\nQUESTION: How old?\nANSWER: 30.');
    expect(f).toHaveLength(2);
    expect(f[1]).toEqual({ question: 'How old?', answer: '30.' });
  });
  it('parses a two-column Quick Bio and flags malformed rows', () => {
    const r = parseQuickBio('<table><thead><tr><th>Attribute</th><th>Details</th></tr></thead><tbody><tr><td>Full Name</td><td>Jane Doe</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>');
    expect(r.rows).toEqual([{ attribute: 'Full Name', details: 'Jane Doe' }]);
    expect(r.issues.join()).toMatch(/3 cells/);
  });
  it('parses link lines and general metadata', () => {
    expect(parseLinkSuggestions('LINK: Euphoria | https://www.imdb.com/title/tt8772296/\nnoise')).toHaveLength(1);
    const g = parseGeneralArticle('SEO TITLE: Best X\nMETA DESCRIPTION: desc\nURL SLUG: Best X Guide\n\nBody here');
    expect(g).toMatchObject({ seoTitle: 'Best X', metaDescription: 'desc', slug: 'best-x-guide', body: 'Body here' });
    expect(parseCategory('CATEGORY: apps', ['Apps', 'Games'])).toBe('Apps');
    expect(parseCategory('CATEGORY: Made Up', ['Apps'])).toBeNull();
  });
  it('parses labelled Writer 2.0 output', () => {
    const out = parseWriter2(`**H1:** Jane Doe Biography\n\n**Main Article:**\nIntro text.\n\n## Early Life\nText.\n\n**Quick Bio:**\n<table><tr><th>Attribute</th><th>Details</th></tr><tr><td>Name</td><td>Jane</td></tr></table>\n\n**Five FAQs:**\nQUESTION: Q1?\nANSWER: A1\n\n**Meta Description:** A short meta.\n**Suggested URL Slug:** jane-doe\n**Tags:** a, b, c\n**Research Notes:** private`);
    expect(out.title).toBe('Jane Doe Biography');
    expect(out.article).toContain('## Early Life');
    expect(out.quickBio).toHaveLength(1);
    expect(out.faqs).toHaveLength(1);
    expect(out.slug).toBe('jane-doe');
    expect(out.tags).toEqual(['a', 'b', 'c']);
    expect(out.researchNotes).toBe('private');
  });
});

describe('sanitize and assembly', () => {
  it('strips scripts and fences', () => {
    expect(sanitizeArticleHtml('<p>x</p><script>alert(1)</script>')).toBe('<p>x</p>');
    expect(markdownToHtml('Sure! Here is the article:\n\n```\n## H\n\nText\n```').trim()).toBe('<h2>H</h2>\n<p>Text</p>');
  });
  it('assembles in order with German headings and final link line', () => {
    const r = assembleArticle({
      bodyHtml: '<p>Intro</p><h2>Karriere</h2><p>Body</p><h2>Fazit</h2><p>Ende</p>',
      language: 'German', keyword: 'Max', title: null,
      quickBio: [{ attribute: 'Name', details: 'Max' }], faqs: [{ question: 'Wer?', answer: 'Er.' }],
      internalLink: { line: 'Das könnte Ihnen gefallen:', url: 'https://ex.com/a', title: 'A' },
    });
    const order = ['Intro', 'Kurzbiografie von Max', 'Karriere', 'Häufig gestellte Fragen', 'Fazit', 'Das könnte Ihnen gefallen:'].map((s) => r.html.indexOf(s));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
  });
  it('counts keywords with normalization', () => {
    expect(countKeyword('Sydney Sweeney is... sydney sweeney!', 'Sydney Sweeney').normalized).toBe(2);
  });
  it('inserts links only in body text, once per phrase', () => {
    const r = insertLinks('<h2>Euphoria</h2><p>She starred in Euphoria and Euphoria again.</p>', [{ anchor: 'Euphoria', url: 'https://imdb.com/x' }], 5);
    expect(r.html.match(/<a /g)).toHaveLength(1);
    expect(r.html).toContain('<h2>Euphoria</h2>');
  });
});

describe('security', () => {
  it('blocks publishing without permission or outside scheduler flow', () => {
    const req = { method: 'POST', url: '/wp-json/wp/v2/posts/5', body: JSON.stringify({ status: 'publish' }) };
    expect(() => assertMutationAllowed({ canPublish: false, schedulerFlow: true }, req)).toThrow(PublishBlockedError);
    expect(() => assertMutationAllowed({ canPublish: true, schedulerFlow: false }, req)).toThrow(PublishBlockedError);
    expect(() => assertMutationAllowed({ canPublish: true, schedulerFlow: true }, req)).not.toThrow();
    expect(() => assertMutationAllowed({ canPublish: false, schedulerFlow: false }, { ...req, body: 'post_status=future' })).toThrow();
    expect(() => assertMutationAllowed({ canPublish: false, schedulerFlow: false }, { ...req, body: JSON.stringify({ status: 'draft' }) })).not.toThrow();
  });
  it('detects private IPs and rejects internal URLs', async () => {
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    await expect(assertPublicUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertPublicUrl('https://evil.test/', { resolver: async () => ['192.168.1.1'] })).rejects.toThrow(/private/);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
  });
  it('prevents path traversal', () => {
    expect(() => safeJoin('/data', '../etc')).toThrow();
    expect(() => safeJoin('/data', 'C:\\x')).toThrow();
    expect(safeJoin('/data', 'a/b')).toMatch(/data[\\/]a[\\/]b$/);
  });
});
