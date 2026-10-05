import { existsSync, readdirSync } from 'node:fs';
import { DataStore, contestIdFromStem } from '../data.ts';
import type { Field } from '../schemas/field.ts';

/** Contest ids in official ballot order (first ballot that lists them), then any others alphabetically. */
export function orderedContestIds(data: DataStore): string[] {
  const ordered = data.listBallots().flatMap((b) => b.ballot.contests);
  const dir = `${data.root}/contests`;
  const rest = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => contestIdFromStem(f.slice(0, -5)))
    : [];
  return [...new Set([...ordered, ...rest.sort()])];
}

export interface QueueItem {
  contestId: string;
  entityId: string;
  field: Field;
}

/** Next field awaiting review: proposed, or flagged for re-review. */
export function nextToReview(
  data: DataStore,
  contestFilter?: string,
  skip: Set<string> = new Set(),
): QueueItem | null {
  for (const contestId of contestFilter ? [contestFilter] : orderedContestIds(data)) {
    for (const entityId of data.listEntities(contestId)) {
      for (const field of data.loadFields(contestId, entityId).fields) {
        const key = `${contestId}|${entityId}|${field.field_key}|${field.slot ?? ''}`;
        if ((field.status === 'proposed' || field.needs_rereview) && !skip.has(key)) {
          return { contestId, entityId, field };
        }
      }
    }
  }
  return null;
}

export const queueKey = (i: QueueItem) =>
  `${i.contestId}|${i.entityId}|${i.field.field_key}|${i.field.slot ?? ''}`;
