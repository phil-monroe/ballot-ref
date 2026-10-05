import { Field } from '../schemas/field.ts';
import type { Drop } from '../schemas/report.ts';
import { checkEntity } from './entity.ts';
import { checkLength } from './length.ts';
import { checkQuote } from './quote.ts';
import { checkSchema } from './schema.ts';
import type { GateContext, RawField } from './types.ts';
import { matchSource } from './whitelist.ts';

export type GateOutcome =
  { ok: true; field: Field } | { ok: false; reason: Drop['reason']; detail?: string };

/**
 * Applies every gate, in order, to one proposed field. A failure is reported, never repaired: the
 * returned field is exactly what the extractor proposed, with provenance filled from the stored
 * snapshot and the source registry (the model never chooses the tier, source hash, or dates).
 */
export function runGates(raw: RawField, ctx: GateContext): GateOutcome {
  const source = matchSource(ctx.snapshot.url, ctx.sources, ctx.entityId);
  if (!source) return { ok: false, reason: 'source-not-whitelisted', detail: ctx.snapshot.url };
  if (source.tier === 'context') {
    return {
      ok: false,
      reason: 'source-not-whitelisted',
      detail: 'context-tier sources are link-only',
    };
  }

  const checks = [
    () =>
      checkSchema(raw, ctx.contest, source.tier, {
        priorities: ctx.config.priorities_per_candidate,
        keyVotes: ctx.config.key_vote_count,
      }),
    () => checkLength(raw.quote, ctx.config.quote_max_words),
    () => checkQuote(raw.quote, ctx.snapshot.text),
    () =>
      !ctx.skipEntity &&
      ctx.extractor.kind === 'model' &&
      (ctx.contest.kind === 'candidate' || ctx.contest.kind === 'judicial')
        ? checkEntity(ctx.subjectName, ctx.ballotName, ctx.snapshot.text)
        : ({ ok: true } as const),
  ];
  for (const check of checks) {
    const r = check();
    if (!r.ok) return r;
  }

  const parsed = Field.safeParse({
    contest_id: ctx.contest.id,
    entity_id: ctx.entityId,
    field_key: raw.field_key,
    slot: raw.slot ?? null,
    value: raw.value,
    quote: raw.quote,
    source_url: ctx.snapshot.url,
    source_hash: ctx.snapshot.sha256,
    retrieved_at: ctx.snapshot.retrieved_at,
    tier: source.tier,
    status: 'proposed',
    reviewer: null,
    reviewed_at: null,
    extractor: ctx.extractor,
    ...(raw.author ? { author: raw.author } : {}),
    needs_rereview: false,
  });
  if (!parsed.success) return { ok: false, reason: 'schema', detail: parsed.error.message };
  return { ok: true, field: parsed.data };
}
