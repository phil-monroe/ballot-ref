import type { GateResult } from './types.ts';
import { normalizeWhitespace } from './normalize.ts';

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/** Case, punctuation, middle initials and generational suffixes are ignored; nothing else is. */
export function nameTokens(name: string): string[] {
  return normalizeWhitespace(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SUFFIXES.has(t));
}

/** Gate 6: the name the extractor found must be the target candidate and must appear in the text. */
export function checkEntity(
  subjectName: string | null | undefined,
  ballotName: string,
  snapshotText: string,
): GateResult {
  if (!subjectName)
    return { ok: false, reason: 'entity-mismatch', detail: 'extractor named no subject' };
  if (nameTokens(subjectName).join(' ') !== nameTokens(ballotName).join(' ')) {
    return {
      ok: false,
      reason: 'entity-mismatch',
      detail: `"${subjectName}" is not "${ballotName}"`,
    };
  }
  const hay = normalizeWhitespace(snapshotText).toLowerCase();
  if (!hay.includes(normalizeWhitespace(subjectName).toLowerCase())) {
    return {
      ok: false,
      reason: 'entity-mismatch',
      detail: `"${subjectName}" does not appear in the source text`,
    };
  }
  return { ok: true };
}
