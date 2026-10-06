import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import {
  ProcessQueue,
  loadProcessing,
  outstandingSources,
  processOutstanding,
  processSource,
  type ProcessDeps,
} from '../../src/discovery/process.ts';
import type { ExtractInput, LlmExtractor } from '../../src/extract/extractor.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import type { Source } from '../../src/schemas/source.ts';
import { house, makeDiscoveryFixture, type Fixture } from '../helpers/discovery-fixture.ts';

const src = (url: string, over: Partial<Source> = {}): Source => ({
  url,
  domain_class: 'candidate-site',
  tier: 'says',
  entity_id: 'troy-balderson',
  redistributable: false,
  whitelisted_by: 'phil',
  whitelisted_at: '2026-10-06T00:00:00Z',
  notes: '',
  ...over,
});
const A = 'https://a.example/priorities';
const B = 'https://b.example/priorities';
const CTX = 'https://news.example/story';

let fx: Fixture;
let requested: string[];
let extractCalls: string[];
let failFetch: Set<string>;
let failExtract: boolean;

function deps(): ProcessDeps {
  const extractor: LlmExtractor = {
    provider: 'stub',
    model: 'stub',
    async extract(i: ExtractInput) {
      extractCalls.push(i.snapshot.url);
      if (failExtract) throw new Error('claude exited 1');
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
  return {
    data: fx.data,
    store: fx.store,
    config: loadConfig(),
    extractor,
    logs: { drops: join(fx.dir, 'drops.jsonl'), extractionRuns: join(fx.dir, 'runs.jsonl') },
    fetcher: new Fetcher({
      userAgent: 't',
      rateLimitSeconds: 0.001,
      sleep: async () => {},
      maxAttempts: 1,
      fetchImpl: (async (u: string | URL | Request) => {
        const url = String(u);
        if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
        requested.push(url);
        if (failFetch.has(url)) return new Response('', { status: 500 });
        return new Response(
          `<html><body><p>Troy Balderson says: lower taxes for working families. Page ${url}</p></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        );
      }) as typeof fetch,
    }),
  };
}

beforeEach(() => {
  fx = makeDiscoveryFixture(house, [
    src(A),
    src(B),
    src(CTX, { domain_class: 'other', tier: 'context' }),
  ]);
  requested = [];
  extractCalls = [];
  failFetch = new Set();
  failExtract = false;
});

describe('processSource (FR-005a)', () => {
  it('fetches and extracts only the named source; fields land as proposed through the gates', async () => {
    const rec = await processSource(house.id, A, deps());
    expect(rec).toMatchObject({ url: A, fetched: true, extracted: true, last_error: null });
    expect(requested).toEqual([A]);
    expect(extractCalls).toEqual([A]);
    const fields = fx.data.loadFields(house.id, 'troy-balderson').fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ status: 'proposed', source_url: A });
    expect(loadProcessing(fx.data)).toHaveLength(1);
  });

  it('never fetches or extracts a link-only source', async () => {
    expect(await processSource(house.id, CTX, deps())).toBeNull();
    expect(requested).toEqual([]);
    expect(extractCalls).toEqual([]);
  });

  it('records a fetch failure in processing.json and the retrieval status report', async () => {
    failFetch.add(A);
    const rec = await processSource(house.id, A, deps());
    expect(rec).toMatchObject({ fetched: false, extracted: false });
    expect(rec!.last_error).toMatch(/failed|http/i);
    expect(extractCalls).toEqual([]);
    const status = JSON.parse(readFileSync(join(fx.dir, 'data/reports/status.json'), 'utf8'));
    expect(
      status.some((e: { url: string; outcome: string }) => e.url === A && e.outcome !== 'ok'),
    ).toBe(true);
  });

  it('records an extraction failure and keeps the snapshot', async () => {
    failExtract = true;
    const rec = await processSource(house.id, A, deps());
    expect(rec).toMatchObject({ fetched: true, extracted: false });
    expect(rec!.last_error).toMatch(/claude exited/);
  });
});

describe('ProcessQueue', () => {
  it('runs enqueued jobs serially in the background and drains', async () => {
    const q = new ProcessQueue(deps());
    q.enqueue(house.id, A);
    q.enqueue(house.id, B);
    q.enqueue(house.id, CTX);
    expect(q.pending).toBe(3);
    const done = await q.drain();
    expect(q.pending).toBe(0);
    expect(done.map((r) => r.url)).toEqual([A, B]);
    expect(extractCalls).toEqual([A, B]);
  });
});

describe('process retry (FR-005b)', () => {
  it('retries only unfetched or unextracted sources and is idempotent', async () => {
    failFetch.add(B);
    await processSource(house.id, A, deps());
    await processSource(house.id, B, deps());
    expect(outstandingSources(house.id, deps())).toEqual([{ contest_id: house.id, url: B }]);

    failFetch.clear();
    requested.length = 0;
    extractCalls.length = 0;
    const retried = await processOutstanding(deps(), [house.id]);
    expect(retried.map((r) => [r.url, r.fetched, r.extracted])).toEqual([[B, true, true]]);
    expect(requested).toEqual([B]);

    // Nothing left: a second retry makes no requests and no model calls.
    requested.length = 0;
    extractCalls.length = 0;
    expect(await processOutstanding(deps(), [house.id])).toEqual([]);
    expect(requested).toEqual([]);
    expect(extractCalls).toEqual([]);
  });

  it('retries an extraction that failed after a good fetch without refetching', async () => {
    failExtract = true;
    await processSource(house.id, A, deps());
    failExtract = false;
    requested.length = 0;
    const r = await processOutstanding(deps(), [house.id]);
    expect(r.find((x) => x.url === A)).toMatchObject({ fetched: true, extracted: true });
    expect(requested).not.toContain(A); // already stored; not re-requested
  });
});
