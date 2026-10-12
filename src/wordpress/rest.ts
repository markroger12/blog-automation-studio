import type { Page } from 'playwright';

/**
 * Calls the WordPress REST API from inside the authenticated admin page using the page's own
 * REST nonce (wpApiSettings.nonce). No passwords or application passwords are used or stored.
 */
export async function getRestNonce(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as unknown as { wpApiSettings?: { nonce?: string } };
    return w.wpApiSettings?.nonce ?? null;
  });
}

export async function wpRest<T>(page: Page, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const nonce = await getRestNonce(page);
  if (!nonce) throw new Error('WordPress REST nonce not found on the admin page (session may have expired).');
  return page.evaluate(
    async ({ path, init, nonce }) => {
      const root = (window as unknown as { wpApiSettings?: { root?: string } }).wpApiSettings?.root ?? '/wp-json/';
      const url = root.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, data: data as never };
    },
    { path, init, nonce },
  );
}
