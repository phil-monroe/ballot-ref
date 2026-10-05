import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import { LOGS, appendLog } from '../log.ts';
import { symmetryPath, writeSymmetryReport } from '../report/symmetry.ts';
import type { SymmetryReport } from '../schemas/report.ts';
import { writeFileSync } from 'node:fs';

export function formatSymmetry(r: SymmetryReport): string {
  const slots = Object.keys(r.candidates[0]?.slots ?? {});
  const rows = r.candidates.map(
    (c) =>
      `  ${c.entity_id.padEnd(24)} ${String(c.filled).padStart(2)} filled  ${slots.map((s) => (c.slots[s] ? '■' : '·')).join('')}`,
  );
  return [
    `Symmetry report for ${r.contest_id} (threshold ${r.threshold})`,
    `  slots: ${slots.join(', ')}`,
    ...rows,
    r.flags.length ? `FLAGGED: ${r.flags.join('; ')}` : 'No flags.',
    r.acknowledged_at
      ? `Acknowledged by ${r.acknowledged_by} at ${r.acknowledged_at}`
      : 'Not acknowledged.',
  ].join('\n');
}

/** Regenerates the report from current fields, then records the acknowledgment against that content. */
export function acknowledgeSymmetry(
  contestId: string,
  reviewer: string,
  data: DataStore,
  config: SiteConfig,
  now: Date = new Date(),
): SymmetryReport {
  if (!reviewer?.trim())
    throw new Error('A reviewer id is required (--reviewer or BALLOT_REF_REVIEWER).');
  const report = writeSymmetryReport(contestId, data, config);
  const acked = { ...report, acknowledged_by: reviewer, acknowledged_at: now.toISOString() };
  writeFileSync(symmetryPath(data, contestId), JSON.stringify(acked, null, 2) + '\n');
  appendLog(LOGS.review, {
    action: 'acknowledge-symmetry',
    reviewer,
    contest_id: contestId,
    flags: report.flags,
  });
  return acked;
}
