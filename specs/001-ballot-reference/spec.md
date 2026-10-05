# Feature Specification: Ballot Reference (Sourced Voter Reference)

**Feature Branch**: `001-ballot-reference`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Ballot Reference — Build Spec (v0.1): a tool that, for a given Ohio precinct ballot, produces a sourced, symmetric reference for every contest and issue on that ballot, for a small circle of friends and family. First target: Nov 3, 2026 General, Delaware County precinct 154/1 - POWELL CITY J."

## Overview

Ballot Reference produces a **sourced reference** (explicitly *not* a "nonpartisan guide") for every contest and issue on a specific Ohio precinct ballot. Every fact shown is a short verbatim quote from a pre-approved source, labeled with what kind of evidence it is, and approved by a human before anyone sees it. It does not recommend, rate, score, or summarize. A sparse, accurate page is preferred over a rich, wrong one.

The election is Nov 3, 2026. A usable partial version is more valuable than a complete version that arrives late. Priority order for coverage: U.S. Senate, Governor/Lt. Governor, State Issue 3, county/local levies, other statewide contests, district and county races, then judicial.

### Non-Goals

- No endorsements, recommendations, ratings, scores, sentiment analysis, predictions, or "which candidate is better for X."
- No summaries of news or opinion (link only).
- No reader accounts, tracking, or data collection from readers.
- No polling-place or registration features (link to Vote411 and the county board of elections instead).
- Not presented as a "nonpartisan guide."

### Evidence Tiers

| Tier | Meaning | Examples |
|------|---------|----------|
| `official` | Government or ballot record | Board of elections ballot text, Secretary of State issue report, county auditor levy cost estimate, FEC filings |
| `says` | The candidate's or sponsor's own statements | Candidate website issues page, sponsor levy materials |
| `done` | Verifiable record | Roll-call votes, filed bills, campaign finance, court/office history on official sites |
| `context` | Link-only, never summarized or quoted | News, Vote411, Ballotpedia, bar association ratings |

## Clarifications

### Session 2026-10-04 (second pass)

- Q: For the Governor/Lt. Governor race, one set of fields per joint ticket or separate sets per person? → A: Two sets per ticket (governor candidate and lieutenant governor candidate), each with its own sources, 3 priorities, and finance, shown side by side under the one ticket on the ballot.
- Q: Should write-in lines and candidates labeled "Other-party candidate" get full slots and count in symmetry? → A: Named candidates always get full slots and count in symmetry, whatever their printed label; write-in lines are shown as printed with no slots and are excluded from symmetry.
- Q: What happens to approved fields when a source changes after approval? → A: Sources are re-fetched on demand or schedule; if content changed, approved quotes keep showing from their stored copy (with its retrieved date), the contest is flagged for re-review, and "ready to publish" is blocked until cleared.
- Q: What should the "Report an error" link do? → A: Open a new issue in the project's public GitHub repository, pre-filled with the contest, candidate, field, and page URL (project will be open source; corrections are tracked in GitHub Issues).
- Q: Should stored source copies (snapshots) be committed to the public repository? → A: Commit approved fields, quotes, and snapshot fingerprints, plus snapshots of government/public-record sources; keep copies of candidate sites and other third-party pages out of the public repo (local and private backup only).
- Q: Where should the whole-site quote re-check run, given third-party copies stay out of the public repo? → A: Re-verification is best-effort: it checks every quote whose snapshot is available in the current environment and reports each source without an available snapshot as "unverifiable here" instead of failing. The quote gate at extraction, validation, and review is unchanged and still requires the local snapshot.

### Session 2026-10-04

- Q: How many stated priorities should the reference show for each candidate? → A: 3 priorities per candidate (same number for every candidate in a contest).
- Q: Who chooses the set of key votes shown for incumbents? → A: A published neutral rule (e.g., final-passage votes on the most recent N bills), applied identically to everyone with a record; no hand-picking.
- Q: What counts as lopsided coverage in the symmetry report? → A: Flag a contest if any candidate has zero fields, or if candidates' filled-field counts differ by more than 2 (threshold configurable).
- Q: Which campaign finance figure should be shown, and as of when? → A: Total raised and total spent from each candidate's most recent filed report, with the report's coverage end date shown.
- Q: What should the published page show for a contest that isn't fully reviewed yet? → A: Every contest appears in official ballot order with candidate names as printed; contests not yet ready to publish carry a clear "Not yet reviewed" label and show no fields.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a sourced reference for my ballot (Priority: P1)

A voter in the Powell J precinct (a friend or family member of the maintainer) opens the unlisted link on their phone. They see every contest and issue on their ballot in the official ballot order. For each candidate in a contest, they see the same set of fields in the same layout. Each field shows a short quote, a link to the original source, a badge for its evidence tier, and when it was retrieved and reviewed. Fields that could not be found show an explicit "Not found in whitelisted sources." state. They can follow deep links to a single contest, print the page, and find a methodology page explaining what the tool does and does not do.

**Why this priority**: This is the product. Without a published page that voters can read, nothing else has value. It is also the first thing that must exist for the election date.

**Independent Test**: Publish one contest (U.S. Senate) with approved fields and verify that a voter on a phone can reach it by link, read every candidate's fields in identical layout, follow each source link, see tier badges and dates, and see the "not found" state for any missing field.

**Acceptance Scenarios**:

1. **Given** a published ballot page for Powell J, **When** a voter opens it, **Then** contests and issues are listed in the same order as the official sample ballot, each reachable by a deep link.
2. **Given** a published contest with two or more candidates, **When** the voter views it, **Then** every candidate is shown in ballot order using an identical layout and identical field slots.
3. **Given** a field with an approved value, **When** the voter views it, **Then** they see the value, the verbatim quote, a link to the source, a tier badge, and the retrieved and last-reviewed dates.
4. **Given** a candidate field for which no valid, approved quote exists, **When** the voter views the contest, **Then** that slot shows "Not found in whitelisted sources." rather than being hidden or filled with other text.
5. **Given** any field, **When** the voter wants to flag a problem, **Then** a "Report an error" link is present on that field.
6. **Given** the page, **When** it is loaded or printed, **Then** it is readable on a phone and prints cleanly, loads no third-party content, and sets no tracking of any kind.
7. **Given** the site is deployed, **When** a search engine or stranger looks for it, **Then** the site is unlisted and signals that it should not be indexed.

---

### User Story 2 - Ingest the official ballot as the source of truth (Priority: P1)

The maintainer points the tool at a county, election, and precinct (configuration only). The tool retrieves the official ballot and produces the list of contests and options exactly as printed: office, term, vote-for-N, candidates with party labels, write-in lines, and issue titles and full ballot text. The raw ballot is preserved. If automated retrieval is blocked, the maintainer can supply the ballot manually (pasted text or uploaded PDF). On later re-runs, the tool reports what changed (withdrawals, corrections).

**Why this priority**: Every other part of the reference hangs off the ballot's contest list. Wording of levy text and issue language must come from the official ballot, never from a language model.

**Independent Test**: Run ingestion for Powell J and compare the result with the official sample ballot (17 contests and 5 issues as of the Sept 22, 2026 check, or the corrected official list) with zero manual edits.

**Acceptance Scenarios**:

1. **Given** the Powell J configuration, **When** ingestion runs, **Then** the resulting list matches the official ballot's contests and issues exactly, in official order, with zero manual edits.
2. **Given** a contest on the ballot, **When** it is parsed, **Then** office, term, vote-for-N, candidate names and party labels as printed, write-in lines, and (for issues) the full official text are captured.
3. **Given** automated retrieval fails, **When** the maintainer supplies the ballot by pasted text or PDF, **Then** the same parsing and verification apply.
4. **Given** a prior ingestion exists, **When** ingestion is re-run and the official ballot changed, **Then** a change report lists additions, removals, and edits (e.g., a withdrawn candidate).
5. **Given** the raw ballot, **When** inspected later, **Then** the exact retrieved copy is still available for re-verification.

---

### User Story 3 - Collect sourced facts for a contest with every claim verified (Priority: P1)

For a given contest, the maintainer has a human-seeded list of approved sources (for example, a candidate's own website confirmed by the maintainer, FEC filings, roll-call vote records). The tool retrieves and stores a copy of each source, then proposes structured field values for each candidate by *extracting* them from the stored text. Each proposed value must carry a short verbatim quote that literally appears in the stored copy. Anything that fails the validation gates is dropped and logged, never paraphrased or repaired. A per-contest symmetry report shows which fields exist for which candidates.

**Why this priority**: This is the mechanism that makes the reference trustworthy. Hallucination and drift are the dominant risks, and the quote and review gates exist to prevent them.

**Independent Test**: Run the U.S. Senate contest end to end from sources through stored copies, extraction, validation, and a proposed-field list; verify that a deliberately altered, paraphrased, or wrong-source quote is rejected and that a deliberately lopsided test contest fails the symmetry report.

**Acceptance Scenarios**:

1. **Given** an approved source and a candidate, **When** extraction runs, **Then** each proposed field includes the value, a verbatim quote from the stored copy, the source link, a content fingerprint of the stored copy, the retrieval time, the evidence tier, and a record of which model and instructions version produced it.
2. **Given** a proposed field whose quote is not a literal substring of the stored copy (after documented whitespace normalization), **When** validation runs, **Then** the field is dropped and the drop is logged.
3. **Given** a quote longer than the configured word limit (default 25 words), **When** validation runs, **Then** the field is dropped and logged.
4. **Given** a field whose source is not on the contest's approved source list, **When** validation runs, **Then** the field is dropped and logged.
5. **Given** extracted text that names a different person than the target candidate (e.g., a name collision), **When** validation runs, **Then** the field is dropped and logged.
6. **Given** a source page containing text that tries to instruct the system (e.g., "ignore previous instructions"), **When** extraction runs, **Then** the text is treated purely as data and has no effect on behavior.
7. **Given** extraction for one candidate, **When** it runs, **Then** it uses no information about other candidates and only one source document at a time.
8. **Given** a contest where one candidate has zero fields or coverage differs between candidates by more than a configured threshold, **When** the symmetry report is generated, **Then** the contest is flagged.
9. **Given** a source that blocks automated retrieval, **When** retrieval fails after retries and fallback, **Then** the failure appears in a status report and the maintainer can import the content manually.

---

### User Story 4 - Review and approve every field before publishing (Priority: P1)

The reviewer (the maintainer) steps through proposed fields one at a time. For each, they see the value, the quote highlighted in its source copy, and the source link, and choose approve, reject, or edit. Edits are recorded with the reviewer's identity. A contest becomes "ready to publish" only when all its fields are reviewed, its symmetry report has been viewed and acknowledged, and none of its source copies are stale. Only approved or edited fields appear on the published site.

**Why this priority**: The human review gate is a non-negotiable principle. Nothing reaches voters without it.

**Independent Test**: With a mix of proposed fields, step through review, then attempt to publish: verify unreviewed fields and unacknowledged symmetry reports block "ready to publish," and verify rejected and proposed fields never appear on the site.

**Acceptance Scenarios**:

1. **Given** proposed fields exist, **When** the reviewer asks for the next field, **Then** they see the value, the highlighted quote in context, and the source link, and can approve, reject, or edit.
2. **Given** the reviewer edits a field, **When** they save, **Then** the edit is recorded with the reviewer's id and time, and the edited value must still satisfy the validation gates.
3. **Given** a contest with unreviewed fields, an unacknowledged symmetry report, or a source copy older than the staleness limit (default 7 days), **When** publication is attempted, **Then** the contest is blocked and the reason is shown.
4. **Given** fields with status proposed or rejected, **When** the site is built, **Then** they are excluded.

---

### User Story 5 - Show state issues and local levies using official language (Priority: P2)

For State Issue 3 and each local levy on the Powell J ballot, the page shows official ballot language, the official explanation, and (for the state issue) the argument-for and argument-against text as short quotes with who authored each. For levies, it shows taxing entity, type (renewal/additional/replacement/decrease), millage, duration, purpose as stated, the county auditor's estimated cost per $100k of valuation, the sponsor's own materials (`says` tier), and a link to the official text. A statement of the effect of YES versus NO is shown only if it is quotable from the official explanation. State Issue 3 is never described as broader than the narrow photo-ID amendment it is.

**Why this priority**: Issues are high-impact for voters and are largely drawn from official text, making them both valuable and low-risk. Ranked below the core pipeline because it builds on it.

**Independent Test**: Publish State Issue 3 and one levy; verify every shown element is a quote from an official or sponsor source with its tier badge, and that no descriptive text is written by the tool.

**Acceptance Scenarios**:

1. **Given** State Issue 3, **When** the page is shown, **Then** it presents official ballot language and explanation as quotes with source links, and arguments for/against with their authors identified.
2. **Given** a local levy, **When** the page is shown, **Then** auditor's estimated cost per $100k of valuation appears if present in official ballot language or auditor material, otherwise the "Not found" state.
3. **Given** any issue, **When** content is shown, **Then** no tool-authored explanation of effect, current law, or consequences appears unless it is a quote from an official source.

---

### User Story 6 - Add another precinct without redoing work (Priority: P3)

The maintainer adds a second precinct (possibly in another county) by adding configuration only. Contests shared with an existing ballot (statewide, shared districts) reuse their already-approved data with no re-extraction; only contests unique to the new precinct need new sourcing. The new ballot gets its own page.

**Why this priority**: Valuable for sharing with more households, but only after the first ballot works and the election clock permits.

**Independent Test**: Add a second precinct configuration; verify its page builds, shared contests show identical approved data, and no extraction ran for them.

**Acceptance Scenarios**:

1. **Given** an existing ballot and a new precinct configuration that shares statewide contests, **When** ingestion and build run, **Then** shared contests are recognized as the same contest and reuse approved fields without re-extraction.
2. **Given** a new precinct, **When** added, **Then** no program changes are required.

---

### User Story 7 - Understand the method and report errors (Priority: P2)

Any reader can open a prominent methodology page that explains what the tool does and does not do, the tier definitions, the source whitelist rules, the review process, known gaps, and how to contact the maintainer with a correction. Each page footer links to Vote411, the county board of elections ballot viewer, and the Secretary of State issue report.

**Why this priority**: Transparency about method is how this reference earns trust in lieu of claiming neutrality.

**Independent Test**: Open the methodology page from any page and verify each listed topic is present and the error-report and footer links work.

**Acceptance Scenarios**:

1. **Given** any page, **When** a reader looks for the method, **Then** a prominent link leads to the methodology page covering all listed topics.
2. **Given** a "Report an error" link, **When** activated, **Then** it opens a message to the maintainer pre-identifying the specific field.

---

### Edge Cases

- A candidate withdraws or the official ballot is corrected after ingestion: the change report flags it and affected contests are re-reviewed before publication.
- Two different people share a name with a candidate: entity-resolution check drops mismatched fields.
- A source returns an error page, "maintenance" page, or a block: retried with backoff, then a fallback retrieval method, then reported; manual import available. A maintenance page must never be stored as if it were real content.
- A source's content changes after retrieval: the stored copy and its fingerprint remain the record; re-retrieval creates a new copy and flags fields tied to the old one for re-verification.
- A candidate has no website or no public record: slots show "Not found in whitelisted sources."; the contest still publishes, with the symmetry report surfacing the gap. The tool does not fill the gap with generated text.
- Incumbents or better-funded candidates have far more material: coverage is limited to the same schema and same top-N priorities for all; asymmetry is surfaced, not corrected by generation.
- An unopposed contest, a vote-for-two contest, or a write-in-only line: displayed faithfully per the official ballot.
- A source's text contains an instruction aimed at the extractor: treated as data only.
- Quote text spans odd whitespace, line breaks, or typographic characters: matching uses a documented normalization applied identically to quote and stored copy.
- Multi-column ballot layout and watermark text interleaved in extracted text: contest order and candidate order must still match the printed ballot.
- A joint ticket (Governor and Lieutenant Governor) is a single option with two names; a party label like "Other-party candidate" is shown exactly as printed.
- Ballotpedia or Vote411 content: never retrieved for extraction or republished; only linked as `context`.
- Snapshot goes stale between review and build: build warns, and "ready to publish" is revoked until refreshed or the staleness is acknowledged.
- The site is built with no network connection: it must still build completely from stored data.

## Requirements *(mandatory)*

### Functional Requirements

**Provenance and integrity (non-negotiable)**

- **FR-001**: The system MUST only extract structured values from stored source text and MUST NOT generate free-form descriptions of candidates, positions, or issues.
- **FR-002**: Every displayed claim MUST carry source link, retrieval time, a content fingerprint of the stored source copy, an evidence tier, and a verbatim quote that is a literal substring of that stored copy (after documented whitespace normalization).
- **FR-003**: A field with no valid quote MUST be dropped and logged, never paraphrased; the page MUST show "Not found in whitelisted sources." in its place.
- **FR-004**: Quotes MUST NOT exceed a configurable word limit (default 25 words); longer material is linked, not reproduced.
- **FR-005**: A field's source MUST match the contest's human-registered source list (domain and, where specified, path); otherwise the field is dropped and logged.
- **FR-006**: Field values MUST conform to the schema for their contest type; unknown fields and mistyped values are rejected.
- **FR-007**: The extracted subject MUST match the target candidate; mismatches (e.g., namesakes) are dropped and logged.
- **FR-008**: Self-description (`says`) and record (`done`) MUST be kept in separate tiers and never combined in one field.
- **FR-009**: Each contest MUST receive the same schema and the same source classes for every candidate; each candidate MUST have exactly 3 stated-priority slots (filled from sources or shown as "Not found in whitelisted sources."), the same for all candidates in a contest.
- **FR-010**: Extraction MUST be isolated: one source document per request, no access to other candidates' data, no ability to browse or take actions, output constrained to the schema, and fetched text treated strictly as untrusted data.
- **FR-011**: Each field MUST record which model and instruction version produced it; token usage and failures per extraction run MUST be logged.
- **FR-012**: The reference MUST NOT include endorsements, recommendations, ratings, scores, predictions, sentiment analysis, or summaries of news or opinion.

**Source registry and retrieval**

- **FR-013**: Sources MUST be human-registered per contest (and per candidate where applicable) before any retrieval for extraction, each with url, domain class, tier, who approved it, and notes. Supported source classes include county board of elections, Ohio Secretary of State, FEC, Congress/Senate/House sites, Ohio legislature, county auditor, candidate's own site (human-confirmed), and sponsor/entity sites for levies.
- **FR-014**: Search-based discovery, if offered, MUST only propose sources into a review queue; nothing proposed is retrieved for extraction until a human approves it.
- **FR-015**: Retrieval MUST honor robots.txt and site terms, rate-limit requests, identify itself with a genuine user agent, and avoid re-retrieving identical content.
- **FR-016**: On retrieval failure, the system MUST retry with backoff, then try a fallback retrieval approach, then record the failure in a status report; failures MUST NOT be silent.
- **FR-017**: The system MUST support manual import (pasted text or uploaded PDF) for sources that cannot be retrieved automatically.
- **FR-018**: Every retrieved or imported source MUST be stored so any displayed quote can be re-verified later.
- **FR-018a**: Sources MUST be re-retrievable on demand or on a schedule. When re-retrieved content differs from the stored copy, previously approved fields MUST continue to display from their original stored copy with its original retrieved date, the affected contest MUST be flagged for re-review, and "ready to publish" MUST be blocked until the reviewer clears the flag.
- **FR-018b**: The project will be published as an open-source public repository. Approved fields, quotes, and snapshot fingerprints, and snapshots of government or public-record sources (e.g., the official ballot), MAY be committed publicly; snapshots of candidate sites and other third-party pages MUST NOT be committed to the public repository and MUST be retained locally and in private backup so quotes remain verifiable by the maintainer.
- **FR-018c**: Whole-site quote re-verification (e.g., in CI or on a fresh clone) MUST be best-effort: it MUST verify every quote whose snapshot is available, MUST NOT fail solely because a snapshot is unavailable, and MUST list each field and source whose snapshot is unavailable in a report as "unverifiable here." This does not relax FR-002 or the validation gates, which MUST still fail when the snapshot is present locally and the quote does not match, and MUST still require the local snapshot at extraction, validation, and review time.
- **FR-019**: Ballotpedia and Vote411 content MUST NOT be scraped or republished; they appear only as links at `context` tier.

**Ballot ingestion**

- **FR-020**: The system MUST ingest a ballot from the county board of elections' official ballot viewer using county, election, and precinct supplied as configuration, with fallbacks to a browser-driven retrieval and then manual import.
- **FR-021**: Ingestion MUST capture, per contest: office, term, vote-for-N, candidates (as printed) with party labels, write-in lines, and for issues the title and full official text; and preserve the raw ballot.
- **FR-022**: Issue and levy wording MUST come from the official ballot or its PDF and never from a language model.
- **FR-023**: For Powell J, ingestion MUST reproduce the official contest and issue list (17 contests and 5 issues as of the Sept 22, 2026 check, subject to verification against the official ballot) with zero manual edits.
- **FR-024**: Re-running ingestion MUST diff against the prior copy and report changes.

**Data model and reuse**

- **FR-025**: Contests MUST have a stable, canonical identifier combining election, office, jurisdiction/district, and term, and MUST be shared across every ballot that contains them.
- **FR-026**: Adding a ballot (county, precinct, election, ordered contest list) MUST require configuration only, no program changes.
- **FR-027**: Candidates/options MUST record name as printed, party label as printed (or none), ballot order, write-in flag, and an incumbent flag only when verifiable.
- **FR-028**: Adding a second ballot MUST reuse already-approved shared-contest data without re-extraction.

**Contest-type content**

- **FR-029**: Candidate contests (federal, statewide, legislative, county) MUST support: official ballot name, party label, campaign website, 3 stated priorities (quoted), current/prior offices from official sources, and campaign finance (`done`) as total raised and total spent from each candidate's most recent filed report on an official finance source, with the report's coverage end date shown.
- **FR-029a**: For joint-ticket contests (Governor and Lieutenant Governor), each ticket MUST be shown as one ballot choice containing two candidate field sets (one per person) using the same schema and slots, each with its own sources; symmetry is evaluated across all persons in the contest.
- **FR-029b**: Every named candidate MUST receive the full field slots and be counted in the symmetry report regardless of printed party label (including "Other-party candidate" or no label); write-in lines MUST be shown as printed, with no field slots, and excluded from the symmetry report.
- **FR-030**: Incumbent candidates MUST additionally support key votes from official roll-call records (`done`), selected by a published neutral rule (e.g., final-passage votes on the most recent N bills, with N and the rule stated on the methodology page) applied identically to every candidate who has a voting record; votes MUST NOT be hand-picked per candidate.
- **FR-031**: Judicial contests MUST use a reduced schema: official ballot name, current judicial/legal office, bar admission/years if on an official source, and campaign site link; no issue-position fields.
- **FR-032**: Constitutional issues MUST support official ballot language, official explanation, argument-for and argument-against quotes with the author of each recorded, effect-of-YES/NO only if quotable from the official explanation, and current-law comparison only with an official source.
- **FR-033**: Local levies MUST support taxing entity, type (renewal/additional/replacement/decrease), millage, duration, purpose as stated, county auditor's estimated cost per $100k of valuation, sponsor materials (`says`), and a link to the official text.
- **FR-034**: State Issue 3 MUST NOT be characterized as broader than a photo-ID constitutional amendment adding the existing requirement to the constitution.

**Validation and symmetry**

- **FR-035**: The system MUST generate a per-contest symmetry report showing field coverage per candidate, flag a contest when any candidate has zero filled fields or when candidates' filled-field counts differ by more than a configurable threshold (default 2), and require the report be viewed before approval.
- **FR-036**: The system MUST warn when any source copy is older than a configurable limit (default 7 days) at build time.
- **FR-037**: The quote-matching validation MUST be covered by automated tests including negative cases (paraphrase, altered word, wrong source), and the symmetry check MUST be demonstrably failing on a deliberately lopsided test contest.

**Review**

- **FR-038**: A review workflow MUST present one proposed field at a time with its value, highlighted quote in source context, source link, and approve/reject/edit actions; edits are logged with reviewer id and time.
- **FR-039**: A contest is "ready to publish" only when all of its fields are reviewed, its symmetry report is acknowledged, and none of its source copies are stale.
- **FR-040**: The published site MUST include only approved or edited fields.

**Published site**

- **FR-041**: The system MUST produce a static, mobile-friendly, print-friendly site with one page per ballot listing contests in official ballot order, with deep links per contest.
- **FR-041a**: Contests that are not yet ready to publish MUST still appear in official ballot order with candidate names as printed and a clear "Not yet reviewed" label, and MUST show no fields, so readers can distinguish "not researched yet" from "Not found in whitelisted sources."
- **FR-042**: Each contest MUST show candidates in ballot order in an identical layout; each field shows value, quote, source link, tier badge, retrieved date, and last-reviewed date; absent fields show an explicit "not found" state.
- **FR-043**: The site MUST include a prominent methodology page (what it does and does not do, tier definitions, whitelist rules, review process, known gaps, correction contact), a "Report an error" link on every field (a link that opens a new issue in the project's public GitHub repository, pre-filled with the contest, candidate, field, and page URL), and footer links to Vote411, the county board's ballot viewer, and the Secretary of State issue report for each issue.
- **FR-044**: The site MUST be unlisted and signal non-indexing by default, include no analytics, no third-party scripts, and collect no reader data.
- **FR-045**: The site MUST build completely from stored data with no network access.
- **FR-046**: The site MUST NOT describe itself as a "nonpartisan guide"; it MUST label itself a sourced reference with a published methodology.

**Pipeline operation**

- **FR-047**: Each pipeline stage (ingest, resolve contests, register sources, retrieve, extract, validate, review, build) MUST be repeatable without producing duplicates and resumable after interruption.
- **FR-048**: The model provider and model used for extraction MUST be pinned and recorded, and swappable without changing stored data formats or pipeline behavior.

### Key Entities

- **Election**: A specific election event (id, date, type), e.g., Nov 3, 2026 General.
- **Contest**: A canonical office or ballot issue, keyed by election, office, jurisdiction/district, and term. Shared by all ballots that include it.
- **Ballot**: A county + precinct + election with an ordered list of contest references; defined purely by configuration.
- **Candidate / Option**: A choice within a contest: name as printed, party label as printed or none, ballot order, write-in flag, incumbent flag (only if verifiable). For issues, the YES/NO options.
- **Source**: A human-approved place to look: url, domain class, evidence tier, who approved it, notes. Scoped to a contest and optionally a candidate.
- **Snapshot**: A stored copy of a retrieved or manually imported source: url, retrieval time, content fingerprint, content type, plain-text form. The anchor against which quotes are verified.
- **Field**: One sourced fact about a candidate or issue: contest, entity, field key, value, verbatim quote, source link, snapshot fingerprint, retrieval time, tier, review status (proposed / approved / rejected / edited), reviewer, review time, and extractor identity (model + instruction version).
- **Symmetry Report**: Per-contest matrix of field coverage by candidate with flags and an acknowledgment record.
- **Status/Change Reports**: Retrieval failures, validation drops, and ballot changes between ingestions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ingestion of the Powell J ballot reproduces the official contest and issue list (17 contests and 5 issues, or the corrected official list) with 100% of items matching and zero manual edits.
- **SC-002**: 100% of fields shown on the published site have a quote that appears verbatim in the stored copy of the cited source, verified by an automated re-check of the whole site wherever the stored copy is available; fields whose copy is unavailable in the checking environment are listed in a report, never silently skipped. On the maintainer's machine, where all copies are present, the re-check finds zero mismatches and zero unverifiable fields.
- **SC-003**: 0 fields appear on the published site that were not approved or edited by a human reviewer.
- **SC-004**: The U.S. Senate contest runs end to end (sources → stored copies → proposed fields → validation → review → published page) and is viewable by a voter before any other contest is completed.
- **SC-005**: For every published contest, all candidates show the same field slots in identical layout; 100% of published contests have an acknowledged symmetry report.
- **SC-006**: Automated tests demonstrate that a paraphrased quote, a single-word-altered quote, and a quote taken from a different source are each rejected, and that a deliberately lopsided contest fails the symmetry check.
- **SC-007**: A voter can go from opening the link to reading any one candidate's fields for a contest in under 30 seconds on a phone.
- **SC-008**: Adding a second precinct requires zero code changes and zero re-extraction for contests shared with an existing ballot.
- **SC-009**: The site builds successfully with the network disabled.
- **SC-010**: A scan of the built site finds zero third-party requests, zero analytics, and a non-indexing signal on every page.
- **SC-011**: Of the Powell J ballot's contests and issues, coverage reaches in priority order at least U.S. Senate, Governor/Lt. Governor, State Issue 3, and the four local levies published and reviewed before Nov 3, 2026; remaining contests are published as capacity allows, with unpublished ones listed as known gaps on the methodology page.
- **SC-012**: Every retrieval failure and every validation drop in a run is visible in a report; none are silent.

## Assumptions

- **Audience and visibility**: A small private circle (friends and family); the site is unlisted and non-indexed. Broader sharing would first require checking Ohio political-communication disclaimer rules; this spec is not legal advice.
- **Single maintainer/reviewer**: One person acts as maintainer and reviewer. Multi-reviewer workflows are out of scope.
- **Timeline**: ~30 days from the Sept 22, 2026 check to Nov 3, 2026. A thin published slice is preferred over a complete pipeline published late; partial coverage is acceptable and disclosed.
- **Fixture accuracy**: The maintainer supplied the official Powell J sample ballot (saved at `reference/powell-j-ballot-2026-11-03.pdf`; see `reference/powell-j-fixture-notes.md`). Checked against it, the 17 contests / 5 issues count holds, but several details in the original brief were imprecise (e.g., the Supreme Court and Common Pleas General entries are each two separate single-seat contests with different terms, not one two-seat contest). The official ballot governs.
- **Ballot format**: The official ballot viewer returns a two-page, multi-column, watermarked PDF, not an HTML page. Ingestion must handle column reading order and watermark noise; manual import remains the fallback.
- **Source whitelist is human-seeded** before looking at results; per-candidate websites are added only after the maintainer confirms the site belongs to that candidate.
- **Defaults carried from the brief**: unlisted + noindex; static hosting; Vote411 and Ballotpedia link-only; quote limit 25 words; staleness limit 7 days; all configurable.
- **Language model use** is limited to extraction; a single provider/model is pinned at first and made swappable. Specific technology choices (languages, frameworks, hosting) are deferred to planning; the brief's recommended stack is a suggestion, not a requirement of this spec.
- **Reader privacy**: Readers need no accounts to read the site; the only reader-initiated contact is an error report filed on GitHub. Error reports go to the public GitHub Issues of the project's repository (the repository URL is a configuration value); submitting one requires a GitHub account and is the reader's choice.
- **Dependencies**: Availability of the county board of elections' ballot viewer and official/government sources; if blocked, manual import is the fallback. Official sites may be intermittently unavailable.
- **Open source**: The repository is public on GitHub; no credentials, private source copies, or reviewer personal data may be committed.
- **Out of scope**: endorsements, ratings, news summaries, accounts, analytics, polling-place and registration help, and non-Ohio ballots.
