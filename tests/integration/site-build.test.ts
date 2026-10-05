import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { build, makeFixture, read } from '../helpers/site-fixture.ts';

let html: string;
let netLog: string;
beforeAll(() => {
  const fx = makeFixture();
  const b = build(fx.dir);
  html = read(join(b.out, 'b/test-1/index.html'));
  netLog = read(b.netLog);
}, 120_000);

describe('site build (SC-009)', () => {
  it('builds with network access blocked and attempts no connections', () => {
    expect(html).toContain('Ready Race');
    expect(netLog).toBe('');
  });
  it('lists contests in official ballot order', () => {
    const order = [
      'Ready Race',
      'Pending Race',
      'Governor and Lieutenant Governor',
      'Proposed Tax Levy (Additional) Test District',
    ];
    const positions = order.map((t) =>
      html.indexOf(`<a class="anchor" href="#`) >= 0 ? html.indexOf(`>${t}</a></h3>`) : -1,
    );
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
  it('gives every contest a deep-link anchor', () => {
    expect(html).toContain('id="ready-race-oh-unspecified"');
    expect(html).toContain('id="levy-test-district-additional"');
  });
  it('renders not-yet-reviewed contests with names only and no fields', () => {
    const pending = html.slice(
      html.indexOf('id="pending-race-oh-unspecified"'),
      html.indexOf('id="governor-lt-governor'),
    );
    expect(pending).toContain('Not yet reviewed');
    expect(pending).toContain('Gamma Gray');
    expect(pending).not.toContain('PROPOSED-TEXT');
    expect(pending).not.toContain('<dl');
  });
  it('shows approved and edited fields, and never proposed or rejected ones', () => {
    expect(html).toContain('ALPHA-PRIORITY-ONE');
    expect(html).toContain('BETA-PRIORITY-ONE');
    expect(html).not.toContain('REJECTED-TEXT');
    expect(html).not.toContain('PROPOSED-TEXT');
  });
  it('shows value, quote, source link, tier badge, dates and an error-report link for a field', () => {
    expect(html).toMatch(/<blockquote>ALPHA-PRIORITY-ONE<\/blockquote>/);
    expect(html).toContain('href="https://alpha.example/issues"');
    expect(html).toContain('badge--says');
    expect(html).toContain('retrieved 2026-10-04');
    expect(html).toContain('reviewed 2026-10-04');
    expect(html).toMatch(/href="https:\/\/github\.com\/[^"]+\/issues\/new\?title=/);
  });
});
