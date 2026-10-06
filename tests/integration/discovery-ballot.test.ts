import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import type { DiscoveryAgent } from '../../src/discovery/agent.ts';
import { runBallotDiscovery } from '../../src/discovery/run-ballot.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { cand, house } from '../helpers/discovery-fixture.ts';

const config = loadConfig();
const N = 22;
const ids = Array.from(
  { length: N },
  (_, i) => `2026-11-03:test-${String(i).padStart(2, '0')}:oh:unspecified`,
);

let dir: string;
let data: DataStore;
let logPath: string;
let calls: string[];
let failing: Set<string>;

const ballotYaml = (contests: string[]) => ({
  county: 'delaware',
  precinct_code: '154/1',
  precinct_name: 'Test',
  election: '2026-11-03-general',
  ballot_source: { county_slug: 'delaware', election_code: 'x', precinct_code: '154___1' },
  contests,
});

function agent(): DiscoveryAgent {
  return {
    provider: 'stub',
    model: 'stub',
    tools: ['WebSearch', 'WebFetch'],
    async discover(input) {
      calls.push(input.contest.id);
      if (failing.has(input.contest.id)) throw new Error('rate limited');
      return {
        results: [
          {
            entity_id: input.candidates[0]!.entity_id,
            url: `https://site-${input.contest.id.split(':')[1]}-${input.candidates[0]!.entity_id}.example/`,
            class_guess: 'candidate-site',
            tier_guess: 'says',
            reason: 'Campaign website',
          },
        ],
        searched: [],
        usage: { input_tokens: 1, output_tokens: 1, models: ['stub'] },
      };
    },
  };
}

const fetcher = () =>
  new Fetcher({
    userAgent: 't',
    rateLimitSeconds: 0.001,
    sleep: async () => {},
    maxAttempts: 1,
    fetchImpl: (async (u: string | URL | Request) =>
      String(u).endsWith('/robots.txt')
        ? new Response('', { status: 404 })
        : new Response(`<html><body>${'filler '.repeat(60)}</body></html>`, {
            headers: { 'content-type': 'text/html' },
          })) as typeof fetch,
  });

const run = (ballotFile: string, refresh = false) =>
  runBallotDiscovery({
    ballotFile,
    data,
    agent: agent(),
    fetcher: fetcher(),
    config,
    refresh,
    logPath,
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ballot-ref-ballot-'));
  data = new DataStore(join(dir, 'data'));
  logPath = join(dir, 'runs.jsonl');
  calls = [];
  failing = new Set();
  mkdirSync(join(dir, 'data/ballots'), { recursive: true });
  for (const id of ids)
    data.saveContest({
      ...house,
      id,
      candidates: [cand('alpha', 'Alpha One', 0), cand('beta', 'Beta Two', 1)],
    });
  writeFileSync(join(dir, 'data/ballots/a.yaml'), stringify(ballotYaml(ids)));
  writeFileSync(join(dir, 'data/ballots/b.yaml'), stringify(ballotYaml([ids[0]!, ids[1]!])));
});

describe('whole-ballot discovery (US4)', () => {
  it('discovers every contest in ballot order, continues past a failure, and reports pending counts', async () => {
    failing.add(ids[5]!);
    const results = await run(join(dir, 'data/ballots/a.yaml'));
    expect(results).toHaveLength(N);
    expect(results.map((r) => r.contest_id)).toEqual(ids);
    expect(results.filter((r) => r.outcome === 'discovered')).toHaveLength(N - 1);
    expect(results[5]).toMatchObject({ outcome: 'failed', pending: 0 });
    expect(results[5]!.error).toMatch(/alpha: rate limited; beta: rate limited/);
    expect(results[0]).toMatchObject({ outcome: 'discovered', added: 2, pending: 2 }); // one per candidate
    for (const id of ids.filter((x) => x !== ids[5]))
      expect(data.loadProposals(id)).toHaveLength(2);
  });

  it('a second run skips discovered contests and retries only the failed one', async () => {
    failing.add(ids[5]!);
    await run(join(dir, 'data/ballots/a.yaml'));
    calls.length = 0;
    failing.clear();
    const again = await run(join(dir, 'data/ballots/a.yaml'));
    expect(calls).toEqual([ids[5], ids[5]]); // one call per candidate
    expect(again.filter((r) => r.outcome === 'skipped')).toHaveLength(N - 1);
    expect(again[5]).toMatchObject({ outcome: 'discovered', added: 2 });
  });

  it('researches a contest shared by two ballots once (FR-018)', async () => {
    await run(join(dir, 'data/ballots/a.yaml'));
    calls.length = 0;
    const second = await run(join(dir, 'data/ballots/b.yaml'));
    expect(calls).toEqual([]);
    expect(second.map((r) => r.outcome)).toEqual(['skipped', 'skipped']);
    expect(second[0]!.pending).toBe(2); // the earlier proposals are reused
  });

  it('--refresh re-runs everything but adds zero duplicates (SC-006)', async () => {
    await run(join(dir, 'data/ballots/a.yaml'));
    calls.length = 0;
    const refreshed = await run(join(dir, 'data/ballots/a.yaml'), true);
    expect(calls).toHaveLength(N * 2);
    expect(refreshed.every((r) => r.outcome === 'discovered' && r.added === 0)).toBe(true);
    for (const id of ids) expect(data.loadProposals(id)).toHaveLength(2);
  });
});
