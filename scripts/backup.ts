import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/db';

/** Consistent online SQLite backup via VACUUM INTO (safe while the app runs). Media is copied alongside. */
async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'data', 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'app.db').replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target}'`);
  const media = path.join(process.cwd(), 'data', 'media');
  if (fs.existsSync(media)) fs.cpSync(media, path.join(dir, 'media'), { recursive: true });
  console.log(`✔ Backup written to ${dir}\n  Restore: stop the app, copy app.db over data/app.db (and media/), then run npm run setup.`);
}
main().finally(() => prisma.$disconnect());
