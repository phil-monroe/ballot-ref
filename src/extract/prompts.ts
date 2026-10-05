import { existsSync, readFileSync } from 'node:fs';
import type { Contest } from '../schemas/contest.ts';

/** Prompt family for a contest kind; each family is versioned in prompts/<family>.<version>.md. */
export function promptFamily(kind: Contest['kind']): 'candidate' | 'judicial' | 'issue' {
  if (kind === 'judicial') return 'judicial';
  if (kind === 'candidate') return 'candidate';
  return 'issue';
}

export function loadPrompt(family: string, version: string, dir = 'prompts'): string {
  const path = `${dir}/${family}.${version}.md`;
  if (!existsSync(path)) throw new Error(`Prompt not found: ${path}`);
  return readFileSync(path, 'utf8');
}
