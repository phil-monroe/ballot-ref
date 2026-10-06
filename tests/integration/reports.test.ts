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
import { collectStatus, formatStatus } from '../../src/report/status.ts';
import { addProposals } from '../../src/discovery/queue.ts';
import { newProposal } from '../helpers/discovery-fixture.ts';
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

describe('proposed-source status (FR-017)', () => {
  it('reports pending, accepted and rejected counts and candidates with no sources', () => {
    const { data, store } = setup();
    const id = contest.id;
    const mk = (url: string) => newProposal({ contest_id: id, entity_id: 'jon-husted', url });
    const { added } = addProposals(
      id,
      [mk('https://p1.example/'), mk('https://p2.example/'), mk('https://p3.example/')],
      data,
    );
    const q = data.loadProposals(id);
    q[1] = { ...q[1]!, status: 'accepted' };
    q[2] = { ...q[2]!, status: 'rejected' };
    data.saveProposals(id, q);
    expect(added).toHaveLength(3);
    const report = collectStatus(data, store, loadConfig());
    const c = report.contests.find((x) => x.contest_id === id)!;
    expect(c.discovery).toEqual({ pending: 1, accepted: 1, rejected: 1, zero_source: [] });
    expect(formatStatus(report)).toContain('sources: 1 pending, 1 accepted, 1 rejected');

    // Reject the rest: the only candidate now has no live proposals.
    data.saveProposals(
      id,
      q.map((p) => ({ ...p, status: 'rejected' as const })),
    );
    const c2 = collectStatus(data, store, loadConfig()).contests.find((x) => x.contest_id === id)!;
    expect(c2.discovery.zero_source).toEqual(['Jon Husted']);
  });
  it('lists accepted sources whose processing failed', () => {
    const { data, store } = setup();
    mkdirSync(join(data.root, 'reports'), { recursive: true });
    writeFileSync(
      join(data.root, 'reports/processing.json'),
      JSON.stringify([
        {
          contest_id: contest.id,
          url: 'https://x.example/',
          fetched: false,
          extracted: false,
          last_error: 'http: HTTP 500',
          updated_at: '2026-10-06T00:00:00.000Z',
        },
        {
          contest_id: contest.id,
          url: 'https://y.example/',
          fetched: true,
          extracted: true,
          last_error: null,
          updated_at: '2026-10-06T00:00:00.000Z',
        },
      ]),
    );
    const report = collectStatus(data, store, loadConfig());
    expect(report.processing_failures.map((r) => r.url)).toEqual(['https://x.example/']);
    expect(formatStatus(report)).toContain('ballot-ref process');
  });
});
