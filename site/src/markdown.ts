import { contests, guide, list, politifactLinks } from './lib';

// Plain-markdown rendering of the whole guide, for llms.txt / llms-full.txt and pasting into an AI chat.
const bullets = (items: unknown, indent = ''): string => list(items).map((i) => `${indent}- ${i}`).join('\n');
const block = (title: string, items: unknown, level = '####'): string => {
  const b = bullets(items);
  return b ? `${level} ${title}\n${b}\n` : '';
};
const links = (items: any[] | undefined): string =>
  (items ?? []).length ? `Sources:\n${items!.map((s) => `- [${s.title}](${s.url})`).join('\n')}\n` : '';

const candidate = (c: any): string => {
  const out: string[] = [];
  const tags = [c.party, c.incumbent ? 'incumbent' : '', c.verification ? `(${c.verification.replace('_', ' ')})` : ''].filter(Boolean).join(', ');
  out.push(`### ${c.name}${tags ? ` (${tags})` : ''}`);
  out.push(c.website ? `Website: ${c.website}` : 'Website: none found');
  if (c.verification_note) out.push(`Note: ${c.verification_note}`);
  if (c.summary) out.push(`\n${c.summary}\n`);
  const sec = [
    block('Resume', c.resume),
    block('Track record (highlights, not an evaluation)', c.track_record),
    block(`Stated priorities${c.priorities_note ? ` (${c.priorities_note})` : ''}`, c.priorities),
    c.priority_details?.length
      ? `#### Full priority details from the campaign site\n${c.priority_details.map((d: any) => `- **${d.title}**: ${d.summary}`).join('\n')}\n`
      : '',
    block('Positions', c.positions),
    block('Money', c.money),
    block('Endorsements', c.endorsements),
    block('Supporters say', c.support),
    block('Critics say', c.oppose),
  ];
  out.push(sec.filter(Boolean).join('\n'));
  out.push('#### PolitiFact\n' + [...politifactLinks(c).map((l) => `- [${l.label}](${l.url})`), ...(c.politifact_items ?? []).map((i: any) => `- [${i.title}](${i.url}) (${i.kind === 'fact_check' ? 'fact-check' : 'article'}, ${i.date}${i.rating ? `, rated ${i.rating}` : ''})${i.note ? `: ${i.note}` : ''}`)].join('\n') + '\n');
  const src = [...(c.resume_sources ?? []), ...(c.sources ?? [])];
  if (src.length) out.push(links(src));
  return out.join('\n');
};

export const contest = (c: any): string => {
  const out: string[] = [];
  if (c.type === 'ballot_issue') {
    out.push(`## ${c.ballot_order}. ${c.title}`);
    out.push([c.jurisdiction && `Jurisdiction: ${c.jurisdiction}`, c.levy_type && `Type: ${c.levy_type}`, c.threshold && `Threshold: ${c.threshold}`, c.website && `Website: ${c.website}`].filter(Boolean).join('\n'));
    out.push('Choices: ' + (c.id.startsWith('state-') ? 'Yes / No' : 'For / Against'));
    const parts: [string, unknown][] = [
      ['Ballot language (summary)', c.ballot_language_summary],
      ['What it does', c.what_it_does],
      ['How it got on the ballot', c.how_it_got_on_ballot],
      ['Cost', c.cost],
      ['Cost context', c.cost_context],
      ['Revenue estimate', c.revenue_estimate ? `${c.revenue_estimate.value} (${c.revenue_estimate.note})` : undefined],
      ['What it would fund', c.what_it_would_fund ?? c.what_it_funds],
      ['Implementation', c.implementation_note],
      ['History', c.history],
      ['Context', c.context],
      ['Supporters', c.supporters],
      ['Opponents', c.opponents],
      ['Arguments for', c.arguments_for],
      ['Arguments against', c.arguments_against],
    ];
    for (const [t, v] of parts) out.push(block(t, v, '###'));
    out.push('### PolitiFact\n' + [...politifactLinks(c).map((l) => `- [${l.label}](${l.url})`), ...(c.politifact_items ?? []).map((i: any) => `- [${i.title}](${i.url}) (${i.kind === 'fact_check' ? 'fact-check' : 'article'}, ${i.date}${i.rating ? `, rated ${i.rating}` : ''})${i.note ? `: ${i.note}` : ''}`)].join('\n') + '\n');
    if (c.documents?.length) out.push('### Official documents (hosted copies)\n' + c.documents.map((d: any) => `- ${d.title}: /docs/${d.file} (original: ${d.source})`).join('\n') + '\n');
    out.push(links(c.sources));
    return out.filter(Boolean).join('\n');
  }
  out.push(`## ${c.ballot_order}. ${c.office}`);
  out.push(
    [
      c.term && `Term: ${c.term}`,
      c.districts_note && `District: ${c.districts_note}`,
      c.contested === false && 'Uncontested',
      c.website && `Office website: ${c.website}`,
      c.what_the_office_does && `About the office: ${c.what_the_office_does}`,
      c.background && `Background: ${c.background}`,
      c.race_status && `Race status: ${c.race_status}`,
      c.debate_note && `Debates: ${c.debate_note}`,
    ].filter(Boolean).join('\n'),
  );
  if (c.polls?.length) {
    out.push('\nPolls:\n' + c.polls.map((p: any) => `- ${p.pollster}${p.dates ? `, ${p.dates}` : ''}${p.population ? `, ${p.population}` : ''}: ${p.result}`).join('\n'));
  }
  if (c.events?.length) out.push('\nEvents:\n' + bullets(c.events));
  out.push('');
  for (const cand of c.candidates) out.push(candidate(cand));
  out.push(links(c.sources));
  return out.filter((x) => x !== undefined).join('\n');
};

export const SITE_NOTE =
  'Neutrality: priorities and track-record items come from campaign sites and public biographies; items marked "campaign claim" or "unverified" are not independently confirmed. "Supporters say" and "Critics say" are arguments made by others, not recommendations. Verify anything important with the Delaware County Board of Elections.';

export const fullMarkdown = (): string => {
  const m = guide.meta;
  const parts: string[] = [
    `# ${m.title}`,
    `Jurisdiction: ${m.jurisdiction}. Precinct: ${m.precinct}. Election date: ${m.election_date}. Guide compiled: ${m.guide_compiled}.`,
    `Official sample ballot: ${m.ballot_source.url}`,
    '',
    SITE_NOTE,
    '',
    '## Summary',
    bullets(m.tldr),
    '',
    '## Not on this ballot',
    bullets(m.not_on_this_ballot),
    '',
    '## Notes',
    bullets(m.notes),
    '',
    '## Caveats',
    bullets(m.caveats.map((c: any) => `${c.text}${c.verification ? ` [${c.verification}]` : ''}`)),
    '',
    '# Contests and issues (in ballot order)',
    '',
    ...contests.map(contest),
    '',
    '## General sources',
    ...m.global_sources.map((s: any) => `- [${s.title}](${s.url})`),
    '',
  ];
  return parts.join('\n').replace(/\n{3,}/g, '\n\n');
};

export const indexMarkdown = (base: string): string => {
  const m = guide.meta;
  const lines = [
    `# ${m.title}`,
    '',
    `> Nonpartisan research guide for ${m.jurisdiction}, precinct ${m.precinct}, for the ${m.election_date} general election: ${contests.length} ballot items (candidate races and issues) with candidate resumes, track records, stated priorities, money, endorsements, arguments, polls and sources. Compiled ${m.guide_compiled}.`,
    '',
    SITE_NOTE,
    '',
    '## How to use this with an AI assistant',
    `- Give the assistant the full guide: ${base}/llms-full.txt (one markdown file, everything below). The raw data is ${base}/guide.yaml.`,
    '- Ask it to answer only from the guide, name its source for each claim, and stay neutral.',
    '',
    '## Ballot contents',
    ...contests.map((c: any) => `- ${c.ballot_order}. ${c.title ?? c.office}: ${c.type === 'ballot_issue' ? (c.id.startsWith('state-') ? 'Yes / No' : 'For / Against') : c.candidates.map((x: any) => x.name).join('; ')}`),
    '',
    '## Pages',
    `- [Full guide as markdown](${base}/llms-full.txt)`,
    `- [Raw data (YAML)](${base}/guide.yaml)`,
    `- [My ballot (picks and notes, stored on your device)](${base}/)`,
    `- [About and caveats](${base}/about/)`,
    ...contests.map((c: any) => `- [${c.ballot_order}. ${c.title ?? c.office}](${base}/race/${c.id}/)`),
    '',
  ];
  return lines.join('\n');
};

export const raceMarkdown = (c: any): string => {
  const m = guide.meta;
  return [
    `Voter guide excerpt: ${m.title}. ${m.jurisdiction}, precinct ${m.precinct}. Compiled ${m.guide_compiled}.`,
    SITE_NOTE,
    '',
    contest(c),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
};
