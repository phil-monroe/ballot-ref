import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import type { Field } from '../../src/schemas/field.ts';
import { verifySite } from '../../src/verify/verify.ts';
import { contest, sources } from '../unit/gate-helpers.ts';

let dir: string;
let data: DataStore;
let store: SnapshotStore;

function put(text: string, redistributable = false) {
  return store.put({
    url: 'https://husted.example/issues',
    body: text,
    contentType: 'text/plain',
    text,
    method: 'direct',
    redistributable,
  });
}
const field = (
  sha: string,
  quote: string,
  slot: number,
  status: Field['status'] = 'approved',
): Field => ({
  contest_id: contest.id,
  entity_id: 'jon-husted',
  field_key: 'priority',
  slot,
  value: 'v',
  quote,
  source_url: 'https://husted.example/issues',
  source_hash: sha,
  retrieved_at: '2026-10-04T00:00:00Z',
  tier: 'says',
  status,
  reviewer: 'phil',
  reviewed_at: '2026-10-04T00:00:00Z',
  extractor: { kind: 'manual' },
  needs_rereview: false,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ballot-ref-verify-'));
  data = new DataStore(join(dir, 'data'));
  store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources/2026-11-03__test__oh__unspecified.yaml'),
    stringify(sources),
  );
});

describe('verify (best-effort, FR-018c)', () => {
  it('passes when every present snapshot contains its quote', () => {
    const m = put('We will lower grocery prices.');
    data.saveFields(contest.id, 'jon-husted', {
      fields: [field(m.sha256, 'lower grocery prices', 1)],
    });
    expect(verifySite(data, store)).toMatchObject({ checked: 1, mismatches: [], unverifiable: [] });
  });
  it('FAILS when a present snapshot does not contain the quote', () => {
    const m = put('Something else entirely.');
    data.saveFields(contest.id, 'jon-husted', {
      fields: [field(m.sha256, 'lower grocery prices', 1)],
    });
    expect(verifySite(data, store).mismatches).toHaveLength(1);
  });
  it('lists an absent snapshot as unverifiable here instead of failing', () => {
    const m = put('We will lower grocery prices.');
    data.saveFields(contest.id, 'jon-husted', {
      fields: [field(m.sha256, 'lower grocery prices', 1)],
    });
    rmSync(join(dir, 'data/snapshots/private'), { recursive: true }); // as on a fresh clone: metadata only
    const r = verifySite(data, store);
    expect(r.mismatches).toEqual([]);
    expect(r.unverifiable).toHaveLength(1);
    expect(r.unverifiable[0]).toMatchObject({
      source_url: 'https://husted.example/issues',
      entity_id: 'jon-husted',
    });
  });
  it('does not check unreviewed fields (only what the site would show)', () => {
    const m = put('text');
    data.saveFields(contest.id, 'jon-husted', {
      fields: [field(m.sha256, 'not in the text', 1, 'proposed')],
    });
    expect(verifySite(data, store)).toMatchObject({ checked: 0, mismatches: [] });
  });
});
