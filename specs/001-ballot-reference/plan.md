# Implementation Plan: Ballot Reference (Sourced Voter Reference)

**Branch**: `001-ballot-reference` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ballot-reference/spec.md`

## Summary

A file-based, resumable pipeline (ingest ballot → resolve contests → source registry → fetch + snapshot → extract → validate → review → build) that produces a static, unlisted, tracker-free site of quote-backed fields for the Powell J ballot, and later other Ohio ballots by configuration only. A language model is used solely for schema-constrained extraction from one stored source at a time. The quote gate (literal substring in a stored snapshot), the symmetry report, and a human review gate are hard stops, enforced in code and tests. Ballot ingestion reads the county board's official ballot (a watermarked 3-column PDF) by positioned-text parsing, with manual import as fallback. Delivery order follows the spec: thin U.S. Senate slice first, then widen coverage.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 (ESM, strict mode)

**Primary Dependencies**: Zod (schemas and validation), `pdfjs-dist` (positioned PDF text for ballot parsing), `yaml`, `commander` (CLI), Anthropic SDK behind a thin `LlmExtractor` adapter, Playwright (optional fetch fallback, dev-installed only when needed), Astro (static site generator, zero client JS by default)

**Storage**: Files in git. YAML for hand-edited config (ballots, contests, sources); JSON for fields, snapshot metadata, and reports; append-only JSONL for the review and drop logs. Snapshot bodies live in two directories: `data/snapshots/public/` (committed; government and public-record sources only) and `data/snapshots/private/` (gitignored; candidate sites and other third-party pages)

**Testing**: Vitest (unit, contract, integration with recorded fixtures); GitHub Actions CI; no network in tests

**Target Platform**: Maintainer's macOS/Node workstation for the pipeline and review; output is static files deployable to Cloudflare Pages (or any static host)

**Project Type**: CLI pipeline plus static site generator, single repository, single package

**Performance Goals**: Site build under 30 seconds for one ballot; each page loads with no JavaScript required; pipeline throughput is not a concern (tens of sources per contest)

**Constraints**: Build offline with zero network calls; no third-party requests from the site; robots.txt honored and rate-limited fetching; quote and review gates cannot be bypassed by flags; the public repo contains no third-party page copies (FR-018b); re-verification is best-effort where snapshots are absent (FR-018c)

**Scale/Scope**: One ballot now (17 contests, 5 issues, roughly 45 named candidates), tens of additional ballots at most; a few hundred approved fields

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | How the plan satisfies it | Status |
|---|---|---|
| I. Extract, don't generate | Extractor output schema contains only quote-backed values; no free-text description field exists; levy and issue text comes from the ballot parser | Pass |
| II. Provenance on every claim | `Field` requires url, retrieved_at, source_hash, quote, tier; unquoted fields cannot be constructed (Zod); drops are logged | Pass |
| III. Symmetry | One schema per contest type applied to all candidates; per-contest symmetry report is a publish gate | Pass |
| IV. Tiers | `tier` is derived from the source registry entry, not chosen by the model; `says` and `done` use separate field keys | Pass |
| V. Fixed whitelist | Fetch and extract refuse any URL not in the contest's source file; discovery is out of scope for v0 | Pass |
| VI. Untrusted content | Extractor call declares no tools, uses native JSON-schema output, one document per call, no cross-candidate context; output re-validated by Zod | Pass |
| VII. Review gate | Build reads only `approved` or `edited` fields; no code path publishes `proposed` | Pass |
| VIII. Empty is acceptable | Missing slots render "Not found in whitelisted sources."; unreviewed contests render "Not yet reviewed" | Pass |
| Validation gates 1–7 | Implemented as pure functions in `src/validate/`, each with negative tests | Pass |
| Offline build, no tracking | Astro build reads `data/` only; CI test asserts no external URLs in built HTML | Pass |
| Open-source snapshot policy | Source registry marks each source `redistributable`; commit hook and CI check block private snapshots from the public tree | Pass |

No violations; the Complexity Tracking table is not needed. Re-check after Phase 1: still Pass (see data-model.md and contracts/).

## Project Structure

### Documentation (this feature)

```text
specs/001-ballot-reference/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── data-files.md
│   ├── extractor.md
│   └── site.md
├── reference/            # Powell J sample ballot + fixture notes
├── checklists/
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
data/
├── ballots/<county>-<precinct>.yaml
├── contests/<contest-id>.yaml
├── sources/<contest-id>.yaml
├── snapshots/
│   ├── public/            # committed: <sha256>.txt + <sha256>.json (government sources)
│   └── private/           # gitignored: third-party pages
├── fields/<contest-id>/<entity-id>.json
├── logs/                  # review.jsonl, drops.jsonl, extraction-runs.jsonl
└── reports/               # status, symmetry, ballot-diff (generated)
src/
├── schemas/               # Zod schemas per contest type + shared types
├── ingest/                # ballot fetch (direct, Playwright, manual), PDF parser, diff
├── sources/               # registry loading, whitelist matching, tiers
├── fetch/                 # robots-aware fetcher, retry/backoff, snapshot store, manual import
├── extract/               # LlmExtractor adapter, prompt loader, run logging
├── validate/              # quote, length, whitelist, schema, entity, staleness, symmetry
├── review/                # CLI review loop, publish-readiness checks
├── report/                # status, symmetry, unverifiable-here reports
├── verify/                # best-effort whole-site quote re-verification
└── cli.ts
prompts/                   # versioned extraction prompts (e.g. candidate.v1.md)
site/                      # Astro project: pages, layouts, print CSS, methodology
fixtures/
├── powell-j/              # ballot PDF + expected parsed output
└── synthetic/             # lopsided contest, injection page, namesake page
tests/
├── unit/
├── contract/
└── integration/
site.config.yaml           # repo URL, stale limit, quote word cap, symmetry threshold, key-vote N, model pin
```

**Structure Decision**: Single TypeScript package with the Astro site under `site/`. The pipeline and site share Zod schemas and read the same `data/` tree, so one package avoids workspace overhead for a one-maintainer, 30-day project.

## Complexity Tracking

Not applicable; no constitution violations.
