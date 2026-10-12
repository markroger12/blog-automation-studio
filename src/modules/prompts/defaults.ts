// Generated from the master specification (Appendix A/B). These are shipped DEFAULTS.
// Owner edits live in the PromptTemplate table and are never overwritten (see src/modules/prompts/seed.ts).
export interface DefaultPrompt {
  moduleKey: string;
  stageKey: string;
  name: string;
  description: string;
  content: string;
  /** Bump when the shipped default text changes. */
  version: number;
}

export const DEFAULT_PROMPTS: DefaultPrompt[] = [
  {
    moduleKey: "celebrity-v1",
    stageKey: "TITLES",
    name: "Titles",
    description: "Generates 6–10 title options plus a parseable Recommended Title line.",
    version: 1,
    content: "Generate several credible, reader-focused, SEO-friendly blog titles for:\nPrimary keyword: \"{{keyword}}\"\n{{#if example_title}}Reference title for direction only: \"{{example_title}}\"{{/if}}\nAudience: {{country}}; language: {{language}}.\n \nUse the primary keyword naturally where it helps. Avoid exaggerated, spammy, clickbait and formulaic AI-sounding titles. Make the subject and reader benefit clear. Offer distinct angles instead of minor rephrasings. Do not assert private details or relationships as facts in a title unless they are supported.\n \nReturn 6–10 numbered title options, followed by a final line in exactly this format:\nRecommended Title: <best title>",
  },
  {
    moduleKey: "celebrity-v1",
    stageKey: "RESEARCH",
    name: "Research",
    description: "Collects supportable research notes (never published directly).",
    version: 1,
    content: "Research the person or subject associated with \"{{keyword}}\" for an article titled \"{{selected_title}}\". Collect only information you can responsibly support. Focus on identity; known dates and places; early life; education; public family/relationship details; career chronology; notable roles/projects; awards; public statements; and genuinely relevant recent developments.\n \nSeparate reliable established facts from disputed claims, estimates, rumors and unavailable details. Do not guess birth dates, children, partners, height, net worth, income, or private contact information. For net worth, explain when published numbers are unofficial estimates. Prefer primary sources and reputable reporting. When citing a source, include a real checkable URL and date if known; never fabricate a citation.\n \nProduce organized research notes detailed enough to support a substantial article, including brief notes on uncertain facts and source conflicts. Do not write the article yet. Language: {{language}}. Country/audience: {{country}}.",
  },
  {
    moduleKey: "celebrity-v1",
    stageKey: "LONG_ARTICLE",
    name: "Long article",
    description: "1,500–2,000 word draft with H2/H3 Markdown headings.",
    version: 1,
    content: "Write a substantial biography article of approximately 1,500–2,000 words using the established research already gathered in this conversation.\nTitle: \"{{selected_title}}\"\nPrimary keyword: \"{{keyword}}\"\n{{#if secondary_keywords}}Secondary terms to use only where natural: {{secondary_keywords}}{{/if}}\nAudience: {{country}}; language: {{language}}.\n \nUse a concise, informative opening and logical H2/H3 Markdown headings (## and ###). Write ordinary prose in paragraphs of roughly 3–5 varied sentences; no bullet-point or numbered-list body sections. Include a coherent conclusion. Bold only occasional genuinely important names, works or milestones. Avoid repetitive phrases, exaggerated claims and fabricated information. Preserve meaningful uncertainty, distinguish unofficial estimates and attribute potentially disputed claims.\n \nUse the focus keyword naturally; the {{min_keyword_occurrences}}–{{max_keyword_occurrences}} target is advisory, never justification for keyword stuffing. Do not add FAQs or a Quick Bio yet. Output only the article body; no commentary, title heading, reference list made of invented URLs or self-evaluation.",
  },
  {
    moduleKey: "celebrity-v1",
    stageKey: "FINAL_ARTICLE",
    name: "Final article",
    description: "Edits the long article to the configured maximum length.",
    version: 1,
    content: "Edit the previous long article into a finished magazine-quality article of no more than {{max_words}} words. Keep the same verified factual substance, names, dates, quantities, direct quotes and meaningful uncertainty. Remove repetition, awkward phrasing, filler, weak transitions and formulaic AI-sounding language. Maintain useful ## H2 and ### H3 headings and natural paragraphs. Keep the introduction concise, retain a logical conclusion, and use \"{{keyword}}\" naturally near the opening and in a relevant heading only where helpful.\n \nDo not add FAQs, a Quick Bio, a second title, unsupported claims, invented quotations, bullet lists, commentary or sources you did not verify. Output the complete final article only in {{language}}.",
  },
  {
    moduleKey: "celebrity-v1",
    stageKey: "FAQS",
    name: "FAQs",
    description: "Exactly faq_count QUESTION/ANSWER pairs.",
    version: 1,
    content: "For the completed biography about \"{{keyword}}\", write exactly {{faq_count}} realistic search-based questions with concise, factual answers in {{language}}. Use facts established in the research; do not guess private information or turn uncertainty into certainty.\n \nOutput only repeated pairs in this format:\nQUESTION: <question ending in ?>\nANSWER: <one short useful answer>\n \nDo not include an introduction, conclusion or extra commentary.",
  },
  {
    moduleKey: "celebrity-v1",
    stageKey: "QUICK_BIO",
    name: "Quick Bio",
    description: "Two-column Attribute | Details HTML table.",
    version: 1,
    content: "For the biography about \"{{keyword}}\", create a clean HTML Quick Bio table containing approximately {{bio_rows_range}} useful rows supported by the research. Use exactly two columns: Attribute and Details. Candidate fields: Full Name, Known As, Profession, Date of Birth, Age, Birthplace, Nationality, Education, Public Relationship Status, Career, Known For, Famous Works, Social Media, Height and Estimated Net Worth. Omit irrelevant fields rather than inventing values; for an important unavailable field, write \"Not publicly confirmed\" or the natural German equivalent.\n \nUse valid HTML only: <table>, <thead>, <tbody>, <tr>, <th> and <td>. First row headers are Attribute and Details. No CSS, scripts, Markdown fences, citations of invented sources or surrounding commentary. Language: {{language}}.",
  },
  {
    moduleKey: "shared",
    stageKey: "EXTERNAL_LINKS",
    name: "External links",
    description: "Proposes LINK: <phrase> | <url> rows; verified locally before insertion.",
    version: 1,
    content: "Review the article below and propose up to {{link_count}} genuinely useful outbound references. Each anchor must appear **exactly** in the supplied article body. Prefer independently checkable official sites, educational institutions, recognized publications, relevant IMDb entries and {{wikipedia_site}} where appropriate. Do not link the primary focus keyword \"{{keyword}}\" itself, a social media profile, unrelated store, gossip aggregator or unverified net-worth site. Avoid more than two proposed anchors from the same paragraph.\n \nVerify the destination's subject and URL if you have browsing available. If you cannot check a URL, do not invent it; simply return fewer suggestions. Never rewrite the article.\n \nReturn one line per link, with nothing else:\nLINK: <exact phrase in the body> | <full verified URL>\n \nArticle:\n{{final_article}}",
  },
  {
    moduleKey: "shared",
    stageKey: "PHOTO_CHECK",
    name: "Photo check",
    description: "Watermark/collage/alt-text review of attached candidate images.",
    version: 1,
    content: "I attached {{photo_count}} candidate editorial images for a biography about \"{{keyword}}\", numbered in attachment order. Inspect visible content only. For every photo, report whether there is an overlay watermark/agency logo/website name or a collage made from multiple images. A real-life sign or shirt print is not a watermark. Make a concise alt-text description of visible clothing, action, surroundings or scene, without guessing the person's identity, event, location.\n \nOutput only one line per image:\n<number>: watermark=yes|no | collage=yes|no | alt=<description of 12 words or fewer>",
  },
  {
    moduleKey: "shared",
    stageKey: "SEO_CORRECTION",
    name: "SEO correction",
    description: "Bounded content correction for concrete Rank Math/local SEO issues.",
    version: 1,
    content: "The WordPress Rank Math panel and local SEO checker reported the following concrete issues for the article about \"{{keyword}}\":\n{{rankmath_issues}}\n \nRevise only what is reasonably correctable in article content while preserving all verified facts, names, dates, quotations, hyperlinks, HTML structure, images, FAQ meaning and headings. Keep the revised article at or below {{max_words}} words. The focus keyword may be placed naturally in the introduction or a relevant heading if absent, but never repeat it artificially. Do not satisfy a plugin check at the expense of accuracy or clarity. Use Markdown ## H2 and ### H3 as in the original. Output only the full revised article in {{language}}.\n \nArticle:\n{{final_article}}",
  },
  {
    moduleKey: "tigram",
    stageKey: "ARTICLE",
    name: "Article",
    description: "General/Tigram article with SEO TITLE / META DESCRIPTION / URL SLUG header lines.",
    version: 1,
    content: "Write a well-researched, helpful, original, reader-friendly SEO article for a {{country}} audience in {{language}}.\nPrimary keyword: \"{{keyword}}\"\n{{#if secondary_keywords}}Secondary keywords (use only where natural): {{secondary_keywords}}{{/if}}\nWord target: {{word_range}}.\n \nStart with exactly these three machine-readable lines:\nSEO TITLE: <clear title under 60 characters with the primary keyword where possible>\nMETA DESCRIPTION: <specific description between 100 and 150 characters>\nURL SLUG: <clear lower-case words separated by hyphens>\n \nThen deliver the full article as Markdown, without a redundant title heading or introductory chatbot commentary. Start with an interesting, direct introduction of approximately 100–150 words that uses the primary keyword naturally in the first 100 words. Follow with a direct-answer paragraph of around 40–60 words where that format matches reader intent. Use 5–7 substantial ## H2 sections; add ### H3 headings only when useful. Include one practical step-by-step explanation and one meaningful comparison/pros-cons table if the topic lends itself to them. Include a ## Frequently Asked Questions section with seven specific ### H3 questions and brief answers. End with ## Conclusion and a relevant, non-salesy next step.\n \nKeep paragraphs easy to follow and varied in length. Distinguish verified facts from estimates, opinions, unsupported product claims and current information you cannot confirm. Do not pretend to have tested software or products unless the research actually provides that evidence. No fabricated statistics, links, release dates, quotations or testimonials. No empty filler sections. The primary goal is to solve the reader's question, not to game a plugin score.",
  },
  {
    moduleKey: "tigram",
    stageKey: "CATEGORY",
    name: "Category",
    description: "Chooses exactly one synchronized WordPress category.",
    version: 1,
    content: "Select exactly one suitable WordPress category for the article about \"{{keyword}}\" from this list:\n{{categories}}\n \nChoose only a category literally present in the list. Output a single line:\nCATEGORY: <exact category name>",
  },
  {
    moduleKey: "tigram",
    stageKey: "IMAGE_PLAN",
    name: "Image plan",
    description: "FEATURED / BODY1 / BODY2 image briefs with alt text.",
    version: 1,
    content: "Create a practical 3-image plan for the article about \"{{keyword}}\" using the final article's actual topic. One image is a 16:9 featured visual with space for a short editorial headline and the website logo. Two are helpful body illustrations with no text, watermark or logo. Avoid inaccurate depictions of branded UIs, real people, proprietary logos or product details you cannot verify.\n \nReturn exactly three lines:\nFEATURED: <visual direction> | ALT: <specific accessible alt text>\nBODY1: <visual direction> | ALT: <specific accessible alt text>\nBODY2: <visual direction> | ALT: <specific accessible alt text>",
  },
  {
    moduleKey: "tigram",
    stageKey: "IMAGE_GENERATION",
    name: "Image generation",
    description: "Creates one editorial illustration from an approved brief.",
    version: 1,
    content: "Create one clean editorial illustration based on this approved image brief:\n{{image_brief}}\n \nUse the specified 16:9 composition, readable shapes, professional lighting and clear focal subject. Follow the website's configured visual style. Keep the content visually relevant and accurate; avoid unnecessary text, watermarks, third-party logos, false UI screenshots and unrequested people. No surrounding explanation.",
  },
  {
    moduleKey: "shared",
    stageKey: "HUMANIZE",
    name: "Editorial humanizer",
    description: "Fact-locked paragraph editing in [P#] batches (Appendix B).",
    version: 1,
    content: "You are a senior magazine editor. Improve the labelled paragraphs below so they read as careful, natural, precise editorial writing. This is an editorial improvement task, not a request to fool AI-detection software.\n \nNon-negotiable constraints:\n1. Preserve every factual claim and all existing uncertainty. Do not add facts, examples, quotes, sources, statistics or first-hand experience.\n2. Preserve names, dates, numbers, quoted words and the number of occurrences of \"{{keyword}}\" within each individual paragraph.\n3. Preserve every exact link mark {L1}anchor{/L1} and every {b}bold{/b} and {i}italic{/i} span with identical inner text.\n4. Keep the language and regional spelling of each paragraph unchanged.\n5. Remove empty phrases such as “It is important to note”, “It is worth noting”, “This highlights” and “In conclusion” when they add nothing.\n6. Avoid opening sentences with Additionally, Furthermore, Moreover, Notably, Overall or Ultimately; connect ideas by meaning.\n7. Replace inflated words such as delve, pivotal, intricate, meticulous, underscore, showcase, testament, tapestry, realm, vibrant, embark, navigate, leverage, foster, crucial, remarkable, renowned and boasts with plain, accurate language where appropriate.\n8. Vary sentence length naturally. Do not insert deliberate errors, slang, awkward fragments or artificial quirks.\n9. Prefer commas and full stops over excessive em dashes. Keep each output as one paragraph with roughly the same length as its original (normally within 20%).\n10. If a paragraph is already clear, preserve it or make only a very small change. Do not make a guess sound certain.\n \nSpecific issues identified by the local editor:\n{{problems}}\n \nReply with only the edited paragraphs in the same numbered order. Put each original label alone on a line, followed by its single edited paragraph, for example:\n[P4]\nEdited paragraph text.\n \nNo titles, notes, code fences, introductions, explanations or extra paragraphs.\n \nParagraphs:\n{{paragraphs}}",
  },
  {
    moduleKey: "celebrity-v2",
    stageKey: "ARTICLE",
    name: "Owner single-response article",
    description: "Paste your exact long-article prompt here. Stored unmodified; only {{keyword}} is injected.",
    version: 1,
    content: "Primary Keyword: {{keyword}}\n\nWrite a complete, fact-conscious celebrity biography article in {{language}} for readers in {{country}}. Return clearly labelled sections: H1, Main Article (Markdown ## and ### headings), Quick Bio (two-column HTML table), Five FAQs (QUESTION:/ANSWER:), Final Thoughts, Meta Description, Suggested URL Slug, Tags (8–12, comma-separated), Internal-link anchors and Research Notes. Never invent dates, partners, children, height or net worth; use \"Not publicly confirmed\" where needed.",
  },
];

/** Hashes of previously shipped defaults per module/stage, used to decide whether an upgrade may replace the stored text. */
export const PREVIOUS_DEFAULT_HASHES: Record<string, string[]> = {};

export function findDefaultPrompt(moduleKey: string, stageKey: string): DefaultPrompt | undefined {
  return DEFAULT_PROMPTS.find((p) => p.moduleKey === moduleKey && p.stageKey === stageKey);
}
