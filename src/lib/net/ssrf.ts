import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower) || lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8');
  }
  return true;
}

export interface UrlCheckOptions {
  allowHttp?: boolean;
  resolver?: (host: string) => Promise<string[]>;
}

const defaultResolver = async (host: string) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Validates protocol, credentials, port and that every resolved address is public. */
export async function assertPublicUrl(raw: string, opts: UrlCheckOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && !(opts.allowHttp !== false && url.protocol === 'http:')) throw new SsrfError(`Blocked protocol ${url.protocol}`);
  if (url.username || url.password) throw new SsrfError('URLs with credentials are not allowed');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new SsrfError(`Blocked port ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new SsrfError(`Blocked internal host ${host}`);
  const addrs = net.isIP(host) ? [host] : await (opts.resolver ?? defaultResolver)(host).catch(() => {
    throw new SsrfError(`DNS lookup failed for ${host}`);
  });
  if (!addrs.length) throw new SsrfError(`No addresses for ${host}`);
  for (const a of addrs) if (isPrivateIp(a)) throw new SsrfError(`Blocked private address ${a} for ${host}`);
  return url;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  redirects: string[];
}

/** Fetch with SSRF checks repeated on every redirect, no cookies/auth, size and time caps. */
export async function safeFetch(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; method?: 'GET' | 'HEAD'; resolver?: UrlCheckOptions['resolver']; accept?: string } = {},
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const redirects: string[] = [];
  let current = raw;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    for (let i = 0; i <= maxRedirects; i++) {
      const url = await assertPublicUrl(current, { resolver: opts.resolver });
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        credentials: 'omit',
        headers: { 'user-agent': 'BlogAutomationStudio/3.0 (+link-verification)', accept: opts.accept ?? 'text/html,application/xhtml+xml,*/*;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, url).toString();
        redirects.push(current);
        continue;
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new SsrfError(`Response exceeded ${maxBytes} bytes`);
          }
          chunks.push(value);
        }
      }
      return { finalUrl: url.toString(), status: res.status, contentType: res.headers.get('content-type'), body: Buffer.concat(chunks), redirects };
    }
    throw new SsrfError(`Too many redirects (>${maxRedirects})`);
  } finally {
    clearTimeout(timer);
  }
}
