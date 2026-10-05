import { loadConfig } from './config.ts';
import { DataStore } from './data.ts';
import { AnthropicExtractor } from './extract/anthropic.ts';
import { loadPrompt, promptFamily } from './extract/prompts.ts';
import { runExtract } from './extract/run-extract.ts';
import { Fetcher } from './fetch/fetcher.ts';
import { importManual } from './fetch/manual-import.ts';
import { playwrightFallback } from './fetch/playwright-fallback.ts';
import { runFetch } from './fetch/run-fetch.ts';
import { SnapshotStore } from './fetch/snapshot-store.ts';
import { collectStatus, formatStatus } from './report/status.ts';
import { reviewLoop } from './review/cli.ts';
import { acknowledgeSymmetry, formatSymmetry } from './review/symmetry.ts';
import { writeSymmetryReport } from './report/symmetry.ts';
import { checkRegistry, findSourceAnywhere } from './sources/registry.ts';
import { revalidateContest } from './validate/revalidate.ts';

export const EXIT = { ok: 0, validation: 1, usage: 2, retrieval: 3 } as const;
type Out = { json: boolean };

const print = (o: Out, human: string, machine: unknown) =>
  console.log(o.json ? JSON.stringify(machine) : human);

export function sourcesCheck(contestId: string, o: Out): number {
  const problems = checkRegistry(contestId);
  print(o, problems.length ? problems.map((p) => `- ${p.message}`).join('\n') : 'registry ok', {
    contestId,
    problems,
  });
  return problems.length ? EXIT.validation : EXIT.ok;
}

export async function fetchCommand(contestId: string, refetch: boolean, o: Out): Promise<number> {
  const config = loadConfig();
  const fetcher = new Fetcher({
    userAgent: config.user_agent,
    rateLimitSeconds: config.rate_limit_seconds,
    fallback: playwrightFallback(config.user_agent),
  });
  const s = await runFetch({
    contestId,
    refetch,
    data: new DataStore(),
    store: new SnapshotStore(),
    fetcher,
  });
  const human = [
    ...s.entries.map((e) => `${e.outcome.padEnd(8)} ${e.url}${e.error ? `  (${e.error})` : ''}`),
    s.flagged ? `${s.flagged} approved field(s) flagged needs_rereview (source changed)` : '',
    s.needsManual ? 'Some sources need manual import: ballot-ref import <url> <file>' : '',
  ]
    .filter(Boolean)
    .join('\n');
  print(o, human, s);
  return s.needsManual ? EXIT.retrieval : EXIT.ok;
}

export async function importCommand(url: string, file: string, o: Out): Promise<number> {
  const found = findSourceAnywhere(url);
  if (!found) {
    console.error(`${url} is not whitelisted in any contest's source registry; register it first.`);
    return EXIT.usage;
  }
  if (found.source.tier === 'context') {
    console.error('context-tier sources are link-only and are never imported for extraction.');
    return EXIT.usage;
  }
  const meta = await importManual({
    url,
    file,
    redistributable: found.source.redistributable,
    store: new SnapshotStore(),
  });
  print(
    o,
    `imported ${url} as ${meta.sha256.slice(0, 12)} (${meta.redistributable ? 'public' : 'private'})`,
    meta,
  );
  return EXIT.ok;
}

export async function extractCommand(
  contestId: string,
  entityId: string | undefined,
  o: Out,
): Promise<number> {
  const config = loadConfig();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    return EXIT.usage;
  }
  const data = new DataStore();
  const contest = data.loadContest(contestId);
  const family = promptFamily(contest.kind);
  const extractor = new AnthropicExtractor(config, (i) => loadPrompt(family, i.prompt_version));
  const s = await runExtract({
    contestId,
    entityId,
    data,
    store: new SnapshotStore(),
    extractor,
    config,
  });
  const human = [
    `${s.calls} call(s), ${s.proposed} field(s) proposed, ${s.drops.length} dropped`,
    ...s.drops.map(
      (d) =>
        `  dropped ${d.entity_id}/${d.field_key}: ${d.reason}${d.detail ? ` (${d.detail})` : ''}`,
    ),
    ...s.errors.map((e) => `  error ${e}`),
    ...s.skipped.map((e) => `  skipped ${e}`),
  ].join('\n');
  print(o, human, s);
  return s.errors.length ? EXIT.validation : EXIT.ok;
}

export function validateCommand(contestId: string, o: Out): number {
  const config = loadConfig();
  const data = new DataStore();
  const failures = revalidateContest(contestId, data, new SnapshotStore(), config);
  const sym = writeSymmetryReport(contestId, data, config);
  const human = [
    failures.length ? `${failures.length} gate failure(s):` : 'all gates passed',
    ...failures.map(
      (f) =>
        `  ${f.entity_id}/${f.field_key}${f.slot ? `#${f.slot}` : ''}: ${f.reason}${f.detail ? ` (${f.detail})` : ''}`,
    ),
    sym.flags.length ? `symmetry FLAGGED: ${sym.flags.join('; ')}` : 'symmetry ok',
    ...sym.candidates.map((c) => `  ${c.entity_id}: ${c.filled} filled`),
  ].join('\n');
  print(o, human, { failures, symmetry: sym });
  return failures.length ? EXIT.validation : EXIT.ok;
}

export function statusCommand(contest: string | undefined, o: Out): number {
  const s = collectStatus(new DataStore(), new SnapshotStore(), loadConfig(), contest);
  print(o, formatStatus(s), s);
  return EXIT.ok;
}

const reviewerOf = (flag?: string) => flag ?? process.env.BALLOT_REF_REVIEWER ?? '';

export async function reviewNextCommand(
  contest: string | undefined,
  reviewer: string | undefined,
): Promise<number> {
  try {
    await reviewLoop({
      reviewer: reviewerOf(reviewer),
      contest,
      data: new DataStore(),
      store: new SnapshotStore(),
      config: loadConfig(),
    });
    return EXIT.ok;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return EXIT.usage;
  }
}

/** Shows the symmetry report; `--ack` records the acknowledgment (requires a reviewer id). */
export function reviewSymmetryCommand(
  contestId: string,
  ack: boolean,
  reviewer: string | undefined,
  o: Out,
): number {
  const config = loadConfig();
  const data = new DataStore();
  try {
    const report = ack
      ? acknowledgeSymmetry(contestId, reviewerOf(reviewer), data, config)
      : writeSymmetryReport(contestId, data, config);
    print(o, formatSymmetry(report) + (ack ? '' : '\n(use --ack to acknowledge)'), report);
    return EXIT.ok;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return EXIT.usage;
  }
}
