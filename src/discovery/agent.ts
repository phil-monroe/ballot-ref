import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { SiteConfig } from '../config.ts';
import { run, type CliRunner } from '../extract/claude-cli.ts';
import { DomainClass, Tier } from '../schemas/shared.ts';
import { taskText, type DiscoveryInput } from './prompt.ts';

/** The only tools a discovery run may use (FR-011a): reading the web. Nothing that writes or runs code. */
export const DISCOVERY_TOOLS = ['WebSearch', 'WebFetch'] as const;

export const DiscoveryResult = z.strictObject({
  entity_id: z.string().min(1).nullable(),
  url: z.url({ protocol: /^https?$/ }),
  class_guess: DomainClass,
  tier_guess: Tier,
  reason: z.string().max(160),
  site_shows_name_and_office: z.boolean().optional(),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResult>;

/** Results are validated one by one so a single bad entry cannot discard the rest. */
export const DiscoveryEnvelope = z.strictObject({
  results: z.array(z.unknown()),
  searched: z.array(z.strictObject({ entity_id: z.string().nullable(), topic: z.string() })),
});

export interface DiscoveryOutput {
  results: unknown[];
  searched: { entity_id: string | null; topic: string }[];
  usage: { input_tokens: number; output_tokens: number; models: string[] };
}

/** Provider-neutral discovery agent; swapping providers means implementing this only. */
export interface DiscoveryAgent {
  readonly provider: string;
  readonly model: string;
  readonly tools: readonly string[];
  discover(input: DiscoveryInput): Promise<DiscoveryOutput>;
}

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results', 'searched'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entity_id', 'url', 'class_guess', 'tier_guess', 'reason'],
        properties: {
          entity_id: { type: ['string', 'null'] },
          url: { type: 'string' },
          class_guess: { type: 'string', enum: DomainClass.options },
          tier_guess: { type: 'string', enum: Tier.options },
          reason: { type: 'string', maxLength: 160 },
          site_shows_name_and_office: { type: 'boolean' },
        },
      },
    },
    searched: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entity_id', 'topic'],
        properties: { entity_id: { type: ['string', 'null'] }, topic: { type: 'string' } },
      },
    },
  },
} as const;

const CliResult = z.object({
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).passthrough(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Discovery through the Claude Code CLI on the user's own login. Isolation mirrors extraction except that
 * web search and page fetch are enabled: no other tools, no MCP servers, no settings or slash commands, no
 * saved session, an empty temp working directory, and a per-run spend cap. Only the schema-constrained
 * JSON answer is consumed, and it is re-validated by the caller.
 */
export class ClaudeCliDiscoveryAgent implements DiscoveryAgent {
  readonly provider = 'claude-cli';
  readonly model: string;
  readonly tools = DISCOVERY_TOOLS;

  constructor(
    private readonly config: SiteConfig,
    private readonly systemPrompt: string,
    private readonly runner: CliRunner = run(config.model.cli_path ?? 'claude'),
  ) {
    this.model = config.model.id;
  }

  async discover(input: DiscoveryInput): Promise<DiscoveryOutput> {
    const tools = this.tools.join(',');
    const args = [
      '-p',
      '--model',
      this.model,
      '--tools',
      tools,
      '--allowedTools',
      tools,
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--max-budget-usd',
      String(this.config.discovery.max_budget_usd),
      '--system-prompt',
      this.systemPrompt,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(JSON_SCHEMA),
    ];
    const cwd = mkdtempSync(join(tmpdir(), 'ballot-ref-disc-'));
    try {
      const stdout = await this.runner(args, taskText(input), cwd);
      const res = CliResult.parse(JSON.parse(stdout));
      if (res.is_error) throw new Error(`claude reported an error: ${res.result ?? 'unknown'}`);
      const parsed = DiscoveryEnvelope.parse(
        res.structured_output ?? JSON.parse(res.result ?? 'null'),
      );
      return {
        results: parsed.results,
        searched: parsed.searched,
        usage: {
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
          models: Object.keys(res.modelUsage ?? {}),
        },
      };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
}
