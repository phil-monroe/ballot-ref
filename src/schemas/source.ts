import { z } from 'zod';
import { DomainClass, IsoDateTime, Tier } from './shared.ts';

export const Source = z
  .strictObject({
    url: z.string().min(1),
    domain_class: DomainClass,
    tier: Tier,
    entity_id: z.string().optional(),
    redistributable: z.boolean(),
    whitelisted_by: z.string().min(1),
    whitelisted_at: IsoDateTime,
    notes: z.string().default(''),
  })
  .describe('context-tier sources are link-only and are never fetched for extraction');
export type Source = z.infer<typeof Source>;

export const SourceFile = z.array(Source);
