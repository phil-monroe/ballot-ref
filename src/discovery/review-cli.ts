import { createInterface } from 'node:readline/promises';
import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { Fetcher } from '../fetch/fetcher.ts';
import { orderedContestIds } from '../review/queue.ts';
import type { Proposal } from '../schemas/proposal.ts';
import { DomainClass, Tier } from '../schemas/shared.ts';
import { computeCoverage, formatCoverage } from './coverage.ts';
import { fetchExcerpt, sanitizeForTerminal } from './excerpt.ts';
import { ProcessQueue } from './process.ts';
import { orderForReview, pending } from './queue.ts';
import {
  DiscoveryReviewError,
  acceptProposal,
  rejectProposal,
  type AcceptEdits,
} from './review.ts';

const clean = sanitizeForTerminal;

/**
 * Interactive review of proposed sources, one at a time (FR-004). Accept registers the source and queues
 * fetch + extract in the background without waiting (FR-005a); quitting waits for those jobs and prints
 * their summary. Skip lasts for the session; skipped proposals stay pending on disk.
 */
export async function sourceReviewLoop(opts: {
  reviewer: string;
  contest?: string;
  data: DataStore;
  config: SiteConfig;
  fetcher: Fetcher;
  queue: ProcessQueue;
  /** Override the decisions log path (tests). */
  decisionsLog?: string;
}): Promise<void> {
  if (!opts.reviewer?.trim())
    throw new DiscoveryReviewError(
      'A reviewer id is required (--reviewer or BALLOT_REF_REVIEWER).',
    );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const skipped = new Set<string>();
  const shown = new Set<string>();
  const excerpts = new Map<string, Promise<string>>();
  const excerptFor = (p: Proposal) => {
    if (!excerpts.has(p.id)) excerpts.set(p.id, fetchExcerpt(p.url, opts.fetcher));
    return excerpts.get(p.id)!;
  };
  const ctx = {
    reviewer: opts.reviewer,
    data: opts.data,
    ...(opts.decisionsLog ? { decisionsLog: opts.decisionsLog } : {}),
  };

  const nextItems = (): { contestId: string; list: Proposal[] } | null => {
    for (const contestId of opts.contest ? [opts.contest] : orderedContestIds(opts.data)) {
      const contest = opts.data.loadContest(contestId);
      const list = orderForReview(pending(opts.data.loadProposals(contestId)), contest).filter(
        (p) => !skipped.has(p.id),
      );
      if (list.length) return { contestId, list };
    }
    return null;
  };

  try {
    for (;;) {
      const next = nextItems();
      if (!next) {
        console.log('No proposed sources left to review.');
        break;
      }
      const { contestId, list } = next;
      const p = list[0]!;
      const contest = opts.data.loadContest(contestId);
      if (!shown.has(contestId)) {
        shown.add(contestId);
        console.log(
          '\n' +
            formatCoverage(
              computeCoverage(contest, opts.data.loadProposals(contestId), opts.config),
            ) +
            '\n',
        );
      }
      if (list[1]) void excerptFor(list[1]); // prefetch the next item
      const cand = contest.candidates.find((c) => c.id === p.entity_id);
      console.log('─'.repeat(72));
      console.log(
        `${contestId}  /  ${cand ? cand.ballot_name : p.entity_id === null ? '(contest-wide)' : p.entity_id}   (${list.length} pending in this contest)`,
      );
      console.log(`url:    ${clean(p.url)}${p.final_url ? `  ->  ${clean(p.final_url)}` : ''}`);
      console.log(`as:     ${p.proposed_class} / ${p.proposed_tier}`);
      console.log(`why:    ${clean(p.reason)}`);
      if (p.identity_label) console.log(`site:   ${p.identity_label.replace('-', ' ')}`);
      if (p.validity.status !== 'ok')
        console.log(
          `!! check: ${p.validity.status}${p.validity.note ? ` (${clean(p.validity.note)})` : ''}`,
        );
      console.log(`page:   ${(await excerptFor(p)).split('\n').join('\n        ')}`);
      const ans = (await rl.question('[a]ccept  [e]dit then accept  [r]eject  [s]kip  [q]uit > '))
        .trim()
        .toLowerCase();
      try {
        if (ans === 'q') break;
        if (ans === 's') skipped.add(p.id);
        else if (ans === 'r') {
          console.log(
            'Reject reasons are published in the repository. Keep them neutral and factual (for example "not this candidate", "dead link").',
          );
          const reason = await rl.question('reason (optional) > ');
          rejectProposal(contestId, p.id, reason, ctx);
        } else if (ans === 'a' || ans === 'e') {
          const edits: AcceptEdits = {};
          if (ans === 'e') {
            const cls = (await rl.question(`class [${p.proposed_class}] > `)).trim();
            if (cls) edits.domain_class = DomainClass.parse(cls);
            const tier = (await rl.question(`tier [${p.proposed_tier}] > `)).trim();
            if (tier) edits.tier = Tier.parse(tier);
            const ent = (
              await rl.question(`candidate id [${p.entity_id ?? '-'}] ('-' = contest-wide) > `)
            ).trim();
            if (ent) edits.entity_id = ent === '-' ? null : ent;
          }
          const finalClass = edits.domain_class ?? p.proposed_class;
          if (finalClass === 'candidate-site') {
            const name = cand?.ballot_name ?? edits.entity_id ?? p.entity_id ?? 'the candidate';
            const yes = (
              await rl.question(`Confirm this site belongs to ${name}, ${contest.title}? [y/N] > `)
            )
              .trim()
              .toLowerCase();
            edits.ownership_confirmed = yes === 'y' || yes === 'yes';
          }
          const { source } = acceptProposal(contestId, p.id, edits, ctx);
          if (source.tier === 'context')
            console.log('Registered as link-only context (not fetched).');
          else {
            opts.queue.enqueue(contestId, source.url);
            console.log('Registered. Fetching and extracting in the background...');
          }
        }
      } catch (e) {
        if (!(e instanceof DiscoveryReviewError) && !(e instanceof Error && e.name === 'ZodError'))
          throw e;
        console.log(`Refused: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        skipped.add(p.id);
      }
    }
  } finally {
    rl.close();
  }
  if (opts.queue.pending > 0)
    console.log(`Waiting for ${opts.queue.pending} background job(s) to finish...`);
  const done = await opts.queue.drain();
  for (const r of done)
    console.log(
      `${r.extracted ? 'ok    ' : r.fetched ? 'fetched' : 'FAILED '} ${r.url}${r.last_error ? `  (${clean(r.last_error)})` : ''}`,
    );
  if (done.some((r) => !r.fetched || !r.extracted))
    console.log('Retry failures with: ballot-ref process --all');
}
