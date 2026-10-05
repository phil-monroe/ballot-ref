import { describe, expect, it } from 'vitest';
import { runGates } from '../../src/validate/run-gates.ts';
import { ctxFor } from './gate-helpers.ts';

const ctx = ctxFor({ text: 'housing and taxes' });
const base = { field_key: 'priority', slot: 1, value: 'housing', quote: 'housing' };

describe('schema gate', () => {
  it('rejects unknown keys on the field', () => {
    // @ts-expect-error deliberately malformed
    expect(runGates({ ...base, extra: 1 }, ctx)).toMatchObject({ ok: false, reason: 'schema' });
  });
  it('rejects a field key not allowed for the contest kind', () => {
    expect(runGates({ ...base, field_key: 'millage', slot: null }, ctx)).toMatchObject({
      ok: false,
      reason: 'schema',
    });
  });
  it('requires slots on priorities and caps them at the configured count', () => {
    expect(runGates({ ...base, slot: null }, ctx)).toMatchObject({ ok: false, reason: 'schema' });
    expect(runGates({ ...base, slot: 4 }, ctx)).toMatchObject({ ok: false, reason: 'schema' });
  });
  it('rejects a mistyped value', () => {
    expect(runGates({ ...base, value: { a: 1 } as never }, ctx)).toMatchObject({
      ok: false,
      reason: 'schema',
    });
  });
  it('requires the right tier: a priority (says) cannot come from a done-tier source', () => {
    const c = ctxFor({ text: 'housing', url: 'https://www.fec.gov/data/candidate/X' });
    expect(runGates(base, c)).toMatchObject({ ok: false, reason: 'schema' });
  });
  it('rejects context-tier sources for extraction', () => {
    const c = ctxFor({ text: 'housing', url: 'https://ballotpedia.org/Jon_Husted' });
    expect(runGates(base, c)).toMatchObject({ ok: false, reason: 'source-not-whitelisted' });
  });
});
