import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const client = new PrismaClient({ log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'] });
  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let pragmasApplied = false;
/** WAL + busy timeout so the dashboard and the single worker can share SQLite safely. */
export async function applySqlitePragmas(client: PrismaClient = prisma): Promise<void> {
  if (pragmasApplied) return;
  pragmasApplied = true;
  await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await client.$queryRawUnsafe('PRAGMA busy_timeout=10000;');
  await client.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
