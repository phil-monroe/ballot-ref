import { z } from 'zod';
import { FieldStatus, IsoDateTime, Sha256, Tier } from './shared.ts';

export const Extractor = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('model'), model: z.string().min(1), prompt_version: z.string().min(1) }),
  z.strictObject({ kind: z.literal('parser'), name: z.string().min(1), version: z.string().min(1) }),
  z.strictObject({ kind: z.literal('manual') }),
]);

export const Field = z.strictObject({
  contest_id: z.string().min(1),
  entity_id: z.string().min(1),
  field_key: z.string().min(1),
  slot: z.number().int().positive().nullable(),
  value: z.union([z.string(), z.number()]),
  quote: z.string().min(1),
  source_url: z.string().min(1),
  source_hash: Sha256,
  retrieved_at: IsoDateTime,
  tier: Tier.exclude(['context']),
  status: FieldStatus,
  reviewer: z.string().nullable(),
  reviewed_at: IsoDateTime.nullable(),
  extractor: Extractor,
  author: z.string().optional(),
  needs_rereview: z.boolean().default(false),
});
export type Field = z.infer<typeof Field>;

export const FieldFile = z.strictObject({ fields: z.array(Field) });
export type FieldFile = z.infer<typeof FieldFile>;
