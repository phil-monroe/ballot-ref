import { describe, expect, it } from 'vitest';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import {
  WITHHELD_REASON,
  checkUrl,
  editDistance,
  identityLabel,
  isLinkOnlyHost,
  lookalikeOf,
  neutralReason,
  registrableDomain,
} from '../../src/discovery/validity.ts';
import { house } from '../helpers/discovery-fixture.ts';

const longText = (extra = '') =>
  `<html><head><title>x</title></head><body><p>${'Campaign news and events for the district. '.repeat(10)}${extra}</p></body></html>`;

function fetcherFor(
  pages: Record<string, { body?: string; status?: number; finalUrl?: string; throws?: boolean }>,
) {
  return new Fetcher({
    userAgent: 'test',
    rateLimitSeconds: 0.001,
    sleep: async () => {},
    maxAttempts: 1,
    fetchImpl: (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) {
        const origin = new URL(url).origin;
        const key = `${origin}/robots.txt`;
        if (pages[key])
          return new Response(pages[key]!.body ?? '', { status: pages[key]!.status ?? 200 });
        return new Response('', { status: 404 });
      }
      const p = pages[url];
      if (!p || p.throws) throw new Error('ENOTFOUND');
      const res = new Response(p.body ?? '', {
        status: p.status ?? 200,
        headers: { 'content-type': 'text/html' },
      });
      if (p.finalUrl) Object.defineProperty(res, 'url', { value: p.finalUrl });
      return res;
    }) as typeof fetch,
  });
}

describe('domain helpers', () => {
  it('registrableDomain and editDistance', () => {
    expect(registrableDomain('www.Balderson.com')).toBe('balderson.com');
    expect(registrableDomain('lookup.boe.ohio.gov')).toBe('ohio.gov');
    expect(editDistance('fec.gov', 'fee.gov')).toBe(1);
  });
  it('flags lookalikes of government domains but not the real ones', () => {
    expect(lookalikeOf('www.fee.gov')).toBe('fec.gov');
    expect(lookalikeOf('ohiosos.com')).toBe('ohiosos.gov');
    expect(lookalikeOf('www.fec.gov')).toBeNull();
    expect(lookalikeOf('lookup.boe.ohio.gov')).toBeNull();
    expect(lookalikeOf('balderson.com')).toBeNull();
  });
  it('link-only hosts', () => {
    expect(isLinkOnlyHost('https://ballotpedia.org/Troy_Balderson')).toBe(true);
    expect(isLinkOnlyHost('https://www.vote411.org/ballot')).toBe(true);
    expect(isLinkOnlyHost('https://balderson.com')).toBe(false);
  });
});

describe('checkUrl (FR-013)', () => {
  it('ok for a reachable page on the same domain', async () => {
    const f = fetcherFor({ 'https://balderson.example/': { body: longText() } });
    const r = await checkUrl('https://balderson.example/', f);
    expect(r.validity.status).toBe('ok');
    expect(r.final_url).toBeNull();
    expect(r.text).toContain('Campaign news');
  });
  it('unreachable when the network fails', async () => {
    const r = await checkUrl('https://gone.example/', fetcherFor({}));
    expect(r.validity.status).toBe('unreachable');
  });
  it('flags a redirect to an unrelated domain', async () => {
    const f = fetcherFor({
      'https://balderson.example/': {
        body: longText(),
        finalUrl: 'https://elsewhere.example/home',
      },
    });
    const r = await checkUrl('https://balderson.example/', f);
    expect(r.validity.status).toBe('redirects-off-domain');
    expect(r.final_url).toBe('https://elsewhere.example/home');
  });
  it('allows a www redirect on the same registrable domain', async () => {
    const f = fetcherFor({
      'https://balderson.example/': {
        body: longText(),
        finalUrl: 'https://www.balderson.example/',
      },
    });
    const r = await checkUrl('https://balderson.example/', f);
    expect(r.validity.status).toBe('ok');
    expect(r.final_url).toBe('https://www.balderson.example/');
  });
  it('flags a lookalike of an official domain even when reachable', async () => {
    const f = fetcherFor({ 'https://www.fee.gov/data/': { body: longText() } });
    expect((await checkUrl('https://www.fee.gov/data/', f)).validity.status).toBe('lookalike');
  });
  it('flags parked and nearly empty pages', async () => {
    const parked = fetcherFor({
      'https://p.example/': {
        body: `<html><body>${'x '.repeat(200)} This domain is for sale</body></html>`,
      },
      'https://tiny.example/': { body: '<html><body>hi</body></html>' },
    });
    expect((await checkUrl('https://p.example/', parked)).validity.status).toBe('parked');
    expect((await checkUrl('https://tiny.example/', parked)).validity.status).toBe('parked');
  });
  it('marks robots-blocked pages unchecked rather than dropping them', async () => {
    const f = fetcherFor({
      'https://b.example/robots.txt': { body: 'User-agent: *\nDisallow: /' },
      'https://b.example/': { body: longText() },
    });
    const r = await checkUrl('https://b.example/', f);
    expect(r.validity.status).toBe('unchecked');
    expect(r.validity.note).toMatch(/robots/);
  });
  it('never fetches link-only hosts', async () => {
    let called = false;
    const f = new Fetcher({
      userAgent: 't',
      rateLimitSeconds: 0.001,
      fetchImpl: (async () => {
        called = true;
        return new Response('');
      }) as typeof fetch,
    });
    const r = await checkUrl('https://ballotpedia.org/Troy_Balderson', f);
    expect(called).toBe(false);
    expect(r.validity.status).toBe('unchecked');
  });
});

describe('identityLabel (FR-007a)', () => {
  const page = (s: string) => s;
  it('is identity-matched only when the page shows the name and an office keyword', () => {
    expect(
      identityLabel(
        page('Troy Balderson for Congress, Ohio 12th District'),
        'Troy Balderson',
        house,
        true,
      ),
    ).toBe('identity-matched');
  });
  it('is a possible match when the name or office is missing, or there is no page text', () => {
    expect(identityLabel('Troy Balderson, plumber in Dayton', 'Troy Balderson', house, true)).toBe(
      'possible-match',
    );
    expect(identityLabel('Congress candidate announcement', 'Troy Balderson', house, true)).toBe(
      'possible-match',
    );
    expect(identityLabel(null, 'Troy Balderson', house, true)).toBe('possible-match');
  });
  it('never trusts the agent when the page does not support the claim, and honors a denial', () => {
    expect(identityLabel('nothing relevant', 'Troy Balderson', house, true)).toBe('possible-match');
    expect(identityLabel('Troy Balderson for Congress', 'Troy Balderson', house, false)).toBe(
      'possible-match',
    );
  });
});

describe('neutralReason (FR-010)', () => {
  it('keeps factual notes and withholds evaluative ones', () => {
    expect(neutralReason('Campaign website with issue pages')).toBe(
      'Campaign website with issue pages',
    );
    expect(neutralReason('The best, most trustworthy candidate site')).toBe(WITHHELD_REASON);
  });
});
