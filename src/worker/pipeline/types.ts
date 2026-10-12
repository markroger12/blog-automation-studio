import type { ArticleTask, PrismaClient, Website } from '@prisma/client';
import type { TaskStatus } from '@/lib/domain';
import type { AppSettings } from '@/lib/settings-schema';

export type StageKind = 'chatgpt' | 'local' | 'gate' | 'wordpress';

export type StageResult =
  | { outcome: 'completed'; prompt?: string; output?: string; outputHtml?: string; data?: unknown }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'paused'; status: TaskStatus; message: string };

export interface AskOptions {
  attachments?: { name: string; mime: string; path: string }[];
  fresh?: boolean;
  newChat?: boolean;
}

export interface PipelineContext {
  db: PrismaClient;
  task: ArticleTask;
  website: Website | null;
  settings: AppSettings;
  workerId: string;
  /** Re-read task from DB (after updates). */
  reload(): Promise<ArticleTask>;
  updateTask(data: Partial<ArticleTask>): Promise<ArticleTask>;
  getStageOutput(stageKey: string): Promise<{ output: string | null; outputHtml: string | null; json: unknown } | null>;
  /**
   * Renders the stage prompt, persists it, and returns the completed answer.
   * If the answer is not available yet, throws WaitForExternal so the job parks without holding a lease.
   */
  askChatGPT(stageKey: string, promptKey: string, extra?: Record<string, unknown>, opts?: AskOptions): Promise<{ prompt: string; text: string; html: string | null; conversationUrl: string | null }>;
  checkCancelled(): Promise<void>;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, details?: unknown): Promise<void>;
  addReviewReason(reason: string): Promise<void>;
}

export interface PipelineStage {
  key: string;
  label: string;
  kind: StageKind;
  runningStatus: TaskStatus;
  progress: number;
  /** Stage keys whose output this stage consumes (for regeneration invalidation). */
  dependsOn: string[];
  run(ctx: PipelineContext): Promise<StageResult>;
}

export interface PipelineDefinition {
  moduleKey: string;
  stages: PipelineStage[];
  regenerationPlan(stageKey: string, task: ArticleTask): string[];
  variables(ctx: PipelineContext, extra?: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
  contextPrimer?(ctx: PipelineContext, stageKey: string): Promise<string | null>;
  finalize(ctx: PipelineContext): Promise<void>;
  afterRegeneration?(ctx: PipelineContext, stageKey: string): Promise<void>;
}

export class WaitForExternal extends Error {
  constructor(public readonly reason: string, public readonly retryAt?: Date) {
    super(reason);
    this.name = 'WaitForExternal';
  }
}

export class TaskCancelled extends Error {
  constructor() {
    super('Task was cancelled');
    this.name = 'TaskCancelled';
  }
}

export class FatalStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalStageError';
  }
}

export class LoginRequired extends Error {
  constructor(public readonly target: 'CHATGPT' | 'WORDPRESS', message: string) {
    super(message);
    this.name = 'LoginRequired';
  }
}

/** Computes the stage plus all transitive dependents, in pipeline order. */
export function dependentClosure(stages: PipelineStage[], stageKey: string): string[] {
  const affected = new Set<string>([stageKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of stages) {
      if (!affected.has(s.key) && s.dependsOn.some((d) => affected.has(d))) {
        affected.add(s.key);
        changed = true;
      }
    }
  }
  return stages.filter((s) => affected.has(s.key)).map((s) => s.key);
}
