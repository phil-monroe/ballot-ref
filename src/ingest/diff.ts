import type { Contest } from '../schemas/contest.ts';
import type { BallotDiff } from '../schemas/report.ts';

/** Content that identifies a contest as the same contest; excludes per-ballot page and snapshot hash. */
export const contestSignature = (c: Contest) =>
  JSON.stringify({
    t: c.title,
    term: c.term,
    v: c.vote_for,
    c: c.candidates,
    o: c.issue_options,
    b: c.ballot_text,
  });

/** Added / removed / changed contests between two ingestions (FR-024). Order changes count as changes. */
export function diffBallots(
  prev: Contest[],
  next: Contest[],
  now = new Date().toISOString(),
): BallotDiff {
  const p = new Map(prev.map((c) => [c.id, c]));
  const n = new Map(next.map((c) => [c.id, c]));
  const added = [...n.keys()].filter((id) => !p.has(id));
  const removed = [...p.keys()].filter((id) => !n.has(id));
  const changed = [...n.keys()].filter(
    (id) => p.has(id) && contestSignature(p.get(id)!) !== contestSignature(n.get(id)!),
  );
  const prevOrder = prev.map((c) => c.id).filter((id) => n.has(id));
  const nextOrder = next.map((c) => c.id).filter((id) => p.has(id));
  if (JSON.stringify(prevOrder) !== JSON.stringify(nextOrder)) {
    for (const id of nextOrder) if (!changed.includes(id)) changed.push(`${id} (order)`);
  }
  return { generated_at: now, added, removed, changed };
}
