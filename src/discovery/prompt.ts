import type { Contest } from '../schemas/contest.ts';

export interface DiscoveryInput {
  contest: {
    id: string;
    title: string;
    kind: Contest['kind'];
    jurisdiction: string;
    election_date: string;
    /** Levies and issues: the taxing or sponsoring entity named on the ballot. */
    entity: string | null;
  };
  /** Named candidates only (write-ins excluded). Empty for issues and levies. */
  candidates: { entity_id: string; ballot_name: string; party_label: string | null }[];
}

/** The only data a discovery run is given: ballot names, never registry, fields, or snapshots (FR-011a). */
export function discoveryInputFor(contest: Contest): DiscoveryInput {
  return {
    contest: {
      id: contest.id,
      title: contest.title,
      kind: contest.kind,
      jurisdiction: contest.jurisdiction,
      election_date: contest.id.split(':')[0] ?? '',
      entity: contest.ballot_text?.entity ?? null,
    },
    candidates: contest.candidates
      .filter((c) => !c.write_in)
      .map((c) => ({ entity_id: c.id, ballot_name: c.ballot_name, party_label: c.party_label })),
  };
}

/** The per-contest task sent on stdin. The same text shape is used for every candidate (FR-008). */
export function taskText(input: DiscoveryInput): string {
  const c = input.contest;
  const lines = [
    `Contest: ${c.title}`,
    `Kind: ${c.kind}`,
    `Jurisdiction: ${c.jurisdiction}`,
    `Election date: ${c.election_date}`,
  ];
  if (c.entity) lines.push(`Entity: ${c.entity}`);
  if (input.candidates.length) {
    lines.push(
      input.candidates.length === 1
        ? 'Research ONLY this candidate (use this entity_id; use null for pages about the contest as a whole):'
        : 'Candidates (use these entity_id values):',
    );
    for (const k of input.candidates)
      lines.push(
        `- entity_id: ${k.entity_id} | ballot name: ${k.ballot_name} | party: ${k.party_label ?? 'none'}`,
      );
  } else {
    lines.push('This is an issue or levy. Use entity_id null for every result.');
  }
  lines.push('', 'Find sources now and return only the required JSON.');
  return lines.join('\n');
}
