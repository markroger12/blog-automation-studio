import readline from 'node:readline/promises';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (process.env.BAS_EMAIL ?? (await rl.question('Email: '))).trim().toLowerCase();
  const name = (process.env.BAS_NAME ?? (await rl.question('Name: '))).trim();
  const role = (process.env.BAS_ROLE ?? (await rl.question('Role (ADMIN/EDITOR) [EDITOR]: ')) ?? 'EDITOR').trim().toUpperCase() || 'EDITOR';
  const password = process.env.BAS_PASSWORD ?? (await rl.question('Password (min 10 chars): '));
  rl.close();
  if (!['ADMIN', 'EDITOR'].includes(role)) throw new Error('Role must be ADMIN or EDITOR');
  const user = await prisma.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
  console.log(`✔ Created ${user.role} ${user.email}`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
