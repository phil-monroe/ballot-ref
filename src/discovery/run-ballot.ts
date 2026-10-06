import { existsSync, readFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import type { DataStore } from '../data.ts';
import type { Fetcher } from '../fetch/fetcher.ts';
import { LOGS } from '../log.ts';
import type { DiscoveryAgent } from './agent.ts';
import { runDiscovery } from './run-discovery.ts';

export interface BallotContestResult {
  contest_id: string;
  outcome: 'discovered' | 'skipped' | 'failed';
  added: number;
  pending: number;
  error?: string;
}

/** True when the run log holds a finished run for this contest with no error. */
export function hasDiscoveredBefore(
  contestId: string,
  logPath: string = LOGS.discoveryRuns,
): boolean {
  if (!existsSync(logPath)) return false;
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .some((line) => {
      try {
        const r = JSON.parse(line) as { contest_id?: string; error?: string | null };
        return r.contest_id === contestId && r.error === null;
      } catch {
        return false;
      }
    });
}

/**
 * Discovery for every contest on a ballot, in ballot order, one contest at a time. A failed contest does
 * not stop the run. A contest already discovered (for example shared with another ballot) is skipped
 * unless `refresh` is set, so shared contests are researched once and reused (FR-018).
 */
export async function runBallotDiscovery(opts: {
  ballotFile: string;
  data: DataStore;
  agent: DiscoveryAgent;
  fetcher: Fetcher;
  config: SiteConfig;
  refresh?: boolean;
  logPath?: string;
  onResult?: (r: BallotContestResult) => void;
}): Promise<BallotContestResult[]> {
  const ballot = opts.data.loadBallot(opts.ballotFile);
  const results: BallotContestResult[] = [];
  const emit = (r: BallotContestResult) => {
    results.push(r);
    opts.onResult?.(r);
  };
  const pendingOf = (id: string) =>
    opts.data.loadProposals(id).filter((p) => p.status === 'pending').length;
  for (const contestId of [...new Set(ballot.contests)]) {
    if (!opts.refresh && hasDiscoveredBefore(contestId, opts.logPath)) {
      emit({ contest_id: contestId, outcome: 'skipped', added: 0, pending: pendingOf(contestId) });
      continue;
    }
    try {
      const { run } = await runDiscovery({
        contestId,
        data: opts.data,
        agent: opts.agent,
        fetcher: opts.fetcher,
        config: opts.config,
        ...(opts.logPath ? { logPath: opts.logPath } : {}),
      });
      emit(
        run.error
          ? {
              contest_id: contestId,
              outcome: 'failed',
              added: run.added,
              pending: pendingOf(contestId),
              error: run.error,
            }
          : {
              contest_id: contestId,
              outcome: 'discovered',
              added: run.added,
              pending: pendingOf(contestId),
            },
      );
    } catch (e) {
      emit({
        contest_id: contestId,
        outcome: 'failed',
        added: 0,
        pending: pendingOf(contestId),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
