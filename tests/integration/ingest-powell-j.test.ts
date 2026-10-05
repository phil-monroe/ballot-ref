import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildContests } from '../../src/ingest/build-contests.ts';
import { Expected, compareToExpected } from '../../src/ingest/expected.ts';
import { layoutLines, snapshotText } from '../../src/ingest/layout.ts';
import { parseBallot } from '../../src/ingest/parse-ballot.ts';
import { extractItems } from '../../src/ingest/pdf-items.ts';
import { normalizeWhitespace } from '../../src/validate/normalize.ts';

const lines = layoutLines(await extractItems(readFileSync('fixtures/powell-j/ballot.pdf')));
const contests = buildContests(parseBallot(lines), {
  date: '2026-11-03',
  county: 'delaware',
  snapshotHash: 'a'.repeat(64),
});
const expected = Expected.parse(
  JSON.parse(readFileSync('fixtures/powell-j/expected.json', 'utf8')),
);

describe('Powell J ballot ingest (SC-001)', () => {
  it('parses 17 contests and 5 issues', () => {
    expect(contests.filter((c) => c.ballot_page === 1)).toHaveLength(17);
    expect(contests.filter((c) => c.ballot_page === 2)).toHaveLength(5);
  });
  it('matches the hand-authored expected fixture exactly, in official order', () => {
    expect(compareToExpected(contests, expected)).toEqual([]);
  });
  it('has unique contest ids', () => {
    expect(new Set(contests.map((c) => c.id)).size).toBe(contests.length);
  });
  it('drops the watermark and page furniture', () => {
    const text = snapshotText(lines);
    expect(text).not.toMatch(/\bSample\b/);
    expect(text).not.toMatch(/Page \d of 2/);
    expect(text).not.toMatch(/Instructions to Voter/);
  });
  it('keeps issue text as a substring of the snapshot text after whitespace normalization', () => {
    const snap = normalizeWhitespace(snapshotText(lines));
    for (const c of contests.filter((x) => x.ballot_text)) {
      expect(snap).toContain(normalizeWhitespace(c.ballot_text!.text));
    }
  });
});
