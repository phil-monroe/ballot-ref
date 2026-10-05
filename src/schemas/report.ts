import { z } from 'zod';
import { IsoDateTime } from './shared.ts';

export const DropReason = z.enum([
  'quote-not-substring',
  'quote-too-long',
  'source-not-whitelisted',
  'schema',
  'entity-mismatch',
]);
export type DropReason = z.infer<typeof DropReason>;

export const Drop = z.strictObject({
  at: IsoDateTime,
  contest_id: z.string(),
  entity_id: z.string(),
  field_key: z.string(),
  reason: DropReason,
  detail: z.string().optional(),
});
export type Drop = z.infer<typeof Drop>;

export const SymmetryReport = z.strictObject({
  contest_id: z.string(),
  generated_at: IsoDateTime,
  threshold: z.number().int().nonnegative(),
  candidates: z.array(
    z.strictObject({
      entity_id: z.string(),
      filled: z.number().int(),
      slots: z.record(z.string(), z.boolean()),
    }),
  ),
  flags: z.array(z.string()),
  /** Digest of the contest's non-rejected field content; an acknowledgment is void if it changes. */
  fields_digest: z.string(),
  acknowledged_by: z.string().nullable(),
  acknowledged_at: IsoDateTime.nullable(),
});
export type SymmetryReport = z.infer<typeof SymmetryReport>;

export const StatusEntry = z.strictObject({
  url: z.string(),
  outcome: z.enum(['ok', 'retried', 'failed', 'blocked', 'manual']),
  at: IsoDateTime,
  error: z.string().optional(),
});
export type StatusEntry = z.infer<typeof StatusEntry>;

export const UnverifiableEntry = z.strictObject({
  contest_id: z.string(),
  entity_id: z.string(),
  field_key: z.string(),
  source_url: z.string(),
  source_hash: z.string(),
});

export const BallotDiff = z.strictObject({
  generated_at: IsoDateTime,
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
});
export type BallotDiff = z.infer<typeof BallotDiff>;
