export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** `20261103g_webeix0` -> `2026-11-03`. */
export function dateFromElectionCode(code: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(code);
  if (!m) throw new Error(`Cannot read a date from election code "${code}"`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function termSlug(term: string | null): string {
  if (!term) return 'unspecified';
  const date = /(\d{1,2})-(\d{1,2})-(\d{4})/.exec(term);
  if (!date) return slug(term);
  const [, mo, d, y] = date;
  if (/unexpired/i.test(term)) return `special-${y}`;
  return `full-${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

const STATEWIDE: [RegExp, string][] = [
  [/^Governor and Lieutenant Governor/, 'governor-lt-governor'],
  [/^Attorney General/, 'attorney-general'],
  [/^Auditor of State/, 'auditor-of-state'],
  [/^Secretary of State/, 'secretary-of-state'],
  [/^Treasurer of State/, 'treasurer-of-state'],
  [/^Justice of the Supreme Court/, 'supreme-court-justice'],
  [/^Chief Justice of the Supreme Court/, 'supreme-court-chief-justice'],
  [/^U\.S\. Senator/, 'us-senate'],
];

const DISTRICT: [RegExp, string][] = [
  [/^Representative to Congress \((\d+)\w* District\)/, 'us-house'],
  [/^State Senator \((\d+)\w* District\)/, 'state-senate'],
  [/^State Representative \((\d+)\w* District\)/, 'state-house'],
  [/^Judge of the Court of Appeals \((\d+)\w* District\)/, 'court-of-appeals'],
];

/** Office and jurisdiction components of a contest id from the printed title (without "For "). */
export function officeAndJurisdiction(title: string, county: string): [string, string] {
  for (const [re, office] of STATEWIDE) if (re.test(title)) return [office, 'oh'];
  for (const [re, office] of DISTRICT) {
    const m = re.exec(title);
    if (m) return [office, `oh-${m[1]}`];
  }
  if (/Common Pleas.*Probate\/Juvenile/.test(title))
    return ['common-pleas-probate-juvenile', county];
  if (/Common Pleas.*General Division/.test(title)) return ['common-pleas-general', county];
  const countyOffice = /^County (\w+)/.exec(title);
  if (countyOffice) return [`county-${slug(countyOffice[1]!)}`, county];
  return [slug(title.replace(/\(.*?\)/g, '')), county];
}

export function candidateContestId(
  date: string,
  title: string,
  term: string | null,
  county: string,
) {
  const [office, jurisdiction] = officeAndJurisdiction(title, county);
  return { id: `${date}:${office}:${jurisdiction}:${termSlug(term)}`, jurisdiction };
}
