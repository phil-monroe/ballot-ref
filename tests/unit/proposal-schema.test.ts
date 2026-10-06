import { describe, expect, it } from 'vitest';
import { Proposal, ProposalFile } from '../../src/schemas/proposal.ts';
import { Source } from '../../src/schemas/source.ts';
import { proposal } from '../helpers/discovery-fixture.ts';

describe('Proposal schema', () => {
  it('accepts a valid proposal and round-trips', () => {
    const p = proposal();
    expect(Proposal.parse(p)).toEqual(p);
  });
  it('rejects unknown fields', () => {
    expect(() => Proposal.parse({ ...proposal(), extra: 1 })).toThrow();
  });
  it('rejects a reason over 160 characters', () => {
    expect(() => Proposal.parse(proposal({ reason: 'x'.repeat(161) }))).toThrow();
    expect(() => Proposal.parse(proposal({ reason: 'x'.repeat(160) }))).not.toThrow();
  });
  it('requires tier context for proposed_class other', () => {
    expect(() =>
      Proposal.parse(proposal({ proposed_class: 'other', proposed_tier: 'says' })),
    ).toThrow(/other/);
    expect(() =>
      Proposal.parse(proposal({ proposed_class: 'other', proposed_tier: 'context' })),
    ).not.toThrow();
  });
  it('rejects duplicate ids in a file', () => {
    expect(() => ProposalFile.parse([proposal(), proposal()])).toThrow(/duplicate/);
  });
});

describe('Source schema: other class', () => {
  const base = {
    url: 'https://news.example/a',
    redistributable: false,
    whitelisted_by: 'me',
    whitelisted_at: '2026-10-06T00:00:00Z',
    notes: '',
  };
  it('allows other only with tier context', () => {
    expect(() => Source.parse({ ...base, domain_class: 'other', tier: 'context' })).not.toThrow();
    expect(() => Source.parse({ ...base, domain_class: 'other', tier: 'says' })).toThrow();
  });
});
