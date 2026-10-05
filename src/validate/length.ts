import type { GateResult } from './types.ts';
import { normalizeWhitespace } from './normalize.ts';

export const wordCount = (s: string): number => {
  const n = normalizeWhitespace(s);
  return n === '' ? 0 : n.split(' ').length;
};

/** Gate 2: quote length cap (default 25 words, from config). */
export function checkLength(quote: string, maxWords: number): GateResult {
  const n = wordCount(quote);
  return n <= maxWords
    ? { ok: true }
    : { ok: false, reason: 'quote-too-long', detail: `${n} words > ${maxWords}` };
}
