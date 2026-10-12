import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default('file:../data/app.db'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters. Run `npm run setup`.'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  BROWSER_CHANNEL: z.enum(['chrome', 'msedge', 'chromium']).default('chrome'),
  SERPER_API_KEY: z.string().optional(),
  WP_E2E_ADMIN_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}
