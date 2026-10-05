import type { GateResult } from './types.ts';
import { normalizeWhitespace } from './normalize.ts';

/** Gate 1: the quote must be a literal substring of the snapshot text after whitespace-only normalization. */
export function checkQuote(quote: string, snapshotText: string): GateResult {
  const q = normalizeWhitespace(quote);
  if (q === '') return { ok: false, reason: 'quote-not-substring', detail: 'empty quote' };
  return normalizeWhitespace(snapshotText).includes(q)
    ? { ok: true }
    : { ok: false, reason: 'quote-not-substring' };
}
