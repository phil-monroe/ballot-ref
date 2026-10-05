import { describe, expect, it } from 'vitest';
import { DataStore, contestFileStem, contestIdFromStem } from '../../src/data.ts';

const store = new DataStore('fixtures/synthetic/tree');

describe('data file layout and loader', () => {
  it('maps ":" in contest ids to "__" in filenames and back', () => {
    const id = '2026-11-03:test-office:oh:2027';
    expect(contestFileStem(id)).toBe('2026-11-03__test-office__oh__2027');
    expect(contestIdFromStem(contestFileStem(id))).toBe(id);
  });
  it('loads ballots and resolves every contest ref', () => {
    const ballot = store.listBallots()[0]!.ballot;
    expect(ballot.contests).toHaveLength(1);
    for (const ref of ballot.contests) {
      expect(store.loadContest(ref).id).toBe(ref);
    }
  });
  it('loads the source registry', () => {
    const sources = store.loadSources('2026-11-03:test-office:oh:2027');
    expect(sources[0]?.tier).toBe('official');
  });
  it('returns empty fields when none exist', () => {
    expect(store.loadFields('2026-11-03:test-office:oh:2027', 'alpha').fields).toEqual([]);
  });
});
