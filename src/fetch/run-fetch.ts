import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DataStore } from '../data.ts';
import { fetchable } from '../sources/registry.ts';
import type { SnapshotMeta } from '../schemas/snapshot.ts';
import type { StatusEntry } from '../schemas/report.ts';
import { SnapshotMeta as SnapshotMetaSchema } from '../schemas/snapshot.ts';
import { Fetcher } from './fetcher.ts';
import { htmlToText } from './html-text.ts';
import { extractItems } from '../ingest/pdf-items.ts';
import { layoutLines, snapshotText } from '../ingest/layout.ts';
import type { SnapshotStore } from './snapshot-store.ts';

export function latestSnapshotFor(url: string, store: SnapshotStore): SnapshotMeta | null {
  const dir = `${store.root}/meta`;
  if (!existsSync(dir)) return null;
  const all = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => SnapshotMetaSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))))
    .filter((m) => m.url === url);
  return all.sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at))[0] ?? null;
}

async function textOf(body: Buffer, contentType: string): Promise<string> {
  if (/pdf/i.test(contentType)) return snapshotText(layoutLines(await extractItems(body)));
  if (/html/i.test(contentType)) return htmlToText(body.toString('utf8'));
  return body.toString('utf8');
}

export interface FetchSummary {
  entries: StatusEntry[];
  /** Fields flagged needs_rereview because their source changed. */
  flagged: number;
  needsManual: boolean;
}

/**
 * Fetches a contest's whitelisted sources into snapshots. Without `refetch`, a source that already has
 * a snapshot is not requested again (FR-015). With `refetch`, a changed source gets a NEW snapshot and
 * fields tied to the old one are flagged `needs_rereview` while still pointing at the old snapshot (FR-018a).
 */
export async function runFetch(opts: {
  contestId: string;
  refetch?: boolean;
  data: DataStore;
  store: SnapshotStore;
  fetcher: Fetcher;
  now?: () => Date;
}): Promise<FetchSummary> {
  const now = opts.now ?? (() => new Date());
  const entries: StatusEntry[] = [];
  let flagged = 0;

  for (const source of fetchable(opts.data.loadSources(opts.contestId))) {
    const prior = latestSnapshotFor(source.url, opts.store);
    if (prior && !opts.refetch) {
      entries.push({
        url: source.url,
        outcome: 'ok',
        at: now().toISOString(),
        error: 'already stored; not re-requested',
      });
      continue;
    }
    const res = await opts.fetcher.fetchUrl(source.url);
    if (!res.ok) {
      entries.push({
        url: source.url,
        outcome: res.reason === 'blocked' || res.reason === 'robots' ? 'blocked' : 'failed',
        at: now().toISOString(),
        error: `${res.reason}: ${res.error}`,
      });
      continue;
    }
    const meta = opts.store.put({
      url: source.url,
      body: res.body,
      contentType: res.contentType,
      text: await textOf(res.body, res.contentType),
      method: res.method,
      redistributable: source.redistributable,
      retrievedAt: now().toISOString(),
    });
    entries.push({
      url: source.url,
      outcome: res.retried ? 'retried' : 'ok',
      at: now().toISOString(),
    });

    if (prior && prior.sha256 !== meta.sha256) {
      for (const entity of opts.data.listEntities(opts.contestId)) {
        const file = opts.data.loadFields(opts.contestId, entity);
        let changed = false;
        for (const f of file.fields) {
          if (
            f.source_hash === prior.sha256 &&
            (f.status === 'approved' || f.status === 'edited') &&
            !f.needs_rereview
          ) {
            f.needs_rereview = true;
            changed = true;
            flagged++;
          }
        }
        if (changed) opts.data.saveFields(opts.contestId, entity, file);
      }
    }
  }

  const path = `${opts.data.root}/reports/status.json`;
  const previous: StatusEntry[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  const merged = [...previous.filter((p) => !entries.some((e) => e.url === p.url)), ...entries];
  mkdirSync(`${opts.data.root}/reports`, { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n');

  return {
    entries,
    flagged,
    needsManual: entries.some((e) => e.outcome === 'failed' || e.outcome === 'blocked'),
  };
}
