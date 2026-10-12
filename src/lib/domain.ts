import { z } from 'zod';

export const ROLES = ['ADMIN', 'EDITOR'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const TASK_STATUSES = [
  'QUEUED',
  'OPENING_CHATGPT',
  'GENERATING_TITLES',
  'AWAITING_TITLE_APPROVAL',
  'RESEARCHING',
  'WRITING_ARTICLE',
  'OPTIMIZING',
  'GENERATING_FAQS',
  'GENERATING_BIO_TABLE',
  'SEO_CHECKING',
  'AWAITING_ARTICLE_APPROVAL',
  'OPENING_WORDPRESS',
  'CREATING_DRAFT',
  'RUNNING_RANKMATH',
  'DRAFT_CREATED',
  'NEEDS_REVIEW',
  'LOGIN_REQUIRED',
  'FAILED',
  'CANCELLED',
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TERMINAL_STATUSES: TaskStatus[] = ['DRAFT_CREATED', 'FAILED', 'CANCELLED'];
export const PAUSED_STATUSES: TaskStatus[] = ['AWAITING_TITLE_APPROVAL', 'AWAITING_ARTICLE_APPROVAL', 'NEEDS_REVIEW', 'LOGIN_REQUIRED'];

export const STAGE_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const JOB_STATUSES = ['WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const QUEUES = ['article', 'chatgpt', 'control', 'workflow', 'humanizer', 'wordpress'] as const;
export type QueueName = (typeof QUEUES)[number];

export const LANGUAGES = ['English', 'German'] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

export const EDITOR_TYPES = ['AUTO', 'GUTENBERG', 'CLASSIC'] as const;
export const PROFILE_KINDS = ['CHATGPT', 'WORDPRESS', 'GENERIC'] as const;
export const SESSION_STATES = ['UNKNOWN', 'ACTIVE', 'LOGIN_REQUIRED', 'ERROR'] as const;

export const EXTENSION_FAIL_CODES = ['LOGIN', 'HUMAN_CHECK', 'CONVERSATION_LOST', 'USAGE_LIMIT', 'CANCELLED', 'ERROR'] as const;
export type ExtensionFailCode = (typeof EXTENSION_FAIL_CODES)[number];

export const statusTone: Record<TaskStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  QUEUED: 'neutral',
  OPENING_CHATGPT: 'info',
  GENERATING_TITLES: 'info',
  AWAITING_TITLE_APPROVAL: 'warning',
  RESEARCHING: 'info',
  WRITING_ARTICLE: 'info',
  OPTIMIZING: 'info',
  GENERATING_FAQS: 'info',
  GENERATING_BIO_TABLE: 'info',
  SEO_CHECKING: 'info',
  AWAITING_ARTICLE_APPROVAL: 'warning',
  OPENING_WORDPRESS: 'info',
  CREATING_DRAFT: 'info',
  RUNNING_RANKMATH: 'info',
  DRAFT_CREATED: 'success',
  NEEDS_REVIEW: 'warning',
  LOGIN_REQUIRED: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export const KeywordListSchema = z.array(z.string().trim().min(1).max(200)).max(50);

export function normalizeKeyword(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
