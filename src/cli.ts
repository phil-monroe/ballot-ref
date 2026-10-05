#!/usr/bin/env -S npx tsx
import { Command } from 'commander';

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

stub('ingest', '<ballot-config>', 'Fetch and parse the official ballot');
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
