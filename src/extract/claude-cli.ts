import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { SiteConfig } from '../config.ts';
import { buildRequest } from './anthropic.ts';
import {
  responseSchema,
  type ExtractInput,
  type ExtractOutput,
  type LlmExtractor,
} from './extractor.ts';

export type CliRunner = (args: string[], stdin: string, cwd: string) => Promise<string>;

const run: (bin: string) => CliRunner = (bin) => (args, stdin, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`claude exited ${code}: ${err.trim() || out.slice(0, 300)}`)),
    );
    child.stdin.end(stdin);
  });

const CliResult = z.object({
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).passthrough(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Extraction through the Claude Code CLI using the user's own login (no API key). Isolation: tools
 * disabled, no MCP servers, no settings or slash commands, no session saved, and an empty temporary
 * working directory so no CLAUDE.md can be discovered. The prompt and delimited document go in on stdin;
 * output is constrained by --json-schema and re-validated here.
 */
export class ClaudeCliExtractor implements LlmExtractor {
  readonly provider = 'claude-cli';
  readonly model: string;

  constructor(
    private readonly config: SiteConfig,
    private readonly loadPrompt: (input: ExtractInput) => string,
    private readonly runner: CliRunner = run(config.model.cli_path ?? 'claude'),
  ) {
    this.model = config.model.id;
  }

  async extract(input: ExtractInput): Promise<ExtractOutput> {
    const req = buildRequest(input, this.loadPrompt(input), this.config.model);
    // The CLI's validator does not know the draft 2020-12 meta-schema Zod declares; drop the key.
    const schemaBody = { ...(req.output_config?.format?.schema ?? {}) } as Record<string, unknown>;
    delete schemaBody.$schema;
    const schema = JSON.stringify(schemaBody);
    const args = [
      '-p',
      '--model',
      this.model,
      '--tools',
      '',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--system-prompt',
      String(req.system),
      '--output-format',
      'json',
      '--json-schema',
      schema,
    ];
    const cwd = mkdtempSync(join(tmpdir(), 'ballot-ref-cli-'));
    try {
      const stdout = await this.runner(
        args,
        String((req.messages[0] as { content: string }).content),
        cwd,
      );
      const res = CliResult.parse(JSON.parse(stdout));
      if (res.is_error) throw new Error(`claude reported an error: ${res.result ?? 'unknown'}`);
      // Re-validate: the model is untrusted even when schema-constrained.
      const parsed = responseSchema(input.fieldKeys).parse(
        res.structured_output ?? JSON.parse(res.result ?? 'null'),
      );
      return {
        subject_name: parsed.subject_name,
        fields: parsed.fields.map((f) => ({ ...f })),
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
}
