import { execFileSync } from 'node:child_process';
import { findTrackedPrivateSnapshots } from '../src/verify/tracked-snapshots.ts';

// Index state (`git ls-files`) covers both CI checkouts and pre-commit use.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const bad = findTrackedPrivateSnapshots(tracked);
if (bad.length) {
  console.error(
    'Third-party snapshot bodies must not be committed to the public repository (FR-018b):',
  );
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.log('ok: no private snapshot bodies are tracked');
