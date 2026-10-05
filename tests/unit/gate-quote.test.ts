import { describe, expect, it } from 'vitest';
import { checkQuote } from '../../src/validate/quote.ts';
import { runGates } from '../../src/validate/run-gates.ts';
import { ctxFor, sources } from './gate-helpers.ts';

const TEXT =
  'My top priority is to lower grocery prices for\nOhio families. I also support term limits.';

describe('quote gate', () => {
  it('accepts an exact substring', () => {
    expect(checkQuote('lower grocery prices', TEXT)).toEqual({ ok: true });
  });
  it('accepts whitespace-only differences (line breaks)', () => {
    expect(checkQuote('prices for Ohio families.', TEXT)).toEqual({ ok: true });
  });
  it('rejects a paraphrase', () => {
    const r = checkQuote('reduce the cost of groceries', TEXT);
    expect(r).toMatchObject({ ok: false, reason: 'quote-not-substring' });
  });
  it('rejects a single altered word', () => {
    expect(checkQuote('lower grocery costs for Ohio families', TEXT)).toMatchObject({ ok: false });
  });
  it('rejects case and punctuation differences (no folding)', () => {
    expect(checkQuote('Lower grocery prices', TEXT)).toMatchObject({ ok: false });
    expect(checkQuote('term limits!', TEXT)).toMatchObject({ ok: false });
  });
  it('rejects an empty quote', () => {
    expect(checkQuote('   ', TEXT)).toMatchObject({ ok: false });
  });
});

describe('quote taken from a different source', () => {
  it('is rejected: text from source B is not in snapshot A', () => {
    const a = ctxFor({ text: 'Alpha site text about housing.' });
    const r = runGates(
      { field_key: 'priority', slot: 1, value: 'x', quote: 'Beta site text about taxes.' },
      a,
    );
    expect(r).toMatchObject({ ok: false, reason: 'quote-not-substring' });
  });
  it('is rejected when the snapshot URL is not registered for the contest (wrong source)', () => {
    const r = runGates(
      { field_key: 'priority', slot: 1, value: 'x', quote: 'housing' },
      ctxFor({ text: 'housing', url: 'https://evil.example/page' }),
    );
    expect(r).toMatchObject({ ok: false, reason: 'source-not-whitelisted' });
  });
  it('accepts a valid field and takes tier and provenance from the registry and snapshot', () => {
    const r = runGates(
      { field_key: 'priority', slot: 1, value: 'housing', quote: 'housing' },
      ctxFor({ text: 'about housing' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.field).toMatchObject({
        tier: 'says',
        status: 'proposed',
        source_hash: 'b'.repeat(64),
      });
    }
    expect(sources.length).toBeGreaterThan(0);
  });
});
