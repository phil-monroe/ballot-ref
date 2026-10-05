import { joinLines, type Line } from './layout.ts';
import { slug } from './contest-id.ts';

export interface ParsedCandidate {
  name: string;
  party: string | null;
  writeIn: boolean;
  ticket: number | null;
  role?: 'governor' | 'lieutenant-governor';
}

export interface ParsedContest {
  kind: 'candidate' | 'judicial' | 'constitutional-issue' | 'levy';
  /** Printed title without the leading "For ". For issues, the printed heading. */
  title: string;
  term: string | null;
  voteFor: number;
  candidates: ParsedCandidate[];
  options: string[];
  page: number;
  /** Issues only. */
  issue?: {
    entity: string | null;
    geography: string | null;
    levyType: string | null;
    text: string;
  };
}

const isJudicial = (title: string) => /^(Chief )?(Judge|Justice)\b/.test(title);

function groupByStream(lines: Line[]): Line[][] {
  const streams = new Map<string, Line[]>();
  for (const l of lines) {
    const k = `${l.page}:${l.col}`;
    (streams.get(k) ?? streams.set(k, []).get(k)!).push(l);
  }
  return [...streams.values()];
}

/** A stream is a candidate-contest stream if it has an unindented 12pt line starting "For ". */
const isContestStream = (s: Line[]) =>
  s.some((l) => l.indent < 10 && l.size === 12 && l.text.startsWith('For '));

function parseContestStream(stream: Line[]): ParsedContest[] {
  const out: ParsedContest[] = [];
  let cur: ParsedContest | null = null;
  let titleLines: string[] = [];
  let inTitle = false;
  let pendingGov: string | null = null;
  let ticketNo = 0;
  let last: ParsedCandidate | null = null;

  const finishTitle = () => {
    if (cur && inTitle) {
      cur.title = joinLines(titleLines).replace(/^For /, '');
      cur.kind = isJudicial(cur.title) ? 'judicial' : 'candidate';
      inTitle = false;
    }
  };

  for (const l of stream) {
    if (l.indent < 10 && l.size === 12) {
      if (!inTitle) {
        cur = {
          kind: 'candidate',
          title: '',
          term: null,
          voteFor: 1,
          candidates: [],
          options: [],
          page: l.page,
        };
        out.push(cur);
        titleLines = [];
        inTitle = true;
      }
      titleLines.push(l.text);
      continue;
    }
    if (!cur) continue;
    finishTitle();
    if (l.indent < 10 && l.size === 7) {
      const vote = /Vote for not more than (\d+)/.exec(l.text);
      const term = /^\(((?:Full|Unexpired) term[^)]*)\)$/.exec(l.text);
      if (vote) cur.voteFor = Number(vote[1]);
      else if (term) cur.term = term[1]!;
      continue;
    }
    if (l.indent >= 10 && l.size === 12) {
      if (pendingGov !== null) {
        const lg: ParsedCandidate = {
          name: l.text,
          party: null,
          writeIn: false,
          ticket: ticketNo,
          role: 'lieutenant-governor',
        };
        cur.candidates.push(lg);
        last = lg;
        pendingGov = null;
      } else if (l.text.endsWith(' and')) {
        ticketNo += 1;
        pendingGov = l.text.slice(0, -4);
        cur.candidates.push({
          name: pendingGov,
          party: null,
          writeIn: false,
          ticket: ticketNo,
          role: 'governor',
        });
      } else {
        last = { name: l.text, party: null, writeIn: false, ticket: null };
        cur.candidates.push(last);
      }
      continue;
    }
    if (l.indent >= 10 && l.size === 10 && last) {
      // Party belongs to the whole ticket: set it on both persons.
      for (const c of cur.candidates) {
        if (last.ticket !== null && c.ticket === last.ticket) c.party = l.text;
      }
      last.party = l.text;
      continue;
    }
    if (l.indent >= 10 && l.size === 8 && /^Write-in$/i.test(l.text)) {
      cur.candidates.push({ name: l.text, party: null, writeIn: true, ticket: null });
      last = null;
    }
  }
  finishTitle();
  return out;
}

/** Trailing "... Counties" geography lines are separated from the taxing entity name. */
function splitGeography(head: string[]): { entity: string[]; geography: string[] } {
  const geo: string[] = [];
  const rest = [...head];
  if (rest.length && /Counties$/.test(rest[rest.length - 1]!)) {
    geo.unshift(rest.pop()!);
    while (rest.length > 1 && rest[rest.length - 1]!.endsWith(',')) geo.unshift(rest.pop()!);
  }
  return { entity: rest, geography: geo };
}

function finishIssue(
  head: string[],
  body: string[],
  options: string[],
  page: number,
): ParsedContest {
  const text = joinLines(body);
  const printed = joinLines(head);
  if (/Constitutional Amendment/.test(printed)) {
    return {
      kind: 'constitutional-issue',
      title: printed,
      term: null,
      voteFor: 1,
      candidates: [],
      options,
      page,
      issue: { entity: null, geography: null, levyType: null, text },
    };
  }
  // Levy heading: "Proposed Tax Levy [(Type)] <entity lines> [<geography lines>]"
  const typeLine = head.findIndex((h) => /^\(.*\)$/.test(h));
  const first = head[0] ?? '';
  const inline = /^Proposed Tax Levy \((.*)\)$/.exec(first);
  let levyType: string | null = null;
  let entityLines: string[];
  if (inline) {
    levyType = slug(inline[1]!);
    entityLines = head.slice(1);
  } else if (typeLine === 1) {
    levyType = slug(head[1]!.slice(1, -1));
    entityLines = head.slice(2);
  } else if (/Sales and Use Tax/.test(first)) {
    levyType = 'sales-use-tax';
    entityLines = head.slice(1);
  } else {
    entityLines = head.slice(1);
  }
  const { entity, geography } = splitGeography(entityLines);
  return {
    kind: 'levy',
    title: printed,
    term: null,
    voteFor: 1,
    candidates: [],
    options,
    page,
    issue: {
      entity: entity.length ? joinLines(entity) : null,
      geography: geography.length ? joinLines(geography) : null,
      levyType,
      text,
    },
  };
}

const OPTION_START = /^(For|Against|YES|NO)\b/;

function parseIssueStream(stream: Line[]): ParsedContest[] {
  const out: ParsedContest[] = [];
  let head: string[] = [];
  let body: string[] = [];
  let options: string[] = [];
  let page = 0;
  let started = false;
  let prevHeading = false;

  const flush = () => {
    if (started) out.push(finishIssue(head, body, options, page));
    head = [];
    body = [];
    options = [];
  };

  for (const l of stream) {
    const heading = l.indent < 10 && (l.size === 10 || l.size === 11);
    if (heading) {
      if (!prevHeading) {
        flush();
        started = true;
        page = l.page;
      }
      head.push(l.text);
      prevHeading = true;
      continue;
    }
    prevHeading = false;
    if (!started) continue;
    if (l.indent >= 10 && l.size === 12) {
      if (OPTION_START.test(l.text) || options.length === 0) options.push(l.text);
      else options[options.length - 1] = joinLines([options[options.length - 1]!, l.text]);
      continue;
    }
    body.push(l.text);
  }
  flush();
  return out;
}

/** Parses laid-out ballot lines into contests and issues in printed order. No model involved. */
export function parseBallot(lines: Line[]): ParsedContest[] {
  const out: ParsedContest[] = [];
  for (const stream of groupByStream(lines)) {
    out.push(...(isContestStream(stream) ? parseContestStream(stream) : parseIssueStream(stream)));
  }
  return out;
}
