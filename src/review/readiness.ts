import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { loadSymmetryReport } from '../report/symmetry.ts';
import { fieldsDigest } from '../validate/symmetry.ts';
import { snapshotIsStale } from '../validate/staleness.ts';
import type { Field } from '../schemas/field.ts';

export interface Readiness {
  ready: boolean;
  reasons: string[];
}

/**
 * FR-039: ready iff every field is reviewed, the symmetry report is acknowledged for the CURRENT field
 * content, no snapshot behind a field is stale, and no field awaits re-review.
 */
export function evaluateReadiness(
  contestId: string,
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
  now: Date = new Date(),
): Readiness {
  const reasons: string[] = [];
  const contest = data.loadContest(contestId);
  const byEntity: Record<string, Field[]> = {};
  for (const e of data.listEntities(contestId)) byEntity[e] = data.loadFields(contestId, e).fields;
  const all = Object.values(byEntity).flat();

  const proposed = all.filter((f) => f.status === 'proposed').length;
  if (proposed) reasons.push(`${proposed} field(s) not yet reviewed`);
  const rereview = all.filter((f) => f.needs_rereview).length;
  if (rereview) reasons.push(`${rereview} field(s) need re-review (source changed)`);

  if (contest.kind === 'candidate' || contest.kind === 'judicial') {
    const report = loadSymmetryReport(data, contestId);
    const named = Object.fromEntries(
      contest.candidates.filter((c) => !c.write_in).map((c) => [c.id, byEntity[c.id] ?? []]),
    );
    if (!report) reasons.push('symmetry report not generated or acknowledged');
    else if (!report.acknowledged_at) reasons.push('symmetry report not acknowledged');
    else if (report.fields_digest !== fieldsDigest(named))
      reasons.push('symmetry acknowledgment is out of date (fields changed)');
  }

  const stale = new Set<string>();
  for (const f of all) {
    if (f.status === 'rejected') continue;
    const meta = store.getMeta(f.source_hash);
    if (meta && snapshotIsStale(meta, config.stale_days, now)) stale.add(f.source_url);
  }
  for (const url of stale) reasons.push(`stale snapshot (> ${config.stale_days} days): ${url}`);

  return { ready: reasons.length === 0, reasons };
}
