import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DataStore } from '../data.ts';
import { SnapshotStore } from '../fetch/snapshot-store.ts';
import type { Contest } from '../schemas/contest.ts';
import { buildContests } from './build-contests.ts';
import { dateFromElectionCode } from './contest-id.ts';
import { diffBallots } from './diff.ts';
import { Expected, compareToExpected } from './expected.ts';
import { getBallotBytes } from './fetch-ballot.ts';
import { layoutLines, snapshotText } from './layout.ts';
import { parseBallot } from './parse-ballot.ts';
import { extractItems } from './pdf-items.ts';

export interface IngestResult {
  contests: Contest[];
  snapshotHash: string;
  diff: ReturnType<typeof diffBallots>;
  mismatches: string[];
}

/** Idempotent: re-running with the same ballot yields the same files and an empty diff. */
export async function runIngest(opts: {
  ballotFile: string;
  from?: string;
  userAgent: string;
  data?: DataStore;
  snapshots?: SnapshotStore;
}): Promise<IngestResult> {
  const data = opts.data ?? new DataStore();
  const snapshots = opts.snapshots ?? new SnapshotStore();
  const ballot = data.loadBallot(opts.ballotFile);

  const bytes = await getBallotBytes({ ballot, from: opts.from, userAgent: opts.userAgent });
  const lines = layoutLines(await extractItems(bytes.data));
  const meta = snapshots.put({
    url: opts.from
      ? `file:${opts.from}`
      : `ballot:${ballot.ballot_source.county_slug}/${ballot.ballot_source.election_code}/${ballot.ballot_source.precinct_code}`,
    body: Buffer.from(bytes.data),
    contentType: bytes.contentType,
    text: snapshotText(lines),
    method: bytes.method,
    redistributable: true, // official ballot: government record
  });

  const contests = buildContests(parseBallot(lines), {
    date: dateFromElectionCode(ballot.ballot_source.election_code),
    county: ballot.ballot_source.county_slug,
    snapshotHash: meta.sha256,
  });

  const previous = ballot.contests
    .filter((id) => existsSync(data.contestPath(id)))
    .map((id) => data.loadContest(id));
  const diff = diffBallots(previous, contests);

  for (const c of contests) data.saveContest(c);
  data.saveBallot(opts.ballotFile, { ...ballot, contests: contests.map((c) => c.id) });

  mkdirSync(`${data.root}/reports`, { recursive: true });
  writeFileSync(`${data.root}/reports/ballot-diff.json`, JSON.stringify(diff, null, 2) + '\n');

  let mismatches: string[] = [];
  if (ballot.fixture) {
    const expected = Expected.parse(JSON.parse(readFileSync(ballot.fixture, 'utf8')));
    mismatches = compareToExpected(contests, expected);
  }
  return { contests, snapshotHash: meta.sha256, diff, mismatches };
}
