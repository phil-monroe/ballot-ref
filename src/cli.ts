#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { loadConfig } from './config.ts';
import { NeedsManualImport } from './ingest/fetch-ballot.ts';
import { runIngest } from './ingest/run-ingest.ts';

export const EXIT = { ok: 0, validation: 1, usage: 2, retrieval: 3 } as const;

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
stub('fetch', '<contest-id>', 'Fetch whitelisted sources into snapshots');
stub('import', '<source-url> <file>', 'Manually import a source');
stub('extract', '<contest-id>', 'Run schema-constrained extraction');
stub('validate', '<contest-id>', 'Run all gates and the symmetry report');
stub('status', '', 'Readiness, stale snapshots, failures');
stub('verify', '', 'Best-effort whole-site quote re-verification');
stub('build', '', 'Build the static site from data/');

const sources = program.command('sources').description('Source registry commands');
sources
  .command('check <contest-id>')
  .description('Validate the registry for a contest')
  .action(() => {
    console.error('sources check: not implemented yet');
    process.exitCode = EXIT.usage;
  });

const review = program.command('review').description('Review workflow');
review
  .command('next')
  .option('--contest <id>')
  .description('Review the next proposed field')
  .action(() => {
    console.error('review next: not implemented yet');
    process.exitCode = EXIT.usage;
  });
review
  .command('symmetry <contest-id>')
  .description('Show and acknowledge the symmetry report')
  .action(() => {
    console.error('review symmetry: not implemented yet');
    process.exitCode = EXIT.usage;
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  await program.parseAsync(process.argv);
}

export { program };
