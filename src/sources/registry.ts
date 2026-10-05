import { existsSync, readdirSync } from 'node:fs';
import { DataStore, contestIdFromStem } from '../data.ts';
import type { Source } from '../schemas/source.ts';
import { matchSource } from '../validate/whitelist.ts';

/** Sources that may be fetched for extraction: `context` entries are link-only (Principle IV). */
export const fetchable = (sources: Source[]): Source[] =>
  sources.filter((s) => s.tier !== 'context');

export interface RegistryProblem {
  contestId: string;
  message: string;
}

/** `sources check`: validates a contest's registry file against the contest's entities. */
export function checkRegistry(contestId: string, data = new DataStore()): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  const add = (message: string) => problems.push({ contestId, message });
  if (!existsSync(data.contestPath(contestId))) {
    add('contest file not found');
    return problems;
  }
  const contest = data.loadContest(contestId);
  let sources: Source[];
  try {
    sources = data.loadSources(contestId);
  } catch (e) {
    add(`registry file is invalid: ${e instanceof Error ? e.message : String(e)}`);
    return problems;
  }
  if (sources.length === 0) add('no sources registered');
  const ids = new Set(contest.candidates.map((c) => c.id));
  const urls = new Set<string>();
  for (const s of sources) {
    if (s.entity_id && !ids.has(s.entity_id))
      add(`${s.url}: entity_id "${s.entity_id}" is not a candidate in this contest`);
    const key = `${s.entity_id ?? ''}|${s.url}`;
    if (urls.has(key)) add(`${s.url}: duplicate entry`);
    urls.add(key);
    try {
      new URL(s.url);
    } catch {
      add(`${s.url}: not a valid URL`);
    }
    if (s.tier === 'context' && s.redistributable)
      add(`${s.url}: context sources are link-only and cannot be redistributable`);
  }
  const named = contest.candidates.filter((c) => !c.write_in);
  if (contest.kind === 'candidate' || contest.kind === 'judicial') {
    for (const c of named) {
      if (
        !sources.some(
          (s) => fetchable([s]).length && (s.entity_id === undefined || s.entity_id === c.id),
        )
      ) {
        add(`${c.id}: no fetchable source registered`);
      }
    }
  }
  return problems;
}

/** Finds the registry entry (in any contest) that whitelists a URL; used by manual import. */
export function findSourceAnywhere(
  url: string,
  data = new DataStore(),
): { contestId: string; source: Source } | null {
  const dir = `${data.root}/sources`;
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const contestId = contestIdFromStem(f.slice(0, -5));
    const source = matchSource(url, data.loadSources(contestId));
    if (source) return { contestId, source };
  }
  return null;
}
