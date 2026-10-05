import { normalizeWhitespace } from '../validate/normalize.ts';

const BOLD = '\u001b[1;7m';
const RESET = '\u001b[0m';

/**
 * A window of the (whitespace-normalized) snapshot around the quote, with the quote highlighted.
 * Returns null if the quote is not found, which the reviewer must treat as a failed gate.
 */
export function highlightQuote(
  snapshotText: string,
  quote: string,
  opts: { radius?: number; mark?: [string, string] } = {},
): string | null {
  const [open, close] = opts.mark ?? [BOLD, RESET];
  const radius = opts.radius ?? 240;
  const text = normalizeWhitespace(snapshotText);
  const q = normalizeWhitespace(quote);
  const at = q === '' ? -1 : text.indexOf(q);
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + q.length + radius);
  return (
    (start > 0 ? '… ' : '') +
    text.slice(start, at) +
    open +
    text.slice(at, at + q.length) +
    close +
    text.slice(at + q.length, end) +
    (end < text.length ? ' …' : '')
  );
}
