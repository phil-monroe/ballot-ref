import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { Fetcher } from '../fetch/fetcher.ts';
import { LOGS, appendLog } from '../log.ts';
import type { DiscoveryRun, Proposal } from '../schemas/proposal.ts';
import { DiscoveryResult, type DiscoveryAgent } from './agent.ts';
import { discoveryInputFor } from './prompt.ts';
import { addProposals, type NewProposal } from './queue.ts';
import { checkUrl, identityLabel, isLinkOnlyHost, neutralReason } from './validity.ts';

export interface DiscoveryOutcome {
  run: DiscoveryRun;
  added: Proposal[];
}

/**
 * One discovery run for one contest: the agent researches, code validates every result, and new proposals
 * are written to the review queue. It never writes to the registry, fields, or site (FR-003), keeps partial
 * results when a step fails, and records every candidate with no proposals as "no sources found" (FR-009).
 */
export async function runDiscovery(opts: {
  contestId: string;
  data: DataStore;
  agent: DiscoveryAgent;
  fetcher: Fetcher;
  config: SiteConfig;
  now?: () => Date;
  runId?: string;
  logPath?: string;
}): Promise<DiscoveryOutcome> {
  const { data, agent, fetcher, config } = opts;
  const now = opts.now ?? (() => new Date());
  const contest = data.loadContest(opts.contestId);
  const input = discoveryInputFor(contest);
  const startedAt = now().toISOString();
  const runId =
    opts.runId ??
    `${startedAt.replace(/[-:.]/g, '').slice(0, 15)}-${Math.random().toString(36).slice(2, 6)}`;
  const run: DiscoveryRun = {
    run_id: runId,
    contest_id: contest.id,
    started_at: startedAt,
    finished_at: startedAt,
    model: agent.model,
    prompt_version: config.prompt_versions.discovery ?? 'v1',
    tools: [...agent.tools],
    searched: [],
    returned: 0,
    added: 0,
    skipped_duplicate: 0,
    invalid: 0,
    no_sources_found: [],
    error: null,
  };
  const finish = (added: Proposal[]): DiscoveryOutcome => {
    run.finished_at = now().toISOString();
    const queue = data.loadProposals(contest.id);
    const targets: (string | null)[] = input.candidates.length
      ? input.candidates.map((c) => c.entity_id)
      : [null];
    run.no_sources_found = targets.filter((t) => !queue.some((p) => p.entity_id === t));
    appendLog(opts.logPath ?? LOGS.discoveryRuns, run as unknown as Record<string, unknown>);
    return { run, added };
  };

  // One call per candidate (one for an issue), each with an identical task: equal research depth for every
  // candidate (FR-008), and one failed call leaves the others' results intact.
  const inputs = input.candidates.length
    ? input.candidates.map((c) => ({ ...input, candidates: [c] }))
    : [input];
  const results: { entity: string | null; raw: unknown }[] = [];
  const errors: string[] = [];
  for (const sub of inputs) {
    const entity = sub.candidates.length ? sub.candidates[0]!.entity_id : null;
    try {
      const out = await agent.discover(sub);
      run.searched.push(...out.searched);
      for (const raw of out.results) results.push({ entity, raw });
    } catch (e) {
      errors.push(`${entity ?? 'contest'}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  run.returned = results.length;
  run.error = errors.length ? errors.join('; ') : null;

  const names = new Map(input.candidates.map((c) => [c.entity_id, c.ballot_name]));
  const incoming: NewProposal[] = [];
  const seen = new Set<string>();
  for (const { entity, raw } of results) {
    const parsed = DiscoveryResult.safeParse(raw);
    const r = parsed.success ? parsed.data : null;
    // A call may only return results for its own candidate, or for the contest as a whole.
    const badTarget = r !== null && r.entity_id !== null && r.entity_id !== entity;
    if (!r || badTarget) {
      run.invalid++;
      continue;
    }
    const url = new URL(r.url).toString(); // canonical form (encodes stray spaces)
    const key = `${r.entity_id ?? '*'}|${url}`;
    if (seen.has(key)) {
      run.skipped_duplicate++;
      continue;
    }
    seen.add(key);

    const linkOnly = isLinkOnlyHost(url);
    const cls = linkOnly ? 'other' : r.class_guess;
    const tier = linkOnly ? 'context' : cls === 'other' ? 'context' : r.tier_guess;
    let page;
    try {
      page = await checkUrl(url, fetcher);
    } catch (e) {
      page = {
        validity: {
          status: 'unchecked' as const,
          note: e instanceof Error ? e.message : String(e),
        },
        final_url: null,
        text: null,
      };
    }
    const label =
      cls === 'candidate-site' && r.entity_id !== null
        ? identityLabel(page.text, names.get(r.entity_id)!, contest, r.site_shows_name_and_office)
        : null;
    incoming.push({
      contest_id: contest.id,
      entity_id: r.entity_id,
      url,
      final_url: page.final_url,
      proposed_class: cls,
      proposed_tier: tier,
      reason: neutralReason(r.reason),
      identity_label: label,
      validity: page.validity,
      run_id: runId,
      found_at: now().toISOString(),
      status: 'pending',
      decided_by: null,
      decided_at: null,
      decision_reason: null,
      accepted_as: null,
      ownership_confirmed: null,
    });
  }
  const { added, duplicate } = addProposals(contest.id, incoming, data);
  run.added = added.length;
  run.skipped_duplicate += duplicate;
  return finish(added);
}
