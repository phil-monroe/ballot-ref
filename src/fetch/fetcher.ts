import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type RobotsRules } from './robots.ts';
import { looksLikeErrorPage } from './html-text.ts';

export type FetchFailure = 'robots' | 'blocked' | 'maintenance' | 'http' | 'network';
export type FetchResult =
  | {
      ok: true;
      body: Buffer;
      contentType: string;
      method: 'direct' | 'playwright';
      retried: boolean;
    }
  | { ok: false; reason: FetchFailure; error: string };

export interface FetcherOptions {
  userAgent: string;
  rateLimitSeconds: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxAttempts?: number;
  /** Browser-driven fallback tried after retries fail; return null when unavailable. */
  fallback?: (url: string) => Promise<FetchResult | null>;
}

/** Robots-aware, rate-limited fetcher with retry/backoff and a fallback. Failures are returned, never thrown or hidden. */
export class Fetcher {
  private robots = new Map<string, Promise<RobotsRules>>();
  private lastRequest = new Map<string, number>();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxAttempts: number;

  constructor(private readonly opts: FetcherOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  private async throttle(host: string): Promise<void> {
    const wait =
      (this.lastRequest.get(host) ?? -Infinity) + this.opts.rateLimitSeconds * 1000 - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequest.set(host, this.now());
  }

  private robotsFor(url: URL): Promise<RobotsRules> {
    const key = url.origin;
    if (!this.robots.has(key)) {
      this.robots.set(
        key,
        (async () => {
          try {
            await this.throttle(url.host);
            const res = await this.fetchImpl(`${url.origin}/robots.txt`, {
              headers: { 'user-agent': this.opts.userAgent },
            });
            if (res.status >= 500) return DISALLOW_ALL; // unreachable robots.txt: stay out
            if (!res.ok) return ALLOW_ALL; // 4xx: no robots file
            return parseRobots(await res.text(), this.opts.userAgent);
          } catch {
            return DISALLOW_ALL;
          }
        })(),
      );
    }
    return this.robots.get(key)!;
  }

  async fetchUrl(rawUrl: string): Promise<FetchResult> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false, reason: 'network', error: `invalid URL ${rawUrl}` };
    }
    const rules = await this.robotsFor(url);
    if (!rules.allows(url.pathname + url.search)) {
      return { ok: false, reason: 'robots', error: `robots.txt disallows ${url.pathname}` };
    }

    let last: FetchResult = { ok: false, reason: 'network', error: 'no attempt made' };
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (attempt > 0) await this.sleep(1000 * 2 ** (attempt - 1));
      await this.throttle(url.host);
      last = await this.once(url, attempt > 0);
      if (last.ok) return last;
    }
    if (this.opts.fallback) {
      const fb = await this.opts.fallback(rawUrl);
      if (fb?.ok) return fb;
    }
    return last;
  }

  private async once(url: URL, retried: boolean): Promise<FetchResult> {
    try {
      const res = await this.fetchImpl(url, { headers: { 'user-agent': this.opts.userAgent } });
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      if (res.status === 403 || res.status === 401)
        return { ok: false, reason: 'blocked', error: `HTTP ${res.status}` };
      if (!res.ok)
        return {
          ok: false,
          reason: res.status === 503 ? 'maintenance' : 'http',
          error: `HTTP ${res.status}`,
        };
      const body = Buffer.from(await res.arrayBuffer());
      if (/html/i.test(contentType) && looksLikeErrorPage(body.toString('utf8'))) {
        return {
          ok: false,
          reason: 'maintenance',
          error: 'page looks like a maintenance or block page',
        };
      }
      return { ok: true, body, contentType, method: 'direct', retried };
    } catch (e) {
      return { ok: false, reason: 'network', error: e instanceof Error ? e.message : String(e) };
    }
  }
}
