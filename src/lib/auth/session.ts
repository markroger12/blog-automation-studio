import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { RoleSchema } from '../domain';

export const SESSION_COOKIE = 'bas_session';
export const CSRF_COOKIE = 'bas_csrf';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

export const SessionClaimsSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  csrf: z.string(),
});
export type SessionClaims = z.infer<typeof SessionClaimsSchema>;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is missing or too short. Run `npm run setup`.');
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name, role: claims.role, csrf: claims.csrf })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .setIssuer('blog-automation-studio')
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'blog-automation-studio' });
    const parsed = SessionClaimsSchema.safeParse({ ...payload, sub: payload.sub });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  path: '/',
  maxAge: SESSION_TTL_SEC,
});
