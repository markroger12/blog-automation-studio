import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import { CSRF_COOKIE, SESSION_COOKIE, verifySession, type SessionClaims } from './session';
import type { Role } from '../domain';
import { prisma } from '../db';

export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requirePageSession(role?: Role): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) {
    const count = await prisma.user.count();
    redirect(count === 0 ? '/setup' : '/login');
  }
  if (role === 'ADMIN' && session.role !== 'ADMIN') redirect('/?error=forbidden');
  return session;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Same-origin + double-submit CSRF check for state-changing dashboard requests. */
export async function assertSameOriginAndCsrf(req: Request, session: SessionClaims): Promise<void> {
  const h = await headers();
  const origin = req.headers.get('origin');
  const host = h.get('host');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'Invalid Origin header');
    }
    if (originHost !== host) throw new HttpError(403, 'Cross-origin request rejected');
  } else {
    const fetchSite = req.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') throw new HttpError(403, 'Cross-site request rejected');
  }
  const token = req.headers.get('x-csrf-token');
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  if (!token || token !== session.csrf || cookieToken !== session.csrf) throw new HttpError(403, 'Missing or invalid CSRF token. Reload the page and try again.');
}

type Handler<T> = (ctx: { req: Request; session: SessionClaims; body: T; params: Record<string, string> }) => Promise<unknown>;

export function apiRoute<S extends z.ZodType = z.ZodUndefined>(
  opts: { role?: Role; schema?: S; mutating?: boolean },
  handler: Handler<z.output<S>>,
) {
  type T = z.output<S>;
  return async (req: Request, routeCtx: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, 'Not signed in');
      if (opts.role === 'ADMIN' && session.role !== 'ADMIN') throw new HttpError(403, 'Administrator role required');
      const mutating = opts.mutating ?? req.method !== 'GET';
      if (mutating) await assertSameOriginAndCsrf(req, session);
      let body = undefined as T;
      if (opts.schema) {
        const len = Number(req.headers.get('content-length') ?? '0');
        if (len > 5_000_000) throw new HttpError(413, 'Request body too large');
        const json = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
        body = opts.schema.parse(json);
      }
      const params = routeCtx?.params ? await routeCtx.params : {};
      const result = await handler({ req, session, body, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Validation failed', details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: (e as Error)?.message ?? 'Unexpected error' }, { status: 500 });
}

export async function audit(userId: string | null, action: string, target: string, details: unknown = {}): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, target, details: JSON.stringify(details) } });
}
