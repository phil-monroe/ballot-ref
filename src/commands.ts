import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { DataStore } from './data.ts';
import { AnthropicExtractor } from './extract/anthropic.ts';
import { ClaudeCliDiscoveryAgent } from './discovery/agent.ts';
import { computeCoverage, formatCoverage } from './discovery/coverage.ts';
import { runBallotDiscovery } from './discovery/run-ballot.ts';
import { ProcessQueue, processOutstanding, type ProcessDeps } from './discovery/process.ts';
import { sourceReviewLoop } from './discovery/review-cli.ts';
import { runDiscovery } from './discovery/run-discovery.ts';
import { ClaudeCliExtractor } from './extract/claude-cli.ts';
import { loadPrompt, promptFamily } from './extract/prompts.ts';
import { runExtract } from './extract/run-extract.ts';
import { Fetcher } from './fetch/fetcher.ts';
import { importManual } from './fetch/manual-import.ts';
import { playwrightFallback } from './fetch/playwright-fallback.ts';
import { runFetch } from './fetch/run-fetch.ts';
import { SnapshotStore } from './fetch/snapshot-store.ts';
import { verifySite } from './verify/verify.ts';
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

function makeFetcher(config: ReturnType<typeof loadConfig>): Fetcher {
  return new Fetcher({
    userAgent: config.user_agent,
    rateLimitSeconds: config.rate_limit_seconds,
    fallback: playwrightFallback(config.user_agent),
  });
}

/** `discover <contest-id>`: research proposals into the review queue; nothing is registered or fetched. */
export async function discoverCommand(contestId: string, o: Out): Promise<number> {
  const config = loadConfig();
  if (config.model.provider !== 'claude-cli') {
    console.error(
      'Discovery requires model.provider: claude-cli (it runs the Claude Code CLI with web tools).',
    );
    return EXIT.usage;
  }
  const data = new DataStore();
  try {
    data.loadContest(contestId);
  } catch {
    console.error(`contest not found: ${contestId}`);
    return EXIT.usage;
  }
  const agent = new ClaudeCliDiscoveryAgent(
    config,
    loadPrompt('discovery', config.prompt_versions.discovery ?? 'v1'),
  );
  const { run, added } = await runDiscovery({
    contestId,
    data,
    agent,
    fetcher: makeFetcher(config),
    config,
  });
  const human = [
    `${contestId}: ${run.added} new proposal(s) (${run.skipped_duplicate} duplicate, ${run.invalid} invalid)`,
    ...added.map(
      (p) =>
        `  ${p.proposed_tier.padEnd(8)} ${p.proposed_class.padEnd(16)} ${p.entity_id ?? '(contest)'}  ${p.url}${p.validity.status === 'ok' ? '' : `  [${p.validity.status}]`}`,
    ),
    '',
    formatCoverage(
      computeCoverage(data.loadContest(contestId), data.loadProposals(contestId), config),
    ),
    run.error ? `ERROR: ${run.error}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  print(o, human, { run, added: added.length });
  return run.error ? EXIT.retrieval : EXIT.ok;
}

/** `discover --ballot <file>`: every contest on a ballot, one at a time; already-discovered contests are skipped unless `--refresh`. */
export async function discoverBallotCommand(
  ballotFile: string,
  refresh: boolean,
  o: Out,
): Promise<number> {
  const config = loadConfig();
  if (config.model.provider !== 'claude-cli') {
    console.error(
      'Discovery requires model.provider: claude-cli (it runs the Claude Code CLI with web tools).',
    );
    return EXIT.usage;
  }
  if (!existsSync(ballotFile)) {
    console.error(`ballot config not found: ${ballotFile}`);
    return EXIT.usage;
  }
  const agent = new ClaudeCliDiscoveryAgent(
    config,
    loadPrompt('discovery', config.prompt_versions.discovery ?? 'v1'),
  );
  const results = await runBallotDiscovery({
    ballotFile,
    data: new DataStore(),
    agent,
    fetcher: makeFetcher(config),
    config,
    refresh,
    onResult: (r) => {
      if (!o.json)
        console.log(
          `${r.outcome.padEnd(10)} ${r.contest_id}  (+${r.added}, ${r.pending} pending)${r.error ? `  ERROR: ${r.error}` : ''}`,
        );
    },
  });
  if (o.json) console.log(JSON.stringify(results));
  else
    console.log(
      `\n${results.filter((r) => r.outcome === 'discovered').length} discovered, ${results.filter((r) => r.outcome === 'skipped').length} skipped (already discovered; --refresh to re-run), ${results.filter((r) => r.outcome === 'failed').length} failed`,
    );
  return results.some((r) => r.outcome === 'failed') ? EXIT.retrieval : EXIT.ok;
}

export async function fetchCommand(contestId: string, refetch: boolean, o: Out): Promise<number> {
  const config = loadConfig();
  const fetcher = makeFetcher(config);
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

/** Provider chosen by `model.provider`; the prompt family follows each call's contest kind. */
function makeExtractor(config: ReturnType<typeof loadConfig>) {
  const prompt = (i: { contestKind: Parameters<typeof promptFamily>[0]; prompt_version: string }) =>
    loadPrompt(promptFamily(i.contestKind), i.prompt_version);
  return config.model.provider === 'claude-cli'
    ? new ClaudeCliExtractor(config, prompt)
    : new AnthropicExtractor(config, prompt);
}

function processDeps(config: ReturnType<typeof loadConfig>): ProcessDeps {
  return {
    data: new DataStore(),
    store: new SnapshotStore(),
    fetcher: makeFetcher(config),
    extractor: makeExtractor(config),
    config,
  };
}

/** `sources review`: accept / reject / edit / skip proposed sources; accepted ones are processed in the background. */
export async function sourcesReviewCommand(
  contest: string | undefined,
  reviewer: string | undefined,
): Promise<number> {
  const config = loadConfig();
  if (config.model.provider !== 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (or use model.provider: claude-cli).');
    return EXIT.usage;
  }
  try {
    const deps = processDeps(config);
    await sourceReviewLoop({
      reviewer: reviewerOf(reviewer),
      contest,
      data: deps.data,
      config,
      fetcher: deps.fetcher,
      queue: new ProcessQueue(deps),
    });
    return EXIT.ok;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return EXIT.usage;
  }
}

/** `process`: fetch and extract every accepted source that is not yet fetched or extracted. */
export async function processCommand(contest: string | undefined, o: Out): Promise<number> {
  const config = loadConfig();
  if (config.model.provider !== 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (or use model.provider: claude-cli).');
    return EXIT.usage;
  }
  const done = await processOutstanding(processDeps(config), contest ? [contest] : undefined);
  const human = done.length
    ? done
        .map(
          (r) =>
            `${r.extracted ? 'ok    ' : r.fetched ? 'fetched' : 'FAILED '} ${r.contest_id}  ${r.url}${r.last_error ? `  (${r.last_error})` : ''}`,
        )
        .join('\n')
    : 'nothing outstanding';
  print(o, human, done);
  return done.some((r) => !r.fetched || !r.extracted) ? EXIT.retrieval : EXIT.ok;
}

/** `sources coverage`: proposals per candidate and class group, with gaps flagged (never gated). */
export function sourcesCoverageCommand(contestId: string, o: Out): number {
  const data = new DataStore();
  try {
    const c = computeCoverage(
      data.loadContest(contestId),
      data.loadProposals(contestId),
      loadConfig(),
    );
    print(o, formatCoverage(c), c);
    return EXIT.ok;
  } catch {
    console.error(`contest not found: ${contestId}`);
    return EXIT.usage;
  }
}

export async function extractCommand(
  contestId: string,
  entityId: string | undefined,
  o: Out,
): Promise<number> {
  const config = loadConfig();
  const useCli = config.model.provider === 'claude-cli';
  if (!useCli && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY is not set (or set model.provider: claude-cli in site.config.yaml to use your Claude Code login).',
    );
    return EXIT.usage;
  }
  const data = new DataStore();
  const extractor = makeExtractor(config);
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

/**
 * Builds the static site from data/ with no network access. Contests that are not ready (including any
 * with a stale snapshot) render "Not yet reviewed"; the reasons are printed as warnings (FR-036).
 */
export function buildCommand(o: Out): number {
  const config = loadConfig();
  const status = collectStatus(new DataStore(), new SnapshotStore(), config);
  const blocked = status.contests.filter((c) => !c.ready);
  const warnings = blocked.flatMap((c) => c.reasons.map((r) => `${c.contest_id}: ${r}`));
  if (!o.json) {
    console.log(
      `${status.contests.length - blocked.length} of ${status.contests.length} contests ready to publish`,
    );
    for (const w of warnings.filter((x) => /stale/.test(x))) console.warn(`WARNING ${w}`);
  }
  try {
    execFileSync(
      process.execPath,
      ['node_modules/astro/bin/astro.mjs', 'build', '--root', 'site'],
      {
        stdio: o.json ? 'pipe' : 'inherit',
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      },
    );
  } catch {
    console.error('Site build failed.');
    return EXIT.usage;
  }
  if (o.json)
    console.log(
      JSON.stringify({
        ready: status.contests.length - blocked.length,
        total: status.contests.length,
        warnings,
      }),
    );
  return EXIT.ok;
}

/** Exit 0 unless a PRESENT snapshot does not contain its quote; absent snapshots are only listed. */
export function verifyCommand(o: Out): number {
  const r = verifySite(new DataStore(), new SnapshotStore());
  const human = [
    `${r.checked} quote(s) verified, ${r.mismatches.length} mismatch(es), ${r.unverifiable.length} unverifiable here`,
    ...r.mismatches.map(
      (m) => `  MISMATCH ${m.contest_id} ${m.entity_id}/${m.field_key}  ${m.source_url}`,
    ),
    ...r.unverifiable.map(
      (m) => `  unverifiable here: ${m.contest_id} ${m.entity_id}/${m.field_key}  ${m.source_url}`,
    ),
  ].join('\n');
  print(o, human, r);
  return r.mismatches.length ? EXIT.validation : EXIT.ok;
}
