export type BrowserChannel = 'chrome' | 'msedge' | 'chromium';

/** BROWSER_EXECUTABLE_PATH (an installed Chrome binary) wins over BROWSER_CHANNEL. */
export function browserLaunchTarget(channel?: BrowserChannel): { channel?: string; executablePath?: string; label: string } {
  const exe = process.env.BROWSER_EXECUTABLE_PATH?.trim();
  if (exe) return { executablePath: exe, label: exe };
  const ch = channel ?? (process.env.BROWSER_CHANNEL as BrowserChannel | undefined) ?? 'chrome';
  return ch === 'chromium' ? { label: 'chromium' } : { channel: ch, label: ch };
}
