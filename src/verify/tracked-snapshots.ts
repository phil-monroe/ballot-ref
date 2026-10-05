import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SnapshotMeta } from '../schemas/snapshot.ts';

/**
 * Open-source snapshot policy (FR-018b): third-party snapshot bodies must never be tracked in git.
 * `tracked` is a list of repo-relative paths (e.g. from `git ls-files`).
 */
export function findTrackedPrivateSnapshots(
  tracked: string[],
  snapshotsRoot = 'data/snapshots',
): string[] {
  const bad = new Set<string>();
  const privateDir = `${snapshotsRoot}/private/`;
  for (const p of tracked)
    if (p.startsWith(privateDir) && !p.endsWith('/.gitkeep') && p !== `${privateDir}.gitkeep`)
      bad.add(p);

  const metaDir = `${snapshotsRoot}/meta`;
  if (existsSync(metaDir)) {
    const nonRedistributable = new Set(
      readdirSync(metaDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => SnapshotMeta.parse(JSON.parse(readFileSync(`${metaDir}/${f}`, 'utf8'))))
        .filter((m) => !m.redistributable)
        .flatMap((m) => [m.body_path, m.text_path].map((x) => `${snapshotsRoot}/${x}`)),
    );
    for (const p of tracked) if (nonRedistributable.has(p)) bad.add(p);
  }
  return [...bad].sort();
}
