import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { proposalId, type NewProposal } from '../../src/discovery/queue.ts';
import type { Contest } from '../../src/schemas/contest.ts';
import type { Proposal } from '../../src/schemas/proposal.ts';
import type { Source } from '../../src/schemas/source.ts';

export const cand = (id: string, name: string, order: number, party = 'Republican') => ({
  id,
  ballot_name: name,
  party_label: party,
  order,
  write_in: false,
  incumbent: null,
  ticket_id: null,
});

/** A two-candidate U.S. House contest. */
export const house: Contest = {
  id: '2026-11-03:us-house:oh-12:unspecified',
  kind: 'candidate',
  title: 'Representative to Congress (12th District)',
  jurisdiction: 'oh-12',
  term: null,
  vote_for: 1,
  candidates: [
    cand('troy-balderson', 'Troy Balderson', 0),
    cand('jerrad-christian', 'Jerrad Christian', 1, 'Democratic'),
  ],
  issue_options: [],
  ballot_snapshot_hash: '0'.repeat(64),
  ballot_page: 1,
};

export interface Fixture {
  dir: string;
  data: DataStore;
  store: SnapshotStore;
}

export function makeDiscoveryFixture(contest: Contest = house, sources: Source[] = []): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-disc-'));
  const data = new DataStore(join(dir, 'data'));
  data.saveContest(contest);
  if (sources.length) {
    mkdirSync(join(dir, 'data/sources'), { recursive: true });
    writeFileSync(
      join(dir, 'data/sources', `${contest.id.replaceAll(':', '__')}.yaml`),
      stringify(sources),
    );
  }
  return { dir, data, store: new SnapshotStore(join(dir, 'data/snapshots')) };
}

export function newProposal(over: Partial<NewProposal> = {}): NewProposal {
  return {
    contest_id: house.id,
    entity_id: 'troy-balderson',
    url: 'https://www.fec.gov/data/candidate/H8OH12180/',
    final_url: null,
    proposed_class: 'fec',
    proposed_tier: 'done',
    reason: 'FEC candidate overview page',
    identity_label: null,
    validity: { status: 'ok', note: '' },
    run_id: 'run-1',
    found_at: '2026-10-06T00:00:00.000Z',
    status: 'pending',
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    accepted_as: null,
    ownership_confirmed: null,
    ...over,
  };
}

export const proposal = (over: Partial<NewProposal> = {}): Proposal => {
  const n = newProposal(over);
  return { ...n, id: proposalId(n.contest_id, n.entity_id, n.url) };
};
