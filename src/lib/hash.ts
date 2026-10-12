import crypto from 'node:crypto';

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function normalizeForHash(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
