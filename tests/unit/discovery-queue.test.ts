import { describe, expect, it } from 'vitest';
import {
  addProposals,
  normalizeUrl,
  orderForReview,
  pending,
  proposalId,
} from '../../src/discovery/queue.ts';
import type { Source } from '../../src/schemas/source.ts';
import {
  house,
  makeDiscoveryFixture,
  newProposal,
  proposal,
} from '../helpers/discovery-fixture.ts';

describe('normalizeUrl / proposalId', () => {
  it('lowercases the host and drops fragments, tracking params and trailing slashes', () => {
    expect(normalizeUrl('https://Example.COM/Path/?utm_source=x&b=2&a=1#frag')).toBe(
      'https://example.com/Path?a=1&b=2',
    );
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });
  it('gives equal ids to equivalent URLs and different ids per target', () => {
    const a = proposalId(house.id, 'troy-balderson', 'https://x.example/a/?utm_campaign=z');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(proposalId(house.id, 'troy-balderson', 'https://X.example/a')).toBe(a);
    expect(proposalId(house.id, 'jerrad-christian', 'https://x.example/a')).not.toBe(a);
    expect(proposalId(house.id, null, 'https://x.example/a')).not.toBe(a);
  });
});

describe('addProposals dedupe (FR-006, FR-014)', () => {
  const registered: Source = {
    url: 'https://www.fec.gov/data/candidate/',
    domain_class: 'fec',
    tier: 'done',
    redistributable: true,
    whitelisted_by: 'tester',
    whitelisted_at: '2026-10-01T00:00:00Z',
    notes: '',
  };
  it('skips URLs already registered, already queued (any status), and keeps new ones', () => {
    const { data } = makeDiscoveryFixture(house, [registered]);
    const r1 = addProposals(
      house.id,
      [
        newProposal({ url: 'https://www.fec.gov/data/candidate/H8OH12180/' }), // under a registered prefix
        newProposal({ url: 'https://balderson.example/' }),
      ],
      data,
    );
    expect(r1.added.map((p) => p.url)).toEqual(['https://balderson.example/']);
    expect(r1.duplicate).toBe(1);

    // Reject it, then a re-run must not bring it back.
    const q = data.loadProposals(house.id);
    q[0] = { ...q[0]!, status: 'rejected', decided_by: 'me', decided_at: '2026-10-06T00:00:00Z' };
    data.saveProposals(house.id, q);
    const r2 = addProposals(
      house.id,
      [
        newProposal({ url: 'https://BALDERSON.example' }),
        newProposal({ url: 'https://b2.example' }),
      ],
      data,
    );
    expect(r2.added.map((p) => p.url)).toEqual(['https://b2.example']);
    expect(r2.duplicate).toBe(1);
  });
  it('treats the same URL for two candidates as two proposals', () => {
    const { data } = makeDiscoveryFixture();
    const r = addProposals(
      house.id,
      [
        newProposal({ url: 'https://shared.example/' }),
        newProposal({ url: 'https://shared.example/', entity_id: 'jerrad-christian' }),
      ],
      data,
    );
    expect(r.added).toHaveLength(2);
  });
});

describe('orderForReview (FR-013a)', () => {
  it('orders official, then candidate sites, then others; then ballot order; then URL', () => {
    const ps = [
      proposal({ url: 'https://z.example/', proposed_class: 'other', proposed_tier: 'context' }),
      proposal({
        url: 'https://c.example/',
        entity_id: 'jerrad-christian',
        proposed_class: 'candidate-site',
        proposed_tier: 'says',
      }),
      proposal({
        url: 'https://b.example/',
        proposed_class: 'candidate-site',
        proposed_tier: 'says',
      }),
      proposal({
        url: 'https://boe.example/',
        entity_id: 'jerrad-christian',
        proposed_class: 'ohio-boe',
        proposed_tier: 'official',
      }),
      proposal({
        url: 'https://fec.example/',
        proposed_class: 'fec',
        proposed_tier: 'official',
      }),
    ];
    expect(orderForReview(ps, house).map((p) => p.url)).toEqual([
      'https://fec.example/',
      'https://boe.example/',
      'https://b.example/',
      'https://c.example/',
      'https://z.example/',
    ]);
  });
  it('pending() keeps only undecided proposals', () => {
    expect(
      pending([proposal(), proposal({ url: 'https://x.example/', status: 'rejected' })]),
    ).toHaveLength(1);
  });
});
