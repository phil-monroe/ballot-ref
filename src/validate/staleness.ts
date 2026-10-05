import type { SnapshotMeta } from '../schemas/snapshot.ts';

const DAY_MS = 86_400_000;

/** Gate 7: a snapshot older than `staleDays` warns at build time. */
export function isStale(retrievedAt: string, staleDays: number, now: Date = new Date()): boolean {
  return now.getTime() - new Date(retrievedAt).getTime() > staleDays * DAY_MS;
}

/** Age is measured from the last refetch that confirmed the content, else from retrieval. */
export function snapshotIsStale(
  meta: SnapshotMeta,
  staleDays: number,
  now: Date = new Date(),
): boolean {
  return isStale(meta.confirmed_at ?? meta.retrieved_at, staleDays, now);
}
