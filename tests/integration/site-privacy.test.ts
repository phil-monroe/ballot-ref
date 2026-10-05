import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { build, htmlFiles, makeFixture, read } from '../helpers/site-fixture.ts';

let out: string;
let pages: string[];
beforeAll(() => {
  out = build(makeFixture().dir).out;
  pages = htmlFiles(out);
}, 120_000);

describe('site privacy and indexing (SC-010)', () => {
  it('builds at least the index, a ballot page, and the methodology page', () => {
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
  it('marks every page noindex', () => {
    for (const p of pages)
      expect(read(p), p).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });
  it('has no scripts at all and no external resource loads', () => {
    for (const p of pages) {
      const html = read(p);
      expect(html, p).not.toMatch(/<script/i);
      expect(html, p).not.toMatch(
        /<(img|iframe|video|audio|source|embed|object)[^>]+(src|data)="https?:/i,
      );
      expect(html, p).not.toMatch(/<link[^>]+href="https?:/i);
      expect(html, p).not.toMatch(/url\(\s*['"]?https?:/i);
      expect(html, p).not.toMatch(/@import/i);
    }
  });
  it('contains external URLs only as outbound anchor links', () => {
    for (const p of pages) {
      const stripped = read(p).replace(/<a\b[^>]*>/gi, '');
      expect(stripped, p).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });
  it('has no analytics or tracking markers', () => {
    for (const p of pages)
      expect(read(p), p).not.toMatch(/google-analytics|gtag|plausible|matomo|segment|fbq\(/i);
  });
  it('ships X-Robots-Tag and robots.txt', () => {
    expect(readFileSync(join(out, '_headers'), 'utf8')).toContain('X-Robots-Tag: noindex');
    expect(readFileSync(join(out, 'robots.txt'), 'utf8')).toMatch(/Disallow: \//);
  });
});
