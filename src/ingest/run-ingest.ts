import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DataStore } from '../data.ts';
import { SnapshotStore } from '../fetch/snapshot-store.ts';
import type { Contest } from '../schemas/contest.ts';
import { loadConfig } from '../config.ts';
import { proposeOfficialFields } from './propose-official.ts';
import { buildContests } from './build-contests.ts';
import { dateFromElectionCode } from './contest-id.ts';
import { resolve } from 'node:path';
import { contestSignature, diffBallots } from './diff.ts';
import { Expected, compareToExpected } from './expected.ts';
import { ballotUrl, getBallotBytes } from './fetch-ballot.ts';
import { layoutLines, snapshotText } from './layout.ts';
import { parseBallot } from './parse-ballot.ts';
import { extractItems } from './pdf-items.ts';

export class SharedContestConflict extends Error {}

export interface IngestResult {
  contests: Contest[];
  snapshotHash: string;
  diff: ReturnType<typeof diffBallots>;
  mismatches: string[];
  officialFields: { proposed: number; dropped: number };
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
    // Canonical ballot URL even for manual imports (method records how it was obtained).
    url: ballotUrl(ballot),
    body: Buffer.from(bytes.data),
    contentType: bytes.contentType,
    text: snapshotText(lines),
    method: bytes.method,
    redistributable: true, // official ballot: government record
  });

  // Re-ingesting unchanged content confirms the stored copy is still current (resets staleness).
  snapshots.confirm(meta.sha256, new Date().toISOString());

  const contests = buildContests(parseBallot(lines), {
    date: dateFromElectionCode(ballot.ballot_source.election_code),
    county: ballot.ballot_source.county_slug,
    snapshotHash: meta.sha256,
  });

  const previous = ballot.contests
    .filter((id) => existsSync(data.contestPath(id)))
    .map((id) => data.loadContest(id));
  const diff = diffBallots(previous, contests);

  // Contests are shared across ballots. An identical existing contest is reused untouched (so approved
  // fields keep applying); a different one is only replaced if no other ballot depends on it.
  const usedElsewhere = new Set(
    data
      .listBallots()
      .filter((b) => resolve(b.file) !== resolve(opts.ballotFile))
      .flatMap((b) => b.ballot.contests),
  );
  for (const c of contests) {
    if (existsSync(data.contestPath(c.id))) {
      const existing = data.loadContest(c.id);
      if (contestSignature(existing) === contestSignature(c)) continue;
      if (usedElsewhere.has(c.id)) {
        throw new SharedContestConflict(
          `Contest ${c.id} differs from the version another ballot already uses; resolve before re-ingesting.`,
        );
      }
    }
    data.saveContest(c);
  }
  data.saveBallot(opts.ballotFile, { ...ballot, contests: contests.map((c) => c.id) });

  mkdirSync(`${data.root}/reports`, { recursive: true });
  writeFileSync(`${data.root}/reports/ballot-diff.json`, JSON.stringify(diff, null, 2) + '\n');

  let mismatches: string[] = [];
  if (ballot.fixture) {
    const expected = Expected.parse(JSON.parse(readFileSync(ballot.fixture, 'utf8')));
    mismatches = compareToExpected(contests, expected);
  }
  const officialFields = proposeOfficialFields({
    ballot: data.loadBallot(opts.ballotFile),
    ballotFile: opts.ballotFile,
    snapshotHash: meta.sha256,
    data,
    store: snapshots,
    config: loadConfig(),
  });
  return { contests, snapshotHash: meta.sha256, diff, mismatches, officialFields };
}
