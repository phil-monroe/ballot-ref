# Phase 0 Research: Ballot Reference

All items below were open or "deferred to plan" in the spec. No NEEDS CLARIFICATION remain.

## 1. Ballot parsing approach

- **Finding**: The official ballot URL returns a 2-page, 3-column PDF with a "Sample" watermark. Plain `pdftotext -layout` interleaves columns and watermark letters; `-raw` yields column order but scrambles names within a joint ticket (e.g., "David Pepper" before "Amy Acton and"). Positioned text (`-bbox-layout`) cleanly separates the watermark as its own block.
- **Decision**: Parse with `pdfjs-dist` in Node using per-item coordinates: drop watermark items by identity (rotation/size/text "Sample"), assign items to columns by x-range, then group contests by the "For ..." / issue-title anchors and order candidates by y.
- **Rationale**: No system dependency; geometry preserves printed order, which the spec requires to match exactly. Output is checked against `fixtures/powell-j/expected.json` (17 contests, 5 issues).
- **Alternatives**: `pdftotext` shell-out (not portable, loses order); LLM parsing (forbidden by Principle I for ballot wording); HTML ballot viewer (not what the direct URL returns; ballotlist is JS-driven).

## 2. Fetching strategy

- **Decision**: Direct HTTP fetch with retry and exponential backoff; Playwright fallback only for sources that fail or need JS; manual import (text/PDF) last. robots.txt checked per host, 1 request per host per 2 seconds, user agent identifying the project and the repo URL.
- **Rationale**: Matches the spec's order and ToS stance; Playwright kept optional to keep CI light.

## 3. Snapshot storage under the open-source policy

- **Decision**: Each source in the registry has `redistributable: true|false`. Snapshots of redistributable sources go to `data/snapshots/public/` (committed); the rest to `data/snapshots/private/` (gitignored, backed up privately). A snapshot's metadata JSON (url, retrieved_at, sha256, content-type, class) is always committed; only the body differs. CI fails if a non-redistributable body appears in the tracked tree.
- **Rationale**: Implements FR-018b/c. Missing private bodies yield "unverifiable here" in reports, not failures. Extraction, validation and review always run where the body exists, so the quote gate is never relaxed.

## 4. Quote normalization

- **Decision**: Normalize only whitespace (collapse runs including NBSP and line breaks to one space, trim) on both quote and snapshot text. No case folding, no quote-mark or dash folding, no Unicode compatibility mapping.
- **Rationale**: "Literal substring" must stay strict; folding punctuation would let altered quotes pass.

## 5. LLM extraction

- **Decision**: Anthropic API behind an `LlmExtractor` interface; model pinned in `site.config.yaml` (initial: `claude-sonnet-5-5`), temperature not sent (the API rejects any value other than 1.0 for this model, so "temperature 0" is unavailable; determinism is not a safety property here because the quote, schema, whitelist, and entity gates and human review check every output; `model.temperature` in config is honored if a future model accepts it), no tools declared, native JSON-schema structured output, one snapshot and one candidate per call; Zod re-validates the response. Prompt files are versioned (`prompts/candidate.v1.md`); each field stores `{model, prompt_version}`.
- **Rationale**: Satisfies Principle VI and FR-010/011/048. Native structured output is not tool use, so the call remains tool-free.
- **Alternatives**: Forced tool-calling for structure (rejected: contradicts "no tools"); regex/rule extractors only (kept for official sources where text is rigid, e.g., levy millage and auditor estimates parse directly from ballot text with no model).

## 6. Official-source fields without a model

- **Decision**: Issue text, levy type, millage, duration, and auditor estimate are parsed deterministically from the ballot parser's output and stored as `official` fields with the ballot snapshot as source and the printed sentence as quote (subject to the 25-word cap, longer passages are linked). Model extraction is used only for candidate website and finance/record pages.
- **Rationale**: Principle I and FR-022; also removes model risk from the highest-stakes text.

## 7. Entity resolution

- **Decision**: The extractor must return the subject name it found; the check requires it to match the target candidate's ballot name after normalization (case, punctuation, middle initials) and to appear in the snapshot text. For FEC and similar sources the registry stores the candidate's official ID, which must appear in the URL or snapshot.
- **Rationale**: Guards against namesakes (FR-007) without a model judgment.

## 8. Key-vote rule (N)

- **Decision**: Default rule: final-passage roll-call votes on the N most recent bills, N = 10, configurable in `site.config.yaml` and printed on the methodology page; same bill set for everyone with a record.
- **Rationale**: Resolves the outstanding N from clarification; small enough to review.

## 9. Symmetry computation

- **Decision**: Per contest, count filled field slots per named candidate (write-ins excluded; joint-ticket persons counted individually). Flag when any count is 0 or `max - min > threshold` (default 2). Acknowledgment recorded in the review log with reviewer and timestamp, invalidated if any field in the contest changes.

## 10. Site generation and hosting

- **Decision**: Astro static output; no client JS, print stylesheet, `<meta name="robots" content="noindex">`, Cloudflare `_headers` with `X-Robots-Tag: noindex`, and `robots.txt` disallow. Error reports link to `https://github.com/<repo>/issues/new` with a pre-filled title/body via query string (repo URL from config).
- **Alternatives**: Eleventy (equally valid; Astro chosen for typed data loading shared with Zod schemas).

## 11. Staleness and change handling

- **Decision**: Snapshot age checked at build time against the configurable limit (default 7 days); `refetch` compares hashes, and on change marks affected contests `needs_rereview` while approved fields keep pointing to their original snapshot hash (FR-018a).

## 12. Review tool

- **Decision**: Interactive CLI (`review next`) rendering the quote highlighted in a context window of the snapshot, with approve/reject/edit. Edits re-run validation. A local web UI is deferred (optional M8).
