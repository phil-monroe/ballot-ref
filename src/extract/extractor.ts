import { z } from 'zod';
import type { ContestKindKey } from '../schemas/field-keys.ts';
import type { RawField } from '../validate/types.ts';

export interface ExtractInput {
  entity: { id: string; ballot_name: string; role?: string };
  contestKind: ContestKindKey;
  /** Field keys the model may return for this source (already filtered by source tier). */
  fieldKeys: string[];
  /** Max slots for repeated keys, e.g. { priority: 3 }. */
  slots: Record<string, number>;
  prompt_version: string;
  /** Exactly one stored source document. */
  snapshot: { sha256: string; url: string; text: string };
}

export interface ExtractOutput {
  subject_name: string | null;
  fields: RawField[];
  usage: { input_tokens: number; output_tokens: number };
}

/** Provider-neutral extractor. Swapping providers means implementing this only (FR-048). */
export interface LlmExtractor {
  readonly provider: string;
  readonly model: string;
  extract(input: ExtractInput): Promise<ExtractOutput>;
}

/** Response schema: only the offered keys are expressible; sent to the model as a JSON schema. */
export function responseSchema(fieldKeys: string[]) {
  if (fieldKeys.length === 0) throw new Error('no field keys offered');
  return z.strictObject({
    subject_name: z.string().nullable(),
    fields: z.array(
      z.strictObject({
        field_key: z.enum(fieldKeys as [string, ...string[]]),
        slot: z.number().int().positive().nullable(),
        value: z.string(),
        quote: z.string(),
        author: z.string().nullable(),
      }),
    ),
  });
}
