import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { findTrackedPrivateSnapshots } from '../../src/verify/tracked-snapshots.ts';

describe('private snapshot guard (FR-018b)', () => {
  it('flags any tracked file under data/snapshots/private except the .gitkeep', () => {
    expect(
      findTrackedPrivateSnapshots([
        'data/snapshots/private/.gitkeep',
        'data/snapshots/private/abc.html',
        'README.md',
      ]),
    ).toEqual(['data/snapshots/private/abc.html']);
  });
  it('flags a non-redistributable body even if it was placed in the public directory', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'ballot-ref-snap-')), 'snapshots');
    mkdirSync(root, { recursive: true });
    const store = new SnapshotStore(root);
    const meta = store.put({
      url: 'https://x.example/',
      body: 'b',
      contentType: 'text/html',
      text: 'b',
      method: 'direct',
      redistributable: false,
    });
    // A mistaken `git add -f` of the private body, or a body copied into public/, is the failure to catch:
    const tracked = [
      `snapshots/${meta.body_path}`,
      `snapshots/${meta.text_path}`,
      'snapshots/meta/' + meta.sha256 + '.json',
    ];
    const bad = findTrackedPrivateSnapshots(tracked, 'snapshots');
    expect(bad).toEqual(tracked.slice(0, 2).sort());
    expect(bad.some((p) => p.includes('/meta/'))).toBe(false); // metadata is always allowed
  });
  it('accepts public government snapshots and metadata', () => {
    expect(
      findTrackedPrivateSnapshots(['data/snapshots/public/a.pdf', 'data/snapshots/meta/a.json']),
    ).toEqual([]);
  });
});
