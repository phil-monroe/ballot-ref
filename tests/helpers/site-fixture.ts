import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { symmetryPath, writeSymmetryReport } from '../../src/report/symmetry.ts';
import type { Contest } from '../../src/schemas/contest.ts';
import type { Field } from '../../src/schemas/field.ts';

export const NOW = '2026-10-05T00:00:00Z';
const H = '0'.repeat(64);

const cand = (
  id: string,
  name: string,
  party: string | null,
  order: number,
  extra: object = {},
) => ({
  id,
  ballot_name: name,
  party_label: party,
  order,
  write_in: false,
  incumbent: null,
  ticket_id: null,
  ...extra,
});
const base = {
  jurisdiction: 'oh',
  vote_for: 1,
  issue_options: [],
  ballot_snapshot_hash: H,
  ballot_page: 1,
};

export const CONTESTS: Contest[] = [
  {
    ...base,
    id: '2026-11-03:ready-race:oh:unspecified',
    kind: 'candidate',
    title: 'Ready Race',
    term: null,
    candidates: [
      cand('alpha', 'Alpha Able', 'Democratic', 0),
      cand('beta', 'Beta Baker', 'Republican', 1),
      { ...cand('write-in', 'Write-in', null, 2), write_in: true },
    ],
  },
  {
    ...base,
    id: '2026-11-03:pending-race:oh:unspecified',
    kind: 'candidate',
    title: 'Pending Race',
    term: null,
    candidates: [cand('gamma', 'Gamma Gray', null, 0), cand('delta', 'Delta Dunn', null, 1)],
  },
  {
    ...base,
    id: '2026-11-03:governor-lt-governor:oh:unspecified',
    kind: 'candidate',
    title: 'Governor and Lieutenant Governor',
    term: null,
    candidates: [
      cand('gov-one', 'Gov One', 'Democratic', 0, { ticket_id: 'ticket-1', role: 'governor' }),
      cand('lg-one', 'Lg One', 'Democratic', 0, {
        ticket_id: 'ticket-1',
        role: 'lieutenant-governor',
      }),
      cand('gov-two', 'Gov Two', 'Republican', 1, { ticket_id: 'ticket-2', role: 'governor' }),
      cand('lg-two', 'Lg Two', 'Republican', 1, {
        ticket_id: 'ticket-2',
        role: 'lieutenant-governor',
      }),
    ],
  },
  {
    ...base,
    id: '2026-11-03:levy:test-district:additional',
    kind: 'levy',
    title: 'Proposed Tax Levy (Additional) Test District',
    jurisdiction: 'test-district',
    term: null,
    candidates: [],
    issue_options: [
      { id: 'for', label: 'For the Tax Levy', order: 0 },
      { id: 'against', label: 'Against the Tax Levy', order: 1 },
    ],
    ballot_text: { title: 'Levy', entity: 'Test District', text: 'An additional tax.' },
  },
];

const SOURCE = {
  url: 'https://alpha.example/issues',
  domain_class: 'candidate-site',
  tier: 'says',
  redistributable: false,
  whitelisted_by: 'tester',
  whitelisted_at: '2026-10-01T00:00:00Z',
  notes: '',
};

export function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-site-'));
  const data = new DataStore(join(dir, 'data'));
  const store = new SnapshotStore(join(dir, 'data/snapshots'));
  const config = loadConfig();
  const sha = store.put({
    url: SOURCE.url,
    body: 'text',
    contentType: 'text/plain',
    text: 'text',
    method: 'direct',
    redistributable: false,
    retrievedAt: '2026-10-04T00:00:00Z',
  }).sha256;

  const field = (
    contest: Contest,
    entity: string,
    key: string,
    slot: number | null,
    status: Field['status'],
    quote: string,
    value = quote,
  ): Field => ({
    contest_id: contest.id,
    entity_id: entity,
    field_key: key,
    slot,
    value,
    quote,
    source_url: SOURCE.url,
    source_hash: sha,
    retrieved_at: '2026-10-04T00:00:00Z',
    tier: key === 'priority' ? 'says' : 'official',
    status,
    reviewer: status === 'proposed' ? null : 'phil',
    reviewed_at: status === 'proposed' ? null : '2026-10-04T12:00:00Z',
    extractor: { kind: 'manual' },
    needs_rereview: false,
  });

  for (const c of CONTESTS) data.saveContest(c);
  data.saveBallot(join(dir, 'data/ballots/test-1.yaml'), {
    county: 'test',
    precinct_code: '1',
    precinct_name: 'TEST 1',
    election: '2026-11-03-general',
    ballot_source: { county_slug: 'test', election_code: '20261103g_x', precinct_code: '1' },
    contests: CONTESTS.map((c) => c.id),
  });
  mkdirSync(join(dir, 'data/sources'), { recursive: true });

  const [ready, pending] = CONTESTS as [Contest, Contest, ...Contest[]];
  data.saveFields(ready.id, 'alpha', {
    fields: [
      field(ready, 'alpha', 'priority', 1, 'approved', 'ALPHA-PRIORITY-ONE'),
      field(ready, 'alpha', 'priority', 2, 'rejected', 'REJECTED-TEXT'),
    ],
  });
  data.saveFields(ready.id, 'beta', {
    fields: [field(ready, 'beta', 'priority', 1, 'edited', 'BETA-PRIORITY-ONE')],
  });
  data.saveFields(pending.id, 'gamma', {
    fields: [field(pending, 'gamma', 'priority', 1, 'proposed', 'PROPOSED-TEXT')],
  });

  // Acknowledge symmetry for the ready contests (digest-matched), not for the pending one.
  for (const id of [ready.id, CONTESTS[2]!.id, CONTESTS[3]!.id]) {
    const r = writeSymmetryReport(id, data, config);
    writeFileSync(
      symmetryPath(data, id),
      JSON.stringify({ ...r, acknowledged_by: 'phil', acknowledged_at: NOW }, null, 2),
    );
  }
  return { dir, data, store };
}

export function build(dir: string): { out: string; netLog: string } {
  const out = join(dir, 'dist');
  const netLog = join(dir, 'net.log');
  writeFileSync(netLog, '');
  execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--root', 'site'], {
    env: {
      ...process.env,
      BALLOT_REF_DATA: join(dir, 'data'),
      BALLOT_REF_OUT: out,
      BALLOT_REF_NOW: NOW,
      BALLOT_REF_NET_LOG: netLog,
      ASTRO_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--require ./tests/helpers/no-network.cjs',
    },
    stdio: 'pipe',
  });
  return { out, netLog };
}

export function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

export const read = (p: string) => readFileSync(p, 'utf8');
