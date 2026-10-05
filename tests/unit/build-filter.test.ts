import { describe, expect, it } from 'vitest';
import { isPublishable, publishableFields } from '../../src/review/publishable.ts';

describe('publishable field selector', () => {
  it('returns only approved and edited fields', () => {
    const fields = (['proposed', 'approved', 'rejected', 'edited'] as const).map((status) => ({
      status,
    }));
    expect(publishableFields(fields).map((f) => f.status)).toEqual(['approved', 'edited']);
  });
  it('never treats proposed or rejected as publishable', () => {
    expect(isPublishable({ status: 'proposed' })).toBe(false);
    expect(isPublishable({ status: 'rejected' })).toBe(false);
  });
});
