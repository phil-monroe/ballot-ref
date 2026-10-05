import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { orderedContestIds } from '../review/queue.ts';
import { publishableFields } from '../review/publishable.ts';
import { evaluateReadiness } from '../review/readiness.ts';
import type { Ballot, CandidateOption, Contest } from '../schemas/contest.ts';
import type { Field } from '../schemas/field.ts';
import { slotId, symmetrySlots } from '../validate/symmetry.ts';

export const NOT_FOUND = 'Not found in whitelisted sources.';

const LABELS: Record<string, string> = {
  campaign_website: 'Campaign website',
  office_held: 'Current office',
  prior_office: 'Prior office',
  finance_raised: 'Total raised',
  finance_spent: 'Total spent',
  finance_period_end: 'Report coverage ends',
  current_office: 'Current judicial/legal office',
  bar_admission: 'Bar admission',
  ballot_language: 'Official ballot language',
  official_explanation: 'Official explanation',
  argument_for: 'Argument for',
  argument_against: 'Argument against',
  effect_yes: 'Effect of a YES vote',
  effect_no: 'Effect of a NO vote',
  current_law: 'Current law',
  taxing_entity: 'Taxing entity',
  levy_type: 'Type',
  millage: 'Millage',
  duration: 'Duration',
  purpose: 'Purpose as stated',
  auditor_estimated_cost_per_100k: 'County auditor’s estimated cost per $100,000 of valuation',
  auditor_estimated_annual_collection: 'County auditor’s estimated annual collection',
  sponsor_materials: 'Sponsor’s own materials',
  official_text_link: 'Official text',
};

export function slotLabel(slot: string): string {
  const [key, n] = slot.split('#');
  if (key === 'priority') return `Stated priority ${n}`;
  if (key === 'official_explanation') return `Official explanation, item ${n}`;
  return LABELS[key!] ?? key!;
}

/** Issue keys that expand into one slot per stored item (e.g. each bullet of the official explanation). */
const EXPANDING = new Set(['official_explanation']);

const ISSUE_SLOTS: Record<'constitutional-issue' | 'levy', string[]> = {
  'constitutional-issue': [
    'ballot_language',
    'official_explanation',
    'argument_for',
    'argument_against',
    'effect_yes',
    'effect_no',
    'current_law',
  ],
  levy: [
    'taxing_entity',
    'levy_type',
    'millage',
    'duration',
    'purpose',
    'auditor_estimated_cost_per_100k',
    'auditor_estimated_annual_collection',
    'sponsor_materials',
    'official_text_link',
  ],
};

export interface SlotView {
  slot: string;
  label: string;
  /** Publishable (approved or edited) field, or null => "Not found in whitelisted sources." */
  field: Field | null;
}
export interface PersonView {
  option: CandidateOption;
  slots: SlotView[];
}
export interface ChoiceView {
  ticketId: string | null;
  people: PersonView[];
}
export interface ContestView {
  contest: Contest;
  anchor: string;
  ready: boolean;
  reasons: string[];
  choices: ChoiceView[];
  issueSlots: SlotView[];
  lastReviewed: string | null;
}
export interface BallotView {
  ballot: Ballot;
  slug: string;
  contests: ContestView[];
  readyCount: number;
}

export const ballotSlug = (b: Ballot): string =>
  `${b.county}-${b.precinct_code}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Deep-link anchor for a contest: its id without the election date. */
export const contestAnchor = (id: string): string =>
  id
    .split(':')
    .slice(1)
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-');

function slotsFrom(keys: string[], fields: Field[]): SlotView[] {
  const shown = publishableFields(fields);
  const byId = new Map(shown.map((f) => [slotId(f), f]));
  const expanded = keys.flatMap((k) => {
    if (!EXPANDING.has(k)) return [k];
    const slots = shown
      .filter((f) => f.field_key === k)
      .map((f) => f.slot ?? 1)
      .sort((a, b) => a - b);
    return (slots.length ? slots : [1]).map((n) => `${k}#${n}`);
  });
  return expanded.map((slot) => ({ slot, label: slotLabel(slot), field: byId.get(slot) ?? null }));
}

/**
 * Builds what the site may show. Anything not ready renders names only ("Not yet reviewed"); within a
 * ready contest only approved/edited fields are visible, and every slot is present so layouts match.
 */
export function buildContestView(
  contest: Contest,
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
  now: Date,
): ContestView {
  const readiness = evaluateReadiness(contest.id, data, store, config, now);
  const base = {
    contest,
    anchor: contestAnchor(contest.id),
    ready: readiness.ready,
    reasons: readiness.reasons,
  };
  const named = (o: CandidateOption): PersonView => ({ option: o, slots: [] });

  const choices: ChoiceView[] = [];
  let issueSlots: SlotView[] = [];
  let reviewed: string[] = [];

  if (contest.kind === 'candidate' || contest.kind === 'judicial') {
    const keys = symmetrySlots(contest.kind, config.priorities_per_candidate);
    const person = (o: CandidateOption): PersonView => {
      if (!readiness.ready || o.write_in) return named(o);
      const fields = data.loadFields(contest.id, o.id).fields;
      reviewed.push(...publishableFields(fields).map((f) => f.reviewed_at ?? ''));
      return { option: o, slots: slotsFrom(keys, fields) };
    };
    const seenTickets = new Set<string>();
    for (const o of contest.candidates) {
      if (o.ticket_id) {
        if (seenTickets.has(o.ticket_id)) continue;
        seenTickets.add(o.ticket_id);
        choices.push({
          ticketId: o.ticket_id,
          people: contest.candidates.filter((c) => c.ticket_id === o.ticket_id).map(person),
        });
      } else choices.push({ ticketId: null, people: [person(o)] });
    }
  } else if (readiness.ready) {
    const fields = data
      .listEntities(contest.id)
      .flatMap((e) => data.loadFields(contest.id, e).fields);
    reviewed = publishableFields(fields).map((f) => f.reviewed_at ?? '');
    issueSlots = slotsFrom(ISSUE_SLOTS[contest.kind], fields);
  }

  const lastReviewed = reviewed.filter(Boolean).sort().at(-1) ?? null;
  return { ...base, choices, issueSlots, lastReviewed };
}

export function buildBallotView(
  ballot: Ballot,
  data: DataStore,
  store: SnapshotStore,
  config: SiteConfig,
  now: Date = new Date(),
): BallotView {
  const ids = ballot.contests.length ? ballot.contests : orderedContestIds(data);
  const contests = ids.map((id) =>
    buildContestView(data.loadContest(id), data, store, config, now),
  );
  return {
    ballot,
    slug: ballotSlug(ballot),
    contests,
    readyCount: contests.filter((c) => c.ready).length,
  };
}
