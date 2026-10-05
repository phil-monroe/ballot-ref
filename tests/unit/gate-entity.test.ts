import { describe, expect, it } from 'vitest';
import { runGates } from '../../src/validate/run-gates.ts';
import { checkEntity } from '../../src/validate/entity.ts';
import { ctxFor } from './gate-helpers.ts';

const TEXT = 'Jon Husted is a senator. Jon Husted supports lower taxes.';

describe('entity gate', () => {
  it('accepts the same name', () => {
    expect(checkEntity('Jon Husted', 'Jon Husted', TEXT)).toEqual({ ok: true });
  });
  it('accepts case, punctuation, middle initial and suffix differences', () => {
    expect(checkEntity('JON A. HUSTED, Jr.', 'Jon Husted', 'jon a. husted, jr. said')).toEqual({
      ok: true,
    });
  });
  it('rejects a namesake', () => {
    expect(checkEntity('John Husted', 'Jon Husted', 'John Husted, a dentist')).toMatchObject({
      ok: false,
      reason: 'entity-mismatch',
    });
  });
  it('rejects a missing subject', () => {
    expect(checkEntity(null, 'Jon Husted', TEXT)).toMatchObject({ ok: false });
  });
  it('rejects a subject name that does not appear in the source text', () => {
    expect(checkEntity('Jon Husted', 'Jon Husted', 'nobody here')).toMatchObject({ ok: false });
  });
  it('is enforced for model extractions in the gate pipeline', () => {
    const r = runGates(
      { field_key: 'priority', slot: 1, value: 'x', quote: 'lower taxes' },
      ctxFor({
        text: TEXT,
        extractor: { kind: 'model', model: 'm', prompt_version: 'v1' },
        subjectName: 'John Husted',
      }),
    );
    expect(r).toMatchObject({ ok: false, reason: 'entity-mismatch' });
  });
});
