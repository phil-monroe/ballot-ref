import { describe, expect, it } from 'vitest';
import { diffBallots } from '../../src/ingest/diff.ts';
import { Expected, compareToExpected } from '../../src/ingest/expected.ts';
import type { Contest } from '../../src/schemas/contest.ts';

const cand = (name: string, order: number) => ({
  id: name.toLowerCase(),
  ballot_name: name,
  party_label: null,
  order,
  write_in: false,
  incumbent: null,
  ticket_id: null,
});
const contest = (id: string, names: string[]): Contest => ({
  id,
  kind: 'candidate',
  title: id,
  jurisdiction: 'oh',
  term: null,
  vote_for: 1,
  candidates: names.map(cand),
  issue_options: [],
  ballot_snapshot_hash: '0'.repeat(64),
  ballot_page: 1,
});

describe('diffBallots', () => {
  const prev = [contest('a', ['X', 'Y']), contest('b', ['Z']), contest('c', ['W'])];

  it('reports no differences for identical ballots', () => {
    const d = diffBallots(prev, prev);
    expect([d.added, d.removed, d.changed]).toEqual([[], [], []]);
  });
  it('reports added and removed contests', () => {
    const d = diffBallots(prev, [prev[0]!, prev[1]!, contest('d', ['Q'])]);
    expect(d.added).toEqual(['d']);
    expect(d.removed).toEqual(['c']);
  });
  it('reports a withdrawn candidate as a changed contest', () => {
    const d = diffBallots(prev, [contest('a', ['X']), prev[1]!, prev[2]!]);
    expect(d.changed).toEqual(['a']);
  });
  it('reports a reordering', () => {
    const d = diffBallots(prev, [prev[1]!, prev[0]!, prev[2]!]);
    expect(d.changed.some((x) => x.endsWith('(order)'))).toBe(true);
  });
});

describe('compareToExpected', () => {
  it('flags a count mismatch', () => {
    const expected = Expected.parse({ contests: [] });
    expect(compareToExpected([contest('a', ['X'])], expected)[0]).toMatch(/contest count/);
  });
});
