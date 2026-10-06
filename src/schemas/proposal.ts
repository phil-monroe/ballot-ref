import { z } from 'zod';
import { DomainClass, IsoDateTime, Tier } from './shared.ts';

export const ValidityStatus = z.enum([
  'ok',
  'unreachable',
  'redirects-off-domain',
  'lookalike',
  'parked',
  'unchecked',
]);
export type ValidityStatus = z.infer<typeof ValidityStatus>;

export const IdentityLabel = z.enum(['identity-matched', 'possible-match']);
export type IdentityLabel = z.infer<typeof IdentityLabel>;

export const ProposalStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

export const Proposal = z
  .strictObject({
    /** First 16 hex of sha256 of `contest_id|entity_id-or-*|normalized_url`. */
    id: z.string().regex(/^[0-9a-f]{16}$/),
    contest_id: z.string().min(1),
    entity_id: z.string().min(1).nullable(),
    url: z.string().min(1),
    final_url: z.string().nullable(),
    proposed_class: DomainClass,
    proposed_tier: Tier,
    reason: z.string().max(160),
    identity_label: IdentityLabel.nullable(),
    validity: z.strictObject({ status: ValidityStatus, note: z.string() }),
    run_id: z.string().min(1),
    found_at: IsoDateTime,
    status: ProposalStatus,
    decided_by: z.string().min(1).nullable(),
    decided_at: IsoDateTime.nullable(),
    /** Rejects only; neutral and factual. Committed to the public repository. */
    decision_reason: z.string().nullable(),
    accepted_as: z
      .strictObject({ domain_class: DomainClass, tier: Tier, redistributable: z.boolean() })
      .nullable(),
    ownership_confirmed: z.boolean().nullable(),
  })
  .refine((p) => p.proposed_class !== 'other' || p.proposed_tier === 'context', {
    message: 'proposed_class "other" requires proposed_tier "context"',
    path: ['proposed_class'],
  });
export type Proposal = z.infer<typeof Proposal>;

export const ProposalFile = z.array(Proposal).superRefine((ps, ctx) => {
  const seen = new Set<string>();
  ps.forEach((p, i) => {
    if (seen.has(p.id))
      ctx.addIssue({ code: 'custom', message: `duplicate id ${p.id}`, path: [i] });
    seen.add(p.id);
  });
});
export type ProposalFile = z.infer<typeof ProposalFile>;

export const DiscoveryRun = z.strictObject({
  run_id: z.string().min(1),
  contest_id: z.string().min(1),
  started_at: IsoDateTime,
  finished_at: IsoDateTime,
  model: z.string(),
  prompt_version: z.string(),
  tools: z.array(z.string()),
  searched: z.array(z.strictObject({ entity_id: z.string().nullable(), topic: z.string() })),
  returned: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  skipped_duplicate: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  /** Candidates (or the issue, as null) with no proposals at all: "no sources found" (FR-009). */
  no_sources_found: z.array(z.string().nullable()),
  error: z.string().nullable(),
});
export type DiscoveryRun = z.infer<typeof DiscoveryRun>;

export const Decision = z.strictObject({
  at: IsoDateTime,
  proposal_id: z.string(),
  contest_id: z.string(),
  entity_id: z.string().nullable(),
  url: z.string(),
  action: z.enum(['accept', 'reject']),
  reviewer: z.string().min(1),
  reason: z.string().nullable(),
  accepted_as: z
    .strictObject({ domain_class: DomainClass, tier: Tier, redistributable: z.boolean() })
    .nullable(),
});
export type Decision = z.infer<typeof Decision>;

export const ProcessingRecord = z.strictObject({
  contest_id: z.string(),
  url: z.string(),
  fetched: z.boolean(),
  extracted: z.boolean(),
  last_error: z.string().nullable(),
  updated_at: IsoDateTime,
});
export type ProcessingRecord = z.infer<typeof ProcessingRecord>;
