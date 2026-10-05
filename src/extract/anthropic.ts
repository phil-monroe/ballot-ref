import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { SiteConfig } from '../config.ts';
import {
  responseSchema,
  type ExtractInput,
  type ExtractOutput,
  type LlmExtractor,
} from './extractor.ts';

export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * Builds the request. No tools, no tool_choice, one document, nothing about other candidates. Output is
 * constrained to a JSON schema (native structured output, not tool use). The document sits inside a
 * delimiter with a per-call random id so page text cannot close the block early.
 */
export function buildRequest(
  input: ExtractInput,
  prompt: string,
  model: SiteConfig['model'],
): Anthropic.MessageCreateParamsNonStreaming {
  const id = randomBytes(8).toString('hex');
  const slotNote = Object.entries(input.slots)
    .filter(([k]) => input.fieldKeys.includes(k))
    .map(([k, n]) => `${k}: at most ${n} slots`)
    .join('; ');
  const user = [
    `Target person: ${input.entity.ballot_name}${input.entity.role ? ` (${input.entity.role})` : ''}`,
    `Offered field keys: ${input.fieldKeys.join(', ')}`,
    slotNote ? `Slots: ${slotNote}` : '',
    `Source URL: ${input.snapshot.url}`,
    `<untrusted_document id="${id}">`,
    input.snapshot.text,
    `</untrusted_document id="${id}">`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    model: model.id,
    max_tokens: 4096,
    system: prompt,
    messages: [{ role: 'user', content: user }],
    output_config: {
      format: { type: 'json_schema', schema: z.toJSONSchema(responseSchema(input.fieldKeys)) },
    },
    ...(model.temperature !== undefined ? { temperature: model.temperature } : {}),
  };
}

export class AnthropicExtractor implements LlmExtractor {
  readonly provider = 'anthropic';
  readonly model: string;

  constructor(
    private readonly config: SiteConfig,
    private readonly loadPrompt: (input: ExtractInput) => string,
    private readonly client: MessagesClient = new Anthropic() as unknown as MessagesClient,
  ) {
    this.model = config.model.id;
  }

  async extract(input: ExtractInput): Promise<ExtractOutput> {
    const res = await this.client.messages.create(
      buildRequest(input, this.loadPrompt(input), this.config.model),
    );
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    // Re-validate: the model is untrusted even when schema-constrained.
    const parsed = responseSchema(input.fieldKeys).parse(JSON.parse(text));
    return {
      subject_name: parsed.subject_name,
      fields: parsed.fields.map((f) => ({ ...f })),
      usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
    };
  }
}
