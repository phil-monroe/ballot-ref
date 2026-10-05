import { describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data.ts';
import { computeSymmetry } from '../../src/validate/symmetry.ts';
import type { Field } from '../../src/schemas/field.ts';

const ID = '2026-11-03:lopsided:oh:unspecified';
const store = new DataStore('fixtures/synthetic/lopsided');
const contest = store.loadContest(ID);
const load = () =>
  Object.fromEntries(store.listEntities(ID).map((e) => [e, store.loadFields(ID, e).fields]));
const opts = { threshold: 2, priorities: 3 };

describe('symmetry report', () => {
  it('fails the deliberately lopsided contest (SC-006)', () => {
    const r = computeSymmetry(contest, load(), opts);
    expect(r.flags.length).toBeGreaterThan(0);
    expect(r.flags.join(' ')).toMatch(/differ by 5/);
  });
  it('excludes write-in lines from the report', () => {
    const r = computeSymmetry(contest, load(), opts);
    expect(r.candidates.map((c) => c.entity_id)).toEqual(['rich', 'bare']);
  });
  it('flags a candidate with zero filled fields', () => {
    const r = computeSymmetry(
      contest,
      { rich: load().rich!, bare: [] },
      { ...opts, threshold: 99 },
    );
    expect(r.flags).toEqual(['bare has zero filled fields']);
  });
  it('passes when counts are within the threshold', () => {
    const rich = load().rich!;
    const r = computeSymmetry(contest, { rich, bare: rich.slice(0, 4) }, opts);
    expect(r.flags).toEqual([]);
  });
  it('does not count rejected fields', () => {
    const rich = load().rich!;
    const bare = rich.map((f): Field => ({ ...f, entity_id: 'bare', status: 'rejected' }));
    const r = computeSymmetry(contest, { rich, bare }, { ...opts, threshold: 99 });
    expect(r.flags).toEqual(['bare has zero filled fields']);
  });
  it('counts "Other-party candidate" and each ticket person individually', () => {
    const c = {
      ...contest,
      candidates: [
        {
          id: 'a',
          ballot_name: 'A',
          party_label: 'Other-party candidate',
          order: 0,
          write_in: false,
          incumbent: null,
          ticket_id: 't1',
          role: 'governor' as const,
        },
        {
          id: 'b',
          ballot_name: 'B',
          party_label: 'Other-party candidate',
          order: 0,
          write_in: false,
          incumbent: null,
          ticket_id: 't1',
          role: 'lieutenant-governor' as const,
        },
      ],
    };
    const r = computeSymmetry(c, {}, opts);
    expect(r.candidates).toHaveLength(2);
    expect(r.flags).toEqual(['a has zero filled fields', 'b has zero filled fields']);
  });
});
