import type { FetchResult } from './fetcher.ts';

interface PwPage {
  goto(
    url: string,
    o: { waitUntil: string },
  ): Promise<{ status(): number; headers(): Record<string, string> } | null>;
  content(): Promise<string>;
}
interface PwBrowser {
  newPage(o: { userAgent: string }): Promise<PwPage>;
  close(): Promise<void>;
}

/** Optional browser fallback. Returns null when Playwright is not installed ("needs manual import"). */
export function playwrightFallback(userAgent: string) {
  return async (url: string): Promise<FetchResult | null> => {
    const mod = 'playwright';
    let pw: { chromium: { launch(): Promise<PwBrowser> } };
    try {
      pw = await import(/* @vite-ignore */ mod);
    } catch {
      return null;
    }
    const browser = await pw.chromium.launch();
    try {
      const page = await browser.newPage({ userAgent });
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      if (!res || res.status() >= 400) return null;
      return {
        ok: true,
        body: Buffer.from(await page.content()),
        contentType: res.headers()['content-type'] ?? 'text/html',
        method: 'playwright',
        retried: true,
      };
    } finally {
      await browser.close();
    }
  };
}
