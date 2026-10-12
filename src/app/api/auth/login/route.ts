import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/auth/rate-limit';
import { isSecure, startSession } from '@/lib/auth/login';
import { audit, errorResponse, HttpError } from '@/lib/auth/server';

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(500) });

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) throw new HttpError(403, 'Cross-origin request rejected');
    const ip = req.headers.get('x-forwarded-for') ?? 'local';
    const { email, password } = Body.parse(await req.json());
    const rl = rateLimit(`login:${ip}:${email.toLowerCase()}`, 8, 15 * 60_000);
    if (!rl.ok) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} min.`);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await startSession(user, isSecure(req));
    await audit(user.id, 'auth.login', user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
