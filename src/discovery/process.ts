import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import type { DataStore } from '../data.ts';
import { runExtract } from '../extract/run-extract.ts';
import type { LlmExtractor } from '../extract/extractor.ts';
import type { Fetcher } from '../fetch/fetcher.ts';
import { latestSnapshotFor, runFetch } from '../fetch/run-fetch.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { orderedContestIds } from '../review/queue.ts';
import { ProcessingRecord } from '../schemas/proposal.ts';
import { fetchable } from '../sources/registry.ts';

export interface ProcessDeps {
  data: DataStore;
  store: SnapshotStore;
  fetcher: Fetcher;
  extractor: LlmExtractor;
  config: SiteConfig;
  now?: () => Date;
  /** Override extraction log paths (tests). */
  logs?: { drops: string; extractionRuns: string };
}

const processingPath = (data: DataStore) => `${data.root}/reports/processing.json`;

export function loadProcessing(data: DataStore): ProcessingRecord[] {
  const path = processingPath(data);
  if (!existsSync(path)) return [];
  return ProcessingRecord.array().parse(JSON.parse(readFileSync(path, 'utf8')));
}

function saveProcessing(data: DataStore, record: ProcessingRecord): void {
  const all = loadProcessing(data).filter(
    (r) => !(r.contest_id === record.contest_id && r.url === record.url),
  );
  mkdirSync(`${data.root}/reports`, { recursive: true });
  writeFileSync(processingPath(data), JSON.stringify([...all, record], null, 2) + '\n');
}

/**
 * Fetches then extracts one registered source with the existing pipeline, gates unchanged (FR-005a).
 * Link-only sources are never fetched (returns null). Failures are recorded, never thrown.
 */
export async function processSource(
  contestId: string,
  url: string,
  deps: ProcessDeps,
): Promise<ProcessingRecord | null> {
  const source = deps.data.loadSources(contestId).find((s) => s.url === url);
  if (!source || fetchable([source]).length === 0) return null;
  const now = deps.now ?? (() => new Date());
  const rec: ProcessingRecord = {
    contest_id: contestId,
    url,
    fetched: false,
    extracted: false,
    last_error: null,
    updated_at: now().toISOString(),
  };
  try {
    const f = await runFetch({
      contestId,
      onlyUrl: url,
      data: deps.data,
      store: deps.store,
      fetcher: deps.fetcher,
      now,
    });
    const entry = f.entries[0];
    rec.fetched = entry !== undefined && (entry.outcome === 'ok' || entry.outcome === 'retried');
    if (!rec.fetched) {
      rec.last_error = `${entry?.outcome ?? 'failed'}: ${entry?.error ?? 'no result'}`;
    } else {
      const e = await runExtract({
        contestId,
        onlyUrl: url,
        data: deps.data,
        store: deps.store,
        extractor: deps.extractor,
        config: deps.config,
        now,
        ...(deps.logs ? { logs: deps.logs } : {}),
      });
      rec.extracted = e.errors.length === 0;
      if (e.errors.length) rec.last_error = e.errors.join('; ');
    }
  } catch (e) {
    rec.last_error = e instanceof Error ? e.message : String(e);
  }
  rec.updated_at = now().toISOString();
  saveProcessing(deps.data, rec);
  return rec;
}

/** Serial background chain: the fetcher rate-limits per host and extraction runs one call at a time. */
export class ProcessQueue {
  private chain: Promise<void> = Promise.resolve();
  private done: ProcessingRecord[] = [];
  private outstanding = 0;

  constructor(private readonly deps: ProcessDeps) {}

  get pending(): number {
    return this.outstanding;
  }

  enqueue(contestId: string, url: string): void {
    this.outstanding++;
    this.chain = this.chain
      .then(() => processSource(contestId, url, this.deps))
      .then((r) => {
        if (r) this.done.push(r);
      })
      .catch(() => undefined)
      .finally(() => {
        this.outstanding--;
      });
  }

  /** Resolves when every enqueued job has finished; returns their records. */
  async drain(): Promise<ProcessingRecord[]> {
    await this.chain;
    return this.done;
  }
}

/**
 * Registered, fetchable sources that still need work: no snapshot yet, or an earlier attempt that did not
 * finish extraction. A source with a snapshot and no record was handled by the manual pipeline and is
 * left alone.
 */
export function outstandingSources(
  contestId: string,
  deps: Pick<ProcessDeps, 'data' | 'store'>,
): { contest_id: string; url: string }[] {
  const records = loadProcessing(deps.data);
  return fetchable(deps.data.loadSources(contestId))
    .filter((s) => {
      const rec = records.find((r) => r.contest_id === contestId && r.url === s.url);
      if (rec) return !rec.fetched || !rec.extracted;
      return latestSnapshotFor(s.url, deps.store) === null;
    })
    .map((s) => ({ contest_id: contestId, url: s.url }));
}

/** `process`: retry everything outstanding for the given contests (default: every contest). */
export async function processOutstanding(
  deps: ProcessDeps,
  contestIds?: string[],
): Promise<ProcessingRecord[]> {
  const out: ProcessingRecord[] = [];
  for (const id of contestIds ?? orderedContestIds(deps.data)) {
    for (const item of outstandingSources(id, deps)) {
      const r = await processSource(item.contest_id, item.url, deps);
      if (r) out.push(r);
    }
  }
  return out;
}
