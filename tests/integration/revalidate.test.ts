import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { revalidateContest } from '../../src/validate/revalidate.ts';
import { contest, sources } from '../unit/gate-helpers.ts';

function setup(snapshotText: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-'));
  const data = new DataStore(join(dir, 'data'));
  const store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources', '2026-11-03__test__oh__unspecified.yaml'),
    stringify(sources),
  );
  const meta = store.put({
    url: 'https://husted.example/issues',
    body: snapshotText ?? 'x',
    contentType: 'text/plain',
    text: snapshotText ?? 'x',
    method: 'direct',
    redistributable: false,
  });
  data.saveFields(contest.id, 'jon-husted', {
    fields: [
      {
        contest_id: contest.id,
        entity_id: 'jon-husted',
        field_key: 'priority',
        slot: 1,
        value: 'v',
        quote: 'lower grocery prices',
        source_url: 'https://husted.example/issues',
        source_hash: meta.sha256,
        retrieved_at: meta.retrieved_at,
        tier: 'says',
        status: 'approved',
        reviewer: 'phil',
        reviewed_at: meta.retrieved_at,
        extractor: { kind: 'manual' },
        needs_rereview: false,
      },
    ],
  });
  return { dir, data, store, meta };
}

describe('revalidateContest (validate command core)', () => {
  it('passes when the quote is in the stored snapshot', () => {
    const { data, store } = setup('We will lower grocery prices.');
    expect(revalidateContest(contest.id, data, store, loadConfig())).toEqual([]);
  });
  it('fails, without repairing, when the quote is not in the snapshot', () => {
    const { data, store } = setup('Completely different text.');
    const failures = revalidateContest(contest.id, data, store, loadConfig());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reason: 'quote-not-substring' });
    expect(data.loadFields(contest.id, 'jon-husted').fields[0]!.quote).toBe('lower grocery prices');
  });
  it('fails when the local snapshot body is missing (gates require the local copy)', () => {
    const { dir, data } = setup('lower grocery prices');
    const empty = new SnapshotStore(join(dir, 'elsewhere'));
    const failures = revalidateContest(contest.id, data, empty, loadConfig());
    expect(failures[0]).toMatchObject({ detail: 'snapshot is not available locally' });
  });
});
