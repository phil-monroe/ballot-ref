import { describe, expect, it } from 'vitest';
import { checkLength } from '../../src/validate/length.ts';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('length gate', () => {
  it('accepts exactly the cap and rejects one over', () => {
    expect(checkLength(words(25), 25)).toEqual({ ok: true });
    expect(checkLength(words(26), 25)).toMatchObject({ ok: false, reason: 'quote-too-long' });
  });
  it('honors a configured cap', () => {
    expect(checkLength(words(11), 10)).toMatchObject({ ok: false });
  });
  it('counts words after whitespace normalization', () => {
    expect(checkLength(`a\n\n  b \t c`, 3)).toEqual({ ok: true });
  });
});
