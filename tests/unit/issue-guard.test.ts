import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContests } from '../../src/ingest/build-contests.ts';
import { layoutLines, snapshotText } from '../../src/ingest/layout.ts';
import { officialFieldsFor } from '../../src/ingest/official-fields.ts';
import { parseBallot } from '../../src/ingest/parse-ballot.ts';
import { extractItems } from '../../src/ingest/pdf-items.ts';
import type { Contest } from '../../src/schemas/contest.ts';
import { checkQuote } from '../../src/validate/quote.ts';
import { runGates } from '../../src/validate/run-gates.ts';
import { ctxFor } from './gate-helpers.ts';
import { contest as candidateContest } from './gate-helpers.ts';

let issue3: Contest;
let snapshot: string;
beforeAll(async () => {
  const lines = layoutLines(await extractItems(readFileSync('fixtures/powell-j/ballot.pdf')));
  snapshot = snapshotText(lines);
  issue3 = buildContests(parseBallot(lines), {
    date: '2026-11-03',
    county: 'delaware',
    snapshotHash: 'a'.repeat(64),
  }).find((c) => c.id.includes('state-issue-3'))!;
});

describe('State Issue 3 fields', () => {
  it('are only quotes from the official ballot: effect text exists only because it is printed', () => {
    const fields = officialFieldsFor(issue3, 25);
    const yes = fields.find((f) => f.field_key === 'effect_yes')!;
    const no = fields.find((f) => f.field_key === 'effect_no')!;
    expect(yes.quote).toBe('A "YES" vote means approval of the amendment.');
    expect(no.quote).toBe('A "NO" vote means disapproval of the amendment.');
    for (const f of fields) expect(checkQuote(f.quote, snapshot)).toEqual({ ok: true });
  });
  it('splits the official explanation into its printed items, in order', () => {
    const items = officialFieldsFor(issue3, 25).filter(
      (f) => f.field_key === 'official_explanation',
    );
    expect(items.map((i) => i.slot)).toEqual([1, 2, 3, 4]);
    expect(items[0]!.quote).toBe(
      'Require voters to present an approved form of government-issued photo identification in order to vote.',
    );
  });
  it('never contains tool-authored characterization (every value is a quote or an excerpt notice)', () => {
    for (const f of officialFieldsFor(issue3, 25)) {
      expect(
        String(f.value) === f.quote || /^Excerpt: first \d+ of \d+ words/.test(String(f.value)),
      ).toBe(true);
    }
  });
  it('is not described as broader than the printed amendment: the ballot caption is quoted verbatim', () => {
    const lang = officialFieldsFor(issue3, 25).find((f) => f.field_key === 'ballot_language')!;
    expect(lang.quote).toBe('TO REQUIRE VOTERS TO PRESENT PHOTO IDENTIFICATION IN ORDER TO VOTE');
  });
});

describe('effect_yes / effect_no / current_law require an official source quote', () => {
  const issue = { ...candidateContest, kind: 'constitutional-issue' as const, candidates: [] };
  it('are rejected from a says-tier source even when the quote matches', () => {
    for (const key of ['effect_yes', 'effect_no', 'current_law']) {
      const ctx = { ...ctxFor({ text: 'it would help everyone' }), contest: issue };
      expect(
        runGates({ field_key: key, value: 'x', quote: 'it would help everyone' }, ctx),
        key,
      ).toMatchObject({ ok: false, reason: 'schema' });
    }
  });
  it('are rejected when the quote is not in the official text (cannot be tool-authored)', () => {
    const ctx = {
      ...ctxFor({
        text: 'A "YES" vote means approval.',
        url: 'https://www.fec.gov/data/candidate/x',
      }),
      contest: issue,
    };
    expect(
      runGates(
        { field_key: 'effect_yes', value: 'x', quote: 'A YES vote expands voting access' },
        ctx,
      ),
    ).toMatchObject({ ok: false });
  });
  it('argument fields require the author', () => {
    const ctx = {
      ...ctxFor({ text: 'Vote yes for safety.', url: 'https://www.fec.gov/data/candidate/x' }),
      contest: issue,
    };
    expect(
      runGates({ field_key: 'argument_for', value: 'x', quote: 'Vote yes for safety.' }, ctx),
    ).toMatchObject({ ok: false, reason: 'schema' });
    expect(
      runGates(
        {
          field_key: 'argument_for',
          value: 'x',
          quote: 'Vote yes for safety.',
          author: 'Rep. Example',
        },
        ctx,
      ).ok,
    ).toBe(true);
  });
});
