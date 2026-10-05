import { existsSync, readFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { orderedContestIds } from '../review/queue.ts';
import { evaluateReadiness } from '../review/readiness.ts';
import type { StatusEntry } from '../schemas/report.ts';

export interface ContestStatus {
  contest_id: string;
  title: string;
  counts: {
    proposed: number;
    approved: number;
    edited: number;
    rejected: number;
    needs_rereview: number;
  };
  ready: boolean;
  reasons: string[];
  unverifiable: string[];
}

export interface StatusReport {
  contests: ContestStatus[];
  retrieval_failures: StatusEntry[];
}

export function collectStatus(
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
  contestFilter?: string,
): StatusReport {
  const contests = (contestFilter ? [contestFilter] : orderedContestIds(data)).map(
    (id): ContestStatus => {
      const contest = data.loadContest(id);
      const counts = { proposed: 0, approved: 0, edited: 0, rejected: 0, needs_rereview: 0 };
      const unverifiable = new Set<string>();
      for (const e of data.listEntities(id)) {
        for (const f of data.loadFields(id, e).fields) {
          counts[f.status]++;
          if (f.needs_rereview) counts.needs_rereview++;
          if (store.getText(f.source_hash) === null) unverifiable.add(f.source_url);
        }
      }
      const r = evaluateReadiness(id, data, store, config);
      return {
        contest_id: id,
        title: contest.title,
        counts,
        ready: r.ready,
        reasons: r.reasons,
        unverifiable: [...unverifiable],
      };
    },
  );
  const path = `${data.root}/reports/status.json`;
  const entries: StatusEntry[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  return {
    contests,
    retrieval_failures: entries.filter((e) => e.outcome === 'failed' || e.outcome === 'blocked'),
  };
}

export function formatStatus(s: StatusReport): string {
  const lines = s.contests.map((c) => {
    const n = c.counts;
    const head = `${c.ready ? 'READY      ' : 'not ready  '}${c.contest_id}  (proposed ${n.proposed}, approved ${n.approved}, edited ${n.edited}, rejected ${n.rejected})`;
    return [
      head,
      ...c.reasons.map((r) => `             - ${r}`),
      ...c.unverifiable.map((u) => `             - unverifiable here: ${u}`),
    ].join('\n');
  });
  if (s.retrieval_failures.length) {
    lines.push(
      '',
      'Retrieval failures:',
      ...s.retrieval_failures.map((e) => `  ${e.outcome} ${e.url} ${e.error ?? ''}`),
    );
  }
  return lines.join('\n');
}
