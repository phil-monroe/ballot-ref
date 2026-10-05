import { describe, expect, it } from 'vitest';
import { FIELD_KEYS } from '../../src/schemas/field-keys.ts';
import { runGates } from '../../src/validate/run-gates.ts';
import { ctxFor, contest } from './gate-helpers.ts';
import { offeredKeys } from '../../src/extract/run-extract.ts';

const judicial = { ...contest, kind: 'judicial' as const };
const ctx = (over: Parameters<typeof ctxFor>[0]) => ({ ...ctxFor(over), contest: judicial });

describe('judicial reduced schema (FR-031)', () => {
  it('has exactly the reduced key set: no issue-position fields', () => {
    expect([...FIELD_KEYS.judicial]).toEqual([
      'ballot_name',
      'current_office',
      'bar_admission',
      'campaign_website',
    ]);
    expect(FIELD_KEYS.judicial).not.toContain('priority');
  });
  it('rejects a stated priority for a judicial candidate', () => {
    const r = runGates(
      { field_key: 'priority', slot: 1, value: 'x', quote: 'housing' },
      ctx({ text: 'housing' }),
    );
    expect(r).toMatchObject({ ok: false, reason: 'schema' });
  });
  it('accepts current_office from any registered source', () => {
    expect(
      runGates(
        { field_key: 'current_office', value: 'Judge', quote: 'serves as Judge' },
        ctx({ text: 'She serves as Judge of the court.' }),
      ).ok,
    ).toBe(true);
  });
  it('requires bar_admission to come from an official-tier source', () => {
    const r = runGates(
      { field_key: 'bar_admission', value: '1999', quote: 'admitted in 1999' },
      ctx({ text: 'admitted in 1999' }),
    );
    expect(r).toMatchObject({ ok: false, reason: 'schema' }); // candidate-site is "says"
  });
  it('offers the model only current_office from a says-tier source, and bar_admission from official', () => {
    expect(offeredKeys('judicial', 'says')).toEqual(['current_office']);
    expect(offeredKeys('judicial', 'official')).toEqual(['current_office', 'bar_admission']);
  });
});
