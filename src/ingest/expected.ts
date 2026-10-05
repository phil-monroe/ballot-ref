import { z } from 'zod';
import type { Contest } from '../schemas/contest.ts';

export const ExpectedContest = z.strictObject({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  term: z.string().nullable(),
  vote_for: z.number(),
  page: z.number(),
  candidates: z.array(
    z.strictObject({
      name: z.string(),
      party: z.string().nullable(),
      write_in: z.boolean(),
      ticket_id: z.string().nullable(),
      role: z.string().optional(),
    }),
  ),
  options: z.array(z.string()),
  text_contains: z.array(z.string()).optional(),
});
export const Expected = z.strictObject({ contests: z.array(ExpectedContest) });
export type Expected = z.infer<typeof Expected>;

/** Returns human-readable mismatches; empty when the parsed ballot matches the fixture exactly. */
export function compareToExpected(contests: Contest[], expected: Expected): string[] {
  const problems: string[] = [];
  if (contests.length !== expected.contests.length) {
    problems.push(`contest count: parsed ${contests.length}, expected ${expected.contests.length}`);
  }
  expected.contests.forEach((e, i) => {
    const c = contests[i];
    if (!c) return void problems.push(`missing contest #${i + 1} (${e.id})`);
    const got = {
      id: c.id,
      kind: c.kind,
      title: c.title,
      term: c.term,
      vote_for: c.vote_for,
      page: c.ballot_page,
      candidates: c.candidates.map((x) => ({
        name: x.ballot_name,
        party: x.party_label,
        write_in: x.write_in,
        ticket_id: x.ticket_id,
        ...(x.role ? { role: x.role } : {}),
      })),
      options: c.issue_options.map((o) => o.label),
    };
    const want = { ...e, text_contains: undefined };
    delete want.text_contains;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(
        `contest #${i + 1} differs\n  parsed:   ${JSON.stringify(got)}\n  expected: ${JSON.stringify(want)}`,
      );
    }
    const text = (c.ballot_text?.text ?? '').replace(/\s+/g, ' ');
    for (const needle of e.text_contains ?? []) {
      if (!text.includes(needle))
        problems.push(`contest #${i + 1} (${e.id}) text lacks "${needle}"`);
    }
  });
  return problems;
}
