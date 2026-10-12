'use client';

function csrf(): string {
  const m = document.cookie.match(/(?:^|; )bas_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = Array.isArray(data.details) ? ` — ${data.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join('; ')}` : '';
      throw new ApiError(res.status, `${data.error ?? `Request failed (${res.status})`}${details}`, data.details);
    }
    return data as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError(0, 'The request timed out. Check that the app is running and try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
