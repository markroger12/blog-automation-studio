import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import { prisma } from '../db';
import { AgentAuthError, authenticateAgent } from './service';

/** Extension endpoints: bearer key only (no cookies), JSON only, 2 MB cap. */
export function agentRoute<S extends z.ZodType>(schema: S, fn: (body: z.output<S>) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      await authenticateAgent(prisma, req.headers.get('authorization'));
      if (!(req.headers.get('content-type') ?? '').includes('application/json')) return NextResponse.json({ error: 'JSON required' }, { status: 415 });
      if (Number(req.headers.get('content-length') ?? 0) > 2_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
      const body = schema.parse(await req.json());
      return NextResponse.json(await fn(body), { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof AgentAuthError) return NextResponse.json({ error: e.message }, { status: e.message.includes('owns') ? 409 : 401 });
      if (e instanceof ZodError) return NextResponse.json({ error: 'Validation failed', details: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
