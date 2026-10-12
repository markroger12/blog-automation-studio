import { prisma } from '../src/lib/db';
import { seedSettingsIfMissing } from '../src/lib/settings';
import { seedPrompts } from '../src/modules/prompts/seed';

async function main() {
  const s = await seedSettingsIfMissing();
  const p = await seedPrompts(prisma);
  console.log(`✔ Settings ${s ? 'seeded' : 'preserved'}; prompts created ${p.created.length}, upgraded ${p.upgraded.length}, custom preserved ${p.preservedCustom.length}`);
}
main().finally(() => prisma.$disconnect());
