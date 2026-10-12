import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

// Loose typing on purpose: the research file is the source of truth and its shape may change.
// Path resolves from the repo root, where the npm scripts run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const guide: any = parse(readFileSync(resolve(process.cwd(), 'site/src/data/guide.yaml'), 'utf8'));

export const list = (v: unknown): string[] => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

export const VERIFICATION: Record<string, string> = {
  unverified: 'Unverified',
  campaign_claim: 'Campaign claim',
  calculation: 'Our calculation',
};
