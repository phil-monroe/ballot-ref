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

export function validateStoredField(
  f: Field,
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
): Omit<FieldFailure, 'entity_id' | 'field_key' | 'slot'> | null {
  const contest = data.loadContest(f.contest_id);
  const ballotName =
    contest.candidates.find((c) => c.id === f.entity_id)?.ballot_name ?? f.entity_id;
  const meta = store.getMeta(f.source_hash);
  const text = store.getText(f.source_hash);
  if (!meta || text === null)
    return { reason: 'quote-not-substring', detail: 'snapshot is not available locally' };
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
      entityId: f.entity_id,
      ballotName,
      sources: data.loadSources(f.contest_id),
      snapshot: { sha256: meta.sha256, url: f.source_url, text, retrieved_at: meta.retrieved_at },
      config,
      extractor: f.extractor,
      skipEntity: true,
    },
  );
  return r.ok ? null : { reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) };
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
  const failures: FieldFailure[] = [];
  for (const entityId of data.listEntities(contestId)) {
    for (const f of data.loadFields(contestId, entityId).fields) {
      if (f.status === 'rejected') continue;
      const failure = validateStoredField(f, data, store, config);
      if (failure)
        failures.push({ entity_id: entityId, field_key: f.field_key, slot: f.slot, ...failure });
    }
  }
  return failures;
}
