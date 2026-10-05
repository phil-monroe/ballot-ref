import { mkdirSync, writeFileSync } from 'node:fs';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { orderedContestIds } from '../review/queue.ts';
import { isPublishable } from '../review/publishable.ts';
import { checkQuote } from '../validate/quote.ts';

export interface VerifyEntry {
  contest_id: string;
  entity_id: string;
  field_key: string;
  source_url: string;
  source_hash: string;
}
export interface VerifyReport {
  checked: number;
  mismatches: VerifyEntry[];
  unverifiable: VerifyEntry[];
}

/**
 * Best-effort whole-site re-verification (FR-018c, SC-002). Every approved/edited quote whose snapshot
 * body is present must still be a literal substring of it (a present snapshot that does not match is a
 * failure). Fields whose body is absent in this environment, such as private third-party copies on a
 * fresh clone, are listed as "unverifiable here" and never fail the run.
 */
export function verifySite(data: DataStore, store: SnapshotStore): VerifyReport {
  const report: VerifyReport = { checked: 0, mismatches: [], unverifiable: [] };
  for (const contestId of orderedContestIds(data)) {
    for (const entityId of data.listEntities(contestId)) {
      for (const f of data.loadFields(contestId, entityId).fields.filter(isPublishable)) {
        const entry: VerifyEntry = {
          contest_id: contestId,
          entity_id: entityId,
          field_key: f.slot ? `${f.field_key}#${f.slot}` : f.field_key,
          source_url: f.source_url,
          source_hash: f.source_hash,
        };
        const text = store.getText(f.source_hash);
        if (text === null) {
          report.unverifiable.push(entry);
          continue;
        }
        report.checked++;
        if (!checkQuote(f.quote, text).ok) report.mismatches.push(entry);
      }
    }
  }
  mkdirSync(`${data.root}/reports`, { recursive: true });
  writeFileSync(
    `${data.root}/reports/unverifiable-here.json`,
    JSON.stringify(report.unverifiable, null, 2) + '\n',
  );
  return report;
}
