import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfig } from '../../src/config.ts';
import { DataStore } from '../../src/data.ts';
import { SnapshotStore } from '../../src/fetch/snapshot-store.ts';
import { SharedContestConflict, runIngest } from '../../src/ingest/run-ingest.ts';
import { buildBallotView } from '../../src/site/view.ts';
import { build, htmlFiles, makeFixture, read } from '../helpers/site-fixture.ts';

const PDF = 'fixtures/powell-j/ballot.pdf';
const ballotYaml = (precinct: string, code: string) => ({
  county: 'delaware',
  precinct_code: precinct,
  precinct_name: `Precinct ${precinct}`,
  election: '2026-11-03-general',
  ballot_source: {
    county_slug: 'delaware',
    election_code: '20261103g_webeix0',
    precinct_code: code,
  },
  contests: [],
});

describe('second precinct by configuration only (SC-008)', () => {
  const startDir = process.cwd();
  afterAll(() => process.chdir(startDir));
  let dir: string;
  let data: DataStore;
  let snapshots: SnapshotStore;
  let before: Record<string, string>;
  const snapshotOfContests = () =>
    Object.fromEntries(
      readdirSync(join(dir, 'data/contests')).map((f) => [
        f,
        readFileSync(join(dir, 'data/contests', f), 'utf8'),
      ]),
    );

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ballot-ref-2p-'));
    process.chdir(dir);
    mkdirSync(join(dir, 'data/ballots'), { recursive: true });
    mkdirSync(join(dir, 'fixtures'), { recursive: true });
    copyFileSync(join(startDir, PDF), join(dir, 'ballot.pdf'));
    data = new DataStore(join(dir, 'data'));
    snapshots = new SnapshotStore(join(dir, 'data/snapshots'));
    writeFileSync(
      join(dir, 'site.config.yaml'),
      stringify(loadConfig(join(startDir, 'site.config.yaml'))),
    );
    writeFileSync(
      join(dir, 'data/ballots/delaware-154-1.yaml'),
      stringify(ballotYaml('154/1', '154___1')),
    );
    writeFileSync(
      join(dir, 'data/ballots/delaware-154-2.yaml'),
      stringify(ballotYaml('154/2', '154___2')),
    );
    const common = { from: join(dir, 'ballot.pdf'), userAgent: 'test', data, snapshots };
    await runIngest({ ballotFile: join(dir, 'data/ballots/delaware-154-1.yaml'), ...common });
    before = snapshotOfContests();
    await runIngest({ ballotFile: join(dir, 'data/ballots/delaware-154-2.yaml'), ...common });
  });

  it('adds the second ballot with no code change', () => {
    expect(
      data
        .listBallots()
        .map((b) => b.ballot.precinct_code)
        .sort(),
    ).toEqual(['154/1', '154/2']);
  });
  it('reuses shared contests untouched: same ids, byte-identical files, none duplicated', () => {
    expect(snapshotOfContests()).toEqual(before);
    const [a, b] = data.listBallots().map((x) => x.ballot.contests);
    expect(a).toEqual(b);
  });
  it('shows identical contest views on both ballots (approved data applies to both)', () => {
    const [a, b] = data
      .listBallots()
      .map((x) =>
        buildBallotView(x.ballot, data, snapshots, loadConfig(join(dir, 'site.config.yaml'))),
      );
    expect(a!.slug).not.toBe(b!.slug);
    expect(a!.contests.map((c) => c.contest.id)).toEqual(b!.contests.map((c) => c.contest.id));
  });
  it('refuses to silently change a contest another ballot already uses', async () => {
    const c = data.listBallots()[0]!.ballot.contests[1]!;
    const contest = data.loadContest(c);
    data.saveContest({ ...contest, candidates: contest.candidates.slice(1) }); // now differs from what the PDF says
    await expect(
      runIngest({
        ballotFile: join(dir, 'data/ballots/delaware-154-2.yaml'),
        from: join(dir, 'ballot.pdf'),
        userAgent: 'test',
        data,
        snapshots,
      }),
    ).rejects.toThrow(SharedContestConflict);
  });
});

describe('second precinct page build', () => {
  it('builds a page per ballot and shows the shared contest identically', () => {
    const fx = makeFixture();
    const first = fx.data.listBallots()[0]!;
    fx.data.saveBallot(join(fx.dir, 'data/ballots/test-2.yaml'), {
      ...first.ballot,
      precinct_code: '2',
      precinct_name: 'TEST 2',
    });
    const { out } = build(fx.dir);
    const pages = htmlFiles(out).map((p) => p.replace(out, ''));
    expect(pages).toEqual(expect.arrayContaining(['/b/test-1/index.html', '/b/test-2/index.html']));
    const section = (p: string) => {
      const html = read(join(out, p));
      // The error-report link legitimately names each ballot's own page; normalize it.
      return html
        .slice(
          html.indexOf('id="ready-race-oh-unspecified"'),
          html.indexOf('id="pending-race-oh-unspecified"'),
        )
        .replace(/test-[12]/g, 'test-N');
    };
    expect(section('b/test-1/index.html')).toBe(section('b/test-2/index.html'));
  });
});
