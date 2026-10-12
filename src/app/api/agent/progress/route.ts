import { prisma } from '@/lib/db';
import { agentRoute } from '@/lib/agent/route';
import { ProgressSchema, progress } from '@/lib/agent/service';

export const dynamic = 'force-dynamic';
export const POST = agentRoute(ProgressSchema, (body) => progress(prisma, body));
