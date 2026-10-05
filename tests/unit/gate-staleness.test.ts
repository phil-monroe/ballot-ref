import { describe, expect, it } from 'vitest';
import { isStale } from '../../src/validate/staleness.ts';

const now = new Date('2026-10-10T00:00:00Z');

describe('staleness gate', () => {
  it('is fresh within the limit and stale beyond it', () => {
    expect(isStale('2026-10-03T00:00:00Z', 7, now)).toBe(false); // exactly 7 days
    expect(isStale('2026-10-02T23:59:59Z', 7, now)).toBe(true);
  });
  it('honors a configured limit', () => {
    expect(isStale('2026-10-08T00:00:00Z', 1, now)).toBe(true);
  });
});
