import { z } from 'zod';
import { IsoDateTime, Sha256 } from './shared.ts';

export const SnapshotMeta = z.strictObject({
  sha256: Sha256,
  url: z.string().min(1),
  retrieved_at: IsoDateTime,
  content_type: z.string().min(1),
  method: z.enum(['direct', 'playwright', 'manual']),
  redistributable: z.boolean(),
  body_path: z.string().min(1),
  text_path: z.string().min(1),
});
export type SnapshotMeta = z.infer<typeof SnapshotMeta>;
