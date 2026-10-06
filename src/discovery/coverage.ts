import type { SiteConfig } from '../config.ts';
import type { Contest } from '../schemas/contest.ts';
import type { Proposal } from '../schemas/proposal.ts';
import { tierGroup } from './queue.ts';

export interface CoverageRow {
  /** Candidate id; null is the issue/levy or a contest-wide proposal. */
  entity_id: string | null;
  name: string;
  pending: number;
  accepted: number;
  rejected: number;
  /** Live (pending + accepted) proposals by review group. */
  official: number;
  candidate_site: number;
  other: number;
}

export interface Coverage {
  contest_id: string;
  rows: CoverageRow[];
  flags: string[];
}

const blank = (entity_id: string | null, name: string): CoverageRow => ({
  entity_id,
  name,
  pending: 0,
  accepted: 0,
  rejected: 0,
  official: 0,
  candidate_site: 0,
  other: 0,
});

const live = (r: CoverageRow) => r.pending + r.accepted;

/**
 * Computed on demand from the queue, never stored (FR-008, FR-009, FR-017). Flags report gaps; they never
 * gate review or acceptance (FR-008a).
 */
export function computeCoverage(
  contest: Contest,
  proposals: Proposal[],
  config: Pick<SiteConfig, 'symmetry_threshold'>,
): Coverage {
  const named = contest.candidates.filter((c) => !c.write_in);
  const rows = new Map<string | null, CoverageRow>();
  if (named.length) for (const c of named) rows.set(c.id, blank(c.id, c.ballot_name));
  else rows.set(null, blank(null, contest.title));
  for (const p of proposals) {
    if (!rows.has(p.entity_id)) rows.set(p.entity_id, blank(p.entity_id, '(contest-wide)'));
    const row = rows.get(p.entity_id)!;
    row[p.status]++;
    if (p.status !== 'rejected') {
      const g = tierGroup(p);
      if (g === 0) row.official++;
      else if (g === 1) row.candidate_site++;
      else row.other++;
    }
  }
  const all = [...rows.values()];
  const subjects = all.filter((r) => named.length === 0 || named.some((c) => c.id === r.entity_id));
  const flags: string[] = [];
  for (const r of subjects) if (live(r) === 0) flags.push(`${r.name}: no sources found`);
  const max = Math.max(0, ...subjects.map(live));
  if (subjects.length > 1) {
    for (const r of subjects)
      if (live(r) > 0 && max - live(r) >= config.symmetry_threshold)
        flags.push(`${r.name}: lopsided coverage (${live(r)} vs ${max})`);
  }
  return { contest_id: contest.id, rows: all, flags };
}

export function formatCoverage(c: Coverage): string {
  const lines = [`Coverage for ${c.contest_id}`];
  for (const r of c.rows)
    lines.push(
      `  ${r.name.padEnd(28)} official ${r.official}, candidate site ${r.candidate_site}, other ${r.other}` +
        `   (pending ${r.pending}, accepted ${r.accepted}, rejected ${r.rejected})`,
    );
  for (const f of c.flags) lines.push(`  ! ${f}`);
  return lines.join('\n');
}
