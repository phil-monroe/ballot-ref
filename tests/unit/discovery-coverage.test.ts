import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import { computeCoverage, formatCoverage } from '../../src/discovery/coverage.ts';
import { discoveryInputFor, taskText } from '../../src/discovery/prompt.ts';
import { acceptProposal } from '../../src/discovery/review.ts';
import { addProposals } from '../../src/discovery/queue.ts';
import {
  cand,
  house,
  makeDiscoveryFixture,
  newProposal,
  proposal,
} from '../helpers/discovery-fixture.ts';

const config = loadConfig(); // symmetry_threshold: 2

describe('computeCoverage (FR-008, FR-009)', () => {
  it('counts per candidate by group and status, and flags a candidate with none', () => {
    const c = computeCoverage(
      house,
      [
        proposal({ url: 'https://a.example/', proposed_class: 'fec', proposed_tier: 'official' }),
        proposal({
          url: 'https://b.example/',
          proposed_class: 'candidate-site',
          proposed_tier: 'says',
        }),
        proposal({
          url: 'https://c.example/',
          proposed_class: 'other',
          proposed_tier: 'context',
          status: 'rejected',
        }),
      ],
      config,
    );
    const t = c.rows.find((r) => r.entity_id === 'troy-balderson')!;
    expect(t).toMatchObject({ official: 1, candidate_site: 1, other: 0, pending: 2, rejected: 1 });
    expect(c.flags).toContain('Jerrad Christian: no sources found');
    expect(formatCoverage(c)).toContain('! Jerrad Christian: no sources found');
  });

  it('flags lopsided coverage using symmetry_threshold, but not a small gap', () => {
    const mk = (n: number, entity: string) =>
      Array.from({ length: n }, (_, i) =>
        proposal({ entity_id: entity, url: `https://${entity}-${i}.example/` }),
      );
    const lop = computeCoverage(
      house,
      [...mk(4, 'troy-balderson'), ...mk(1, 'jerrad-christian')],
      config,
    );
    expect(lop.flags).toEqual(['Jerrad Christian: lopsided coverage (1 vs 4)']);
    const ok = computeCoverage(
      house,
      [...mk(2, 'troy-balderson'), ...mk(1, 'jerrad-christian')],
      config,
    );
    expect(ok.flags).toEqual([]);
  });

  it('ignores rejected proposals when judging coverage, and shows contest-wide proposals separately', () => {
    const c = computeCoverage(
      house,
      [
        proposal({
          entity_id: null,
          url: 'https://boe.example/',
          proposed_class: 'ohio-boe',
          proposed_tier: 'official',
        }),
        proposal({ url: 'https://a.example/', status: 'rejected' }),
      ],
      config,
    );
    expect(c.rows.find((r) => r.entity_id === null)?.name).toBe('(contest-wide)');
    expect(c.flags).toEqual([
      'Troy Balderson: no sources found',
      'Jerrad Christian: no sources found',
    ]);
  });

  it('handles an issue: one row, no lopsided flags', () => {
    const issue = {
      ...house,
      kind: 'levy' as const,
      title: 'Levy',
      candidates: [],
      ballot_text: { title: 'Levy', entity: 'Transit Authority', text: 'x' },
    };
    const c = computeCoverage(issue, [], config);
    expect(c.rows).toHaveLength(1);
    expect(c.flags).toEqual(['Levy: no sources found']);
  });

  it('excludes write-ins', () => {
    const c = computeCoverage(
      {
        ...house,
        candidates: [...house.candidates, { ...cand('w', 'Write-in', 2), write_in: true }],
      },
      [],
      config,
    );
    expect(c.rows.map((r) => r.entity_id)).toEqual(['troy-balderson', 'jerrad-christian']);
  });
});

describe('same search task for every candidate (FR-008)', () => {
  it('differs between candidates only in their identifying line', () => {
    const lines = taskText(discoveryInputFor(house)).split('\n');
    const shape = lines
      .filter((l) => l.startsWith('- entity_id:'))
      .map((l) => l.replace(/^- entity_id: \S+ \| ballot name: [^|]+\| party: .*/, 'X'));
    expect(new Set(shape).size).toBe(1);
  });
});

describe('accept is never gated by coverage (FR-008a)', () => {
  it('accepts a source for a candidate while the other has none', () => {
    const fx = makeDiscoveryFixture();
    const { added } = addProposals(
      house.id,
      [
        newProposal({
          url: 'https://only-one.example/',
          proposed_class: 'sponsor-site',
          proposed_tier: 'says',
        }),
      ],
      fx.data,
    );
    const r = acceptProposal(
      house.id,
      added[0]!.id,
      {},
      { reviewer: 'phil', data: fx.data, decisionsLog: `${fx.dir}/d.jsonl` },
    );
    expect(r.proposal.status).toBe('accepted');
    // The other candidate still has nothing, and that is only reported, not enforced.
    expect(computeCoverage(house, fx.data.loadProposals(house.id), config).flags).toEqual([
      'Jerrad Christian: no sources found',
    ]);
  });
});
