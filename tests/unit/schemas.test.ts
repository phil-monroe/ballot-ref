import { describe, expect, it } from 'vitest';
import { Field } from '../../src/schemas/field.ts';
import { Source } from '../../src/schemas/source.ts';
import { SiteConfig } from '../../src/config.ts';
import { loadConfig } from '../../src/config.ts';

const base = {
  contest_id: 'c',
  entity_id: 'e',
  field_key: 'ballot_name',
  slot: null,
  value: 'X',
  quote: 'X',
  source_url: 'https://example.gov/',
  source_hash: 'a'.repeat(64),
  retrieved_at: '2026-10-01T00:00:00Z',
  tier: 'official',
  status: 'proposed',
  reviewer: null,
  reviewed_at: null,
  extractor: { kind: 'manual' },
};

describe('Field schema', () => {
  it('accepts a complete field', () => {
    expect(Field.safeParse(base).success).toBe(true);
  });
  it('rejects unknown keys', () => {
    expect(Field.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
  it('rejects a field without a quote', () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.quote;
    expect(Field.safeParse(rest).success).toBe(false);
    expect(Field.safeParse({ ...base, quote: '' }).success).toBe(false);
  });
  it('rejects context tier (link-only) and bad status', () => {
    expect(Field.safeParse({ ...base, tier: 'context' }).success).toBe(false);
    expect(Field.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
  });
  it('requires a source hash', () => {
    expect(Field.safeParse({ ...base, source_hash: 'abc' }).success).toBe(false);
  });
});

describe('Source and config schemas', () => {
  it('rejects unknown domain class', () => {
    expect(
      Source.safeParse({
        url: 'https://x',
        domain_class: 'ballotpedia',
        tier: 'context',
        redistributable: false,
        whitelisted_by: 'me',
        whitelisted_at: '2026-10-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
  it('loads the repo site.config.yaml and rejects unknown keys', () => {
    const cfg = loadConfig();
    expect(cfg.quote_max_words).toBe(25);
    expect(SiteConfig.safeParse({ ...cfg, surprise: 1 }).success).toBe(false);
  });
});
