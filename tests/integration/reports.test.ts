import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { runExtract } from '../../src/extract/run-extract.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { runFetch } from '../../src/fetch/run-fetch.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { collectStatus } from '../../src/report/status.ts';
import { contest, sources } from '../unit/gate-helpers.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-rep-'));
  const data = new DataStore(join(dir, 'data'));
  const store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources/2026-11-03__test__oh__unspecified.yaml'),
    stringify(sources),
  );
  return { dir, data, store };
}

describe('no silent failures (SC-012)', () => {
  it('records every retrieval failure in the status report and flags that manual import is needed', async () => {
    const { data, store } = setup();
    const fetcher = new Fetcher({
      userAgent: 'test',
      rateLimitSeconds: 0,
      sleep: async () => {},
      fetchImpl: (async (u: string | URL) =>
        String(u).endsWith('robots.txt')
          ? new Response('', { status: 404 })
          : new Response('', { status: 403 })) as typeof fetch,
    });
    const s = await runFetch({ contestId: contest.id, data, store, fetcher });
    expect(s.needsManual).toBe(true);
    const report = JSON.parse(readFileSync(join(data.root, 'reports/status.json'), 'utf8'));
    expect(
      report.some(
        (e: { url: string; outcome: string }) =>
          e.url === 'https://husted.example/issues' && e.outcome === 'blocked',
      ),
    ).toBe(true);
    expect(collectStatus(data, store, loadConfig()).retrieval_failures).toHaveLength(2); // husted + fec are both fetchable
  });
  it('records every validation drop in drops.json and in the append-only drops log', async () => {
    const { dir, data, store } = setup();
    store.put({
      url: 'https://husted.example/issues',
      body: 'plain text',
      contentType: 'text/plain',
      text: 'plain text',
      method: 'direct',
      redistributable: false,
    });
    const logs = { drops: join(dir, 'drops.jsonl'), extractionRuns: join(dir, 'runs.jsonl') };
    const summary = await runExtract({
      contestId: contest.id,
      data,
      store,
      config: loadConfig(),
      logs,
      extractor: {
        provider: 'stub',
        model: 'stub',
        extract: async () => ({
          subject_name: 'Jon Husted',
          fields: [{ field_key: 'priority', slot: 1, value: 'v', quote: 'not in the document' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    });
    expect(summary.drops).toHaveLength(1);
    const report = JSON.parse(readFileSync(join(data.root, 'reports/drops.json'), 'utf8'));
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ reason: 'quote-not-substring', entity_id: 'jon-husted' });
    expect(readFileSync(logs.drops, 'utf8').trim().split('\n')).toHaveLength(1);
  });
  it('records extraction errors instead of swallowing them', async () => {
    const { dir, data, store } = setup();
    store.put({
      url: 'https://husted.example/issues',
      body: 'x',
      contentType: 'text/plain',
      text: 'x',
      method: 'direct',
      redistributable: false,
    });
    const logs = { drops: join(dir, 'drops.jsonl'), extractionRuns: join(dir, 'runs.jsonl') };
    const s = await runExtract({
      contestId: contest.id,
      data,
      store,
      config: loadConfig(),
      logs,
      extractor: {
        provider: 'stub',
        model: 'stub',
        extract: async () => {
          throw new Error('API down');
        },
      },
    });
    expect(s.errors[0]).toMatch(/API down/);
    expect(readFileSync(logs.extractionRuns, 'utf8')).toMatch(/API down/);
  });
});
