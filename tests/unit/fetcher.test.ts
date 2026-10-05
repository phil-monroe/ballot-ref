import { describe, expect, it } from 'vitest';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { htmlToText, looksLikeErrorPage } from '../../src/fetch/html-text.ts';
import { parseRobots } from '../../src/fetch/robots.ts';

type Route = (url: string) => Response;
function make(route: Route, over: Partial<ConstructorParameters<typeof Fetcher>[0]> = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  let t = 0;
  const fetcher = new Fetcher({
    userAgent: 'ballot-ref/0.1 (+test)',
    rateLimitSeconds: 2,
    fetchImpl: (async (u: string | URL) => {
      const url = String(u);
      calls.push(url);
      return route(url);
    }) as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    ...over,
  });
  return { fetcher, calls, sleeps };
}
const html = (body: string, status = 200) =>
  new Response(`<html><title>Page</title><body>${body}</body></html>`, {
    status,
    headers: { 'content-type': 'text/html' },
  });
const okPage = () => html('<p>' + 'Real candidate content. '.repeat(100) + '</p>');

describe('robots.txt', () => {
  const rules = parseRobots(
    'User-agent: *\nDisallow: /private\nAllow: /private/ok\n',
    'ballot-ref',
  );
  it('applies longest-match rules', () => {
    expect(rules.allows('/public')).toBe(true);
    expect(rules.allows('/private/x')).toBe(false);
    expect(rules.allows('/private/ok/y')).toBe(true);
  });
  it('prefers a group for our own agent token', () => {
    const r = parseRobots(
      'User-agent: ballot-ref\nDisallow: /\n\nUser-agent: *\nDisallow:\n',
      'ballot-ref/0.1',
    );
    expect(r.allows('/anything')).toBe(false);
  });
});

describe('fetcher', () => {
  it('does not fetch a path robots.txt disallows', async () => {
    const { fetcher, calls } = make((u) =>
      u.endsWith('/robots.txt') ? new Response('User-agent: *\nDisallow: /secret\n') : okPage(),
    );
    const r = await fetcher.fetchUrl('https://a.example/secret/page');
    expect(r).toMatchObject({ ok: false, reason: 'robots' });
    expect(calls).toEqual(['https://a.example/robots.txt']);
  });
  it('treats an unreachable robots.txt (5xx) as disallow', async () => {
    const { fetcher } = make((u) =>
      u.endsWith('/robots.txt') ? new Response('', { status: 500 }) : okPage(),
    );
    expect(await fetcher.fetchUrl('https://a.example/p')).toMatchObject({
      ok: false,
      reason: 'robots',
    });
  });
  it('rate limits requests per host', async () => {
    const { fetcher, sleeps } = make((u) =>
      u.endsWith('/robots.txt') ? new Response('', { status: 404 }) : okPage(),
    );
    await fetcher.fetchUrl('https://a.example/1');
    await fetcher.fetchUrl('https://a.example/2');
    expect(sleeps.some((ms) => ms > 0)).toBe(true);
  });
  it('retries with exponential backoff, then succeeds', async () => {
    let n = 0;
    const { fetcher, sleeps } = make((u) => {
      if (u.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return ++n < 3 ? new Response('', { status: 502 }) : okPage();
    });
    const r = await fetcher.fetchUrl('https://a.example/p');
    expect(r).toMatchObject({ ok: true, retried: true });
    expect(sleeps).toContain(1000);
    expect(sleeps).toContain(2000);
  });
  it('reports persistent failures instead of hiding them', async () => {
    const { fetcher } = make((u) =>
      u.endsWith('/robots.txt')
        ? new Response('', { status: 404 })
        : new Response('', { status: 403 }),
    );
    expect(await fetcher.fetchUrl('https://a.example/p')).toMatchObject({
      ok: false,
      reason: 'blocked',
    });
  });
  it('uses the fallback after retries fail', async () => {
    const { fetcher } = make(
      (u) =>
        u.endsWith('/robots.txt')
          ? new Response('', { status: 404 })
          : new Response('', { status: 403 }),
      {
        fallback: async () => ({
          ok: true,
          body: Buffer.from('<p>via browser</p>'),
          contentType: 'text/html',
          method: 'playwright',
          retried: true,
        }),
      },
    );
    expect(await fetcher.fetchUrl('https://a.example/p')).toMatchObject({
      ok: true,
      method: 'playwright',
    });
  });
  it('never returns a maintenance page as content', async () => {
    const { fetcher } = make((u) =>
      u.endsWith('/robots.txt')
        ? new Response('', { status: 404 })
        : new Response(
            '<html><title>Site Maintenance</title><body>We are down for scheduled maintenance.</body></html>',
            {
              headers: { 'content-type': 'text/html' },
            },
          ),
    );
    expect(await fetcher.fetchUrl('https://a.example/p')).toMatchObject({
      ok: false,
      reason: 'maintenance',
    });
  });
});

describe('html helpers', () => {
  it('extracts visible text and decodes entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry</p><script>evil()</script><p>second&nbsp;line</p>')).toBe(
      'Tom & Jerry\nsecond line',
    );
  });
  it('does not flag a long real page that mentions maintenance in passing', () => {
    expect(
      looksLikeErrorPage(
        '<html><title>Roads</title><body>' +
          'text '.repeat(500) +
          ' scheduled maintenance of roads</body></html>',
      ),
    ).toBe(false);
  });
});
