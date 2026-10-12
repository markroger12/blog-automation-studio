import type { PrismaClient } from '@prisma/client';
import { sha256 } from '@/lib/hash';
import { listTemplateVariables } from '@/lib/template';
import { DEFAULT_PROMPTS, PREVIOUS_DEFAULT_HASHES } from './defaults';

export interface SeedPromptResult {
  created: string[];
  upgraded: string[];
  preservedCustom: string[];
}

/**
 * Seeds missing prompts once. A stored prompt is upgraded to a new shipped default only when its
 * current content still exactly equals a previously shipped default (i.e. the owner never edited it).
 */
export async function seedPrompts(db: PrismaClient): Promise<SeedPromptResult> {
  const result: SeedPromptResult = { created: [], upgraded: [], preservedCustom: [] };
  for (const def of DEFAULT_PROMPTS) {
    const key = `${def.moduleKey}/${def.stageKey}`;
    const hash = sha256(def.content);
    const existing = await db.promptTemplate.findUnique({ where: { moduleKey_stageKey: { moduleKey: def.moduleKey, stageKey: def.stageKey } } });
    const variables = JSON.stringify(listTemplateVariables(def.content));
    if (!existing) {
      await db.promptTemplate.create({
        data: { moduleKey: def.moduleKey, stageKey: def.stageKey, name: def.name, description: def.description, content: def.content, defaultHash: hash, defaultVersion: def.version, variables },
      });
      result.created.push(key);
      continue;
    }
    if (existing.defaultHash === hash) continue;
    const currentHash = sha256(existing.content);
    const knownOld = new Set([existing.defaultHash, ...(PREVIOUS_DEFAULT_HASHES[key] ?? [])]);
    if (!existing.customized && knownOld.has(currentHash)) {
      await db.promptTemplateHistory.create({ data: { templateId: existing.id, content: existing.content, note: `Replaced by shipped default v${def.version}` } });
      await db.promptTemplate.update({ where: { id: existing.id }, data: { content: def.content, defaultHash: hash, defaultVersion: def.version, variables } });
      result.upgraded.push(key);
    } else {
      await db.promptTemplate.update({ where: { id: existing.id }, data: { defaultHash: hash, defaultVersion: def.version } });
      result.preservedCustom.push(key);
    }
  }
  return result;
}
