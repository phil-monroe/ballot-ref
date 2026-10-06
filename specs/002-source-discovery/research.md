# Research: Source Discovery Queue

## R1. How does discovery browse?

**Decision**: Spawn the Claude Code CLI (`claude -p`) with only `WebSearch` and `WebFetch` enabled, no MCP
servers, no settings, no slash commands, no session persistence, an empty temp working directory, and a
JSON-schema-constrained final answer. Mirrors `ClaudeCliExtractor`, so it uses the maintainer's existing login.

**Rationale**: Reuses a proven isolation recipe; no new accounts or API billing; satisfies amended Principle V.

**Alternatives**: (a) Anthropic API with the server-side web search tool: viable fallback if CLI tool flags
don't allow web-only tools. (b) Program-run search with Claude only ranking: rejected in clarification (user
chose free browsing).

**Spike result (2026-10-06, claude 2.1.291 at `/Users/phil/.local/bin/claude`, set `model.cli_path`)**:
CONFIRMED. `-p --tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch" --strict-mcp-config
--mcp-config '{"mcpServers":{}}' --setting-sources "" --disable-slash-commands --no-session-persistence
--output-format json --json-schema <schema>` from an empty temp cwd runs headless with no permission
prompts (`permission_denials: []`) and returns `structured_output` matching the schema. A trivial query
(find a candidate's FEC page) made 3 turns, one web search, and cost about $0.04 list price, and returned
real, correct FEC URLs. Notes for implementation: (1) the CLI's WebSearch runs through a smaller helper
model, so `modelUsage` lists more than one model; log all of it. (2) Use `--max-budget-usd` as a
per-contest safety cap (configurable, default about $1) so an unbounded search cannot run away.
(3) Task 1 shrinks to turning this into the contract test; the API fallback stays documented but unneeded.

## R2. Structured output and untrusted content

**Decision**: Agent returns `{ contest_id, results: [{ entity_id|null, url, class_guess, tier_guess, reason,
site_shows_name_and_office }] , searched: [...] }`. Zod re-validates; unknown fields rejected; `reason`
capped at 160 chars and rejected if it contains evaluative wording (small deny-list, plus prompt rule). URLs
must parse as http(s). The agent never receives or returns anything that can write files.

## R3. Candidate-site identity label (FR-007a)

**Decision**: The agent reports a boolean `site_shows_name_and_office` per candidate-site result. Code
re-checks it deterministically against the fetched page text (candidate ballot name and office/district
keywords present) and downgrades to "possible match, not confirmed" if the check fails. The agent's claim is
never trusted alone. Label is advisory; FR-007 confirmation remains mandatory.

## R4. Validity checks (FR-013)

**Decision**: For each proposed URL, using the existing `Fetcher` (robots, rate limit, user agent): resolve
redirects, record final URL; flag `unreachable`, `redirects-off-domain` (final registrable domain differs
from proposed), `lookalike` (edit distance ≤2 from a known government/official domain, or from the
candidate's name tokens plus common TLD swaps), `parked` (known parking-page phrases, tiny body). Problems
are shown at review, never silently dropped. Pages that robots.txt blocks are kept but marked `unchecked`.
**Residual risk**: the agent's own browsing (WebFetch) is not governed by our robots handling; documented in
the methodology and accepted since pages are only read, never stored, from that path.

## R5. Link-only and unfit sources (FR-012, FR-012a)

**Decision**: Hostnames for Ballotpedia, Vote411 are forced to `tier: context` in code regardless of the
agent's guess. Because `domain_class` is a closed enum, add one new value, `other`, used only for sources
that fit no existing class; `other` is only valid with `tier: context` (schema refinement), so it can never
be fetched or extracted. This is the sole schema change to existing files, additive and backward compatible.

## R6. Accept triggers fetch and extract in the background (FR-005a/b)

**Decision**: On accept, write the registry entry, then push a job onto an in-process serial promise chain
that runs `runFetch` and `runExtract` limited to that source (new optional `onlyUrl` filter on both). Serial
because the fetcher rate-limits per host and extraction uses one CLI call at a time. The loop does not await
the chain between proposals; on quit it awaits outstanding jobs and prints their summary. Failures are written
to `reports/status.json` (existing) and a new `data/reports/processing.json` listing accepted sources with
no snapshot or no extraction run, which `process` consumes. `process [--contest id|--all]` fetches and
extracts everything outstanding with the same code.

**Alternatives**: Awaiting inline (blocks review, rejected by spec); detached daemon (extra moving part).

## R7. Queue storage and dedupe (FR-006, FR-014, FR-015a)

**Decision**: One YAML file per contest. Identity = hash of `contest_id | entity_id-or-* | normalized URL`
(lowercased host, no fragment, trailing slash and tracking parameters stripped). A discovery run adds only
URLs not already in the queue (any status) and not matched by `matchSource` against the registry. Decisions
append to `data/logs/source-decisions.jsonl`; runs to `data/logs/discovery-runs.jsonl`.

## R8. Review ordering and excerpt (FR-013a, FR-004a)

**Decision**: Order by tier-group (official records, candidate-owned sites, other), then candidate ballot
order, then URL. Excerpt = `<title>` plus first 300 characters of extracted text via existing `htmlToText`,
fetched when the item is about to be shown (prefetch the next item), control and escape characters stripped
before printing, never written to disk.

## R9. Coverage report (FR-008, FR-009, FR-017)

**Decision**: Computed on demand from the queue (not stored): rows per candidate, columns per class group,
counts of pending/accepted/rejected, flags for zero proposals and for gaps where another candidate has at
least `symmetry_threshold` more proposals (reusing the existing config value). Shown before review starts
and by `sources coverage`.

## R10. Skip semantics

**Decision**: Skip is session-scoped, as in `review next`; skipped proposals remain `pending` on disk.
