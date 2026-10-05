import { z } from 'zod';
import type { Contest } from '../schemas/contest.ts';
import { LevyType, REQUIRED_TIER, SLOTTED_KEYS, isAllowedKey } from '../schemas/field-keys.ts';
import type { Tier } from '../schemas/shared.ts';
import type { RawField } from './types.ts';
import type { GateResult } from './types.ts';

const RawFieldSchema = z.strictObject({
  field_key: z.string().min(1),
  slot: z.number().int().positive().nullable().optional(),
  value: z.union([z.string().min(1), z.number()]),
  quote: z.string().min(1),
  author: z.string().min(1).nullable().optional(),
});

/** Gate 4: typed, no unknown fields, key allowed for the contest kind, slot and tier rules. */
export function checkSchema(
  raw: RawField,
  contest: Contest,
  sourceTier: Tier,
  limits: { priorities: number; keyVotes: number },
): GateResult {
  const fail = (detail: string): GateResult => ({ ok: false, reason: 'schema', detail });
  const parsed = RawFieldSchema.safeParse(raw);
  if (!parsed.success)
    return fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const f = parsed.data;

  if (!isAllowedKey(contest.kind, f.field_key))
    return fail(`"${f.field_key}" is not a ${contest.kind} field`);

  const slotted = SLOTTED_KEYS.has(f.field_key);
  if (slotted && f.slot == null) return fail(`"${f.field_key}" requires a slot`);
  if (!slotted && f.slot != null) return fail(`"${f.field_key}" does not take a slot`);
  if (f.field_key === 'priority' && f.slot! > limits.priorities)
    return fail(`priority slot ${f.slot} > ${limits.priorities}`);
  if (f.field_key === 'key_vote' && f.slot! > limits.keyVotes)
    return fail(`key_vote slot ${f.slot} > ${limits.keyVotes}`);

  const need = REQUIRED_TIER[f.field_key];
  if (need && sourceTier !== need)
    return fail(`"${f.field_key}" requires a ${need}-tier source, got ${sourceTier}`);

  if ((f.field_key === 'argument_for' || f.field_key === 'argument_against') && !f.author) {
    return fail(`"${f.field_key}" requires the author of the argument`);
  }
  if (f.author && f.field_key !== 'argument_for' && f.field_key !== 'argument_against') {
    return fail('author is only allowed on argument fields');
  }
  if (f.field_key === 'levy_type' && !LevyType.safeParse(f.value).success)
    return fail(`levy_type "${f.value}" is not an allowed value`);

  return { ok: true };
}
