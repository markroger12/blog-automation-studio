import { prisma } from '@/lib/db';
import { agentRoute } from '@/lib/agent/route';
import { CompleteSchema, complete } from '@/lib/agent/service';

export const dynamic = 'force-dynamic';
export const POST = agentRoute(CompleteSchema, (body) => complete(prisma, body));
