import { prisma } from '@/lib/db';
import { agentRoute } from '@/lib/agent/route';
import { ClaimSchema, claim } from '@/lib/agent/service';

export const dynamic = 'force-dynamic';
export const POST = agentRoute(ClaimSchema, (body) => claim(prisma, body));
