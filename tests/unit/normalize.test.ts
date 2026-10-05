import { describe, expect, it } from 'vitest';
import { normalizeWhitespace } from '../../src/validate/normalize.ts';

describe('normalizeWhitespace', () => {
  it('collapses runs, NBSP, and line breaks', () => {
    expect(normalizeWhitespace('  a \n\t b  c  ')).toBe('a b c');
  });
  it('does not fold case, quotes, or dashes', () => {
    expect(normalizeWhitespace('“Hi” – Ok')).toBe('“Hi” – Ok');
    expect(normalizeWhitespace('ABC')).not.toBe('abc');
  });
});
