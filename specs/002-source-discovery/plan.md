# Implementation Plan: Source Discovery Queue

**Branch**: `002-source-discovery` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-source-discovery/spec.md`

## Summary

Add a discovery stage in front of the existing pipeline. A browsing-enabled but otherwise locked-down
Claude Code run researches one contest at a time and returns structured source proposals. Proposals are
validated by deterministic code (reachability, redirect, lookalike checks), deduplicated, and stored as
committed YAML. A terminal review loop, modeled on `review next`, lets the maintainer accept, reject,
edit-then-accept, or skip each one. Accept writes a normal registry entry and then fetches and extracts that
source in the background using the existing `runFetch` and `runExtract`, unchanged in their gates. A
`process` command retries everything accepted but not yet fetched or extracted. Nothing proposed reaches
extraction, fields, or the site without a human accept (Constitution V, VII).

## Technical Context

**Language/Version**: TypeScript on Node.js 24+ (existing; run with `tsx`)

**Primary Dependencies**: Existing only: `commander`, `yaml`, `zod`, `vitest`. Discovery drives the Claude
Code CLI with web tools, the same spawn pattern as `src/extract/claude-cli.ts`. No new packages.

**Storage**: Files, committed. `data/discovery/proposals/<contest-stem>.yaml` (queue), run and decision logs
as JSONL under `data/logs/`. Registry stays `data/sources/<contest-stem>.yaml`.

**Testing**: `vitest` (unit, contract, integration), with an injected CLI runner and fetch stub as in
`tests/contract/claude-cli.test.ts`. The suite runs with no network (`tests/helpers/no-network.cjs`).

**Target Platform**: Maintainer's machine (macOS terminal), logged-in Claude Code. Site build is untouched.

**Project Type**: CLI plus data files (existing single project)

**Performance Goals**: Whole-ballot discovery (22 contests) completes unattended in one command. Review loop
shows each next proposal in under 2 seconds with excerpt fetch prefetched for the next item.

**Constraints**: Discovery agent may only read the web; no Bash/Read/Write/Edit, no MCP, no settings, empty
working directory, no repo data in its prompt beyond ballot names (FR-011a). Fetching honors robots.txt and
the rate limit (FR-016). The site build stays offline and never reads the queue.

**Scale/Scope**: 22 contests, roughly 50 candidates and 5 issues on the Powell J ballot; tens of proposals per
candidate (no cap, FR-013a).

**Unknowns resolved in research.md**: CLI web-tool flags (spike done, R1), identity labeling, validity
checks, background processing, link-only class value.

## Constitution Check (v1.1.0)

| Principle / gate | Status | How the plan satisfies it |
|---|---|---|
| I. Extract, don't generate | Pass | Discovery output is URLs, class, tier, and a "why proposed" note, validated by schema; no prose about candidates (FR-010, note length capped and checked for evaluative wording by prompt and review). |
| II. Provenance | Pass | Unchanged: quotes still come only from stored snapshots of accepted sources. Review excerpt is never stored or quotable (FR-004a). |
| III. Symmetric by construction | Pass | Same search task template per candidate in a contest; coverage report (FR-008); no accept-time gating (FR-008a); existing symmetry report unchanged. |
| IV. Say and done tiers | Pass | Proposed tier is a suggestion; reviewer sets it. Ballotpedia and Vote411 forced to `context`, never fetched (FR-012). |
| V. Fixed whitelist (amended) | Pass | Browsing is confined to discovery, which writes only to the queue. The accept step is the only path to the registry. |
| VI. Untrusted content | Pass | Agent output schema-constrained and re-validated; page text can't accept/reject/reorder; excerpts sanitized before terminal display. |
| VII. Human review gate | Pass | Accept is human; extracted fields still need `review next`. |
| VIII. Empty is acceptable | Pass | "No sources found" is an explicit result. |
| Gate 3 (`source_url` matches registry) | Pass | Accept appends to the registry; existing gate untouched. |
| Fetch honors robots and rate limit | Pass | Validity checks and excerpt fetch reuse `Fetcher`. Agent-side browsing is outside our control; see risk R4. |
| Private snapshot policy | Pass | Auto-fetch uses the existing store; `redistributable` set by class (government true, else false). |
| Model provider and prompt version pinned and logged | Pass | Discovery runs log model, prompt version `discovery.v1`, and tool set. |

Re-check after design: no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-source-discovery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── discovery-agent.md
│   └── data-files.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── discovery/
│   ├── agent.ts          # DiscoveryAgent interface + ClaudeCliDiscoveryAgent (web tools only)
│   ├── prompt.ts         # loads prompts/discovery.v1.md; builds per-contest task (names only)
│   ├── run-discovery.ts  # per contest: agent -> validate -> dedupe -> write queue; run log
│   ├── validity.ts       # reachable / redirect / lookalike / link-only checks
│   ├── queue.ts          # load/save proposals; dedupe key; ordering (FR-013a)
│   ├── review.ts         # accept/reject/edit actions (pure, testable)
│   ├── review-cli.ts     # interactive loop; background process chain
│   ├── process.ts        # fetch+extract accepted sources; `process` retry command
│   └── coverage.ts       # per-candidate x class coverage + flags (FR-008, FR-017)
├── schemas/
│   └── proposal.ts       # Proposal, DiscoveryRun, Decision schemas (zod)
├── data.ts               # + loadProposals/saveProposals/saveSources
├── cli.ts, commands.ts   # + discover, sources review, sources coverage, process
└── report/status.ts      # + pending/accepted/rejected counts, failed processing
prompts/
└── discovery.v1.md
data/
├── discovery/proposals/  # committed
└── logs/discovery-runs.jsonl, source-decisions.jsonl   # committed
tests/
├── contract/discovery-agent.test.ts
├── unit/discovery-*.test.ts
└── integration/discovery-flow.test.ts
```

**Structure Decision**: Extend the existing single TypeScript project. Discovery gets its own `src/discovery/`
module so existing extract, fetch, and validate code changes only at two seams (a source filter on
`runFetch`/`runExtract`, and `DataStore` additions).

## Complexity Tracking

No constitution violations to justify.
