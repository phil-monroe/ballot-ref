import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { extractItems } from '../ingest/pdf-items.ts';
import { layoutLines, snapshotText } from '../ingest/layout.ts';
import type { SnapshotMeta } from '../schemas/snapshot.ts';
import { htmlToText } from './html-text.ts';
import type { SnapshotStore } from './snapshot-store.ts';

/** Manual import of pasted text, HTML, or a PDF as a snapshot (`method: manual`). */
export async function importManual(opts: {
  url: string;
  file: string;
  redistributable: boolean;
  store: SnapshotStore;
}): Promise<SnapshotMeta> {
  const ext = extname(opts.file).toLowerCase();
  const body = readFileSync(opts.file);
  let contentType = 'text/plain';
  let text: string;
  if (ext === '.pdf') {
    contentType = 'application/pdf';
    text = snapshotText(layoutLines(await extractItems(body)));
  } else if (ext === '.html' || ext === '.htm') {
    contentType = 'text/html';
    text = htmlToText(body.toString('utf8'));
  } else {
    text = body.toString('utf8');
  }
  return opts.store.put({
    url: opts.url,
    body,
    contentType,
    text,
    method: 'manual',
    redistributable: opts.redistributable,
  });
}
