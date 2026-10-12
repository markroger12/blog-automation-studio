import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiRoute, audit, HttpError } from '@/lib/auth/server';
import { validateTemplate } from '@/lib/template';
import { sha256 } from '@/lib/hash';
import { DEFAULT_PROMPTS } from '@/modules/prompts/defaults';

const Body = z.object({ content: z.string().min(1).max(100_000) }).or(z.object({ restoreDefault: z.literal(true) }));

/** Saves owner prompt text byte-for-byte (no trimming or rewriting). Previous text is archived. */
export const PUT = apiRoute({ role: 'ADMIN', schema: Body }, async ({ body, params, session }) => {
  const t = await prisma.promptTemplate.findUnique({ where: { id: params.id } });
  if (!t) throw new HttpError(404, 'Prompt not found');
  let content: string;
  if ('restoreDefault' in body) {
    const def = DEFAULT_PROMPTS.find((d) => d.moduleKey === t.moduleKey && d.stageKey === t.stageKey);
    if (!def) throw new HttpError(404, 'No shipped default for this prompt');
    content = def.content;
  } else content = body.content;
  const v = validateTemplate(content);
  if (!v.ok) throw new HttpError(400, `Template error: ${v.error}`);
  await prisma.$transaction([
    prisma.promptTemplateHistory.create({ data: { templateId: t.id, content: t.content, note: 'restoreDefault' in body ? 'Restored default' : 'Edited by owner' } }),
    prisma.promptTemplate.update({ where: { id: t.id }, data: { content, variables: JSON.stringify(v.variables), customized: sha256(content) !== t.defaultHash } }),
  ]);
  await audit(session.sub, 'prompt.update', `${t.moduleKey}/${t.stageKey}`);
  return { ok: true, variables: v.variables };
});
