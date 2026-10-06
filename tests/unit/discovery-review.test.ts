import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { addProposals } from '../../src/discovery/queue.ts';
import {
  DiscoveryReviewError,
  acceptProposal,
  checkRejectReason,
  rejectProposal,
  type ReviewCtx,
} from '../../src/discovery/review.ts';
import { checkRegistry } from '../../src/sources/registry.ts';
import {
  house,
  makeDiscoveryFixture,
  newProposal,
  type Fixture,
} from '../helpers/discovery-fixture.ts';

let fx: Fixture;
let ctx: ReviewCtx;
let log: string;
const NOW = new Date('2026-10-06T15:00:00Z');

function seed(...ps: Parameters<typeof newProposal>[0][]) {
  const { added } = addProposals(
    house.id,
    ps.map((p) => newProposal(p)),
    fx.data,
  );
  return added;
}
const lines = (p: string) =>
  readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

beforeEach(() => {
  fx = makeDiscoveryFixture();
  log = join(fx.dir, 'decisions.jsonl');
  ctx = { reviewer: 'phil', data: fx.data, now: () => NOW, decisionsLog: log };
});

describe('acceptProposal (FR-005)', () => {
  it('writes a registry entry identical in form to a hand-registered one, with the reviewer', () => {
    const [p] = seed({});
    const { source, proposal } = acceptProposal(house.id, p!.id, {}, ctx);
    expect(source).toEqual({
      url: p!.url,
      domain_class: 'fec',
      tier: 'done',
      entity_id: 'troy-balderson',
      redistributable: true,
      whitelisted_by: 'phil',
      whitelisted_at: NOW.toISOString(),
      notes: `discovery ${p!.id}: FEC candidate overview page`,
    });
    expect(fx.data.loadSources(house.id)).toEqual([source]);
    expect(proposal).toMatchObject({
      status: 'accepted',
      decided_by: 'phil',
      accepted_as: { domain_class: 'fec', tier: 'done', redistributable: true },
    });
    expect(fx.data.loadProposals(house.id)[0]!.status).toBe('accepted');
    expect(lines(log)).toMatchObject([{ action: 'accept', reviewer: 'phil', proposal_id: p!.id }]);
    expect(checkRegistry(house.id, fx.data).filter((x) => !/no fetchable/.test(x.message))).toEqual(
      [],
    );
  });

  it('refuses a candidate site without ownership confirmation, and accepts with it (FR-007)', () => {
    const [p] = seed({
      url: 'https://balderson.example/',
      proposed_class: 'candidate-site',
      proposed_tier: 'says',
      identity_label: 'identity-matched',
    });
    expect(() => acceptProposal(house.id, p!.id, {}, ctx)).toThrow(/belongs to the candidate/);
    expect(() => acceptProposal(house.id, p!.id, { ownership_confirmed: false }, ctx)).toThrow(
      DiscoveryReviewError,
    );
    expect(fx.data.loadSources(house.id)).toEqual([]);
    const { source, proposal } = acceptProposal(
      house.id,
      p!.id,
      { ownership_confirmed: true },
      ctx,
    );
    expect(source).toMatchObject({ domain_class: 'candidate-site', redistributable: false });
    expect(proposal.ownership_confirmed).toBe(true);
  });

  it('refuses a candidate site that has no candidate target', () => {
    const [p] = seed({
      url: 'https://x.example/',
      entity_id: null,
      proposed_class: 'candidate-site',
      proposed_tier: 'says',
    });
    expect(() => acceptProposal(house.id, p!.id, { ownership_confirmed: true }, ctx)).toThrow(
      /assigned to a candidate/,
    );
  });

  it('accepts class "other" only as link-only context, or after the reviewer picks an existing class', () => {
    const [p] = seed({
      url: 'https://news.example/story',
      proposed_class: 'other',
      proposed_tier: 'context',
    });
    expect(() => acceptProposal(house.id, p!.id, { tier: 'says' }, ctx)).toThrow(
      /link-only context/,
    );
    const r = acceptProposal(house.id, p!.id, {}, ctx);
    expect(r.source).toMatchObject({
      domain_class: 'other',
      tier: 'context',
      redistributable: false,
    });

    const [q] = seed({
      url: 'https://news.example/other',
      proposed_class: 'other',
      proposed_tier: 'context',
    });
    const r2 = acceptProposal(house.id, q!.id, { domain_class: 'sponsor-site', tier: 'says' }, ctx);
    expect(r2.source).toMatchObject({ domain_class: 'sponsor-site', tier: 'says' });
  });

  it('sets redistributable by class: government true, everything else false, context never', () => {
    const ps = seed(
      { url: 'https://a.example/', proposed_class: 'ohio-boe', proposed_tier: 'official' },
      { url: 'https://b.example/', proposed_class: 'sponsor-site', proposed_tier: 'says' },
      { url: 'https://c.example/', proposed_class: 'fec', proposed_tier: 'context' },
    );
    const got = ps.map((p) => acceptProposal(house.id, p.id, {}, ctx).source.redistributable);
    expect(got).toEqual([true, false, false]);
  });

  it('applies reviewer edits and validates the target', () => {
    const [p] = seed({ url: 'https://z.example/' });
    expect(() => acceptProposal(house.id, p!.id, { entity_id: 'nobody' }, ctx)).toThrow(
      /not a candidate/,
    );
    const r = acceptProposal(house.id, p!.id, { tier: 'official', entity_id: null }, ctx);
    expect(r.source.tier).toBe('official');
    expect(r.source).not.toHaveProperty('entity_id');
  });

  it('cannot decide the same proposal twice, and needs a reviewer id', () => {
    const [p] = seed({});
    acceptProposal(house.id, p!.id, {}, ctx);
    expect(() => acceptProposal(house.id, p!.id, {}, ctx)).toThrow(/already accepted/);
    expect(() => rejectProposal(house.id, p!.id, null, ctx)).toThrow(/already accepted/);
    const [q] = seed({ url: 'https://q.example/' });
    expect(() => acceptProposal(house.id, q!.id, {}, { ...ctx, reviewer: ' ' })).toThrow(
      /reviewer id/,
    );
  });
});

describe('rejectProposal (FR-006, FR-015a)', () => {
  it('records the decision and reason, registers nothing, and is not re-proposed', () => {
    const [p] = seed({ url: 'https://wrong.example/' });
    const r = rejectProposal(house.id, p!.id, 'not this candidate', ctx);
    expect(r).toMatchObject({
      status: 'rejected',
      decided_by: 'phil',
      decision_reason: 'not this candidate',
    });
    expect(fx.data.loadSources(house.id)).toEqual([]);
    expect(lines(log)).toMatchObject([{ action: 'reject', reason: 'not this candidate' }]);
    const again = addProposals(house.id, [newProposal({ url: 'https://wrong.example/' })], fx.data);
    expect(again.added).toEqual([]);
    expect(again.duplicate).toBe(1);
  });
  it('allows no reason, and refuses evaluative or overlong reasons', () => {
    const [p] = seed({ url: 'https://r.example/' });
    expect(checkRejectReason('  ')).toBeNull();
    expect(() => checkRejectReason('this candidate is corrupt')).toThrow(/neutral/);
    expect(() => checkRejectReason('x'.repeat(201))).toThrow(/too long/);
    expect(rejectProposal(house.id, p!.id, null, ctx).decision_reason).toBeNull();
  });
});
