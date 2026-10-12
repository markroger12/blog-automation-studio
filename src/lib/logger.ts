import { prisma } from './db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_PATTERNS: RegExp[] = [
  /(bas_[A-Za-z0-9_-]{10,})/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /("?(?:password|passwd|secret|token|cookie|authorization|session)[^"]*"?\s*[:=]\s*)"[^"]*"/gi,
  /(__Secure-[A-Za-z0-9-]+=)[^;\s]+/g,
  /(wordpress_logged_in_[a-f0-9]*=)[^;\s]+/gi,
];

export function redact(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_m, p1: string) => `${p1 ?? ''}[REDACTED]`);
  }
  return out;
}

export interface LogInput {
  level?: LogLevel;
  category: string;
  message: string;
  taskId?: string | null;
  stage?: string | null;
  details?: unknown;
  screenshot?: string | null;
}

export async function log(input: LogInput): Promise<void> {
  const level = input.level ?? 'info';
  const message = redact(input.message).slice(0, 4000);
  const details = input.details === undefined ? null : redact(JSON.stringify(input.details)).slice(0, 20000);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${input.category}${input.stage ? `/${input.stage}` : ''} ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.LOG_QUIET !== '1') console.log(line);
  try {
    await prisma.log.create({
      data: {
        level,
        category: input.category,
        message,
        taskId: input.taskId ?? null,
        stage: input.stage ?? null,
        details,
        screenshot: input.screenshot ?? null,
      },
    });
  } catch (e) {
    console.error('Failed to persist log entry', (e as Error).message);
  }
}
