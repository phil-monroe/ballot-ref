import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { LOGS, appendLog } from '../log.ts';
import type { Field } from '../schemas/field.ts';
import { validateStoredField } from '../validate/revalidate.ts';

export class ReviewError extends Error {}

export interface FieldRef {
  contestId: string;
  entityId: string;
  fieldKey: string;
  slot: number | null;
}

export type ReviewAction =
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'edit'; value?: string | number; quote?: string };

/**
 * Applies one review decision. Only `proposed` fields, or fields flagged for re-review, can be acted
 * on. Approve and edit re-run the gates against the local snapshot (review requires the local copy);
 * an edit that fails a gate is refused and nothing changes. Every decision is logged with the reviewer.
 */
export function applyReview(
  ref: FieldRef,
  action: ReviewAction,
  ctx: { reviewer: string; data: DataStore; store: SnapshotStore; config: SiteConfig; now?: Date },
): Field {
  const reviewer = ctx.reviewer?.trim();
  if (!reviewer)
    throw new ReviewError('A reviewer id is required (--reviewer or BALLOT_REF_REVIEWER).');
  const now = (ctx.now ?? new Date()).toISOString();

  const file = ctx.data.loadFields(ref.contestId, ref.entityId);
  const idx = file.fields.findIndex(
    (f) => f.field_key === ref.fieldKey && (f.slot ?? null) === ref.slot,
  );
  if (idx < 0)
    throw new ReviewError(
      `No such field: ${ref.entityId}/${ref.fieldKey}${ref.slot ? `#${ref.slot}` : ''}`,
    );
  const before = file.fields[idx]!;
  if (before.status !== 'proposed' && !before.needs_rereview) {
    throw new ReviewError(
      `Field is ${before.status}; only proposed or re-review fields can be reviewed.`,
    );
  }

  let after: Field;
  if (action.kind === 'reject') {
    after = { ...before, status: 'rejected', reviewer, reviewed_at: now, needs_rereview: false };
  } else {
    const edited =
      action.kind === 'edit'
        ? { ...before, value: action.value ?? before.value, quote: action.quote ?? before.quote }
        : before;
    const failure = validateStoredField(edited, ctx.data, ctx.store, ctx.config);
    if (failure) {
      throw new ReviewError(
        `Gate failed (${failure.reason}${failure.detail ? `: ${failure.detail}` : ''}); nothing was changed.`,
      );
    }
    after = {
      ...edited,
      status: action.kind === 'edit' ? 'edited' : 'approved',
      reviewer,
      reviewed_at: now,
      needs_rereview: false,
    };
  }

  file.fields[idx] = after;
  ctx.data.saveFields(ref.contestId, ref.entityId, file);
  appendLog(LOGS.review, {
    action: action.kind,
    reviewer,
    contest_id: ref.contestId,
    entity_id: ref.entityId,
    field_key: ref.fieldKey,
    slot: ref.slot,
    before: { status: before.status, value: before.value, quote: before.quote },
    after: { status: after.status, value: after.value, quote: after.quote },
  });
  return after;
}
