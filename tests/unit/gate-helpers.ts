import { loadConfig } from '../../src/config.ts';
import type { Contest } from '../../src/schemas/contest.ts';
import type { Source } from '../../src/schemas/source.ts';
import type { GateContext } from '../../src/validate/types.ts';

export const contest: Contest = {
  id: '2026-11-03:test:oh:unspecified',
  kind: 'candidate',
  title: 'Test',
  jurisdiction: 'oh',
  term: null,
  vote_for: 1,
  candidates: [
    {
      id: 'jon-husted',
      ballot_name: 'Jon Husted',
      party_label: 'Republican',
      order: 0,
      write_in: false,
      incumbent: null,
      ticket_id: null,
    },
  ],
  issue_options: [],
  ballot_snapshot_hash: '0'.repeat(64),
  ballot_page: 1,
};

export const sources: Source[] = [
  {
    url: 'https://husted.example/issues',
    domain_class: 'candidate-site',
    tier: 'says',
    entity_id: 'jon-husted',
    redistributable: false,
    whitelisted_by: 'tester',
    whitelisted_at: '2026-10-01T00:00:00Z',
    notes: '',
  },
  {
    url: 'https://www.fec.gov/data/candidate/',
    domain_class: 'fec',
    tier: 'done',
    redistributable: true,
    whitelisted_by: 'tester',
    whitelisted_at: '2026-10-01T00:00:00Z',
    notes: '',
  },
  {
    url: 'https://ballotpedia.org/Jon_Husted',
    domain_class: 'sponsor-site',
    tier: 'context',
    redistributable: false,
    whitelisted_by: 'tester',
    whitelisted_at: '2026-10-01T00:00:00Z',
    notes: 'link only',
  },
];

export function ctxFor(over: {
  text?: string;
  url?: string;
  subjectName?: string | null;
  extractor?: GateContext['extractor'];
  entityId?: string;
}): GateContext {
  return {
    contest,
    entityId: over.entityId ?? 'jon-husted',
    ballotName: 'Jon Husted',
    sources,
    snapshot: {
      sha256: 'b'.repeat(64),
      url: over.url ?? 'https://husted.example/issues',
      text: over.text ?? '',
      retrieved_at: '2026-10-02T00:00:00Z',
    },
    config: loadConfig(),
    extractor: over.extractor ?? { kind: 'manual' },
    subjectName: over.subjectName,
  };
}
