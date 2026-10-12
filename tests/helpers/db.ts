import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export function makeTestDb(): PrismaClient {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bas-db-'));
  const url = `file:${path.join(dir, 'test.db')}`;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  return new PrismaClient({ datasources: { db: { url } } });
}

export function chromeExecutable(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of ['/usr/bin/google-chrome', `${os.homedir()}/.local/bin/google-chrome`, 'C:/Program Files/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(p)) return p;
  return undefined;
}
