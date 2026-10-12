import { parse } from 'yaml';
import guideYaml from './data/guide.yaml?raw';

// Loose typing on purpose: the research file is the source of truth and its shape may change.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const guide: any = parse(guideYaml);

export const list = (v: unknown): string[] => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

export const VERIFICATION: Record<string, string> = {
  unverified: 'Unverified',
  campaign_claim: 'Campaign claim',
  calculation: 'Our calculation',
};

// Every contest in official ballot order, tagged with its section title.
export const contests: any[] = guide.sections
  .flatMap((s: any) => s.contests.map((c: any) => ({ ...c, section: s.title })))
  .sort((a: any, b: any) => a.ballot_order - b.ballot_order);

// The options a voter can pick. Issues are Yes/No (state) or For/Against (local); an explicit
// `choices` list on a contest in the YAML overrides this.
export const choices = (c: any): string[] =>
  c.choices ?? (c.type === 'ballot_issue' ? (c.id.startsWith('state-') ? ['Yes', 'No'] : ['For', 'Against']) : c.candidates.map((x: any) => x.name));

export const label = (c: any): string => c.title ?? c.office;
export const PICKS_KEY = `ballot-ref:${guide.meta.election_date}:${guide.meta.precinct}`;
