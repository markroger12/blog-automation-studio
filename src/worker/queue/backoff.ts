/** Exponential backoff with cap and deterministic optional jitter (0..1). */
export function computeBackoffMs(attempt: number, baseSec: number, maxSec: number, jitter = 0): number {
  const exp = Math.min(maxSec, baseSec * 2 ** Math.max(0, attempt - 1));
  const withJitter = exp * (1 + Math.min(Math.max(jitter, 0), 1) * 0.2);
  return Math.round(Math.min(maxSec, withJitter) * 1000);
}

/** ChatGPT account-level backoff ladder from the specification (seconds). */
export const CHATGPT_BACKOFF_LADDER_SEC = [4, 30, 60, 120, 240, 300] as const;

export function chatgptBackoffMs(consecutive429: number, retryAfterSec?: number | null): number {
  const idx = Math.min(CHATGPT_BACKOFF_LADDER_SEC.length - 1, Math.max(0, consecutive429 - 1));
  const ladder = CHATGPT_BACKOFF_LADDER_SEC[idx] * 1000;
  const retryAfter = retryAfterSec && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;
  return Math.max(ladder, retryAfter);
}
