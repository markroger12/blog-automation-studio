import type { PipelineDefinition } from './types';
import { celebrityV1Pipeline } from '@/modules/celebrity-v1/pipeline';
import { celebrityV2Pipeline } from '@/modules/celebrity-v2/pipeline';
import { tigramPipeline } from '@/modules/tigram/pipeline';

const pipelines: Record<string, PipelineDefinition> = {
  [celebrityV1Pipeline.moduleKey]: celebrityV1Pipeline,
  [celebrityV2Pipeline.moduleKey]: celebrityV2Pipeline,
  [tigramPipeline.moduleKey]: tigramPipeline,
};

export function getPipeline(moduleKey: string): PipelineDefinition {
  const p = pipelines[moduleKey];
  if (!p) throw new Error(`Unknown writer module "${moduleKey}"`);
  return p;
}
