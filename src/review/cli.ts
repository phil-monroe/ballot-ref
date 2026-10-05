import { createInterface } from 'node:readline/promises';
import type { SiteConfig } from '../config.ts';
import { DataStore } from '../data.ts';
import type { SnapshotStore } from '../fetch/snapshot-store.ts';
import { writeSymmetryReport } from '../report/symmetry.ts';
import { ReviewError, applyReview } from './actions.ts';
import { highlightQuote } from './context.ts';
import { nextToReview, queueKey } from './queue.ts';
import { formatSymmetry } from './symmetry.ts';

/**
 * Interactive review loop. Before the first field of each contest in a session, the contest's symmetry
 * report is shown, so a field cannot be approved without the reviewer having seen coverage. Readiness
 * separately requires an explicit acknowledgment (`review symmetry`).
 */
export async function reviewLoop(opts: {
  reviewer: string;
  contest?: string;
  data: DataStore;
  store: SnapshotStore;
  config: SiteConfig;
}): Promise<void> {
  if (!opts.reviewer?.trim())
    throw new ReviewError('A reviewer id is required (--reviewer or BALLOT_REF_REVIEWER).');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const skipped = new Set<string>();
  const shown = new Set<string>();
  try {
    for (;;) {
      const item = nextToReview(opts.data, opts.contest, skipped);
      if (!item) {
        console.log('Nothing left to review.');
        return;
      }
      if (!shown.has(item.contestId)) {
        shown.add(item.contestId);
        console.log(
          '\n' + formatSymmetry(writeSymmetryReport(item.contestId, opts.data, opts.config)) + '\n',
        );
      }
      const f = item.field;
      const text = opts.store.getText(f.source_hash);
      console.log('─'.repeat(72));
      console.log(
        `${item.contestId}  /  ${item.entityId}  /  ${f.field_key}${f.slot ? `#${f.slot}` : ''}  [${f.tier}]${f.needs_rereview ? '  (RE-REVIEW: source changed)' : ''}`,
      );
      console.log(`value:  ${f.value}${f.author ? `   (author: ${f.author})` : ''}`);
      console.log(
        `source: ${f.source_url}  (retrieved ${f.retrieved_at}, ${f.source_hash.slice(0, 12)})`,
      );
      const ctx = text === null ? null : highlightQuote(text, f.quote);
      console.log(
        ctx ??
          `!! quote NOT FOUND in the local snapshot${text === null ? ' (snapshot missing)' : ''}: "${f.quote}"`,
      );
      const ans = (await rl.question('[a]pprove  [r]eject  [e]dit  [s]kip  [q]uit > '))
        .trim()
        .toLowerCase();
      const ref = {
        contestId: item.contestId,
        entityId: item.entityId,
        fieldKey: f.field_key,
        slot: f.slot,
      };
      const ctxArgs = {
        reviewer: opts.reviewer,
        data: opts.data,
        store: opts.store,
        config: opts.config,
      };
      try {
        if (ans === 'q') return;
        if (ans === 's') skipped.add(queueKey(item));
        else if (ans === 'a') applyReview(ref, { kind: 'approve' }, ctxArgs);
        else if (ans === 'r') applyReview(ref, { kind: 'reject' }, ctxArgs);
        else if (ans === 'e') {
          const value = (await rl.question(`new value [${f.value}] > `)).trim();
          const quote = (await rl.question('new quote [keep] > ')).trim();
          applyReview(
            ref,
            { kind: 'edit', ...(value ? { value } : {}), ...(quote ? { quote } : {}) },
            ctxArgs,
          );
        }
      } catch (e) {
        if (!(e instanceof ReviewError)) throw e;
        console.log(`Refused: ${e.message}`);
        skipped.add(queueKey(item));
      }
    }
  } finally {
    rl.close();
  }
}
