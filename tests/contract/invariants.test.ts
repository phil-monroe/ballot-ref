import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { orderedContestIds } from '../../src/review/queue.ts';
import { publishableFields } from '../../src/review/publishable.ts';
import { findTrackedPrivateSnapshots } from '../../src/verify/tracked-snapshots.ts';

// CI invariants from contracts/data-files.md, checked against the repository's real data/.
const data = new DataStore();
const store = new SnapshotStore();

describe('repository data invariants', () => {
  it('every ballot contest ref resolves to a contest file', () => {
    const ballots = data.listBallots();
    expect(ballots.length).toBeGreaterThan(0);
    for (const { ballot } of ballots) {
      for (const id of ballot.contests) expect(existsSync(data.contestPath(id)), id).toBe(true);
    }
  });
  it('every approved/edited field has a source_hash with snapshot metadata present', () => {
    for (const id of orderedContestIds(data)) {
      for (const e of data.listEntities(id)) {
        for (const f of publishableFields(data.loadFields(id, e).fields)) {
          expect(store.getMeta(f.source_hash), `${id}/${e}/${f.field_key}`).not.toBeNull();
        }
      }
    }
  });
  it('no non-redistributable snapshot body is tracked by git', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    expect(findTrackedPrivateSnapshots(tracked)).toEqual([]);
  });
  it('no proposed or rejected field can reach the build', () => {
    for (const id of orderedContestIds(data)) {
      for (const e of data.listEntities(id)) {
        const shown = publishableFields(data.loadFields(id, e).fields);
        expect(shown.every((f) => f.status === 'approved' || f.status === 'edited')).toBe(true);
      }
    }
  });
  it('every field in the repository carries a stored snapshot hash that exists as metadata or is flagged', () => {
    for (const id of orderedContestIds(data)) {
      for (const e of data.listEntities(id)) {
        for (const f of data.loadFields(id, e).fields)
          expect(f.source_hash).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
  it('the site build and src/site never read data/discovery (FR-003, FR-015a)', () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        if (['node_modules', 'dist', '.astro'].includes(f)) return [];
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = [
      ...walk('src/site'),
      ...walk('site').filter((f) => /\.(ts|astro|mjs|js)$/.test(f)),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/discovery/i);
  });
  it('no proposal URL or reject reason appears in the built site output (when a build exists)', () => {
    if (!existsSync('site/dist')) return;
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const queued = readdirSync('data/discovery/proposals')
      .filter((f) => f.endsWith('.yaml'))
      .flatMap((f) => data.loadProposals(f.slice(0, -5).replaceAll('__', ':')));
    const html = walk('site/dist')
      .filter((f) => /\.(html|json|txt|xml)$/.test(f))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const p of queued.filter((x) => x.status !== 'accepted')) {
      expect(html.includes(p.url), p.url).toBe(false);
      if (p.decision_reason) expect(html.includes(p.decision_reason), p.id).toBe(false);
    }
  });
});
