import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import { latestSnapshotFor } from '../fetch/run-fetch.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { LOGS, appendLog } from '../log.ts';
import type { Field } from '../schemas/field.ts';
import { FIELD_KEYS, REQUIRED_TIER } from '../schemas/field-keys.ts';
import type { Drop } from '../schemas/report.ts';
import type { Source } from '../schemas/source.ts';
import { fetchable } from '../sources/registry.ts';
import { runGates } from '../validate/run-gates.ts';
import type { LlmExtractor } from './extractor.ts';
import { promptFamily } from './prompts.ts';
import { ISSUE_ENTITY } from '../ingest/propose-official.ts';

/** Keys the ballot parser or the registry supplies; the model is never asked for them. */
const NOT_FROM_MODEL = new Set([
  'ballot_name',
  'party_label',
  'campaign_website',
  'official_text_link',
  // Parsed deterministically from the official ballot text (FR-022): never model-extracted.
  'taxing_entity',
  'levy_type',
  'millage',
  'duration',
  'purpose',
  'auditor_estimated_cost_per_100k',
  'auditor_estimated_annual_collection',
  'ballot_language',
  'official_explanation',
  'effect_yes',
  'effect_no',
]);

/** Keys a model may return from a source of this tier. Never lets a source supply a key of another tier. */
export function offeredKeys(kind: keyof typeof FIELD_KEYS, tier: Source['tier']): string[] {
  return FIELD_KEYS[kind].filter((k) => {
    if (NOT_FROM_MODEL.has(k)) return false;
    const need = REQUIRED_TIER[k];
    return need ? need === tier : true;
  });
}

export interface ExtractSummary {
  calls: number;
  proposed: number;
  drops: Drop[];
  errors: string[];
  skipped: string[];
}

/**
 * One call per (entity, source snapshot): one document, one target, no other candidate's data. Every
 * returned field goes through the gates; failures are dropped and logged, never repaired. Reviewed
 * fields are never overwritten, and re-runs replace only prior `proposed` fields from the same
 * snapshot, so the stage is idempotent.
 */
export async function runExtract(opts: {
  contestId: string;
  entityId?: string;
  data: DataStore;
  store: SnapshotStore;
  extractor: LlmExtractor;
  config: SiteConfig;
  now?: () => Date;
  logs?: { drops: string; extractionRuns: string };
}): Promise<ExtractSummary> {
  const { data, store, extractor, config } = opts;
  const now = opts.now ?? (() => new Date());
  const contest = data.loadContest(opts.contestId);
  const sources = data.loadSources(opts.contestId);
  const summary: ExtractSummary = { calls: 0, proposed: 0, drops: [], errors: [], skipped: [] };
  const family = promptFamily(contest.kind);
  const promptVersion = config.prompt_versions[family];
  if (!promptVersion) throw new Error(`No prompt version configured for "${family}"`);

  const isIssue = contest.kind === 'levy' || contest.kind === 'constitutional-issue';
  const entities: { id: string; ballot_name: string; role?: string }[] = isIssue
    ? [{ id: ISSUE_ENTITY, ballot_name: contest.title }]
    : contest.candidates.filter((c) => !c.write_in && (!opts.entityId || c.id === opts.entityId));
  const logs = opts.logs ?? { drops: LOGS.drops, extractionRuns: LOGS.extractionRuns };

  for (const entity of entities) {
    const file = data.loadFields(contest.id, entity.id);
    for (const source of fetchable(sources)) {
      if (source.entity_id !== undefined && source.entity_id !== entity.id) continue;
      const meta = latestSnapshotFor(source.url, store);
      const text = meta ? store.getText(meta.sha256) : null;
      if (!meta || text === null) {
        summary.skipped.push(`${entity.id}: no local snapshot for ${source.url}`);
        continue;
      }
      if (meta.sha256 === contest.ballot_snapshot_hash) {
        summary.skipped.push(
          `${entity.id}: ${source.url} is the official ballot, parsed deterministically`,
        );
        continue;
      }
      const keys = offeredKeys(contest.kind, source.tier);
      if (keys.length === 0) {
        summary.skipped.push(
          `${entity.id}: ${source.url} (${source.tier}) offers no extractable keys`,
        );
        continue;
      }

      summary.calls++;
      const base = {
        contest_id: contest.id,
        entity_id: entity.id,
        source_url: source.url,
        source_hash: meta.sha256,
      };
      let out;
      try {
        out = await extractor.extract({
          entity: {
            id: entity.id,
            ballot_name: entity.ballot_name,
            ...(entity.role ? { role: entity.role } : {}),
          },
          contestKind: contest.kind,
          fieldKeys: keys,
          slots: { priority: config.priorities_per_candidate, key_vote: config.key_vote_count },
          prompt_version: promptVersion,
          snapshot: { sha256: meta.sha256, url: meta.url, text },
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        summary.errors.push(`${entity.id} ${source.url}: ${error}`);
        appendLog(logs.extractionRuns, {
          ...base,
          model: extractor.model,
          prompt_version: promptVersion,
          error,
        });
        continue;
      }

      const accepted: Field[] = [];
      const drops: Drop[] = [];
      for (const raw of out.fields) {
        const r = runGates(raw, {
          contest,
          entityId: entity.id,
          ballotName: entity.ballot_name,
          sources,
          snapshot: { sha256: meta.sha256, url: meta.url, text, retrieved_at: meta.retrieved_at },
          config,
          extractor: { kind: 'model', model: extractor.model, prompt_version: promptVersion },
          subjectName: out.subject_name,
        });
        if (r.ok) accepted.push(r.field);
        else {
          drops.push({
            at: now().toISOString(),
            contest_id: contest.id,
            entity_id: entity.id,
            field_key: raw.field_key,
            reason: r.reason,
            ...(r.detail ? { detail: r.detail } : {}),
          });
        }
      }

      // Idempotence: drop earlier proposals from this snapshot; never touch reviewed fields.
      file.fields = file.fields.filter(
        (f) => !(f.status === 'proposed' && f.source_hash === meta.sha256),
      );
      const taken = new Set(file.fields.map((f) => `${f.field_key}#${f.slot ?? ''}`));
      for (const f of accepted) {
        const key = `${f.field_key}#${f.slot ?? ''}`;
        if (taken.has(key)) continue; // slot already held by a reviewed field or another source's proposal
        taken.add(key);
        file.fields.push(f);
        summary.proposed++;
      }
      data.saveFields(contest.id, entity.id, file);
      for (const d of drops) appendLog(logs.drops, d as unknown as Record<string, unknown>);
      summary.drops.push(...drops);
      appendLog(logs.extractionRuns, {
        ...base,
        model: extractor.model,
        prompt_version: promptVersion,
        usage: out.usage,
        returned: out.fields.length,
        accepted: accepted.length,
        dropped: drops.length,
      });
    }
  }

  const path = `${data.root}/reports/drops.json`;
  const prev: Drop[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  mkdirSync(`${data.root}/reports`, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      [...prev.filter((d) => d.contest_id !== contest.id), ...summary.drops],
      null,
      2,
    ) + '\n',
  );
  return summary;
}
