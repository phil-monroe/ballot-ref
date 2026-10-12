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

// PolitiFact: direct profile pages are listed in the YAML (`politifact`) only where one was confirmed to exist;
// everyone else, and every ballot issue, gets a PolitiFact search link.
const pfSearch = (q: string) => `https://www.politifact.com/search/?q=${encodeURIComponent(q)}`;
export type PfLink = { label: string; url: string; direct: boolean };
export const politifactLinks = (c: any): PfLink[] => {
  if (c.type === 'ballot_issue') {
    return [{ label: `Search PolitiFact: ${c.politifact_query ?? c.title}`, url: pfSearch(c.politifact_query ?? c.title), direct: false }];
  }
  if (c.politifact?.length) {
    return c.politifact.map((p: any) => (p.search ? { label: `Search PolitiFact for ${p.label}`, url: p.url, direct: false } : { label: `${p.label} on PolitiFact`, url: p.url, direct: true }));
  }
  return String(c.name)
    .split(' / ')
    .map((n) => n.replace(/\s*\(.*?\)/g, '').trim())
    .map((n) => ({ label: `Search PolitiFact for ${n}`, url: pfSearch(n), direct: false }));
};
