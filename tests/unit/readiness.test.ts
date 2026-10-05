import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { acknowledgeSymmetry } from '../../src/review/symmetry.ts';
import { evaluateReadiness } from '../../src/review/readiness.ts';
import type { Field } from '../../src/schemas/field.ts';
import { contest, sources } from './gate-helpers.ts';

const config = loadConfig();
const T0 = new Date('2026-10-05T00:00:00Z');
let data: DataStore;
let store: SnapshotStore;
let sha: string;

const field = (over: Partial<Field>): Field => ({
  contest_id: contest.id,
  entity_id: 'jon-husted',
  field_key: 'priority',
  slot: 1,
  value: 'v',
  quote: 'q',
  source_url: 'https://husted.example/issues',
  source_hash: sha,
  retrieved_at: '2026-10-04T00:00:00Z',
  tier: 'says',
  status: 'approved',
  reviewer: 'phil',
  reviewed_at: '2026-10-04T00:00:00Z',
  extractor: { kind: 'manual' },
  needs_rereview: false,
  ...over,
});
const save = (fields: Field[]) => data.saveFields(contest.id, 'jon-husted', { fields });
const ready = (now = T0) => evaluateReadiness(contest.id, data, store, config, now);

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-'));
  process.chdir(dir);
  data = new DataStore(join(dir, 'data'));
  store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources/2026-11-03__test__oh__unspecified.yaml'),
    stringify(sources),
  );
  sha = store.put({
    url: 'https://husted.example/issues',
    body: 'q',
    contentType: 'text/plain',
    text: 'q',
    method: 'direct',
    redistributable: false,
    retrievedAt: '2026-10-04T00:00:00Z',
  }).sha256;
  save([field({})]);
});

describe('contest readiness (FR-039)', () => {
  it('is blocked until the symmetry report is acknowledged', () => {
    expect(ready().reasons.join()).toMatch(/symmetry report not/);
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    expect(ready()).toEqual({ ready: true, reasons: [] });
  });
  it('is blocked by unreviewed (proposed) fields', () => {
    save([field({}), field({ slot: 2, status: 'proposed', reviewer: null, reviewed_at: null })]);
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    expect(ready().reasons).toEqual(['1 field(s) not yet reviewed']);
  });
  it('is blocked by a field that needs re-review', () => {
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    save([field({ needs_rereview: true })]);
    expect(ready().reasons.join()).toMatch(/need re-review/);
  });
  it('voids the symmetry acknowledgment when field content changes afterwards', () => {
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    save([field({}), field({ slot: 2, quote: 'q2' })]);
    expect(ready().reasons.join()).toMatch(/out of date/);
  });
  it('does not void the acknowledgment when a field is merely approved', () => {
    save([field({ status: 'proposed', reviewer: null, reviewed_at: null })]);
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    save([field({})]);
    expect(ready().ready).toBe(true);
  });
  it('is blocked by a stale snapshot (> 7 days) and cleared by a refetch confirmation', () => {
    acknowledgeSymmetry(contest.id, 'phil', data, config, T0);
    const later = new Date('2026-10-20T00:00:00Z');
    expect(ready(later).reasons.join()).toMatch(/stale snapshot/);
    store.confirm(sha, '2026-10-19T00:00:00Z');
    expect(ready(later).ready).toBe(true);
  });
});
