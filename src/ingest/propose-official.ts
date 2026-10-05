import { stringify } from 'yaml';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { SiteConfig } from '../config.ts';
import { DataStore, contestFileStem } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { LOGS, appendLog } from '../log.ts';
import type { Ballot } from '../schemas/contest.ts';
import type { Field } from '../schemas/field.ts';
import type { Source } from '../schemas/source.ts';
import { runGates } from '../validate/run-gates.ts';
import { ballotUrl } from './fetch-ballot.ts';
import { officialFieldsFor } from './official-fields.ts';

export const ISSUE_ENTITY = 'issue';
const PARSER = { kind: 'parser' as const, name: 'official-ballot-text', version: '1' };

/**
 * For each issue/levy on the ballot: registers the official ballot as an `official` source and proposes
 * deterministic fields from the printed text. They are `proposed` like any other field and still need
 * human approval. Idempotent: replaces earlier proposals from the same snapshot, never touches reviewed ones.
 */
export function proposeOfficialFields(opts: {
  ballot: Ballot;
  ballotFile: string;
  snapshotHash: string;
  data: DataStore;
  store: SnapshotStore;
  config: SiteConfig;
  now?: Date;
}): { proposed: number; dropped: number } {
  const { ballot, data, store, config } = opts;
  const url = ballotUrl(ballot);
  const meta = store.getMeta(opts.snapshotHash);
  const text = store.getText(opts.snapshotHash);
  if (!meta || text === null) throw new Error('Ballot snapshot is not available locally');
  const at = (opts.now ?? new Date()).toISOString();
  let proposed = 0;
  let dropped = 0;

  for (const id of ballot.contests) {
    const contest = data.loadContest(id);
    if (contest.kind !== 'levy' && contest.kind !== 'constitutional-issue') continue;

    const sources = data.loadSources(id);
    if (!sources.some((s) => s.url === url)) {
      const entry: Source = {
        url,
        domain_class: 'ohio-boe',
        tier: 'official',
        redistributable: true,
        whitelisted_by: `ballot-config:${opts.ballotFile}`,
        whitelisted_at: at,
        notes: 'Official sample ballot supplied as the ballot configuration',
      };
      sources.push(entry);
      mkdirSync(`${data.root}/sources`, { recursive: true });
      writeFileSync(`${data.root}/sources/${contestFileStem(id)}.yaml`, stringify(sources));
    }

    const file = data.loadFields(id, ISSUE_ENTITY);
    file.fields = file.fields.filter(
      (f) =>
        !(
          f.status === 'proposed' &&
          f.source_hash === meta.sha256 &&
          f.extractor.kind === 'parser'
        ),
    );
    const taken = new Set(file.fields.map((f) => `${f.field_key}#${f.slot ?? ''}`));

    for (const raw of officialFieldsFor(contest, config.quote_max_words)) {
      const r = runGates(raw, {
        contest,
        entityId: ISSUE_ENTITY,
        ballotName: contest.title,
        sources,
        snapshot: { sha256: meta.sha256, url, text, retrieved_at: meta.retrieved_at },
        config,
        extractor: PARSER,
        skipEntity: true,
      });
      if (!r.ok) {
        dropped++;
        appendLog(LOGS.drops, {
          contest_id: id,
          entity_id: ISSUE_ENTITY,
          field_key: raw.field_key,
          reason: r.reason,
          detail: r.detail,
        });
        continue;
      }
      const key = `${r.field.field_key}#${r.field.slot ?? ''}`;
      if (taken.has(key)) continue;
      taken.add(key);
      file.fields.push(r.field as Field);
      proposed++;
    }
    if (file.fields.length) data.saveFields(id, ISSUE_ENTITY, file);
  }
  return { proposed, dropped };
}
