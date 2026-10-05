import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { ReviewError, applyReview } from '../../src/review/actions.ts';
import { highlightQuote } from '../../src/review/context.ts';
import type { Field } from '../../src/schemas/field.ts';
import { contest, sources } from './gate-helpers.ts';

const config = loadConfig();
const ref = { contestId: contest.id, entityId: 'jon-husted', fieldKey: 'priority', slot: 1 };
let data: DataStore;
let store: SnapshotStore;
let ctx: {
  reviewer: string;
  data: DataStore;
  store: SnapshotStore;
  config: typeof config;
  now: Date;
};

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ballot-ref-'));
  process.chdir(dir); // review log is written relative to the working directory
  data = new DataStore(join(dir, 'data'));
  store = new SnapshotStore(join(dir, 'data/snapshots'));
  data.saveContest(contest);
  mkdirSync(join(dir, 'data/sources'), { recursive: true });
  writeFileSync(
    join(dir, 'data/sources/2026-11-03__test__oh__unspecified.yaml'),
    stringify(sources),
  );
  const meta = store.put({
    url: 'https://husted.example/issues',
    body: 'We will lower grocery prices for families.',
    contentType: 'text/plain',
    text: 'We will lower grocery prices for families.',
    method: 'direct',
    redistributable: false,
  });
  const field: Field = {
    contest_id: contest.id,
    entity_id: 'jon-husted',
    field_key: 'priority',
    slot: 1,
    value: 'groceries',
    quote: 'lower grocery prices',
    source_url: meta.url,
    source_hash: meta.sha256,
    retrieved_at: meta.retrieved_at,
    tier: 'says',
    status: 'proposed',
    reviewer: null,
    reviewed_at: null,
    extractor: { kind: 'model', model: 'm', prompt_version: 'v1' },
    needs_rereview: false,
  };
  data.saveFields(contest.id, 'jon-husted', { fields: [field] });
  ctx = { reviewer: 'phil', data, store, config, now: new Date('2026-10-05T00:00:00Z') };
});

const status = () => data.loadFields(contest.id, 'jon-husted').fields[0]!;

describe('review actions', () => {
  it('approve: proposed -> approved with reviewer and time', () => {
    applyReview(ref, { kind: 'approve' }, ctx);
    expect(status()).toMatchObject({
      status: 'approved',
      reviewer: 'phil',
      reviewed_at: '2026-10-05T00:00:00.000Z',
    });
  });
  it('reject: proposed -> rejected', () => {
    applyReview(ref, { kind: 'reject' }, ctx);
    expect(status().status).toBe('rejected');
  });
  it('edit: proposed -> edited when the edit passes the gates', () => {
    applyReview(
      ref,
      { kind: 'edit', value: 'grocery costs', quote: 'grocery prices for families' },
      ctx,
    );
    expect(status()).toMatchObject({
      status: 'edited',
      value: 'grocery costs',
      quote: 'grocery prices for families',
    });
  });
  it('edit that fails a gate is refused and changes nothing', () => {
    expect(() => applyReview(ref, { kind: 'edit', quote: 'cut the cost of food' }, ctx)).toThrow(
      ReviewError,
    );
    expect(status()).toMatchObject({ status: 'proposed', quote: 'lower grocery prices' });
    expect(() => applyReview(ref, { kind: 'edit', quote: 'x '.repeat(30) }, ctx)).toThrow(
      /quote-too-long|quote-not-substring/,
    );
  });
  it('approve is refused when the local snapshot is missing (gates need the local copy)', () => {
    expect(() =>
      applyReview(
        ref,
        { kind: 'approve' },
        { ...ctx, store: new SnapshotStore(join(tmpdir(), 'nowhere-' + Date.now())) },
      ),
    ).toThrow(/not available locally/);
  });
  it('requires a reviewer id', () => {
    expect(() => applyReview(ref, { kind: 'approve' }, { ...ctx, reviewer: '  ' })).toThrow(
      /reviewer id/,
    );
  });
  it('cannot re-review an already approved field', () => {
    applyReview(ref, { kind: 'approve' }, ctx);
    expect(() => applyReview(ref, { kind: 'reject' }, ctx)).toThrow(/only proposed/);
  });
  it('a needs_rereview field can be re-approved, clearing the flag', () => {
    applyReview(ref, { kind: 'approve' }, ctx);
    const file = data.loadFields(contest.id, 'jon-husted');
    file.fields[0]!.needs_rereview = true;
    data.saveFields(contest.id, 'jon-husted', file);
    applyReview(ref, { kind: 'approve' }, ctx);
    expect(status().needs_rereview).toBe(false);
  });
  it('logs every decision with reviewer id and before/after', () => {
    applyReview(ref, { kind: 'approve' }, ctx);
    const line = JSON.parse(readFileSync('data/logs/review.jsonl', 'utf8').trim());
    expect(line).toMatchObject({
      action: 'approve',
      reviewer: 'phil',
      before: { status: 'proposed' },
      after: { status: 'approved' },
    });
  });
});

describe('highlightQuote', () => {
  it('marks the quote inside surrounding context', () => {
    const r = highlightQuote('aaa bbb\nccc ddd eee', 'ccc ddd', { radius: 4, mark: ['[[', ']]'] });
    expect(r).toBe('… bbb [[ccc ddd]] eee');
  });
  it('returns null when the quote is not in the snapshot', () => {
    expect(highlightQuote('abc', 'xyz')).toBeNull();
  });
});
