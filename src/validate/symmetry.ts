import { createHash } from 'node:crypto';
import type { Contest } from '../schemas/contest.ts';
import type { Field } from '../schemas/field.ts';
import type { SymmetryReport } from '../schemas/report.ts';

/**
 * Slots compared across candidates. `ballot_name` and `party_label` are excluded: the ballot parser
 * supplies them for every candidate, so they carry no information about research coverage.
 * `key_vote` is excluded: only candidates with a voting record can have it (FR-030).
 */
export function symmetrySlots(kind: Contest['kind'], priorities: number): string[] {
  if (kind === 'judicial') return ['current_office', 'bar_admission', 'campaign_website'];
  if (kind === 'candidate') {
    return [
      'campaign_website',
      ...Array.from({ length: priorities }, (_, i) => `priority#${i + 1}`),
      'office_held',
      'prior_office',
      'finance_raised',
      'finance_spent',
      'finance_period_end',
    ];
  }
  return [];
}

export const slotId = (f: Pick<Field, 'field_key' | 'slot'>): string =>
  f.slot == null ? f.field_key : `${f.field_key}#${f.slot}`;

/** Content digest used to void a symmetry acknowledgment when fields change (approve/edit status excluded). */
export function fieldsDigest(fieldsByEntity: Record<string, Field[]>): string {
  const rows = Object.entries(fieldsByEntity)
    .flatMap(([entity, fields]) =>
      fields
        .filter((f) => f.status !== 'rejected')
        .map((f) => [entity, f.field_key, f.slot, f.value, f.quote, f.source_hash]),
    )
    .map((r) => JSON.stringify(r))
    .sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

/**
 * Per-contest coverage matrix. Named candidates (including "Other-party candidate" and every person
 * on a joint ticket) are counted individually; write-in lines are excluded (FR-029b). Rejected
 * fields do not count. Flags: any candidate with zero filled slots, or max - min > threshold.
 */
export function computeSymmetry(
  contest: Contest,
  fieldsByEntity: Record<string, Field[]>,
  opts: { threshold: number; priorities: number; now?: string },
): SymmetryReport {
  const slots = symmetrySlots(contest.kind, opts.priorities);
  const candidates = contest.candidates
    .filter((c) => !c.write_in)
    .map((c) => {
      const present = new Set(
        (fieldsByEntity[c.id] ?? []).filter((f) => f.status !== 'rejected').map(slotId),
      );
      const matrix = Object.fromEntries(slots.map((s) => [s, present.has(s)]));
      return {
        entity_id: c.id,
        filled: Object.values(matrix).filter(Boolean).length,
        slots: matrix,
      };
    });

  const flags: string[] = [];
  if (slots.length > 0 && candidates.length > 0) {
    for (const c of candidates)
      if (c.filled === 0) flags.push(`${c.entity_id} has zero filled fields`);
    const counts = candidates.map((c) => c.filled);
    const spread = Math.max(...counts) - Math.min(...counts);
    if (spread > opts.threshold) {
      flags.push(`filled-field counts differ by ${spread} (threshold ${opts.threshold})`);
    }
  }
  return {
    contest_id: contest.id,
    generated_at: opts.now ?? new Date().toISOString(),
    threshold: opts.threshold,
    candidates,
    flags,
    fields_digest: fieldsDigest(fieldsByEntity),
    acknowledged_by: null,
    acknowledged_at: null,
  };
}
