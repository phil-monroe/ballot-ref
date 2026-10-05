import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import { DataStore, contestFileStem } from '../data.ts';
import { SymmetryReport } from '../schemas/report.ts';
import { computeSymmetry } from '../validate/symmetry.ts';

export const symmetryPath = (data: DataStore, contestId: string) =>
  `${data.root}/reports/symmetry/${contestFileStem(contestId)}.json`;

export function loadSymmetryReport(data: DataStore, contestId: string): SymmetryReport | null {
  const p = symmetryPath(data, contestId);
  return existsSync(p) ? SymmetryReport.parse(JSON.parse(readFileSync(p, 'utf8'))) : null;
}

/** Regenerates the report; a prior acknowledgment survives only if the field content is unchanged. */
export function writeSymmetryReport(
  contestId: string,
  data: DataStore,
  config: SiteConfig,
): SymmetryReport {
  const contest = data.loadContest(contestId);
  const fieldsByEntity = Object.fromEntries(
    contest.candidates
      .filter((c) => !c.write_in)
      .map((c) => [c.id, data.loadFields(contestId, c.id).fields]),
  );
  const fresh = computeSymmetry(contest, fieldsByEntity, {
    threshold: config.symmetry_threshold,
    priorities: config.priorities_per_candidate,
  });
  const prior = loadSymmetryReport(data, contestId);
  const report: SymmetryReport =
    prior?.acknowledged_at && prior.fields_digest === fresh.fields_digest
      ? { ...fresh, acknowledged_by: prior.acknowledged_by, acknowledged_at: prior.acknowledged_at }
      : fresh;
  const p = symmetryPath(data, contestId);
  mkdirSync(`${data.root}/reports/symmetry`, { recursive: true });
  writeFileSync(p, JSON.stringify(report, null, 2) + '\n');
  return report;
}
