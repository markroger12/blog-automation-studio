import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, PasswordSchemaMin } from '@/lib/auth/password';
import { isSecure, startSession } from '@/lib/auth/login';
import { audit, errorResponse, HttpError } from '@/lib/auth/server';
import { seedSettingsIfMissing } from '@/lib/settings';
import { seedPrompts } from '@/modules/prompts/seed';

const Body = z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(200), password: z.string().min(PasswordSchemaMin).max(500) });

/** First-run only: creates the initial administrator. Disabled once any user exists. */
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) throw new HttpError(403, 'Cross-origin request rejected');
    const body = Body.parse(await req.json());
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new HttpError(409, 'Setup already completed. Sign in instead.');
      return tx.user.create({ data: { name: body.name, email: body.email.toLowerCase(), passwordHash, role: 'ADMIN' } });
    });
    await seedSettingsIfMissing();
    await seedPrompts(prisma);
    await startSession(user, isSecure(req));
    await audit(user.id, 'auth.setup', user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
