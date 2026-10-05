import type { Contest } from '../schemas/contest.ts';
import { candidateContestId, slug } from './contest-id.ts';
import type { ParsedContest } from './parse-ballot.ts';

export interface BuildContext {
  /** ISO date of the election, e.g. 2026-11-03. */
  date: string;
  county: string;
  snapshotHash: string;
}

function uniqueId(id: string, seen: Set<string>): string {
  if (seen.has(id))
    throw new Error(`Duplicate contest id ${id}; the ballot has two indistinguishable contests`);
  seen.add(id);
  return id;
}

export function buildContests(parsed: ParsedContest[], ctx: BuildContext): Contest[] {
  const seen = new Set<string>();
  return parsed.map((p): Contest => {
    const base = {
      ballot_snapshot_hash: ctx.snapshotHash,
      ballot_page: p.page,
      vote_for: p.voteFor,
    };

    if (p.kind === 'constitutional-issue' || p.kind === 'levy') {
      const issue = p.issue!;
      let id: string;
      let jurisdiction: string;
      if (p.kind === 'constitutional-issue') {
        const n = /Issue (\d+)/.exec(p.title)?.[1] ?? slug(p.title);
        jurisdiction = 'oh';
        id = `${ctx.date}:state-issue-${n}:oh:constitutional-amendment`;
      } else {
        jurisdiction = slug(issue.entity ?? p.title);
        id = `${ctx.date}:levy:${jurisdiction}:${issue.levyType ?? 'unspecified'}`;
      }
      return {
        ...base,
        id: uniqueId(id, seen),
        kind: p.kind,
        title: p.title,
        jurisdiction,
        term: null,
        candidates: [],
        issue_options: p.options.map((label, order) => ({ id: slug(label), label, order })),
        ballot_text: { title: p.title, entity: issue.entity, text: issue.text },
      };
    }

    const { id, jurisdiction } = candidateContestId(ctx.date, p.title, p.term, ctx.county);
    return {
      ...base,
      id: uniqueId(id, seen),
      kind: p.kind,
      title: p.title,
      jurisdiction,
      term: p.term,
      candidates: p.candidates.map((c, i) => ({
        id: c.writeIn ? 'write-in' : slug(c.name),
        ballot_name: c.name,
        party_label: c.party,
        // Ticket persons share their ticket's position; other options use their printed position.
        order: c.ticket !== null ? c.ticket - 1 : i,
        write_in: c.writeIn,
        incumbent: null,
        ticket_id: c.ticket !== null ? `ticket-${c.ticket}` : null,
        ...(c.role ? { role: c.role } : {}),
      })),
      issue_options: [],
    };
  });
}
