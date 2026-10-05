/**
 * Whitespace-only normalization (research.md #4). Collapses runs of whitespace, including NBSP and
 * line breaks, to one space and trims. Deliberately does NOT fold case, quotes, dashes, or Unicode
 * compatibility forms: "literal substring" must stay strict.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/[\s   ]+/g, ' ').trim();
}
