import { z } from 'zod';

export const BrowserSettingsSchema = z.object({
  mode: z.enum(['headless', 'headed']).default('headless'),
  navigationTimeoutSec: z.number().int().min(10).max(300).default(60),
  generationTimeoutSec: z.number().int().min(60).max(1800).default(600),
  screenshots: z.boolean().default(true),
  chatgptUrl: z.string().url().default('https://chatgpt.com/'),
  chatgptChromeMode: z.enum(['separate', 'existing']).default('separate'),
});

export const WorkflowSettingsSchema = z.object({
  manualTitleApproval: z.boolean().default(false),
  manualArticleApproval: z.boolean().default(false),
  autoSendToWordPress: z.boolean().default(true),
  createMissingCategory: z.boolean().default(false),
  taskConcurrency: z.number().int().min(1).max(5).default(3),
  adaptiveConcurrency: z.boolean().default(true),
  maxTaskConcurrency: z.number().int().min(1).max(5).default(5),
  targetArticlesPerHour: z.number().int().min(1).max(30).default(6),
  highThroughputMode: z.boolean().default(true),
  retryAttempts: z.number().int().min(0).max(10).default(2),
  workflowCelebrityWriter: z.enum(['1.0', '2.0']).default('1.0'),
});

export const ContentSettingsSchema = z.object({
  maxArticleWordCount: z.number().int().min(300).max(5000).default(1300),
  minKeywordOccurrences: z.number().int().min(0).max(100).default(15),
  maxKeywordOccurrences: z.number().int().min(0).max(100).default(18),
  faqCount: z.number().int().min(1).max(15).default(5),
  quickBioRows: z.number().int().min(4).max(25).default(12),
  defaultLanguage: z.enum(['English', 'German']).default('English'),
  targetCountry: z.string().min(2).max(60).default('United States'),
  keywordDensityCeiling: z.number().min(0.5).max(10).default(2.5),
  generalWordRange: z.string().default('1,200–1,600 words'),
});

export const SeoSettingsSchema = z.object({
  reviewThreshold: z.number().int().min(0).max(100).default(70),
  rankMathTargetScore: z.number().int().min(0).max(100).default(75),
  maxRankMathAttempts: z.number().int().min(0).max(5).default(3),
  externalLinks: z.boolean().default(true),
  maxExternalLinks: z.number().int().min(0).max(10).default(5),
  articleImages: z.boolean().default(true),
  enhanceCelebrityImages: z.boolean().default(false),
  celebrityPhotoReview: z.boolean().default(false),
});

export const AdvancedSettingsSchema = z.object({
  selectorOverrides: z.record(z.string(), z.array(z.string())).default({}),
  diagnosticsRetentionDays: z.number().int().min(1).max(365).default(30),
  operationLeaseSeconds: z.number().int().min(30).max(3600).default(120),
  chatgptLeaseSeconds: z.number().int().min(60).max(3600).default(900),
  retryBaseDelaySec: z.number().int().min(1).max(600).default(15),
  retryMaxDelaySec: z.number().int().min(10).max(7200).default(900),
});

export const FeatureFlagsSchema = z.object({
  bulkCampaigns: z.boolean().default(true),
  smartRouter: z.boolean().default(true),
  researchEvidence: z.boolean().default(true),
  duplicateDetector: z.boolean().default(true),
  intelligentInternalLinks: z.boolean().default(true),
  imageStudio: z.boolean().default(true),
  qualityGate: z.boolean().default(true),
  smartRecovery: z.boolean().default(true),
  searchPerformance: z.boolean().default(true),
  contentRefresh: z.boolean().default(true),
  performanceAnalytics: z.boolean().default(true),
  autoPublishing: z.literal(false).default(false),
});

export const AppSettingsSchema = z.object({
  browser: BrowserSettingsSchema.default({}),
  workflow: WorkflowSettingsSchema.default({}),
  content: ContentSettingsSchema.default({}),
  seo: SeoSettingsSchema.default({}),
  advanced: AdvancedSettingsSchema.default({}),
  features: FeatureFlagsSchema.default({}),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export const SETTINGS_KEY = 'app';
export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

/** Per-site overrides: partial of the content/seo/workflow groups. */
export const SiteOverridesSchema = z.object({
  workflow: WorkflowSettingsSchema.partial().optional(),
  content: ContentSettingsSchema.partial().optional(),
  seo: SeoSettingsSchema.partial().optional(),
});
export type SiteOverrides = z.infer<typeof SiteOverridesSchema>;

export function mergeSettings(base: AppSettings, overrides: SiteOverrides | undefined): AppSettings {
  if (!overrides) return base;
  return AppSettingsSchema.parse({
    ...base,
    workflow: { ...base.workflow, ...(overrides.workflow ?? {}) },
    content: { ...base.content, ...(overrides.content ?? {}) },
    seo: { ...base.seo, ...(overrides.seo ?? {}) },
  });
}
