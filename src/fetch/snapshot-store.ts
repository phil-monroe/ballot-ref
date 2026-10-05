import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SnapshotMeta } from '../schemas/snapshot.ts';

export interface StoreInput {
  url: string;
  body: Buffer | string;
  contentType: string;
  /** Plain text used for quote verification. */
  text: string;
  method: 'direct' | 'playwright' | 'manual';
  redistributable: boolean;
  retrievedAt?: string;
}

const EXT: Record<string, string> = {
  'text/html': 'html',
  'application/pdf': 'pdf',
};

export class SnapshotStore {
  constructor(readonly root = 'data/snapshots') {}

  metaPath(sha: string): string {
    return join(this.root, 'meta', `${sha}.json`);
  }

  /** Immutable: identical content is not re-stored; changed content yields a new hash. */
  put(input: StoreInput): SnapshotMeta {
    const bodyBuf = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    const sha256 = createHash('sha256').update(bodyBuf).digest('hex');
    if (existsSync(this.metaPath(sha256))) return this.getMeta(sha256)!;

    const dir = input.redistributable ? 'public' : 'private';
    const ext = EXT[input.contentType.split(';')[0]!.trim()] ?? 'txt';
    const bodyRel = join(dir, `${sha256}.${ext}`);
    const textRel = join(dir, `${sha256}.txt`);
    mkdirSync(join(this.root, dir), { recursive: true });
    mkdirSync(join(this.root, 'meta'), { recursive: true });
    writeFileSync(join(this.root, bodyRel), bodyBuf);
    if (ext !== 'txt') writeFileSync(join(this.root, textRel), input.text);

    const meta = SnapshotMeta.parse({
      sha256,
      url: input.url,
      retrieved_at: input.retrievedAt ?? new Date().toISOString(),
      content_type: input.contentType,
      method: input.method,
      redistributable: input.redistributable,
      body_path: bodyRel,
      text_path: textRel,
    });
    writeFileSync(this.metaPath(sha256), JSON.stringify(meta, null, 2) + '\n');
    return meta;
  }

  getMeta(sha: string): SnapshotMeta | null {
    const p = this.metaPath(sha);
    return existsSync(p) ? SnapshotMeta.parse(JSON.parse(readFileSync(p, 'utf8'))) : null;
  }

  /** Extracted text, or null when the body is not present in this checkout ("unverifiable here"). */
  getText(sha: string): string | null {
    const meta = this.getMeta(sha);
    if (!meta) return null;
    const p = join(this.root, meta.text_path);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }
}
