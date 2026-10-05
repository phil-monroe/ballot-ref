#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { loadConfig } from './config.ts';
import { NeedsManualImport } from './ingest/fetch-ballot.ts';
import { runIngest } from './ingest/run-ingest.ts';
import {
  EXIT,
  buildCommand,
  extractCommand,
  fetchCommand,
  importCommand,
  reviewNextCommand,
  reviewSymmetryCommand,
  sourcesCheck,
  statusCommand,
  validateCommand,
} from './commands.ts';

export { EXIT };

const out = () => ({ json: Boolean(program.opts().json) });

const program = new Command('ballot-ref')
  .description('Sourced, symmetric reference for Ohio precinct ballots')
  .option('--json', 'machine-readable output')
  .option('--reviewer <id>', 'reviewer id (or BALLOT_REF_REVIEWER)');

const stub = (name: string, args: string, desc: string) =>
  program
    .command(`${name}${args ? ' ' + args : ''}`)
    .description(desc)
    .allowUnknownOption()
    .action(() => {
      console.error(`${name}: not implemented yet`);
      process.exitCode = EXIT.usage;
    });

program
  .command('ingest <ballot-config>')
  .description('Fetch (direct, Playwright, then manual) and parse the official ballot')
  .option('--from <file.pdf>', 'import a ballot PDF manually instead of fetching')
  .action(async (ballotConfig: string, opts: { from?: string }) => {
    try {
      const r = await runIngest({
        ballotFile: ballotConfig,
        from: opts.from,
        userAgent: loadConfig().user_agent,
      });
      const issues = r.contests.filter(
        (c) => c.ballot_page > 1 || c.kind === 'levy' || c.kind === 'constitutional-issue',
      );
      if (program.opts().json) {
        console.log(
          JSON.stringify({ contests: r.contests.length, diff: r.diff, mismatches: r.mismatches }),
        );
      } else {
        console.log(
          `Ingested ${r.contests.length - issues.length} contests and ${issues.length} issues (snapshot ${r.snapshotHash.slice(0, 12)})`,
        );
        console.log(
          `Diff: +${r.diff.added.length} -${r.diff.removed.length} ~${r.diff.changed.length}`,
        );
        for (const id of [
          ...r.diff.added.map((x) => `added ${x}`),
          ...r.diff.removed.map((x) => `removed ${x}`),
          ...r.diff.changed.map((x) => `changed ${x}`),
        ])
          console.log(`  ${id}`);
      }
      if (r.mismatches.length) {
        console.error(`Mismatch against fixture:\n${r.mismatches.join('\n')}`);
        process.exitCode = EXIT.validation;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = e instanceof NeedsManualImport ? EXIT.retrieval : EXIT.usage;
    }
  });
program
  .command('fetch <contest-id>')
  .description('Fetch whitelisted sources into snapshots')
  .option('--refetch', 'refetch stored sources; flag fields whose source changed')
  .action(
    async (id: string, o: { refetch?: boolean }) =>
      void (process.exitCode = await fetchCommand(id, Boolean(o.refetch), out())),
  );
program
  .command('import <source-url> <file>')
  .description('Manually import a whitelisted source (text, HTML, or PDF)')
  .action(
    async (url: string, file: string) =>
      void (process.exitCode = await importCommand(url, file, out())),
  );
program
  .command('extract <contest-id>')
  .option('--entity <id>', 'only this candidate')
  .description('Run schema-constrained extraction (one source, one candidate per call)')
  .action(
    async (id: string, o: { entity?: string }) =>
      void (process.exitCode = await extractCommand(id, o.entity, out())),
  );
program
  .command('validate <contest-id>')
  .description('Run all gates and the symmetry report; never repairs values')
  .action((id: string) => void (process.exitCode = validateCommand(id, out())));
program
  .command('status')
  .option('--contest <id>')
  .description('Readiness, stale snapshots, unverifiable sources, retrieval failures')
  .action((o: { contest?: string }) => void (process.exitCode = statusCommand(o.contest, out())));
stub('verify', '', 'Best-effort whole-site quote re-verification');
program
  .command('build')
  .description('Build the static site from data/ (no network)')
  .action(() => void (process.exitCode = buildCommand(out())));

const sources = program.command('sources').description('Source registry commands');
sources
  .command('check <contest-id>')
  .description('Validate the registry for a contest')
  .action((id: string) => void (process.exitCode = sourcesCheck(id, out())));

const review = program.command('review').description('Review workflow');
review
  .command('next')
  .option('--contest <id>')
  .description('Review the next proposed field (approve / reject / edit)')
  .action(
    async (o: { contest?: string }) =>
      void (process.exitCode = await reviewNextCommand(o.contest, program.opts().reviewer)),
  );
review
  .command('symmetry <contest-id>')
  .option('--ack', 'acknowledge the report as the current reviewer')
  .description('Show and acknowledge the symmetry report')
  .action(
    (id: string, o: { ack?: boolean }) =>
      void (process.exitCode = reviewSymmetryCommand(
        id,
        Boolean(o.ack),
        program.opts().reviewer,
        out(),
      )),
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  await program.parseAsync(process.argv);
}

export { program };
