import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const SiteConfig = z.strictObject({
  repo_url: z.string().url(),
  quote_max_words: z.number().int().positive(),
  stale_days: z.number().int().positive(),
  symmetry_threshold: z.number().int().nonnegative(),
  priorities_per_candidate: z.number().int().positive(),
  key_vote_count: z.number().int().positive(),
  model: z.strictObject({
    provider: z.string(),
    id: z.string(),
    /** Omit for models that reject non-default temperatures (claude-sonnet-5-5 does). */
    temperature: z.number().min(0).max(1).optional(),
    /** provider "claude-cli" only: path to the Claude Code binary (default: `claude` on PATH). */
    cli_path: z.string().optional(),
  }),
  prompt_versions: z.record(z.string(), z.string()),
  rate_limit_seconds: z.number().positive(),
  user_agent: z.string().min(1),
  /** Absolute site URL, if deployed; used in pre-filled error reports. Optional. */
  site_url: z.string().url().optional(),
  /** Footer links; defaults are the national and Ohio Secretary of State landing pages. */
  links: z
    .strictObject({
      vote411: z.string().url().default('https://www.vote411.org/'),
      sos_elections: z.string().url().default('https://www.ohiosos.gov/elections/'),
    })
    .default({
      vote411: 'https://www.vote411.org/',
      sos_elections: 'https://www.ohiosos.gov/elections/',
    }),
});
export type SiteConfig = z.infer<typeof SiteConfig>;

export function loadConfig(path = 'site.config.yaml'): SiteConfig {
  return SiteConfig.parse(parse(readFileSync(path, 'utf8')));
}
