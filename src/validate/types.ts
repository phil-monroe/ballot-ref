import type { SiteConfig } from '../config.ts';
import type { Contest } from '../schemas/contest.ts';
import type { Field } from '../schemas/field.ts';
import type { DropReason } from '../schemas/report.ts';
import type { Source } from '../schemas/source.ts';

export type GateResult = { ok: true } | { ok: false; reason: DropReason; detail?: string };

/** A field as proposed by an extractor, before any gate has run. */
export interface RawField {
  field_key: string;
  slot?: number | null;
  value: unknown;
  quote: string;
  author?: string | null;
}

export interface SnapshotInfo {
  sha256: string;
  url: string;
  text: string;
  retrieved_at: string;
}

export interface GateContext {
  contest: Contest;
  entityId: string;
  /** Name as printed on the ballot, used for the entity-resolution gate. */
  ballotName: string;
  /** Source registry entries for this contest. */
  sources: Source[];
  snapshot: SnapshotInfo;
  config: SiteConfig;
  extractor: Field['extractor'];
  /** Name the model found the text to be about (model extractions only). */
  subjectName?: string | null;
  /** Re-validation of stored fields has no model subject name; skip only the entity gate. */
  skipEntity?: boolean;
}
