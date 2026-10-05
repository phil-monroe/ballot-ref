import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import type { Field } from '../schemas/field.ts';
import type { Drop } from '../schemas/report.ts';
import { runGates } from './run-gates.ts';

export interface FieldFailure {
  entity_id: string;
  field_key: string;
  slot: number | null;
  reason: Drop['reason'];
  detail?: string;
}

/**
 * Re-runs the gates over stored fields (quote, length, whitelist, schema). Nothing is repaired or
 * rewritten. The gates require the local snapshot: a missing one is a failure here, unlike the
 * best-effort `verify` command (FR-018c). The entity gate needs the model's subject name, which is
 * only available at extraction time, so it is not repeated.
 */
export function revalidateContest(
  contestId: string,
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
): FieldFailure[] {
  const contest = data.loadContest(contestId);
  const sources = data.loadSources(contestId);
  const failures: FieldFailure[] = [];
  for (const entityId of data.listEntities(contestId)) {
    const ballotName = contest.candidates.find((c) => c.id === entityId)?.ballot_name ?? entityId;
    for (const f of data.loadFields(contestId, entityId).fields as Field[]) {
      if (f.status === 'rejected') continue;
      const meta = store.getMeta(f.source_hash);
      const text = store.getText(f.source_hash);
      const fail = (reason: Drop['reason'], detail?: string) =>
        failures.push({
          entity_id: entityId,
          field_key: f.field_key,
          slot: f.slot,
          reason,
          ...(detail ? { detail } : {}),
        });
      if (!meta || text === null) {
        fail('quote-not-substring', 'snapshot is not available locally');
        continue;
      }
      const r = runGates(
        {
          field_key: f.field_key,
          slot: f.slot,
          value: f.value,
          quote: f.quote,
          ...(f.author ? { author: f.author } : {}),
        },
        {
          contest,
          entityId,
          ballotName,
          sources,
          snapshot: {
            sha256: meta.sha256,
            url: f.source_url,
            text,
            retrieved_at: meta.retrieved_at,
          },
          config,
          extractor: f.extractor,
          skipEntity: true,
        },
      );
      if (!r.ok) fail(r.reason, r.detail);
    }
  }
  return failures;
}
