import 'server-only';
import { cookies } from 'next/headers';
import { randomToken } from '../hash';
import { CSRF_COOKIE, SESSION_COOKIE, sessionCookieOptions, signSession } from './session';

export async function startSession(user: { id: string; email: string; name: string; role: string }, secure: boolean) {
  const csrf = randomToken(24);
  const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role as 'ADMIN' | 'EDITOR', csrf });
  const store = await cookies();
  const opts = sessionCookieOptions(secure);
  store.set(SESSION_COOKIE, token, opts);
  // Readable by same-origin JS for the double-submit header; useless to other origins.
  store.set(CSRF_COOKIE, csrf, { ...opts, httpOnly: false });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

export function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}
