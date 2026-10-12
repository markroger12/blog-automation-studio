import { prisma } from '@/lib/db';
import { agentRoute } from '@/lib/agent/route';
import { HelloSchema, hello } from '@/lib/agent/service';

export const dynamic = 'force-dynamic';
export const POST = agentRoute(HelloSchema, (body) => hello(prisma, body));
