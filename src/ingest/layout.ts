import type { PdfItem } from './pdf-items.ts';

export interface Line {
  page: number;
  col: number;
  /** Distance from the column's left edge; candidates are indented, contest titles are not. */
  indent: number;
  y: number;
  size: number;
  text: string;
}

const BOILERPLATE = [
  /^Page \d+ of \d+$/,
  /^Vote All Sides$/,
  /^BOARD MEMBERS$/,
  /^This sample ballot was produced/,
  /^OFFICIAL QUESTIONS AND$/,
  /^ISSUES BALLOT$/,
  /^Sample$/,
];

/** Page furniture: footer band, boilerplate, and (page 1 only) header band and instructions. */
function isNoise(it: PdfItem): boolean {
  if (it.rotated) return true; // diagonal "Sample" watermark
  if (BOILERPLATE.some((re) => re.test(it.text))) return true;
  if (it.y <= 45) return true; // footer: page number, ballot id
  if (it.page === 1 && it.y >= 830) return true; // header band and "Instructions to Voter"
  return false;
}

/**
 * Reading order: page, then column left-to-right, then top-to-bottom. Watermark and page furniture
 * are dropped by identity/position, never by content heuristics on candidate text.
 */
export function layoutLines(items: PdfItem[]): Line[] {
  const kept = items.filter((it) => !isNoise(it));
  const colOf = (it: PdfItem) => Math.min(2, Math.floor(it.x / (it.pageWidth / 3)));
  const left = new Map<string, number>();
  for (const it of kept) {
    const k = `${it.page}:${colOf(it)}`;
    left.set(k, Math.min(left.get(k) ?? Infinity, it.x));
  }
  const lines: Line[] = kept.map((it) => ({
    page: it.page,
    col: colOf(it),
    indent: Math.round(it.x - left.get(`${it.page}:${colOf(it)}`)!),
    y: it.y,
    size: it.size,
    text: it.text,
  }));
  return lines.sort((a, b) => a.page - b.page || a.col - b.col || b.y - a.y);
}

/**
 * Joins wrapped lines. A line ending in a hyphen is joined to the next without a space so printed
 * hyphenated words ("government-issued") survive. The same rule builds the stored snapshot text and
 * the issue text, so quotes taken from either remain substrings of the snapshot.
 */
export function joinLines(texts: string[], sep = ' '): string {
  let out = '';
  for (const t of texts) {
    if (out === '') out = t;
    else out += out.endsWith('-') ? t : sep + t;
  }
  return out;
}

/** Plain-text form of the ballot used as the verification anchor for quotes. */
export function snapshotText(lines: Line[]): string {
  return joinLines(
    lines.map((l) => l.text),
    '\n',
  );
}
