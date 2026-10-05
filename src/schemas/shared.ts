import { z } from 'zod';

export const Tier = z.enum(['official', 'says', 'done', 'context']);
export type Tier = z.infer<typeof Tier>;

export const FieldStatus = z.enum(['proposed', 'approved', 'rejected', 'edited']);
export type FieldStatus = z.infer<typeof FieldStatus>;

export const DomainClass = z.enum([
  'ohio-boe',
  'ohio-sos',
  'fec',
  'congress',
  'ohio-legislature',
  'county-auditor',
  'candidate-site',
  'sponsor-site',
]);
export type DomainClass = z.infer<typeof DomainClass>;

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const IsoDateTime = z.iso.datetime({ offset: true });
