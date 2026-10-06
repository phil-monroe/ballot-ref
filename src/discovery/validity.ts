import type { Fetcher } from '../fetch/fetcher.ts';
import { htmlToText } from '../fetch/html-text.ts';
import type { Contest } from '../schemas/contest.ts';
import type { IdentityLabel, Proposal } from '../schemas/proposal.ts';

export type Validity = Proposal['validity'];

/** Hosts whose pages must stay link-only (Principle IV): never fetched, never quoted. */
const LINK_ONLY = /(^|\.)(ballotpedia\.org|vote411\.org)$/i;
export const isLinkOnlyHost = (url: string): boolean => {
  try {
    return LINK_ONLY.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Official domains a lookalike could imitate. */
const KNOWN_GOV = [
  'ohiosos.gov',
  'ohio.gov',
  'fec.gov',
  'house.gov',
  'senate.gov',
  'congress.gov',
  'ohiohouse.gov',
  'ohiosenate.gov',
  'ohiosos.gov',
];

const TWO_PART_SUFFIX = new Set(['co.uk', 'com.au', 'org.uk']);

/** Registrable domain, approximated as the last two labels (three for a few two-part suffixes). */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  const lastTwo = parts.slice(-2).join('.');
  return TWO_PART_SUFFIX.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length]![b.length]!;
}

/** The known official domain this host imitates (distance 1 or 2, not equal), if any. */
export function lookalikeOf(host: string): string | null {
  const d = registrableDomain(host);
  for (const known of KNOWN_GOV) {
    if (d === known || d.endsWith(`.${known}`)) return null;
  }
  for (const known of KNOWN_GOV) {
    const dist = editDistance(d, known);
    if (dist >= 1 && dist <= 2) return known;
  }
  return null;
}

const PARKED =
  /(domain (name )?(is )?(for sale|parked)|this domain (is|may be) for sale|buy this domain|parked (free|domain|by)|sedoparking|related searches|account suspended)/i;

export interface CheckedPage {
  validity: Validity;
  final_url: string | null;
  /** Page text for the identity check only; never stored. */
  text: string | null;
}

/**
 * Basic validity of a proposed URL (FR-013) using the robots-aware, rate-limited fetcher. Problems are
 * reported to the reviewer, never hidden. Link-only hosts are not fetched at all.
 */
export async function checkUrl(url: string, fetcher: Fetcher): Promise<CheckedPage> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return {
      validity: { status: 'unreachable', note: 'not a valid URL' },
      final_url: null,
      text: null,
    };
  }
  const imitated = lookalikeOf(host);
  if (isLinkOnlyHost(url))
    return {
      validity: { status: 'unchecked', note: 'link-only context; not fetched' },
      final_url: null,
      text: null,
    };
  const res = await fetcher.fetchUrl(url);
  if (!res.ok) {
    const unchecked = res.reason === 'robots' || res.reason === 'blocked';
    return {
      validity: {
        status: imitated ? 'lookalike' : unchecked ? 'unchecked' : 'unreachable',
        note: imitated
          ? `resembles ${imitated}; ${res.reason}: ${res.error}`
          : `${res.reason}: ${res.error}`,
      },
      final_url: null,
      text: null,
    };
  }
  const finalUrl = res.finalUrl ?? url;
  const text = /html/i.test(res.contentType) ? htmlToText(res.body.toString('utf8')) : null;
  let status: Validity['status'] = 'ok';
  let note = '';
  if (imitated) {
    status = 'lookalike';
    note = `domain resembles ${imitated}`;
  } else if (registrableDomain(new URL(finalUrl).hostname) !== registrableDomain(host)) {
    status = 'redirects-off-domain';
    note = `redirects to ${new URL(finalUrl).hostname}`;
  } else if (text !== null && (text.trim().length < 200 || PARKED.test(text.slice(0, 4000)))) {
    status = 'parked';
    note = 'page looks parked or nearly empty';
  }
  return {
    validity: { status, note },
    final_url: finalUrl === url ? null : finalUrl,
    text,
  };
}

/** Title words too generic to show a page is about this office. */
const STOP = new Set([
  'of',
  'the',
  'to',
  'for',
  'and',
  'in',
  'a',
  'district',
  'county',
  'state',
  'court',
  'ohio',
]);
const SYNONYMS: [RegExp, string[]][] = [
  [
    /:us-house:/,
    ['u.s. house', 'house of representatives', 'congress', 'congressman', 'congresswoman'],
  ],
  [/:us-senate:/, ['u.s. senate', 'senator', 'senate']],
  [/:governor-lt-governor:/, ['governor']],
  [/:state-house:/, ['state representative', 'ohio house']],
  [/:state-senate:/, ['state senator', 'ohio senate']],
  [/:attorney-general:/, ['attorney general']],
  [/:secretary-of-state:/, ['secretary of state']],
  [/:auditor-of-state:/, ['auditor of state', 'state auditor']],
  [/:treasurer-of-state:/, ['treasurer of state', 'state treasurer']],
  [/:supreme-court-justice:/, ['supreme court']],
  [/:county-commissioner:/, ['commissioner']],
  [/:county-auditor:/, ['auditor']],
];

/** Words that, with the candidate's name, show a page is about this office. */
export function officeKeywords(contest: Contest): string[] {
  const fromTitle = contest.title
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  const extra = SYNONYMS.filter(([re]) => re.test(contest.id)).flatMap(([, k]) => k);
  return [...new Set([...fromTitle, ...extra])];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/**
 * Deterministic identity check for a candidate's own site (FR-007a): the page itself must show the
 * candidate's name and an office keyword. The agent's claim alone is never trusted. The label is
 * advisory; the reviewer's ownership confirmation is still required.
 */
export function identityLabel(
  text: string | null,
  ballotName: string,
  contest: Contest,
  agentClaim: boolean | undefined,
): IdentityLabel {
  if (!text || agentClaim === false) return 'possible-match';
  const t = norm(text);
  const hasName = t.includes(norm(ballotName));
  const hasOffice = officeKeywords(contest).some((k) => t.includes(k));
  return hasName && hasOffice ? 'identity-matched' : 'possible-match';
}

export const EVALUATIVE =
  /\b(best|worst|strongest|weakest|excellent|impressive|corrupt|extreme|extremist|radical|trustworthy|untrustworthy|unqualified|great|terrible|dangerous|honest|dishonest|inexperienced|superior|inferior|should win|must win)\b/i;

export const WITHHELD_REASON = '(note withheld: evaluative wording)';

/** Notes may only say what a source is and covers (FR-010); evaluative notes are withheld, not edited. */
export const neutralReason = (reason: string): string =>
  EVALUATIVE.test(reason) ? WITHHELD_REASON : reason;
