# Contract: Model extractor

Interface (provider-neutral):

```
extract(input: {
  entity: { id, ballot_name, role? },
  schema_version, prompt_version,
  snapshot: { sha256, url, text }
}): Promise<{
  subject_name: string | null,        // name the model found the text to be about
  fields: Array<{ field_key, slot?, value, quote, author? }>,   // unsupported fields are omitted
  usage: { input_tokens, output_tokens },
}>
```

Rules enforced by the caller, not the model:
- One snapshot and one entity per call; no data about other candidates is in the context.
- No tools declared; response constrained by a JSON schema derived from the Zod response schema (`output_config.format`); no temperature is sent (unsupported by current models).
- Page text is passed inside a delimited data block; the prompt states it is untrusted data.
- Every returned field is run through the gates: quote substring of `snapshot.text` (whitespace-normalized), word cap, source whitelist, schema, entity match on `subject_name`. Failures are dropped and logged to `drops.jsonl`; nothing is repaired.
- The model omits any field not explicitly supported by the text.
- Each run appends to `extraction-runs.jsonl`: model id, prompt version, token usage, field counts, drops, errors.

Swapping providers means implementing this interface only; stored data and gates are unchanged.
