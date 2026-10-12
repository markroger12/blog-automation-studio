import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { browserLaunchTarget } from '../src/lib/browser';

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
try {
  execSync('npx prisma migrate deploy', { stdio: ['inherit', 'inherit', 'pipe'] });
} catch (e) {
  const stderr = String((e as { stderr?: Buffer }).stderr ?? '');
  process.stderr.write(stderr);
  if (/database is locked/i.test(stderr)) console.error('\n✖ The database is in use. Stop `npm run dev:all` (dashboard and worker), then run `npm run setup` again. No data was changed.');
  process.exit(1);
}
execSync('npx prisma generate', { stdio: 'inherit' });
execSync('npx tsx scripts/seed.ts', { stdio: 'inherit' });

async function checkBrowser() {
  try {
    const { chromium } = await import('playwright');
    const { label, ...target } = browserLaunchTarget();
    const b = await chromium.launch({ headless: true, ...target });
    console.log(`✔ Browser "${label}" is available (${b.version()})`);
    await b.close();
  } catch (e) {
    console.warn(`⚠ Could not launch the configured browser: ${(e as Error).message.split('\n')[0]}\n  Install Google Chrome, or set BROWSER_EXECUTABLE_PATH to your Chrome binary, or BROWSER_CHANNEL=msedge / chromium in .env (for chromium run: npx playwright install chromium).`);
  }
}

void checkBrowser().then(() => {
  console.log(`\nNext steps:\n  1. npm run dev:all\n  2. Open http://localhost:3000 and create the first admin account\n  3. Settings → Extension → generate a connection key, then follow /automation-chrome\n  4. Websites → add a site → Login (manual) → Sync categories\n`);
});
