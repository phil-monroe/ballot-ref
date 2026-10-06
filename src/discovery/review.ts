import type { DataStore } from '../data.ts';
import { LOGS, appendLog } from '../log.ts';
import type { Decision, Proposal } from '../schemas/proposal.ts';
import type { DomainClass, Tier } from '../schemas/shared.ts';
import type { Source } from '../schemas/source.ts';
import { EVALUATIVE } from './validity.ts';

export class DiscoveryReviewError extends Error {}

/** Classes whose pages are government or public records; their snapshots may be committed. */
export const GOV_CLASSES: ReadonlySet<DomainClass> = new Set([
  'ohio-boe',
  'ohio-sos',
  'fec',
  'congress',
  'ohio-legislature',
  'county-auditor',
]);

export interface ReviewCtx {
  reviewer: string;
  data: DataStore;
  now?: () => Date;
  /** Override the decisions log path (tests). */
  decisionsLog?: string;
}

export interface AcceptEdits {
  domain_class?: DomainClass;
  tier?: Tier;
  /** `null` makes the source contest-wide. */
  entity_id?: string | null;
  /** Required `true` to accept a candidate's own website (FR-007). */
  ownership_confirmed?: boolean;
}

const MAX_REASON = 200;

function find(contestId: string, id: string, ctx: ReviewCtx) {
  if (!ctx.reviewer?.trim())
    throw new DiscoveryReviewError(
      'A reviewer id is required (--reviewer or BALLOT_REF_REVIEWER).',
    );
  const queue = ctx.data.loadProposals(contestId);
  const idx = queue.findIndex((p) => p.id === id);
  if (idx < 0) throw new DiscoveryReviewError(`proposal ${id} not found in ${contestId}`);
  const p = queue[idx]!;
  if (p.status !== 'pending')
    throw new DiscoveryReviewError(`proposal ${id} is already ${p.status}`);
  return { queue, idx, p };
}

const redistributableFor = (cls: DomainClass, tier: Tier): boolean =>
  tier !== 'context' && GOV_CLASSES.has(cls);

/**
 * Accept: validates, appends a registry entry identical in form to a hand-registered one, records the
 * decision, and marks the proposal accepted. It does not fetch or extract (the caller does, FR-005a).
 * Candidate sites need explicit ownership confirmation; `other` can only stay link-only context.
 */
export function acceptProposal(
  contestId: string,
  id: string,
  edits: AcceptEdits,
  ctx: ReviewCtx,
): { proposal: Proposal; source: Source } {
  const { queue, idx, p } = find(contestId, id, ctx);
  const contest = ctx.data.loadContest(contestId);
  const cls = edits.domain_class ?? p.proposed_class;
  const tier = edits.tier ?? p.proposed_tier;
  const entity = edits.entity_id !== undefined ? edits.entity_id : p.entity_id;
  if (entity !== null && !contest.candidates.some((c) => c.id === entity))
    throw new DiscoveryReviewError(`entity "${entity}" is not a candidate in this contest`);
  if (cls === 'other' && tier !== 'context')
    throw new DiscoveryReviewError(
      'class "other" fits no existing class: choose an existing class and tier, or accept it as link-only context',
    );
  if (cls === 'candidate-site') {
    if (entity === null)
      throw new DiscoveryReviewError('a candidate site must be assigned to a candidate');
    if (edits.ownership_confirmed !== true)
      throw new DiscoveryReviewError(
        'confirm that this site belongs to the candidate before accepting it',
      );
  }
  const registry = ctx.data.loadSources(contestId);
  if (registry.some((s) => s.url === p.url && s.entity_id === (entity ?? undefined)))
    throw new DiscoveryReviewError(`${p.url} is already registered for this target`);

  const at = (ctx.now ?? (() => new Date()))().toISOString();
  const redistributable = redistributableFor(cls, tier);
  const source: Source = {
    url: p.url,
    domain_class: cls,
    tier,
    ...(entity !== null ? { entity_id: entity } : {}),
    redistributable,
    whitelisted_by: ctx.reviewer,
    whitelisted_at: at,
    notes: `discovery ${p.id}: ${p.reason}`,
  };
  ctx.data.saveSources(contestId, [...registry, source]);

  const accepted: Proposal = {
    ...p,
    entity_id: entity,
    status: 'accepted',
    decided_by: ctx.reviewer,
    decided_at: at,
    decision_reason: null,
    accepted_as: { domain_class: cls, tier, redistributable },
    ownership_confirmed: cls === 'candidate-site' ? true : null,
  };
  queue[idx] = accepted;
  ctx.data.saveProposals(contestId, queue);
  logDecision(ctx, accepted, 'accept', null);
  return { proposal: accepted, source };
}

/** Reasons are committed to the public repository: neutral and factual only (FR-015a). */
export function checkRejectReason(reason: string | null): string | null {
  const r = reason?.trim() ?? '';
  if (r === '') return null;
  if (r.length > MAX_REASON)
    throw new DiscoveryReviewError(`reason is too long (max ${MAX_REASON} characters)`);
  if (EVALUATIVE.test(r))
    throw new DiscoveryReviewError(
      'reject reasons are published: state a neutral fact about the source (for example "not this candidate", "dead link"), not an opinion',
    );
  return r;
}

export function rejectProposal(
  contestId: string,
  id: string,
  reason: string | null,
  ctx: ReviewCtx,
): Proposal {
  const clean = checkRejectReason(reason);
  const { queue, idx, p } = find(contestId, id, ctx);
  const at = (ctx.now ?? (() => new Date()))().toISOString();
  const rejected: Proposal = {
    ...p,
    status: 'rejected',
    decided_by: ctx.reviewer,
    decided_at: at,
    decision_reason: clean,
    accepted_as: null,
  };
  queue[idx] = rejected;
  ctx.data.saveProposals(contestId, queue);
  logDecision(ctx, rejected, 'reject', clean);
  return rejected;
}

function logDecision(
  ctx: ReviewCtx,
  p: Proposal,
  action: Decision['action'],
  reason: string | null,
) {
  const d: Omit<Decision, 'at'> = {
    proposal_id: p.id,
    contest_id: p.contest_id,
    entity_id: p.entity_id,
    url: p.url,
    action,
    reviewer: ctx.reviewer,
    reason,
    accepted_as: p.accepted_as,
  };
  appendLog(ctx.decisionsLog ?? LOGS.sourceDecisions, d as unknown as Record<string, unknown>);
}
