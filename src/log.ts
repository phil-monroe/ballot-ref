import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Append-only JSONL: one JSON object per line, with a timestamp. */
export function appendLog(path: string, entry: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

export const LOGS = {
  review: 'data/logs/review.jsonl',
  drops: 'data/logs/drops.jsonl',
  extractionRuns: 'data/logs/extraction-runs.jsonl',
} as const;
