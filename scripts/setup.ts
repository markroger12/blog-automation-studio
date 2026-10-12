import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
for (const d of ['', 'profiles', 'media', 'logs', 'screenshots', 'backups', 'chatgpt-chrome']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(envPath, example.replace('SESSION_SECRET=""', `SESSION_SECRET="${secret}"`), { mode: 0o600 });
  console.log('✔ Created .env with a random SESSION_SECRET');
} else console.log('✔ .env exists (left unchanged)');

console.log('… Applying database migrations (never resets data)');
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
execSync('npx prisma generate', { stdio: 'inherit' });
execSync('npx tsx scripts/seed.ts', { stdio: 'inherit' });

async function checkBrowser() {
  try {
    const { chromium } = await import('playwright');
    const channel = (process.env.BROWSER_CHANNEL ?? 'chrome') as string;
    const b = await chromium.launch({ headless: true, ...(channel === 'chromium' ? {} : { channel }) });
    console.log(`✔ Browser channel "${channel}" is available (${b.version()})`);
    await b.close();
  } catch (e) {
    console.warn(`⚠ Could not launch the configured browser: ${(e as Error).message.split('\n')[0]}\n  Install Google Chrome, or set BROWSER_CHANNEL=msedge / chromium in .env (for chromium run: npx playwright install chromium).`);
  }
}

void checkBrowser().then(() => {
  console.log(`\nNext steps:\n  1. npm run dev:all\n  2. Open http://localhost:3000 and create the first admin account\n  3. Settings → Extension → generate a connection key, then follow /automation-chrome\n  4. Websites → add a site → Login (manual) → Sync categories\n`);
});
