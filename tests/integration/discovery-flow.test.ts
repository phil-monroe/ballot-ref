import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import type { DiscoveryAgent, DiscoveryOutput } from '../../src/discovery/agent.ts';
import { runDiscovery } from '../../src/discovery/run-discovery.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { house, makeDiscoveryFixture, type Fixture } from '../helpers/discovery-fixture.ts';
import { ProcessQueue, type ProcessDeps } from '../../src/discovery/process.ts';
import { acceptProposal, rejectProposal } from '../../src/discovery/review.ts';
import type { ExtractInput, LlmExtractor } from '../../src/extract/extractor.ts';
import { runExtract } from '../../src/extract/run-extract.ts';
import { nextToReview } from '../../src/review/queue.ts';

const config = loadConfig();

const page = (body: string) =>
  `<html><body><p>${'Information for voters in the district. '.repeat(10)}${body}</p></body></html>`;

const PAGES: Record<string, string> = {
  'https://www.fec.gov/data/candidate/H8OH12180/': page('FEC filings'),
  'https://balderson.example/': page('Troy Balderson for Congress, Ohio 12th District'),
  'https://dayton-plumbing.example/': page('Troy Balderson, plumber in Dayton'),
};

const fetcher = () =>
  new Fetcher({
    userAgent: 'test',
    rateLimitSeconds: 0.001,
    sleep: async () => {},
    maxAttempts: 1,
    fetchImpl: (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      const body = PAGES[url];
      if (!body) throw new Error('ENOTFOUND');
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    }) as typeof fetch,
  });

/**
 * One agent call is made per candidate. The stub hands each call the results that belong to it: its own
 * candidate's, contest-wide ones (null), and, on the first call only, results naming someone not on the ballot.
 */
function stubAgent(results: unknown[], searched: DiscoveryOutput['searched'] = []): DiscoveryAgent {
  const onBallot = new Set(house.candidates.map((c) => c.id));
  return {
    provider: 'stub',
    model: 'stub-model',
    tools: ['WebSearch', 'WebFetch'],
    async discover(input) {
      const me = input.candidates[0]?.entity_id ?? null;
      const first = me === house.candidates[0]!.id;
      return {
        results: results.filter((x) => {
          const e = (x as { entity_id?: string | null }).entity_id;
          return e === me || e === null || (first && typeof e === 'string' && !onBallot.has(e));
        }),
        searched: first ? searched : [],
        usage: { input_tokens: 1, output_tokens: 1, models: ['stub-model'] },
      };
    },
  };
}

const r = (over: Record<string, unknown>) => ({
  entity_id: 'troy-balderson',
  url: 'https://www.fec.gov/data/candidate/H8OH12180/',
  class_guess: 'fec',
  tier_guess: 'done',
  reason: 'FEC candidate overview',
  ...over,
});

const tree = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out[p.slice(dir.length)] = readFileSync(p, 'utf8');
    }
  };
  for (const sub of ['data/sources', 'data/fields']) walk(join(dir, sub));
  return out;
};

describe('discovery run (US1)', () => {
  let fx: Fixture;
  let logPath: string;
  beforeEach(() => {
    fx = makeDiscoveryFixture();
    logPath = join(fx.dir, 'runs.jsonl');
  });
  const run = (agent: DiscoveryAgent) =>
    runDiscovery({
      contestId: house.id,
      data: fx.data,
      agent,
      fetcher: fetcher(),
      config,
      logPath,
      runId: 'run-test',
      now: () => new Date('2026-10-06T12:00:00Z'),
    });

  it('queues validated proposals, marks a candidate with none, and logs the run', async () => {
    const before = tree(fx.dir);
    const { run: rec, added } = await run(
      stubAgent(
        [
          r({}),
          r({
            url: 'https://balderson.example/',
            class_guess: 'candidate-site',
            tier_guess: 'says',
            reason: 'Campaign website',
            site_shows_name_and_office: true,
          }),
          r({
            url: 'https://dayton-plumbing.example/',
            class_guess: 'candidate-site',
            tier_guess: 'says',
            reason: 'Website for a person with the same name',
            site_shows_name_and_office: true,
          }),
          r({
            url: 'https://ballotpedia.org/Troy_Balderson',
            class_guess: 'sponsor-site',
            tier_guess: 'says',
          }),
          r({ url: 'https://unreachable.example/' }),
          r({ url: 'ftp://nope.example/' }), // invalid scheme
          r({ entity_id: 'someone-else', url: 'https://x.example/' }), // not on this ballot
          r({ reason: 'x'.repeat(200), url: 'https://long.example/' }), // reason too long
        ],
        [{ entity_id: 'troy-balderson', topic: 'FEC filings' }],
      ),
    );
    const queue = fx.data.loadProposals(house.id);
    expect(added).toHaveLength(5);
    expect(rec).toMatchObject({ returned: 8, added: 5, invalid: 3, error: null });

    const by = (u: string) => queue.find((p) => p.url === u)!;
    expect(by('https://www.fec.gov/data/candidate/H8OH12180/').validity.status).toBe('ok');
    expect(by('https://balderson.example/').identity_label).toBe('identity-matched');
    // The agent claimed a match, but the page does not support it.
    expect(by('https://dayton-plumbing.example/').identity_label).toBe('possible-match');
    // Link-only host is forced to context and never fetched.
    expect(by('https://ballotpedia.org/Troy_Balderson')).toMatchObject({
      proposed_tier: 'context',
      proposed_class: 'other',
    });
    expect(by('https://unreachable.example/').validity.status).toBe('unreachable');
    for (const p of queue)
      expect(p).toMatchObject({ status: 'pending', run_id: 'run-test', decided_by: null });

    // Every candidate with no proposals is explicit; the other candidate has some.
    expect(rec.no_sources_found).toEqual(['jerrad-christian']);

    const log = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      run_id: 'run-test',
      model: 'stub-model',
      prompt_version: 'v1',
      tools: ['WebSearch', 'WebFetch'],
      no_sources_found: ['jerrad-christian'],
    });

    // FR-003 / SC-003: registry and fields are untouched.
    expect(tree(fx.dir)).toEqual(before);
  });

  it('keeps a failure as a logged error with no proposals and no side effects', async () => {
    const failing: DiscoveryAgent = {
      provider: 'stub',
      model: 'stub-model',
      tools: ['WebSearch', 'WebFetch'],
      async discover() {
        throw new Error('claude exited 1: rate limited');
      },
    };
    const before = tree(fx.dir);
    const { run: rec, added } = await run(failing);
    expect(rec.error).toMatch(/rate limited/);
    expect(added).toEqual([]);
    expect(rec.no_sources_found).toEqual(['troy-balderson', 'jerrad-christian']);
    expect(tree(fx.dir)).toEqual(before);
    expect(readFileSync(logPath, 'utf8')).toContain('rate limited');
  });

  it("makes one call per candidate with an identical task, and keeps the others' results when one call fails", async () => {
    const seen: string[] = [];
    const flaky: DiscoveryAgent = {
      provider: 'stub',
      model: 'stub-model',
      tools: ['WebSearch', 'WebFetch'],
      async discover(input) {
        const me = input.candidates[0]!.entity_id;
        seen.push(me);
        expect(input.candidates).toHaveLength(1);
        if (me === 'jerrad-christian') throw new Error('rate limited');
        return {
          results: [r({ entity_id: me })],
          searched: [],
          usage: { input_tokens: 1, output_tokens: 1, models: ['stub-model'] },
        };
      },
    };
    const { run: rec, added } = await run(flaky);
    expect(seen).toEqual(['troy-balderson', 'jerrad-christian']);
    expect(added.map((p) => p.entity_id)).toEqual(['troy-balderson']); // partial results kept
    expect(rec.error).toMatch(/jerrad-christian: rate limited/);
    expect(rec.no_sources_found).toEqual(['jerrad-christian']);
  });

  it('rejects a result that names a different candidate than the call was for', async () => {
    const wrong: DiscoveryAgent = {
      provider: 'stub',
      model: 'stub-model',
      tools: ['WebSearch', 'WebFetch'],
      async discover(input) {
        const me = input.candidates[0]!.entity_id;
        const other = me === 'troy-balderson' ? 'jerrad-christian' : 'troy-balderson';
        return {
          results: [r({ entity_id: other, url: `https://x-${me}.example/` })],
          searched: [],
          usage: { input_tokens: 1, output_tokens: 1, models: ['stub-model'] },
        };
      },
    };
    const { run: rec, added } = await run(wrong);
    expect(added).toEqual([]);
    expect(rec.invalid).toBe(2);
  });

  it('canonicalizes URLs the model returns (stray spaces)', async () => {
    const { added } = await run(
      stubAgent([
        r({
          url: 'https://balderson.example/Troy Balderson',
          class_guess: 'other',
          tier_guess: 'context',
        }),
      ]),
    );
    expect(added[0]!.url).toBe('https://balderson.example/Troy%20Balderson');
  });

  it('adds no duplicates on a second run', async () => {
    const agent = stubAgent([r({})]);
    await run(agent);
    const second = await run(agent);
    expect(second.added).toHaveLength(0);
    expect(second.run.skipped_duplicate).toBe(1);
    expect(fx.data.loadProposals(house.id)).toHaveLength(1);
  });
});

// ---- US2: review and register, with background processing ------------------------------------------------

describe('discover, review, register, extract (US2)', () => {
  it('accept registers + processes in the background; reject and skip leave no trace in the registry', async () => {
    const fx = makeDiscoveryFixture();
    const logPath = join(fx.dir, 'runs.jsonl');
    const decisions = join(fx.dir, 'decisions.jsonl');
    const SITE = 'https://balderson.example/';
    PAGES[SITE] = page(
      'Troy Balderson for Congress, Ohio 12th District. I will lower taxes for working families.',
    );

    await runDiscovery({
      contestId: house.id,
      data: fx.data,
      agent: stubAgent([
        r({}),
        r({
          url: SITE,
          class_guess: 'candidate-site',
          tier_guess: 'says',
          reason: 'Campaign website',
          site_shows_name_and_office: true,
        }),
        r({
          url: 'https://dayton-plumbing.example/',
          class_guess: 'candidate-site',
          tier_guess: 'says',
        }),
      ]),
      fetcher: fetcher(),
      config,
      logPath,
    });
    const q = fx.data.loadProposals(house.id);
    const byUrl = (u: string) => q.find((p) => p.url === u)!;
    const ctx = { reviewer: 'phil', data: fx.data, decisionsLog: decisions };

    const extractCalls: string[] = [];
    const extractor: LlmExtractor = {
      provider: 'stub',
      model: 'stub',
      async extract(i: ExtractInput) {
        extractCalls.push(i.snapshot.url);
        return {
          subject_name: 'Troy Balderson',
          fields: [
            {
              field_key: 'priority',
              slot: 1,
              value: 'Lower taxes',
              quote: 'lower taxes for working families',
              author: null,
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
    const deps: ProcessDeps = {
      data: fx.data,
      store: fx.store,
      fetcher: fetcher(),
      extractor,
      config,
      logs: { drops: join(fx.dir, 'drops.jsonl'), extractionRuns: join(fx.dir, 'xruns.jsonl') },
    };
    const queue = new ProcessQueue(deps);

    // Accept the candidate site (with ownership confirmed): registered, then processed in the background.
    const { source } = acceptProposal(house.id, byUrl(SITE).id, { ownership_confirmed: true }, ctx);
    queue.enqueue(house.id, source.url);
    // Reject one with a neutral reason; leave the FEC proposal pending (skipped).
    rejectProposal(
      house.id,
      byUrl('https://dayton-plumbing.example/').id,
      'not this candidate',
      ctx,
    );
    const done = await queue.drain();

    expect(fx.data.loadSources(house.id)).toEqual([source]);
    expect(source.whitelisted_by).toBe('phil');
    const after = fx.data.loadProposals(house.id);
    expect(after.map((p) => [p.url, p.status])).toEqual([
      ['https://www.fec.gov/data/candidate/H8OH12180/', 'pending'],
      [SITE, 'accepted'],
      ['https://dayton-plumbing.example/', 'rejected'],
    ]);
    expect(done).toMatchObject([{ url: SITE, fetched: true, extracted: true }]);
    expect(extractCalls).toEqual([SITE]);

    // Extracted fields are only proposed; nothing is published until a human approves them.
    const fields = fx.data.loadFields(house.id, 'troy-balderson').fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]!.status).toBe('proposed');
    expect(nextToReview(fx.data, house.id)?.field.source_url).toBe(SITE);

    // A re-run proposes nothing already registered, rejected, or pending.
    const again = await runDiscovery({
      contestId: house.id,
      data: fx.data,
      agent: stubAgent([
        r({}),
        r({ url: SITE, class_guess: 'candidate-site', tier_guess: 'says' }),
      ]),
      fetcher: fetcher(),
      config,
      logPath,
    });
    expect(again.added).toEqual([]);
  });

  it('refuses extraction for a source that is only proposed (not registered)', async () => {
    const fx = makeDiscoveryFixture();
    await runDiscovery({
      contestId: house.id,
      data: fx.data,
      agent: stubAgent([r({})]),
      fetcher: fetcher(),
      config,
      logPath: join(fx.dir, 'runs.jsonl'),
    });
    let called = 0;
    const extractor: LlmExtractor = {
      provider: 'stub',
      model: 'stub',
      async extract() {
        called++;
        return { subject_name: null, fields: [], usage: { input_tokens: 0, output_tokens: 0 } };
      },
    };
    const s = await runExtract({
      contestId: house.id,
      data: fx.data,
      store: fx.store,
      extractor,
      config,
      logs: { drops: join(fx.dir, 'd.jsonl'), extractionRuns: join(fx.dir, 'x.jsonl') },
    });
    expect(called).toBe(0);
    expect(s.calls).toBe(0);
  });
});
