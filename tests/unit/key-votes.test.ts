import { describe, expect, it } from 'vitest';
import { keyVoteSlots, selectKeyVoteBills, type Bill } from '../../src/extract/key-votes.ts';

const bill = (id: string, finalPassageDate: string, hasFinalPassageRollCall = true): Bill => ({
  id,
  finalPassageDate,
  hasFinalPassageRollCall,
});
const bills = [
  bill('HB 1', '2026-01-10'),
  bill('HB 2', '2026-03-02'),
  bill('HB 3', '2026-02-20', false), // no final-passage roll call: never selected
  bill('HB 4', '2026-05-01'),
  bill('HB 5', '2026-04-11'),
];

describe('key-vote rule', () => {
  it('takes final-passage roll calls on the N most recent bills, newest first', () => {
    expect(selectKeyVoteBills(bills, 3).map((b) => b.id)).toEqual(['HB 4', 'HB 5', 'HB 2']);
  });
  it('is independent of input order and of who is asking (same set every time)', () => {
    expect(selectKeyVoteBills([...bills].reverse(), 3)).toEqual(selectKeyVoteBills(bills, 3));
  });
  it('breaks date ties deterministically by bill id', () => {
    const tied = [bill('HB 9', '2026-01-01'), bill('HB 2', '2026-01-01')];
    expect(selectKeyVoteBills(tied, 2).map((b) => b.id)).toEqual(['HB 2', 'HB 9']);
  });
  it('numbers slots 1..N by position in the shared set', () => {
    expect(keyVoteSlots(bills, 2).map((s) => [s.slot, s.bill.id])).toEqual([
      [1, 'HB 4'],
      [2, 'HB 5'],
    ]);
  });
  it('returns fewer than N when fewer bills qualify', () => {
    expect(selectKeyVoteBills(bills, 10)).toHaveLength(4);
  });
});
