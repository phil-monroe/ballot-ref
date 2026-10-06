import { createHash } from 'node:crypto';
import type { DataStore } from '../data.ts';
import type { Contest } from '../schemas/contest.ts';
import type { Proposal } from '../schemas/proposal.ts';
import { matchSource } from '../validate/whitelist.ts';

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i;

/** Lowercase host, no fragment, no tracking parameters, no trailing slash (except the root). */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  let out = u.toString();
  if (u.pathname !== '/') out = out.replace(/\/+(\?|$)/, '$1');
  return out;
}

export function proposalId(contestId: string, entityId: string | null, url: string): string {
  return createHash('sha256')
    .update(`${contestId}|${entityId ?? '*'}|${normalizeUrl(url)}`)
    .digest('hex')
    .slice(0, 16);
}

export type NewProposal = Omit<Proposal, 'id'>;

export interface AddResult {
  added: Proposal[];
  duplicate: number;
}

/**
 * Adds proposals the queue does not already hold (any status) and that no registered source already
 * covers (FR-014). Rejected URLs are therefore never proposed again (FR-006).
 */
export function addProposals(
  contestId: string,
  incoming: NewProposal[],
  data: DataStore,
): AddResult {
  const queue = data.loadProposals(contestId);
  const registry = data.loadSources(contestId);
  const have = new Set(queue.map((p) => p.id));
  const added: Proposal[] = [];
  let duplicate = 0;
  for (const n of incoming) {
    const id = proposalId(contestId, n.entity_id, n.url);
    const registered =
      matchSource(n.url, registry, n.entity_id ?? undefined) !== null ||
      registry.some((s) => normalizeUrl(s.url) === normalizeUrl(n.url));
    if (have.has(id) || registered) {
      duplicate++;
      continue;
    }
    have.add(id);
    added.push({ ...n, id });
  }
  if (added.length) data.saveProposals(contestId, [...queue, ...added]);
  return { added, duplicate };
}

/** Review order group: official records first, then candidate-owned sites, then everything else. */
export function tierGroup(p: Pick<Proposal, 'proposed_tier' | 'proposed_class'>): number {
  if (p.proposed_tier === 'official') return 0;
  if (p.proposed_class === 'candidate-site') return 1;
  return 2;
}

/** FR-013a: consistent order (tier group, candidate ballot order, URL). */
export function orderForReview(proposals: Proposal[], contest: Contest): Proposal[] {
  const order = new Map(contest.candidates.map((c) => [c.id, c.order]));
  const rank = (p: Proposal) => (p.entity_id === null ? -1 : (order.get(p.entity_id) ?? 9999));
  return [...proposals].sort(
    (a, b) => tierGroup(a) - tierGroup(b) || rank(a) - rank(b) || a.url.localeCompare(b.url),
  );
}

export const pending = (proposals: Proposal[]): Proposal[] =>
  proposals.filter((p) => p.status === 'pending');
