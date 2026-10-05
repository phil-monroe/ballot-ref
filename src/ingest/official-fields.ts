import type { Contest } from '../schemas/contest.ts';
import type { RawField } from '../validate/types.ts';
import { normalizeWhitespace } from '../validate/normalize.ts';
import { slug } from './contest-id.ts';

/** Deterministic, model-free fields parsed from the official ballot text (Principle I, FR-022). */

const words = (s: string) => normalizeWhitespace(s).split(' ').filter(Boolean);

/** Quote capped at `max` words, plus a value that says so when the printed passage was longer. */
function capped(passage: string, max: number): { quote: string; value: string } {
  const w = words(passage.replace(/[,;:\s]+$/, ''));
  if (w.length <= max) return { quote: w.join(' '), value: w.join(' ') };
  return {
    quote: w.slice(0, max).join(' '),
    value: `Excerpt: first ${max} of ${w.length} words of the printed passage (see the official text)`,
  };
}

function exact(field_key: string, quote: string, value: string = quote): RawField {
  return { field_key, slot: null, value, quote };
}

const PURPOSE_STOPS = [' at a rate', ' at a combined', ' that the county auditor', ' except that'];

/** Fields for a levy contest from its printed heading and ballot text. */
export function levyFields(contest: Contest, maxWords: number): RawField[] {
  const out: RawField[] = [];
  const text = normalizeWhitespace(contest.ballot_text?.text ?? '');
  const title = contest.title;

  const entity = contest.ballot_text?.entity;
  if (entity) out.push(exact('taxing_entity', normalizeWhitespace(entity)));

  const paren = /\(([^)]+)\)/.exec(title);
  if (/Sales and Use Tax/.test(title))
    out.push(exact('levy_type', 'Proposed Sales and Use Tax', 'sales-use-tax'));
  else if (paren && /Proposed Tax Levy/.test(title)) {
    const quote = /Proposed Tax Levy \([^)]+\)/.test(title)
      ? `Proposed Tax Levy (${paren[1]})`
      : `(${paren[1]})`;
    out.push(exact('levy_type', quote, slug(paren[1]!)));
  }

  const mill =
    /(?:at )?a (?:combined )?rate not exceeding ([\d.]+) (mills?) for each \$1 of taxable value/.exec(
      text,
    );
  if (mill) out.push(exact('millage', mill[0], `${mill[1]} ${mill[2]}`));

  const dur =
    /for (\d+) years?, commencing in \d{4}, first due in calendar year \d{4}/.exec(text) ??
    /for a continuing period of time/.exec(text);
  if (dur) out.push(exact('duration', dur[0], dur[1] ? `${dur[1]} years` : 'continuing'));

  const cost =
    /which amounts to (\$[\d,]+) for each \$100,000 of the county auditor['’]s market value/.exec(
      text,
    );
  if (cost) out.push(exact('auditor_estimated_cost_per_100k', cost[0], cost[1]));

  const collect = /the county auditor estimates will collect (\$[\d,]+) annually/.exec(text);
  if (collect) out.push(exact('auditor_estimated_annual_collection', collect[0], collect[1]));

  const start = text.indexOf('for the purpose of');
  if (start >= 0) {
    const rest = text.slice(start);
    const stop = Math.min(
      ...PURPOSE_STOPS.map((s) => rest.indexOf(s)).filter((i) => i > 0),
      rest.length,
    );
    const { quote, value } = capped(rest.slice(0, stop), maxWords);
    out.push({ field_key: 'purpose', slot: null, value, quote });
  }
  return out;
}

/** Fields for a constitutional-amendment contest from its printed ballot text. */
export function issueFields(contest: Contest, maxWords: number): RawField[] {
  const out: RawField[] = [];
  const text = normalizeWhitespace(contest.ballot_text?.text ?? '');

  const caption = /^(.*?)\s+Proposed by /.exec(text)?.[1];
  if (caption) out.push({ field_key: 'ballot_language', slot: null, ...capped(caption, maxWords) });

  const bulletsStart = text.indexOf('•');
  if (bulletsStart >= 0) {
    const end = text.indexOf(' If approved,', bulletsStart);
    const block = text.slice(bulletsStart, end > 0 ? end : undefined);
    block
      .split('•')
      .map((b) => b.trim())
      .filter(Boolean)
      .forEach((bullet, i) =>
        out.push({ field_key: 'official_explanation', slot: i + 1, ...capped(bullet, maxWords) }),
      );
  }

  const yes = /A "YES" vote means [^.]*\./.exec(text);
  if (yes) out.push(exact('effect_yes', yes[0]));
  const no = /A "NO" vote means [^.]*\./.exec(text);
  if (no) out.push(exact('effect_no', no[0]));
  return out;
}

export function officialFieldsFor(contest: Contest, maxWords: number): RawField[] {
  if (contest.kind === 'levy') return levyFields(contest, maxWords);
  if (contest.kind === 'constitutional-issue') return issueFields(contest, maxWords);
  return [];
}
