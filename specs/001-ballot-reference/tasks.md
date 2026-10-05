---

description: "Task list for Ballot Reference (Sourced Voter Reference)"
---

# Tasks: Ballot Reference (Sourced Voter Reference)

**Input**: Design documents from `/specs/001-ballot-reference/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (cli.md, data-files.md, extractor.md, site.md), quickstart.md

**Tests**: Included. The spec requires them (FR-037, SC-006: negative quote cases, lopsided symmetry contest; SC-001/009/010 build and ingest checks), and the constitution requires every validation gate to have automated negative tests. No network in tests; use recorded fixtures.

**Organization**: Grouped by user story. Phases are numbered in **implementation order**, which follows the spec's delivery priority (ingest, then the U.S. Senate vertical slice, then review, then the published site), not strictly US number. All repo-relative paths are from the repository root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1..US7 from spec.md
- Constraints from data-model.md are quoted verbatim where they bind the implementation

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization

- [X] T001 Create the directory skeleton from plan.md: `data/{ballots,contests,sources,snapshots/{public,private,meta},fields,logs,reports}`, `src/{schemas,ingest,sources,fetch,extract,validate,review,report,verify}`, `prompts/`, `fixtures/{powell-j,synthetic}`, `tests/{unit,contract,integration}`, each empty dir with a `.gitkeep` (except `data/snapshots/private/`, which is gitignored)
- [X] T002 Initialize `package.json` (ESM, `"type": "module"`, Node 24 engines, bin `ballot-ref` → `src/cli.ts`) and `tsconfig.json` (strict) at repo root; install `zod`, `pdfjs-dist`, `yaml`, `commander`, `@anthropic-ai/sdk`, and dev deps `typescript`, `vitest`, `tsx`, `eslint`, `prettier`
- [X] T003 [P] Configure ESLint and Prettier in `eslint.config.js` and `.prettierrc`; add `lint`, `typecheck`, `test` scripts in `package.json`
- [X] T004 [P] Update `.gitignore`: ignore `data/snapshots/private/`, `node_modules/`, `site/dist/`, `.env`; add `.env.example` documenting `ANTHROPIC_API_KEY` and `BALLOT_REF_REVIEWER`
- [X] T005 [P] Add GitHub Actions workflow `.github/workflows/ci.yml` running lint, typecheck, `vitest run`, and `ballot-ref verify` (best-effort, must not fail on "unverifiable here")
- [X] T006 Create `site.config.yaml` with the keys from contracts/data-files.md: `repo_url` (placeholder TODO value), `quote_max_words: 25`, `stale_days: 7`, `symmetry_threshold: 2`, `priorities_per_candidate: 3`, `key_vote_count: 10`, `model {provider: anthropic, id: claude-sonnet-5-5}`, `prompt_versions`, `rate_limit_seconds: 2`, `user_agent`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schemas, config loading, snapshot store, and validation gates that every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Implement shared Zod types in `src/schemas/shared.ts`: all objects `.strict()` (unknown keys rejected); `Tier = official|says|done|context`; `FieldStatus = proposed|approved|rejected|edited`; `DomainClass = ohio-boe|ohio-sos|fec|congress|ohio-legislature|county-auditor|candidate-site|sponsor-site`
- [X] T008 [P] Implement `Election`, `Contest`, `Ballot` schemas in `src/schemas/contest.ts` per data-model.md: Contest `id` = `<election>:<office>:<jurisdiction/district>:<term>`, `kind` = `candidate | judicial | constitutional-issue | levy`, `vote_for` integer, ordered `options[]`, candidate option `id, ballot_name, party_label (as printed or null), order, write_in, incumbent (bool|null, only if verifiable), ticket_id`, `ballot_text` for issues, `ballot_snapshot_hash`, `ballot_page`; Ticket with `persons[]` role `governor|lieutenant-governor`; Ballot `contests[]` as ordered refs
- [X] T009 [P] Implement `Source` schema in `src/schemas/source.ts`: `url` (or prefix/pattern), `domain_class`, `tier`, `entity_id?`, `redistributable`, `whitelisted_by`, `whitelisted_at`, `notes`; refine: `context` tier sources are link-only and are never fetched for extraction
- [X] T010 [P] Implement `Snapshot` metadata schema in `src/schemas/snapshot.ts`: `sha256, url, retrieved_at, content_type, method (direct|playwright|manual), redistributable, body_path, text_path`
- [X] T011 [P] Implement `Field` schema in `src/schemas/field.ts`: `contest_id, entity_id, field_key, slot (integer or null), value, quote, source_url, source_hash, retrieved_at, tier, status (proposed|approved|rejected|edited), reviewer, reviewed_at, extractor ({kind:"model",model,prompt_version} | {kind:"parser",name,version} | {kind:"manual"}), author (argument-for/against only), needs_rereview`; a Field cannot be constructed without a quote, source_hash, and tier
- [X] T012 [P] Implement per-kind field-key schemas in `src/schemas/field-keys.ts` per data-model.md: candidate (`ballot_name, party_label, campaign_website, priority` slots 1–3 `says`, `office_held/prior_office`, `finance_raised, finance_spent, finance_period_end` `done`), incumbent addendum (`key_vote`), judicial (`ballot_name, current_office, bar_admission` official only, `campaign_website`), constitutional-issue (`ballot_language, official_explanation, argument_for/against` +author, `effect_yes/effect_no`, `current_law`), levy (`taxing_entity, levy_type` enum `renewal|additional|replacement|decrease|renewal-and-increase|renewal-and-decrease|sales-use-tax`, `millage, duration, purpose, auditor_estimated_cost_per_100k, auditor_estimated_annual_collection, sponsor_materials, official_text_link`)
- [X] T013 [P] Implement `Report` schemas in `src/schemas/report.ts`: Symmetry (candidate × slot matrix, counts, flags, `acknowledged_by`, `acknowledged_at`), Status, Drops (reasons `quote-not-substring|quote-too-long|source-not-whitelisted|schema|entity-mismatch`), Unverifiable-here, Ballot diff
- [X] T014 Implement config and data loaders in `src/config.ts` and `src/data.ts`: load `site.config.yaml` and validate; load/validate YAML and JSON under `data/` via the schemas; contest ids stored with `:` as `__` in filenames (contracts/data-files.md); unknown keys are errors
- [X] T015 [P] Implement whitespace-only normalization in `src/validate/normalize.ts`: collapse runs (including NBSP and line breaks) to one space and trim, applied identically to quote and snapshot text; no case folding, no quote/dash folding, no Unicode compatibility mapping
- [X] T016 Implement the snapshot store in `src/fetch/snapshot-store.ts`: write body by `sha256` into `data/snapshots/public/` when `redistributable` else `data/snapshots/private/`, always write metadata JSON to `data/snapshots/meta/<sha256>.json`; snapshots are immutable (a changed source creates a new snapshot); identical content is not re-stored; a body missing locally is reported as unavailable, not as an error
- [X] T017 [P] Implement append-only JSONL logging in `src/log.ts` for `data/logs/review.jsonl`, `drops.jsonl`, `extraction-runs.jsonl` (one JSON object per line with timestamp)
- [X] T018 Implement `src/cli.ts` skeleton with `commander`: register all commands from contracts/cli.md as stubs, `--json` global flag, exit codes 0 ok / 1 validation or verification failure / 2 usage-config error / 3 retrieval failure requiring manual action, reviewer id from `--reviewer` or `BALLOT_REF_REVIEWER`
- [X] T019 [P] Unit tests for normalization and schema strictness in `tests/unit/normalize.test.ts` and `tests/unit/schemas.test.ts` (unknown key rejected, Field without quote rejected, enums enforced)
- [X] T020 [P] Contract test for data file layout and loader in `tests/contract/data-files.test.ts` using a small synthetic tree under `fixtures/synthetic/`

**Checkpoint**: Foundation ready; story work can begin

---

## Phase 3: User Story 2 - Ingest the official ballot (Priority: P1)

**Goal**: Reproduce the Powell J contest and issue list from the official PDF with zero manual edits; manual import and diff supported.

**Independent Test**: `ballot-ref ingest data/ballots/delaware-154-1.yaml --from fixtures/powell-j/ballot.pdf` produces 17 contests and 5 issues matching `fixtures/powell-j/expected.json` exactly (quickstart.md ingest scenario).

### Tests for User Story 2

- [X] T021 [P] [US2] Copy `specs/001-ballot-reference/reference/powell-j-ballot-2026-11-03.pdf` to `fixtures/powell-j/ballot.pdf` and hand-author `fixtures/powell-j/expected.json` from `reference/powell-j-fixture-notes.md` (17 contests and 5 issues in printed order, party labels as printed incl. "Other-party candidate", write-in lines, vote-for-N, terms); verify column order against the rendered PDF
- [X] T022 [P] [US2] Integration test `tests/integration/ingest-powell-j.test.ts`: parsing the fixture PDF equals `expected.json` (SC-001), no manual edits, official order preserved
- [X] T023 [P] [US2] Unit tests `tests/unit/ballot-diff.test.ts` for additions, removals, and edits (withdrawn candidate) in the ballot diff

### Implementation for User Story 2

- [X] T024 [P] [US2] Create `data/ballots/delaware-154-1.yaml` with `county`, `precinct_code`, `precinct_name`, `election`, `ballot_source {county_slug: delaware, election_code: 20261103g_webeix0, precinct_code: 154___1}`; contest refs filled by ingest
- [X] T025 [US2] Implement PDF positioned-text extraction in `src/ingest/pdf-items.ts` using `pdfjs-dist`: return items with x, y, font size, rotation per page
- [X] T026 [US2] Implement watermark removal and column assignment in `src/ingest/layout.ts`: drop "Sample" watermark items by identity (rotation/size/text), assign remaining items to 3 columns by x-range, order within a column by y (depends on T025)
- [X] T027 [US2] Implement contest/issue parsing in `src/ingest/parse-ballot.ts`: group by "For ..." / issue-title anchors; capture office, term, vote-for-N, candidates as printed with party labels, write-in lines, joint Governor/Lt. Governor tickets as one option with two persons, and issue title plus full official text; no LLM involved (FR-022) (depends on T026)
- [X] T028 [US2] Implement canonical contest id generation in `src/ingest/contest-id.ts` (`<election>:<office>:<jurisdiction/district>:<term>`, e.g. `2026-11-03:us-senate:oh:special-2029`) and write `data/contests/*.yaml` and update the ballot file (depends on T027)
- [X] T029 [P] [US2] Implement ballot retrieval in `src/ingest/fetch-ballot.ts`: direct HTTP (county slug, election code, precinct code from config), then Playwright fallback (optional dependency), then manual (`--from file.pdf`; **`--paste` deferred**: geometry-based parsing needs the PDF, so pasted text cannot yet be parsed); store the raw ballot via the snapshot store as `redistributable: true`
- [X] T030 [US2] Implement ballot diff in `src/ingest/diff.ts` against the previous snapshot, writing `data/reports/ballot-diff.json` (FR-024) (depends on T028)
- [X] T031 [US2] Wire the `ingest` command in `src/cli.ts`: exit non-zero if parsed output mismatches `expected` when a fixture is configured; print ballot diff; idempotent re-runs produce no duplicates
- [X] T032 [US2] Run ingest on the Powell J fixture, commit the generated `data/contests/*.yaml`, `data/ballots/delaware-154-1.yaml`, and the public ballot snapshot

**Checkpoint**: Ballot ingest reproduces 17 + 5 with zero manual edits

---

## Phase 4: User Story 3 - Collect sourced facts with every claim verified (Priority: P1)

**Goal**: For the U.S. Senate contest, register sources, fetch and store snapshots, extract fields, enforce every gate, and produce a symmetry report.

**Independent Test**: Quickstart Senate slice: altered, paraphrased, and wrong-source quotes are rejected and logged; a deliberately lopsided synthetic contest fails the symmetry check; prompt-injection page has no effect.

### Tests for User Story 3 (write first; must fail before implementation)

- [X] T033 [P] [US3] Unit tests `tests/unit/gate-quote.test.ts`: exact substring passes; paraphrase, single-word-altered quote, and quote from a different source are each rejected (SC-006); whitespace-only differences pass; punctuation/case differences fail
- [X] T034 [P] [US3] Unit tests `tests/unit/gate-length.test.ts` (25 words passes, 26 fails; cap read from config), `tests/unit/gate-whitelist.test.ts` (domain/path match, non-registered rejected), `tests/unit/gate-entity.test.ts` (namesake rejected; middle-initial and case differences accepted; name must appear in snapshot text), `tests/unit/gate-staleness.test.ts` (7-day default)
- [X] T035 [P] [US3] Unit tests `tests/unit/symmetry.test.ts`: flag when any candidate has zero filled fields or `max - min > threshold`; write-ins excluded; joint-ticket persons counted individually; "Other-party candidate" counted; the lopsided synthetic contest in `fixtures/synthetic/lopsided/` fails (SC-006)
- [X] T036 [P] [US3] Integration test `tests/integration/extract-injection.test.ts`: `fixtures/synthetic/injection-page.html` ("ignore previous instructions") with a stub extractor yields only schema-valid, quote-verified fields; a `fixtures/synthetic/namesake-page.html` yields an entity-mismatch drop
- [X] T037 [P] [US3] Contract test `tests/contract/extractor.test.ts`: the extractor request declares no tools, carries one snapshot and one entity, contains no other candidate's data, and passes page text inside a delimited untrusted-data block (contracts/extractor.md)
- [X] T038 [P] [US3] Unit tests `tests/unit/fetcher.test.ts`: robots.txt disallow honored, rate limit applied, retry with backoff then fallback then recorded failure, maintenance/error pages never stored as content (use recorded HTTP fixtures)

### Implementation for User Story 3

- [X] T039 [P] [US3] Implement source registry loading and whitelist matching in `src/sources/registry.ts`; tier is taken from the registry entry, never from the model; `context` entries are link-only and excluded from fetch/extract (depends on T009, T014)
- [X] T040 [US3] Implement `ballot-ref sources check <contest-id>` in `src/sources/check.ts`: report non-whitelisted or missing entries
- [X] T041 [P] [US3] Implement the robots-aware fetcher in `src/fetch/fetcher.ts`: robots.txt per host, 1 request per host per `rate_limit_seconds`, real `user_agent` including repo URL, retry with exponential backoff, detect and reject maintenance/error pages (depends on T016)
- [X] T042 [P] [US3] Implement the Playwright fallback in `src/fetch/playwright-fallback.ts` (optional import; absent dependency yields a clear "needs manual import" result)
- [X] T043 [P] [US3] Implement manual import in `src/fetch/manual-import.ts` (pasted text or PDF, `method: manual`, PDF text extracted via `pdfjs-dist`)
- [X] T044 [US3] Implement `fetch` and `import` commands in `src/cli.ts` and `src/fetch/run-fetch.ts`: failures go to `data/reports/status.json` (exit code 3 when manual action needed); `--refetch` compares hashes, creates a new snapshot on change, and sets `needs_rereview` on fields tied to the old snapshot while they keep displaying from the original (FR-018a) (depends on T041–T043)
- [X] T045 [P] [US3] Implement the quote gate in `src/validate/quote.ts` (literal substring after T015 normalization) and the word-cap gate in `src/validate/length.ts` (default 25 words from config)
- [X] T046 [P] [US3] Implement `src/validate/whitelist.ts`, `src/validate/schema.ts`, `src/validate/entity.ts`, `src/validate/staleness.ts` per Validation Gates 3, 4, 6, 7; failures return a typed reason and are never repaired
- [X] T047 [US3] Implement the gate pipeline in `src/validate/run-gates.ts`: apply gates in order, write drops to `data/logs/drops.jsonl` and `data/reports/drops.json` with reason codes (depends on T045, T046)
- [X] T048 [P] [US3] Implement symmetry computation in `src/validate/symmetry.ts` and report writer in `src/report/symmetry.ts`: matrix candidate × slot, flag per research.md decision 9, acknowledgment fields empty until review (T060)
- [X] T049 [P] [US3] Write the extraction prompt `prompts/candidate.v1.md`: model receives only the target entity name, the schema, and the document inside a delimited untrusted block; instructs null for anything not explicitly supported by the text; extract-only, no descriptions
- [X] T050 [US3] Implement the `LlmExtractor` interface and the Anthropic adapter in `src/extract/extractor.ts` and `src/extract/anthropic.ts`: temperature 0, no tools declared, native JSON-schema structured output derived from Zod, pinned model from config; verify the SDK's structured-output parameter names against the installed SDK version (depends on T049). **Verified**: `output_config.format = {type:'json_schema', schema}`; `temperature` is deprecated and rejected for models after Opus 4.6 (incl. `claude-sonnet-5-5`), so none is sent (see research.md #5)
- [X] T051 [US3] Implement `extract` orchestration in `src/extract/run-extract.ts`: one snapshot and one entity per call, run every returned field through the gates, write `proposed` fields to `data/fields/<contest-id>/<entity-id>.json` with `extractor {kind:"model", model, prompt_version}`, append token usage, field counts, drops, and errors to `data/logs/extraction-runs.jsonl`; idempotent (no duplicates on re-run)
- [X] T052 [US3] Wire `extract` and `validate` commands in `src/cli.ts`: `validate` runs all gates plus the symmetry report, exit code 1 if any gate failed, never mutates values
- [ ] T053 [US3] Seed `data/sources/2026-11-03__us-senate__oh__special-2029.yaml` with human-registered sources (official ballot, FEC candidate pages, senate.gov/congress.gov records for incumbents, candidate sites only after the maintainer confirms them), each with `redistributable` set correctly and `whitelisted_by`
- [ ] T054 [US3] Run the Senate slice: `fetch`, `extract`, `validate` for the U.S. Senate contest; review `data/reports/drops.json` and the symmetry report (quickstart.md Senate scenario)

**Checkpoint**: Senate fields exist as `proposed`; all gates tested including negative cases

---

## Phase 5: User Story 4 - Review and approve every field (Priority: P1)

**Goal**: A CLI review loop where nothing reaches the build unless `approved|edited`, and a contest is ready only under the readiness rules.

**Independent Test**: With mixed proposed fields, step through review; verify unreviewed fields, an unacknowledged symmetry report, stale snapshots, and `needs_rereview` each block readiness; edits are logged with reviewer id and re-validated.

### Tests for User Story 4

- [X] T055 [P] [US4] Unit tests `tests/unit/readiness.test.ts`: contest is ready iff all fields reviewed, symmetry acknowledged and not invalidated by later field changes, no stale snapshots, no `needs_rereview`; each failing condition blocks with a reason
- [X] T056 [P] [US4] Unit tests `tests/unit/review-actions.test.ts`: approve/reject/edit transitions (`proposed → approved | rejected | edited`); an edit that fails a gate is refused; edits record reviewer id and time; reviewer id required
- [X] T057 [P] [US4] Unit test `tests/unit/build-filter.test.ts`: `proposed` and `rejected` fields are never returned by the build field selector

### Implementation for User Story 4

- [X] T058 [P] [US4] Implement readiness evaluation in `src/review/readiness.ts` (FR-039) returning ready/blocked with reasons
- [X] T059 [US4] Implement review actions in `src/review/actions.ts`: approve, reject, edit (re-run gates on the edited value and quote), each appended to `data/logs/review.jsonl` with reviewer id, time, and before/after
- [X] T060 [US4] Implement `review symmetry <contest-id>` in `src/review/symmetry.ts`: display the matrix and record acknowledgment (reviewer, time); any later field change in the contest invalidates it
- [X] T061 [US4] Implement the interactive `review next [--contest id]` loop in `src/review/cli.ts`: show value, the quote highlighted inside a context window of the snapshot, source link, tier; prompt approve / reject / edit; refuse to approve a contest's fields if the symmetry report has not been viewed (depends on T058–T060)
- [X] T062 [US4] Implement the `status` command in `src/report/status.ts`: readiness per contest, stale snapshots, unverifiable sources, retrieval failures (`--contest` filter)
- [ ] T063 [US4] Review and approve the U.S. Senate fields, acknowledge its symmetry report, confirm `status` shows the contest ready

**Checkpoint**: Senate contest is `ready`; no code path publishes `proposed` fields

---

## Phase 6: User Story 1 - Read a sourced reference on a phone (Priority: P1) 🎯 MVP

**Goal**: A static, unlisted, tracker-free Astro site with the Powell J ballot in official order, identical candidate layouts, field provenance, "Not found" and "Not yet reviewed" states.

**Independent Test**: Build offline; the Senate contest shows every candidate with identical slots, quote, source link, tier badge, retrieved/reviewed dates, an explicit "Not found in whitelisted sources." for gaps; other contests show "Not yet reviewed"; build test finds zero third-party requests and noindex on every page (SC-009, SC-010).

### Tests for User Story 1

- [X] T064 [P] [US1] Build test `tests/integration/site-build.test.ts`: build with network disabled succeeds (SC-009); contests in official order; non-ready contests render "Not yet reviewed" with no fields; no `proposed|rejected` field text appears in output
- [X] T065 [P] [US1] Build test `tests/integration/site-privacy.test.ts`: no external URLs other than outbound `<a href>` links, no `<script src>` to other origins, no analytics, `noindex` meta on every page, `_headers` has `X-Robots-Tag: noindex`, `robots.txt` disallows all (SC-010)
- [X] T066 [P] [US1] Component test `tests/integration/site-layout.test.ts`: every candidate in a contest renders the same slot structure; a missing slot renders "Not found in whitelisted sources."; joint tickets render one choice with two person blocks; write-in lines render as printed with no slots

### Implementation for User Story 1

- [X] T067 [US1] Scaffold the Astro project in `site/` (`site/package.json` or workspace-free setup using the root package, `site/astro.config.mjs`, static output, no client JS) and a data loader `site/src/lib/data.ts` that imports the shared Zod schemas and reads `data/` only (no network)
- [X] T068 [P] [US1] Implement build-time field selection (lives in `src/site/view.ts` and `src/review/publishable.ts` so tests and the site share it; originally `site/src/lib/select.ts`): only `approved|edited` fields, contests gated by readiness; approved fields flagged `needs_rereview` still display from their original snapshot with the original retrieved date
- [X] T069 [P] [US1] Create the base layout in `site/src/layouts/Base.astro`: mobile-first CSS, `<meta name="robots" content="noindex">`, no external fonts or scripts, link to the methodology page and the footer links
- [X] T070 [P] [US1] Create `site/src/components/FieldRow.astro`: value, quote, source link, tier badge (`official|says|done`), retrieved date, last-reviewed date, "Report an error" link built from `repo_url` as a GitHub new-issue URL pre-filled with contest, entity, field, and page URL (FR-043)
- [X] T071 [P] [US1] Create `site/src/components/CandidateBlock.astro` and `site/src/components/Contest.astro`: options in ballot order with one layout; slot-driven rendering so absent fields show "Not found in whitelisted sources."; ticket and write-in rendering per contracts/site.md
- [X] T072 [US1] Create `site/src/pages/b/[ballot].astro` for `/b/<county>-<precinct>/`: contests in official ballot order, deep-link anchors per contest slug, "Not yet reviewed" state (FR-041a), unreviewed contests show candidate names as printed and no fields (depends on T068–T071)
- [X] T073 [P] [US1] Create `site/src/pages/index.astro` (links only to configured ballots, noindex), `site/public/robots.txt` (disallow all), and `site/public/_headers` (`X-Robots-Tag: noindex`)
- [X] T074 [P] [US1] Add the print stylesheet in `site/src/styles/print.css` and verify layout at phone width
- [X] T075 [US1] Wire the `build` command in `src/cli.ts` to run the Astro build offline; warn on stale snapshots (FR-036); contests not ready render "Not yet reviewed"
- [ ] T076 [US1] Build and manually view the Powell J site locally with the Senate contest published; confirm SC-004 (Senate viewable before any other contest is complete)

**Checkpoint**: MVP: a voter can open the Powell J page and read the sourced U.S. Senate contest

---

## Phase 7: User Story 5 - State issues and local levies from official language (Priority: P2)

**Goal**: State Issue 3 and the four levies shown from official ballot text, deterministic parsing, no model-written prose.

**Independent Test**: Publish State Issue 3 and one levy; every shown element is a quote from an official or sponsor source with a tier badge; the Delaware County DD levy shows 1.8 mills, 5 years, and the auditor's estimated cost per $100k as printed.

### Tests for User Story 5

- [X] T077 [P] [US5] Unit tests `tests/unit/levy-parser.test.ts` against the fixture ballot text: Career Center (renewal and decrease, 0.75 mill, $18/$100k, 10 yrs, est. $5,773,576/yr), RTA (sales and use tax, up to 0.2%, continuing), DD (additional, 1.8 mills, $63/$100k, 5 yrs, est. $25,448,490/yr), Mental Health & Recovery (renewal and increase, 2 mills, $50/$100k, 5 yrs, est. $23,005,505/yr)
- [X] T078 [P] [US5] Unit test `tests/unit/issue-guard.test.ts`: no tool-authored effect/current-law text can be stored; `effect_yes`, `effect_no`, and `current_law` require an official-source quote; State Issue 3 is never characterized as broader than the photo-ID amendment (FR-034)

### Implementation for User Story 5

- [X] T079 [P] [US5] Implement deterministic levy field parsing (in `src/ingest/official-fields.ts`, shared with T080; proposals are written by `src/ingest/propose-official.ts` during `ingest`): taxing entity, `levy_type`, millage, duration, auditor estimate per $100k and annual collection, each emitted as an `official` Field with `extractor {kind:"parser", name, version}` and the printed sentence as quote (quote 25-word cap applies; longer passages are linked, not reproduced)
- [X] T080 [P] [US5] Implement deterministic constitutional-issue field parsing in `src/ingest/official-fields.ts`: `ballot_language` and the official explanation as capped quotes with source link
- [ ] T081 [US5] (official ballot auto-registered as `official` source by `ingest`; SOS issue report, auditor, and sponsor sites still need the maintainer to whitelist them) Register sources for State Issue 3 and the four levies in `data/sources/` (Ohio SOS issue report for Issue 3 arguments with authors, county auditor material, sponsor sites marked `says`, official ballot as `official`)
- [X] T082 [US5] Add the issue extraction prompt `prompts/issue.v1.md` and a schema-constrained path in `src/extract/run-extract.ts` for `argument_for` / `argument_against` (+`author`), `sponsor_materials` (`says`), and `effect_*` only where quotable from the official explanation
- [X] T083 [P] [US5] Add issue and levy rendering in `site/src/components/IssueBlock.astro` (one component for both kinds) using the same FieldRow; levy cost per $100k shows "Not found in whitelisted sources." when absent
- [ ] T084 [US5] Run parse, fetch, extract, validate, review for State Issue 3 and the four levies; build and check the published issue pages

**Checkpoint**: Issues and levies published with official language only

---

## Phase 8: User Story 7 - Methodology and error reporting (Priority: P2)

**Goal**: A prominent methodology page and footer links; error reports go to GitHub Issues.

**Independent Test**: Methodology page reachable from every page and covers every listed topic; each footer link and "Report an error" link resolves as specified.

- [ ] T085 [P] [US7] Test `tests/integration/methodology.test.ts`: page contains what the tool does and does not do, tier definitions, whitelist rules, review process, key-vote rule and N, symmetry threshold, known gaps, correction method (GitHub Issues); does not contain the phrase "nonpartisan guide" except in a negation; labeled a "sourced reference" (FR-046)
- [ ] T086 [US7] Create `site/src/pages/methodology.astro` (served at `/methodology/`) with all topics; values for N, quote cap, staleness, and symmetry threshold read from `site.config.yaml`; known gaps generated from unpublished contests
- [ ] T087 [P] [US7] Create `site/src/components/Footer.astro` with links to Vote411, the county BOE ballot viewer (from the ballot config), and the SOS issue report for each issue; add the prominent methodology link to the base layout
- [ ] T088 [P] [US7] Set the real `repo_url` in `site.config.yaml` once the GitHub repository exists and test the pre-filled new-issue URL encoding in `tests/unit/issue-url.test.ts`

**Checkpoint**: Methodology and corrections path complete

---

## Phase 9: Remaining contests (feeds US1, US3, US4, US5; spec priority order)

**Purpose**: Widen coverage per the delivery order after the first slice ships. Each task reuses the pipeline; no new code expected beyond sources and the schema for incumbents and judicial.

- [ ] T089 [P] Implement the key-vote rule in `src/extract/key-votes.ts`: final-passage roll-call votes on the N most recent bills (N from config, default 10), same bill set for every candidate with a record, never hand-picked per candidate (FR-030); add `tests/unit/key-votes.test.ts`
- [ ] T090 [P] Implement the judicial reduced schema path in `src/schemas/field-keys.ts` and `prompts/judicial.v1.md`: `ballot_name, current_office, bar_admission` (official only), `campaign_website`; no issue-position fields (FR-031); add `tests/unit/judicial-schema.test.ts`
- [ ] T091 [P] Implement joint-ticket handling for Governor/Lt. Governor in `src/extract/run-extract.ts`: two entity field sets per ticket, each with its own sources, 3 priorities, and finance; symmetry across all persons (FR-029a)
- [ ] T092 Register sources, run the pipeline, and review Governor/Lt. Governor (priority 2)
- [ ] T093 Repeat the pipeline for remaining statewide contests (AG, Auditor of State, Secretary of State, Treasurer, two Supreme Court seats)
- [ ] T094 Repeat for U.S. House OH-12, State Senate 19, State House 60, County Commissioner, County Auditor
- [ ] T095 Repeat for judicial contests (Court of Appeals, two Common Pleas General seats, Common Pleas Probate/Juvenile) using the reduced schema; single-candidate contests display faithfully

---

## Phase 10: User Story 6 - Add another precinct without redoing work (Priority: P3)

**Goal**: A second precinct by configuration only; shared contests reuse approved data.

**Independent Test**: Add a second ballot file; page builds; shared contests show identical approved data; no extraction runs for them (SC-008).

- [ ] T096 [P] [US6] Integration test `tests/integration/second-precinct.test.ts` using a synthetic second ballot in `fixtures/synthetic/second-ballot/`: shared statewide contests resolve to the same Contest ids, `extract` makes zero model calls for them, and the page builds with no code changes
- [ ] T097 [US6] Ensure contest ids and field paths are election-scoped, not ballot-scoped, in `src/ingest/contest-id.ts` and `src/data.ts`; ingest of a second ballot links existing contests instead of recreating them
- [ ] T098 [US6] Make the ballot page route generic over `data/ballots/*.yaml` in `site/src/pages/b/[ballot].astro` and `site/src/pages/index.astro`
- [ ] T099 [US6] Add a second real ballot config (another precinct) once available and verify via quickstart.md second-precinct scenario

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T100 Implement `verify` in `src/verify/verify.ts`: best-effort whole-site quote re-verification; verify every quote whose snapshot body is present; exit 0 unless a present snapshot mismatches; write `data/reports/unverifiable-here.json` listing each field and source without an available snapshot (FR-018c, SC-002); add `tests/integration/verify.test.ts` covering present-and-matching, present-and-mismatching (fails), and absent (reported, not failing)
- [ ] T101 [P] Add CI invariant checks in `tests/contract/invariants.test.ts` per contracts/data-files.md: every ballot contest ref resolves; every committed `approved|edited` field has a `source_hash` with metadata present; no non-redistributable snapshot body is tracked; no `proposed` field is referenced by the build
- [ ] T102 [P] Add a pre-commit guard script `scripts/check-private-snapshots.sh` (and CI step) that blocks files under `data/snapshots/private/` or any body marked non-redistributable from being committed
- [ ] T103 [P] Add status/reporting checks `tests/integration/reports.test.ts`: every retrieval failure and validation drop appears in a report (SC-012)
- [ ] T104 [P] Write `README.md` with setup, the pipeline commands from contracts/cli.md, the snapshot policy, and the unlisted/noindex note; add `CONTRIBUTING.md` pointing error reports to GitHub Issues
- [ ] T105 Run every scenario in `specs/001-ballot-reference/quickstart.md` end to end and record deviations
- [ ] T106 Deploy to Cloudflare Pages (unlisted), confirm `X-Robots-Tag` and `robots.txt` in the deployed output, and confirm no third-party requests in the browser network panel
- [ ] T107 Before sharing beyond the small private circle, review Ohio political-communication disclaimer rules (constitution; this is not legal advice) and record the outcome in `docs/legal-note.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: none
- **Foundational (2)**: depends on Setup; BLOCKS all stories
- **US2 Ingest (3)**: depends on Foundational
- **US3 Extraction (4)**: depends on Foundational; needs US2 output (`data/contests/`) for the Senate contest and entity ids
- **US4 Review (5)**: depends on US3 (needs proposed fields and the symmetry report)
- **US1 Site (6)**: gate and selector logic can start once Foundational and T058 (readiness) exist; end-to-end demo needs US4 output
- **US5 Issues (7)**: depends on US2 (ballot text), US3 (extraction), US4 (review), US1 (components)
- **US7 Methodology (8)**: depends on US1 layout; can proceed in parallel with US5
- **Remaining contests (9)**: depends on Phases 4–6; T089–T091 can start once Phase 4 is done
- **US6 Second precinct (10)**: depends on US2 and US1; lowest priority
- **Polish (11)**: T100–T102 should land before the first public share; T106–T107 last

### Within Stories

- Tests first and failing, then implementation
- Schemas, then gates, then orchestration, then CLI wiring
- Constitution gates (quote, whitelist, schema, entity, symmetry, staleness) are never weakened or bypassed by flags to meet a deadline

### Parallel Opportunities

- Setup T003–T005 together; Foundational schemas T007–T013 together and T015, T017, T019, T020
- US3 tests T033–T038 together; gate implementations T045, T046, T048 together; fetch components T041–T043 together
- US1 components T069–T071, T073, T074 together
- Phase 9 T089–T091 together; Phase 11 T101–T104 together

## Parallel Example: User Story 3

```bash
# Tests together:
Task: "Unit tests for quote gate in tests/unit/gate-quote.test.ts"
Task: "Unit tests for symmetry in tests/unit/symmetry.test.ts"
Task: "Contract test for extractor in tests/contract/extractor.test.ts"

# Gates together:
Task: "Implement quote and length gates in src/validate/quote.ts and src/validate/length.ts"
Task: "Implement whitelist, schema, entity, staleness gates in src/validate/"
Task: "Implement symmetry in src/validate/symmetry.ts"
```

## Implementation Strategy

### MVP First (thin U.S. Senate slice, per spec priority and SC-004)

1. Phases 1–2 (Setup, Foundational)
2. Phase 3 (US2 ingest) so contests and entities exist
3. Phase 4 (US3) for the Senate contest only
4. Phase 5 (US4) review the Senate fields
5. Phase 6 (US1) build and publish the first page; **STOP and validate** against the quickstart and SC-004/009/010
6. Share with the private circle only after T100–T102 pass

### Incremental Delivery

1. Add Phase 9 contests in spec priority order: Governor/Lt. Governor, then State Issue 3 and levies (Phase 7), then other statewide, then district and county, then judicial
2. Add the methodology page (Phase 8) before first sharing
3. Publish partial coverage; list unpublished contests as known gaps (SC-011)
4. Phase 10 only if time allows before Nov 3, 2026

## Notes

- [P] tasks touch different files and have no dependency on unfinished tasks
- Each story is independently testable at its stated checkpoint
- Commit after each task or logical group; commit messages end with the attribution line given in the session
- Open items: set the real `repo_url` (T006, T088); verify the Anthropic structured-output parameters (T050)
