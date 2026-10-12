/** Client-safe writer manifests. Server pipelines are registered separately in src/worker/pipeline/registry.ts. */
export interface ModuleStageInfo {
  key: string;
  label: string;
  kind: 'chatgpt' | 'local' | 'gate' | 'wordpress';
  promptKey?: string;
}

export interface ModuleManifest {
  key: string;
  name: string;
  group: 'Celebrity' | 'General';
  icon: string;
  description: string;
  stages: ModuleStageInfo[];
  prompts: string[];
  available: boolean;
}

const tail: ModuleStageInfo[] = [
  { key: 'EXTERNAL_LINKS', label: 'External links', kind: 'chatgpt', promptKey: 'EXTERNAL_LINKS' },
  { key: 'IMAGES', label: 'Images', kind: 'local' },
  { key: 'HUMANIZE', label: 'Editorial humanizer', kind: 'chatgpt', promptKey: 'HUMANIZE' },
  { key: 'ASSEMBLY', label: 'Assembly', kind: 'local' },
  { key: 'SEO_CHECK', label: 'SEO & quality check', kind: 'local' },
  { key: 'ARTICLE_APPROVAL', label: 'Article approval', kind: 'gate' },
  { key: 'WORDPRESS_DRAFT', label: 'WordPress draft', kind: 'wordpress' },
  { key: 'RANKMATH', label: 'Rank Math', kind: 'wordpress' },
];

export const MODULES: ModuleManifest[] = [
  {
    key: 'celebrity-v1',
    name: 'Celebrity Writer 1.0',
    group: 'Celebrity',
    icon: 'UserRound',
    description: 'Multi-stage biography pipeline: titles → research → long → final → FAQs → Quick Bio.',
    stages: [
      { key: 'TITLES', label: 'Titles', kind: 'chatgpt', promptKey: 'TITLES' },
      { key: 'TITLE_APPROVAL', label: 'Title approval', kind: 'gate' },
      { key: 'RESEARCH', label: 'Research', kind: 'chatgpt', promptKey: 'RESEARCH' },
      { key: 'LONG_ARTICLE', label: 'Long article', kind: 'chatgpt', promptKey: 'LONG_ARTICLE' },
      { key: 'FINAL_ARTICLE', label: 'Final article', kind: 'chatgpt', promptKey: 'FINAL_ARTICLE' },
      { key: 'FAQS', label: 'FAQs', kind: 'chatgpt', promptKey: 'FAQS' },
      { key: 'QUICK_BIO', label: 'Quick Bio', kind: 'chatgpt', promptKey: 'QUICK_BIO' },
      ...tail,
    ],
    prompts: ['TITLES', 'RESEARCH', 'LONG_ARTICLE', 'FINAL_ARTICLE', 'FAQS', 'QUICK_BIO', 'EXTERNAL_LINKS', 'HUMANIZE', 'SEO_CORRECTION', 'PHOTO_CHECK'],
    available: true,
  },
  {
    key: 'celebrity-v2',
    name: 'Celebrity Writer 2.0',
    group: 'Celebrity',
    icon: 'Sparkles',
    description: "Single-response writer using the owner's exact long-article prompt (never rewritten).",
    stages: [{ key: 'ARTICLE', label: 'Article (single response)', kind: 'chatgpt', promptKey: 'ARTICLE' }, ...tail],
    prompts: ['ARTICLE', 'EXTERNAL_LINKS', 'HUMANIZE', 'SEO_CORRECTION'],
    available: true,
  },
  {
    key: 'tigram',
    name: 'Tigram / General Writer',
    group: 'General',
    icon: 'Newspaper',
    description: 'Software, apps, games, how-to and explainers with SEO header lines and category selection.',
    stages: [
      { key: 'ARTICLE', label: 'Article', kind: 'chatgpt', promptKey: 'ARTICLE' },
      { key: 'CATEGORY', label: 'Category', kind: 'chatgpt', promptKey: 'CATEGORY' },
      ...tail,
    ],
    prompts: ['ARTICLE', 'CATEGORY', 'IMAGE_PLAN', 'IMAGE_GENERATION', 'EXTERNAL_LINKS', 'HUMANIZE', 'SEO_CORRECTION'],
    available: true,
  },
];

export function getManifest(key: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.key === key);
}
