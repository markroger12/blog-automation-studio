import { prisma } from '@/lib/db';
import { agentRoute } from '@/lib/agent/route';
import { FailSchema, fail } from '@/lib/agent/service';

export const dynamic = 'force-dynamic';
export const POST = agentRoute(FailSchema, (body) => fail(prisma, body));
