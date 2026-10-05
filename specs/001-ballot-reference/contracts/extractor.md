# Contract: Model extractor

Interface (provider-neutral):

```
extract(input: {
  entity: { id, ballot_name, role? },
  schema_version, prompt_version,
  snapshot: { sha256, url, text }
}): Promise<{
  subject_name: string | null,        // name the model found the text to be about
  fields: Array<{ field_key, slot?, value, quote, author? } | null>,
  usage: { input_tokens, output_tokens },
}>
```

Rules enforced by the caller, not the model:
- One snapshot and one entity per call; no data about other candidates is in the context.
- No tools declared; response constrained by a JSON schema derived from the Zod field schema; temperature 0.
- Page text is passed inside a delimited data block; the prompt states it is untrusted data.
- Every returned field is run through the gates: quote substring of `snapshot.text` (whitespace-normalized), word cap, source whitelist, schema, entity match on `subject_name`. Failures are dropped and logged to `drops.jsonl`; nothing is repaired.
- The model returns `null` for any field not explicitly supported by the text.
- Each run appends to `extraction-runs.jsonl`: model id, prompt version, token usage, field counts, drops, errors.

Swapping providers means implementing this interface only; stored data and gates are unchanged.
