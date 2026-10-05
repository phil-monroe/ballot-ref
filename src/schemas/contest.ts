import { z } from 'zod';

export const Election = z.strictObject({
  id: z.string().min(1),
  date: z.iso.date(),
  type: z.enum(['general', 'primary', 'special']),
});
export type Election = z.infer<typeof Election>;

export const CandidateOption = z.strictObject({
  id: z.string().min(1),
  ballot_name: z.string().min(1),
  party_label: z.string().nullable(),
  order: z.number().int().nonnegative(),
  write_in: z.boolean(),
  incumbent: z.boolean().nullable(),
  ticket_id: z.string().nullable(),
  role: z.enum(['governor', 'lieutenant-governor']).optional(),
});
export type CandidateOption = z.infer<typeof CandidateOption>;

export const IssueOption = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export const ContestKind = z.enum(['candidate', 'judicial', 'constitutional-issue', 'levy']);

export const BallotText = z.strictObject({
  title: z.string().min(1),
  entity: z.string().nullable(),
  text: z.string().min(1),
});

export const Contest = z.strictObject({
  id: z.string().min(1),
  kind: ContestKind,
  title: z.string().min(1),
  jurisdiction: z.string().min(1),
  term: z.string().nullable(),
  vote_for: z.number().int().positive(),
  candidates: z.array(CandidateOption).default([]),
  issue_options: z.array(IssueOption).default([]),
  ballot_text: BallotText.optional(),
  ballot_snapshot_hash: z.string().regex(/^[0-9a-f]{64}$/),
  ballot_page: z.number().int().positive(),
});
export type Contest = z.infer<typeof Contest>;

export const BallotSource = z.strictObject({
  county_slug: z.string().min(1),
  election_code: z.string().min(1),
  precinct_code: z.string().min(1),
});

export const Ballot = z.strictObject({
  county: z.string().min(1),
  precinct_code: z.string().min(1),
  precinct_name: z.string().min(1),
  election: z.string().min(1),
  ballot_source: BallotSource,
  contests: z.array(z.string().min(1)).default([]),
});
export type Ballot = z.infer<typeof Ballot>;
