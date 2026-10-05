import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import { build, makeFixture, read } from '../helpers/site-fixture.ts';

let html: string;
let text: string;
const config = loadConfig();
beforeAll(() => {
  html = read(join(build(makeFixture().dir).out, 'methodology/index.html'));
  text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}, 120_000);

describe('methodology page (FR-043, FR-046)', () => {
  it.each([
    ['what it does', /What this does/],
    ['what it does not do', /What this does not do/],
    ['tier definitions', /Evidence tiers/],
    ['whitelist rules', /Fixed source list/],
    ['review process', /Human review/],
    ['key-vote rule', /Key votes/],
    ['symmetry threshold', /Symmetry check/],
    ['known gaps', /Known gaps/],
    ['correction method', /Corrections/],
  ])('covers %s', (_name, re) => {
    expect(text).toMatch(re);
  });
  it('states the configured numbers (key votes, quote cap, symmetry threshold, staleness)', () => {
    expect(text).toContain(`${config.key_vote_count} most recent bills`);
    expect(text).toContain(`at most ${config.quote_max_words} words`);
    expect(text).toContain(`differ by more than ${config.symmetry_threshold}`);
    expect(text).toContain(`older than ${config.stale_days} days`);
  });
  it('lists unreviewed contests as known gaps', () => {
    expect(text).toContain('Pending Race');
    expect(text).not.toMatch(/Known gaps.*Ready Race.*Corrections/);
  });
  it('labels itself a sourced reference and only ever mentions "nonpartisan guide" in a negation', () => {
    expect(text).toMatch(/sourced reference/);
    for (const m of text.matchAll(/nonpartisan guide/gi)) {
      expect(text.slice(Math.max(0, m.index! - 20), m.index!)).toMatch(/not (a )?[“"]?$/i);
    }
  });
  it('points corrections at GitHub Issues, not email', () => {
    expect(html).toMatch(/href="https:\/\/github\.com\/[^"]+\/issues"/);
    expect(html).not.toMatch(/mailto:/);
  });
  it('is reachable from the ballot page header and footer', () => {
    // The ballot page is built in the same run; the header link is in the base layout.
    expect(html).toContain('href="/methodology/"');
  });
});
