import path from 'node:path';
import fs from 'node:fs';

export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
export const CHATGPT_PROFILE_DIR = path.join(DATA_DIR, 'chatgpt-chrome');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
export const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function toSafeSlug(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug || 'site';
}

export function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG.test(slug);
}

/**
 * Resolve `relative` under `base`, rejecting traversal, absolute paths, drive letters and NUL bytes.
 * Works with Windows and POSIX separators.
 */
export function safeJoin(base: string, ...relative: string[]): string {
  for (const part of relative) {
    if (part.includes('\0')) throw new Error('Invalid path: NUL byte');
    if (path.isAbsolute(part) || /^[a-zA-Z]:/.test(part) || part.startsWith('\\\\')) {
      throw new Error('Invalid path: absolute paths are not allowed');
    }
  }
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...relative);
  const rel = path.relative(resolvedBase, target);
  if (rel === '' ) return target;
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid path: traversal outside base directory');
  return target;
}

export function profileDirForSlug(slug: string): string {
  if (!isSafeSlug(slug)) throw new Error(`Invalid profile slug "${slug}"`);
  return safeJoin(PROFILES_DIR, slug);
}
