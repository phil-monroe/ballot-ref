import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContests } from '../../src/ingest/build-contests.ts';
import { layoutLines, snapshotText } from '../../src/ingest/layout.ts';
import { officialFieldsFor } from '../../src/ingest/official-fields.ts';
import { parseBallot } from '../../src/ingest/parse-ballot.ts';
import { extractItems } from '../../src/ingest/pdf-items.ts';
import type { Contest } from '../../src/schemas/contest.ts';
import { checkLength } from '../../src/validate/length.ts';
import { checkQuote } from '../../src/validate/quote.ts';
import type { RawField } from '../../src/validate/types.ts';

let contests: Contest[];
let snapshot: string;
beforeAll(async () => {
  const lines = layoutLines(await extractItems(readFileSync('fixtures/powell-j/ballot.pdf')));
  snapshot = snapshotText(lines);
  contests = buildContests(parseBallot(lines), {
    date: '2026-11-03',
    county: 'delaware',
    snapshotHash: 'a'.repeat(64),
  });
});

const fieldsOf = (idPart: string) => {
  const c = contests.find((x) => x.id.includes(idPart))!;
  return Object.fromEntries(
    officialFieldsFor(c, 25).map((f) => [`${f.field_key}${f.slot ? `#${f.slot}` : ''}`, f]),
  );
};
const v = (f: RawField | undefined) => f?.value;

describe('levy parser on the Powell J ballot', () => {
  it('Delaware Area Career Center: renewal and decrease, 0.75 mill, $18, 10 years, $5,773,576', () => {
    const f = fieldsOf('career-center');
    expect(v(f.taxing_entity)).toBe('Delaware Area Career Center');
    expect(v(f.levy_type)).toBe('renewal-and-decrease');
    expect(v(f.millage)).toBe('0.75 mill');
    expect(v(f.duration)).toBe('10 years');
    expect(v(f.auditor_estimated_cost_per_100k)).toBe('$18');
    expect(v(f.auditor_estimated_annual_collection)).toBe('$5,773,576');
  });
  it('Delaware County RTA: sales and use tax, continuing', () => {
    const f = fieldsOf('regional-transit');
    expect(v(f.levy_type)).toBe('sales-use-tax');
    expect(v(f.duration)).toBe('continuing');
    expect(f.auditor_estimated_cost_per_100k).toBeUndefined(); // not on the printed ballot: no field, not invented
  });
  it('Delaware County Board of DD: additional, 1.8 mills, $63, 5 years, $25,448,490', () => {
    const f = fieldsOf('developmental-disabilities');
    expect(v(f.levy_type)).toBe('additional');
    expect(v(f.millage)).toBe('1.8 mills');
    expect(v(f.duration)).toBe('5 years');
    expect(v(f.auditor_estimated_cost_per_100k)).toBe('$63');
    expect(v(f.auditor_estimated_annual_collection)).toBe('$25,448,490');
  });
  it('Delaware-Morrow Mental Health & Recovery: renewal and increase, 2 mills, $50, 5 years, $23,005,505', () => {
    const f = fieldsOf('mental-health');
    expect(v(f.levy_type)).toBe('renewal-and-increase');
    expect(v(f.millage)).toBe('2 mills');
    expect(v(f.duration)).toBe('5 years');
    expect(v(f.auditor_estimated_cost_per_100k)).toBe('$50');
    expect(v(f.auditor_estimated_annual_collection)).toBe('$23,005,505');
  });
  it('every quote is a literal substring of the ballot snapshot and within the word cap', () => {
    for (const c of contests.filter(
      (x) => x.kind === 'levy' || x.kind === 'constitutional-issue',
    )) {
      for (const f of officialFieldsFor(c, 25)) {
        expect(checkQuote(f.quote, snapshot), `${c.id} ${f.field_key}`).toEqual({ ok: true });
        expect(checkLength(f.quote, 25), `${c.id} ${f.field_key}`).toEqual({ ok: true });
      }
    }
  });
  it('labels truncated passages as excerpts instead of presenting them as complete', () => {
    const f = fieldsOf('regional-transit');
    expect(String(v(f.purpose))).toMatch(/^Excerpt: first 25 of \d+ words/);
  });
});
