/**
 * Central publication guard. Every outgoing WordPress editor mutation passes through here.
 * Only the approved scheduler flow, after a fresh canPublish check, may set publish/future/private/pending.
 */
export const PUBLISHING_STATUSES = ['publish', 'future', 'private', 'pending'] as const;

export class PublishBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishBlockedError';
  }
}

export interface GuardContext {
  /** Fresh value read from the database immediately before the action. */
  canPublish: boolean;
  /** True only inside the authorized scheduler path. */
  schedulerFlow: boolean;
}

export function extractRequestedStatus(body: string | null | undefined, url: string): string | null {
  const u = new URL(url, 'http://x');
  const qs = u.searchParams.get('status') ?? u.searchParams.get('post_status');
  if (qs) return qs;
  if (!body) return null;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const s = json.status ?? json.post_status;
    if (typeof s === 'string') return s;
  } catch {
    const params = new URLSearchParams(body);
    const s = params.get('post_status') ?? params.get('status') ?? (params.has('publish') ? 'publish' : null) ?? (params.get('original_publish') && params.has('publish') ? 'publish' : null);
    if (s) return s;
  }
  return null;
}

export function isPublishingStatus(status: string | null): boolean {
  return !!status && (PUBLISHING_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/** Throws unless the request is allowed. Used by the Playwright route interceptor and by server-side services. */
export function assertMutationAllowed(ctx: GuardContext, req: { method: string; url: string; body?: string | null }): void {
  if (req.method.toUpperCase() === 'GET' || req.method.toUpperCase() === 'HEAD') return;
  const status = extractRequestedStatus(req.body ?? null, req.url);
  if (!isPublishingStatus(status)) return;
  if (!ctx.canPublish) throw new PublishBlockedError(`Blocked attempt to set status "${status}": publishing is disabled for this website.`);
  if (!ctx.schedulerFlow) throw new PublishBlockedError(`Blocked attempt to set status "${status}" outside the authorized scheduler flow.`);
}

/** Matches WordPress endpoints that can change post status. */
export function isPostMutationUrl(url: string): boolean {
  return /\/wp-json\/wp\/v2\/(posts|pages)(\/\d+)?(\?|$)|[?&]rest_route=%2Fwp%2Fv2%2F(posts|pages)|\/wp-admin\/post\.php|\/wp-admin\/admin-ajax\.php/.test(url);
}
