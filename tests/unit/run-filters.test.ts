import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import type { ExtractInput, LlmExtractor } from '../../src/extract/extractor.ts';
import { runExtract } from '../../src/extract/run-extract.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { runFetch } from '../../src/fetch/run-fetch.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import type { Source } from '../../src/schemas/source.ts';
import { contest } from './gate-helpers.ts';

const src = (url: string, over: Partial<Source> = {}): Source => ({
  url,
  domain_class: 'candidate-site',
  tier: 'says',
  entity_id: 'jon-husted',
  redistributable: false,
  whitelisted_by: 't',
  whitelisted_at: '2026-10-01T00:00:00Z',
  notes: '',
  ...over,
});
const A = 'https://a.example/issues';
const B = 'https://b.example/issues';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-filter-'));
  const data = new DataStore(join(dir, 'data'));
  const store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources', '2026-11-03__test__oh__unspecified.yaml'),
    stringify([src(A), src(B)]),
  );
  return { data, store };
}

function fetcher(seen: string[]) {
  return new Fetcher({
    userAgent: 'test',
    rateLimitSeconds: 0.001,
    sleep: async () => {},
    fetchImpl: (async (u: string | URL | Request) => {
      const url = String(u);
      seen.push(url);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response(`<html><body>Jon Husted plans from ${url}.</body></html>`, {
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch,
  });
}

describe('onlyUrl filters', () => {
  it('runFetch fetches only the named source; without it, all sources', async () => {
    const one = setup();
    const seen1: string[] = [];
    const r1 = await runFetch({
      contestId: contest.id,
      onlyUrl: B,
      ...one,
      fetcher: fetcher(seen1),
    });
    expect(r1.entries.map((e) => e.url)).toEqual([B]);
    expect(seen1.filter((u) => !u.endsWith('robots.txt'))).toEqual([B]);

    const all = setup();
    const r2 = await runFetch({ contestId: contest.id, ...all, fetcher: fetcher([]) });
    expect(r2.entries.map((e) => e.url).sort()).toEqual([A, B]);
  });

  it('runExtract calls the model only for the named source; without it, for every fetched one', async () => {
    const s = setup();
    await runFetch({ contestId: contest.id, ...s, fetcher: fetcher([]) });
    const urls: string[] = [];
    const extractor: LlmExtractor = {
      provider: 'stub',
      model: 'stub',
      async extract(i: ExtractInput) {
        urls.push(i.snapshot.url);
        return {
          subject_name: 'Jon Husted',
          fields: [],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
    const base = {
      contestId: contest.id,
      ...s,
      extractor,
      config: loadConfig(),
      logs: { drops: join(tmpdir(), 'd.jsonl'), extractionRuns: join(tmpdir(), 'r.jsonl') },
    };
    await runExtract({ ...base, onlyUrl: A });
    expect(urls).toEqual([A]);
    urls.length = 0;
    await runExtract(base);
    expect(urls.sort()).toEqual([A, B]);
  });
});
