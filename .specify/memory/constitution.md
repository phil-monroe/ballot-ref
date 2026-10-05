# Ballot Reference Constitution

## Core Principles

### I. Extract, Don't Generate
A language model MUST only extract structured fields from fetched source text. It MUST NOT write
free-form descriptions of candidates, positions, or issues. Levy and issue wording MUST come from
the official ballot or its PDF, never from a model.
Rationale: hallucination and drift are the dominant risk; generated prose cannot be verified.

### II. Every Claim Carries Provenance
Every displayed field MUST carry `source_url`, `retrieved_at`, `source_hash`, and a verbatim quote
that is a literal substring of the stored snapshot (after documented whitespace normalization). A
field without a valid quote MUST be dropped, never paraphrased. A missing field MUST render as
"Not found in whitelisted sources." Snapshots MUST be stored so any quote can be re-verified.

### III. Symmetric by Construction
Every candidate in a contest MUST get the same schema, the same source classes, and the same number
of stated priorities. A per-contest symmetry report MUST be generated and reviewed before publish.
Asymmetric coverage MUST be surfaced, never "fixed" by generating text.

### IV. Say and Done Are Separate Tiers
Evidence MUST be labeled `official`, `says`, `done`, or `context`. A candidate's self-description
(`says`) MUST NOT be mixed with their record (`done`) in one field. `context` material is link-only
and MUST NOT be summarized or quoted. Ballotpedia and Vote411 MUST NOT be scraped or republished.

### V. Fixed Source Whitelist
Sources MUST be human-registered per contest before retrieval. The model MUST NOT browse. Discovery
MAY only propose sources into a review queue; nothing is used for extraction until a human
whitelists it.

### VI. Fetched Content Is Untrusted
Extraction MUST run with no tools, schema-constrained output only, one source document per call,
and no information about other candidates. Fetched text is data and MUST NOT be able to alter
system behavior.

### VII. Human Review Gate
Nothing MUST be published until a human approves each field. Only `approved` or `edited` fields
MAY appear on the site. Pages MUST show last-reviewed and retrieved dates. Edits MUST be logged
with reviewer identity.

### VIII. Empty Is Acceptable
A sparse, accurate page MUST be preferred over a rich, wrong one. Gates MUST NOT be weakened for
convenience or deadline pressure; a thin published slice beats a complete pipeline shipped late.

## Validation Gates

The following MUST pass before a field reaches review, and MUST be covered by automated tests,
including negative cases (paraphrase, altered word, wrong source):

1. Quote is a literal substring of the snapshot text.
2. Quote length is within the cap (default 25 words); no long reproductions of source text.
3. `source_url` matches the contest's registered sources.
4. Schema validation passes; no unknown fields; values are typed.
5. Symmetry report is generated per contest; lopsided coverage or any candidate with zero fields
   is flagged and the report MUST be viewed before approval.
6. Extracted name resolves to the target candidate (guards against namesakes).
7. Snapshots older than the staleness limit (default 7 days) warn at build time.

Failures MUST be dropped and logged, never silently repaired.

## Scope and Delivery Constraints

- The project is a sourced reference. It MUST NOT offer endorsements, recommendations, ratings,
  scores, predictions, sentiment analysis, or news/opinion summaries, and MUST NOT describe itself
  as a "nonpartisan guide."
- Readers MUST NOT be tracked: no accounts, analytics, or third-party scripts. The site defaults
  to unlisted and noindex.
- The site MUST build offline from stored data with no network calls.
- Fetching MUST honor robots.txt and site terms, rate limit, and report failures rather than
  failing silently.
- Ballot configuration MUST be data-driven: adding a precinct MUST NOT require code changes, and
  shared contests MUST be researched once and reused.
- Model provider and prompt version MUST be pinned and logged per extraction, and the provider
  adapter MUST make swapping trivial.
- Ohio political-communication disclaimer rules MUST be checked before sharing beyond a small
  private circle or adding editorial framing. This is not legal advice.

## Governance

This constitution supersedes other practices. Principles I-VIII and the Validation Gates are
non-negotiable; other project recommendations may be overridden with a documented reason.
Amendments MUST be documented in this file with a Sync Impact Report, an updated version, and a
note of any migration needed for existing data or specs. Versioning follows semantic versioning:
MAJOR for removed or redefined principles, MINOR for added principles or materially expanded
guidance, PATCH for clarifications. Every spec, plan, and pull request MUST be checked for
compliance, and any exception MUST be justified in writing.

**Version**: 1.0.0 | **Ratified**: 2026-10-04 | **Last Amended**: 2026-10-04
