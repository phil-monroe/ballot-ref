# Data Model: Source Discovery Queue

## Proposal (one element of `data/discovery/proposals/<contest-stem>.yaml`)

| Field | Type | Notes |
|---|---|---|
| id | string | First 16 hex of sha256 of `contest_id\|entity_id-or-*\|normalized_url` |
| contest_id | string | Existing contest id |
| entity_id | string \| null | Candidate id, or null for contest/issue-level |
| url | string | As proposed |
| final_url | string \| null | After redirects, if checked |
| proposed_class | DomainClass \| `other` | Agent's guess; reviewer may change |
| proposed_tier | Tier | Agent's guess; forced to `context` for link-only hosts |
| reason | string (≤160) | Why proposed: what the source is and covers; no evaluation |
| identity_label | `identity-matched` \| `possible-match` \| null | Candidate-site proposals only (FR-007a) |
| validity | `{ status, note }` | status: `ok`, `unreachable`, `redirects-off-domain`, `lookalike`, `parked`, `unchecked` |
| run_id | string | Discovery run that first found it |
| found_at | datetime | |
| status | `pending` \| `accepted` \| `rejected` | Skip is session-only (R10) |
| decided_by | string \| null | Reviewer id |
| decided_at | datetime \| null | |
| decision_reason | string \| null | Rejects only; neutral and factual; published (FR-015a) |
| accepted_as | `{ domain_class, tier, redistributable }` \| null | What was written to the registry |
| ownership_confirmed | boolean \| null | Required true to accept a candidate-site (FR-007) |

Transitions: `pending -> accepted | rejected`. Decided proposals are immutable except a later explicit
`sources review --reopen` (out of scope for v1).

Constraints: `proposed_class: other` requires `proposed_tier: context` until the reviewer changes it to an
existing class on accept. Unique on `id`.

## DiscoveryRun (`data/logs/discovery-runs.jsonl`, one line per run)

`run_id`, `contest_id`, `started_at`, `finished_at`, `model`, `prompt_version`, `tools` (list), `searched`
(queries or topics reported), `returned`, `added`, `skipped_duplicate`, `invalid`, `error` (nullable).

## Decision (`data/logs/source-decisions.jsonl`)

`at`, `proposal_id`, `contest_id`, `entity_id`, `url`, `action` (accept/reject), `reviewer`, `reason`,
`accepted_as`.

## ProcessingRecord (`data/reports/processing.json`)

Per accepted source: `contest_id`, `url`, `fetched` (bool), `extracted` (bool), `last_error`, `updated_at`.
Used by `process` and the status view (FR-005b, FR-017).

## Changes to existing entities

- `DomainClass` gains `other` (valid only with `tier: context`).
- `DataStore` gains `loadProposals`, `saveProposals`, `saveSources` (append, schema-validated).
- `runFetch` and `runExtract` gain an optional `onlyUrl` filter; default behavior unchanged.

## Coverage (computed, not stored)

Per contest: for each candidate, counts by class group and status; flags `zero-proposals`, `lopsided`.
