import type { Field } from '../schemas/field.ts';

/** Only `approved` or `edited` fields may ever reach the site (Principle VII, FR-040). */
export const isPublishable = (f: Pick<Field, 'status'>): boolean =>
  f.status === 'approved' || f.status === 'edited';

export const publishableFields = <T extends Pick<Field, 'status'>>(fields: T[]): T[] =>
  fields.filter(isPublishable);
