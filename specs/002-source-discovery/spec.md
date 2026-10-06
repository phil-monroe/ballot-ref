# Feature Specification: Source Discovery Queue

**Feature Branch**: `002-source-discovery`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "One of the biggest time challenges is doing the research to find the sources to review and include. Implement a way to have Claude do the research to find the list of potential sources that can then be used to go through and review each source one by one."

## Clarifications

### Session 2026-10-06

- Q: Should discovery be allowed to propose sources outside the existing source classes? → A: Open-ended. Claude may propose any source, and the reviewer assigns the class and tier during review.
- Q: How many proposed sources should discovery keep per candidate or issue before review? → A: No cap. Keep everything found (duplicates and invalid URLs excluded).
- Q: Should the proposed-sources queue, including rejected URLs and reasons, be committed to the public repository? → A: Commit everything (pending, accepted, rejected, with reasons).
- Q: When reviewing a proposed source, should the tool show a page excerpt or only the URL and reason? → A: Also show the page title and a short opening excerpt, in the terminal only and never saved.
- Q: May Claude run its own live web searches and open pages during discovery, or should the program do the searching and give Claude only results? → A: Claude browses freely (search and open pages) during discovery; the constitution gets a clarifying amendment allowing this for discovery only.
- Q: After accepting a proposed source, should the tool automatically fetch and extract from it? → A: Yes. Accept registers, fetches, and extracts automatically; extracted fields still go to the normal human field review before anything is published.
- Q: Should discovery propose candidate-owned websites only if they clearly identify the candidate and office, or any plausible match? → A: Label each candidate-site proposal "identity matched" (site shows the candidate's name and office) or "possible match, not confirmed"; both are shown, and the reviewer's explicit confirmation is still required.
- Q: Should a candidate's accepted sources be limited to the same source classes as other candidates in the contest? → A: No restriction at accept time, because many candidates have few or no sources. Lopsided coverage is surfaced by the coverage summary and the existing symmetry report, not blocked or warned on at accept.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get a proposed-source list for a contest (Priority: P1)

The maintainer picks a contest (for example, the U.S. House race in Ohio's 12th district) and asks for source discovery. Claude researches the open web and public records and produces a list of *candidate sources* for every candidate (or for the issue or levy). Each proposed source shows its URL, what kind of source it appears to be (official record, candidate's own site, government site, or link-only context), the evidence tier it would carry, which candidate or issue it belongs to, and a one-line note on why it was proposed. Nothing in this list is used for extraction yet.

**Why this priority**: Finding sources is the maintainer's biggest time sink. A proposed list alone, even reviewed by hand outside the tool, removes most of that effort.

**Independent Test**: Run discovery for one contest that has no registered sources. Confirm a proposed list is produced covering every candidate on the ballot, that each entry has the fields above, and that the contest's registered source list and all extraction results are unchanged.

**Acceptance Scenarios**:

1. **Given** a contest with two candidates and no registered sources, **When** the maintainer runs discovery for it, **Then** a proposed list is produced that attributes each proposal to a specific candidate or to the contest as a whole, and the registered source list is unchanged.
2. **Given** a levy or state issue, **When** discovery runs, **Then** proposals include sponsor or entity pages and relevant official government pages, labeled with their source class.
3. **Given** discovery finds nothing for a candidate, **When** the list is produced, **Then** that candidate appears with an explicit "no sources found" entry rather than being omitted.

---

### User Story 2 - Review proposed sources one by one (Priority: P1)

The maintainer steps through the proposed sources one at a time, like the existing field review. For each, they see the URL, the proposed class and tier, the target candidate or issue, and the reason it was proposed. They can accept it (it becomes a registered source, attributed to them), reject it (with an optional reason, remembered so it is not proposed again), edit the class, tier, or target before accepting, or skip it for later. Only accepted sources enter the contest's source registry.

**Why this priority**: The project's rules require a human to whitelist every source before anything is fetched. This step turns Claude's research into usable, approved sources and is the only path from proposal to registry.

**Independent Test**: Take a proposed list with several entries, accept one, reject one, and skip one. Confirm only the accepted source appears in the registry, with the maintainer recorded as approver; the rejected one is logged with its reason; the skipped one is still pending.

**Acceptance Scenarios**:

1. **Given** a pending proposal, **When** the maintainer accepts it, **Then** it is added to the contest's source registry with the reviewer's identity and timestamp, and the next pending proposal is shown.
2. **Given** a pending proposal, **When** the maintainer rejects it, **Then** it is not registered, the decision is logged, and a later discovery run does not re-propose the same URL for that contest.
3. **Given** a candidate-owned website is proposed, **When** the maintainer reviews it, **Then** the review clearly asks them to confirm the site belongs to that candidate, and it cannot be accepted without that confirmation.
4. **Given** the maintainer quits mid-review, **When** they resume later, **Then** unreviewed proposals are still pending and reviewed ones are not shown again.

---

### User Story 3 - Fair coverage across candidates (Priority: P2)

Before reviewing, the maintainer sees a coverage summary per contest: how many proposals exist per candidate and by source class. Lopsided coverage (for example, one candidate with a website and records, another with nothing) is called out so the maintainer can seek more sources for the thinner side or accept the gap knowingly. Discovery looks for the same source classes for every candidate in a contest.

**Why this priority**: The project requires symmetric treatment of candidates. Surfacing asymmetry early avoids a lopsided page discovered only at publish time.

**Independent Test**: Run discovery on a contest where one candidate has far more findable material. Confirm the coverage summary flags the imbalance and that discovery searched the same source classes for each candidate.

**Acceptance Scenarios**:

1. **Given** proposals where one candidate has none, **When** the coverage summary is shown, **Then** that candidate is flagged as having zero proposed sources.
2. **Given** a contest, **When** discovery runs, **Then** the same set of source classes is searched for every candidate in it.

---

### User Story 4 - Run discovery across the whole ballot and re-run later (Priority: P3)

The maintainer can run discovery for every contest on a ballot in one go, see which contests have pending proposals, and re-run discovery later (for example, after a candidate launches a website). A re-run proposes only sources not already registered, rejected, or pending.

**Why this priority**: Convenience and upkeep. Valuable once per-contest discovery works.

**Independent Test**: Run discovery for the whole ballot, review some proposals, re-run, and confirm no duplicates of registered, rejected, or pending entries appear.

**Acceptance Scenarios**:

1. **Given** a ballot with 22 contests, **When** the maintainer runs discovery for the ballot, **Then** each contest gets its own proposed list and a status shows pending counts per contest.
2. **Given** an earlier run, **When** discovery is re-run, **Then** only new URLs are added to the pending list.

---

### Edge Cases

- A proposed URL is unreachable, redirects elsewhere, or is a lookalike or parked domain: it is flagged and shown with the problem noted, never silently dropped or silently accepted.
- Two candidates share a name with unrelated people (namesakes): proposals include enough identifying context (office, party, district) for the maintainer to tell them apart.
- A proposed source is a type that must stay link-only (such as Ballotpedia or Vote411): it is labeled as link-only context and is never fetched for extraction.
- The same URL is proposed for multiple candidates or contests: it appears once per target so each can be accepted or rejected independently.
- Discovery content contains text that tries to give instructions to the system: it is treated purely as data and has no effect on behavior.
- The research service is unavailable or rate limited mid-run: partial results are kept, the failure is reported, and the run can be resumed or repeated.
- A contest is shared between ballots: discovery and review are done once and reused.
- A write-in or candidate with no public presence: shown as "no sources found"; this is acceptable and not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the maintainer run source discovery for a single contest, and for all contests on a ballot.
- **FR-002**: Discovery MUST produce a list of proposed sources, each with URL, proposed source class (which MAY be a class outside the existing set, such as local news or a civic group), proposed evidence tier, target (a specific candidate, or the issue or levy), a short reason for the proposal, and when and how it was found.
- **FR-003**: Proposed sources MUST be held in a separate review queue and MUST NOT be added to any contest's registered source list, fetched for extraction, or shown on the site until a human accepts them.
- **FR-004**: The system MUST let the maintainer review pending proposals one at a time with accept, reject (with optional reason), edit-then-accept, and skip actions, and MUST support quitting and resuming.
- **FR-005**: Accepting a proposal MUST create a registered source entry identical in form to a hand-registered one, recording the reviewer's identity and the time of approval.
- **FR-006**: Rejected URLs MUST be remembered per contest so later discovery runs do not propose them again.
- **FR-007**: A candidate's own website MUST NOT be acceptable until the reviewer explicitly confirms it belongs to that candidate.
- **FR-007a**: Each proposed candidate-owned website MUST be labeled "identity matched" when the site shows the candidate's name and office, and "possible match, not confirmed" otherwise. Both labels MUST be shown to the reviewer, who still must explicitly confirm ownership (FR-007) before acceptance; the label never replaces that confirmation.
- **FR-008**: Discovery MUST apply the same set of source classes to every candidate in a contest, and MUST report coverage per candidate and per class, flagging any candidate with zero proposals and any lopsided coverage.
- **FR-008a**: Accepting a source MUST NOT be blocked or gated by what other candidates in the contest have; asymmetry from candidates having fewer or no sources is expected and is surfaced only through the coverage report (FR-008) and the existing per-contest symmetry report, never "fixed" by restricting or generating content.
- **FR-009**: A candidate or issue with no discoverable sources MUST appear explicitly as "no sources found" in the queue and coverage report.
- **FR-010**: Discovery MUST only propose sources. It MUST NOT summarize, describe, rate, or characterize candidates or issues; any note is limited to why the source was proposed (what it is and what it covers).
- **FR-011**: Content gathered during discovery MUST be treated as untrusted data and MUST NOT be able to alter system behavior or auto-accept, auto-reject, or reorder proposals.
- **FR-012**: Sources that must remain link-only (such as Ballotpedia and Vote411) MUST be proposed, if at all, only as link-only context and MUST NOT be eligible for extraction.
- **FR-012a**: Discovery MAY propose sources of any kind, including those outside the existing source classes. The reviewer MUST assign the final class and tier on accept; a proposal with a class not yet in the system MUST NOT be acceptable until the reviewer picks an existing class and tier (or link-only context) for it.
- **FR-013**: Each proposal MUST be checked for basic validity (reachable, not a redirect to an unrelated domain, not an obviously parked or lookalike domain) and any problem MUST be shown to the reviewer.
- **FR-013a**: Discovery MUST NOT cap the number of proposals per candidate or issue. Because the queue may be long, review MUST present proposals in a consistent order (official records, then candidate-owned sites, then other sources) so the most useful ones come first, and the reviewer MUST be able to stop at any time without losing progress.
- **FR-004a**: During review, the tool MUST show the page's title and a short opening excerpt fetched at review time to help the reviewer judge the proposal. The excerpt MUST be shown only in the terminal, MUST NOT be written to disk or committed, and MUST NOT be usable as a quote or source text for extraction (extraction still uses only stored snapshots of accepted sources).
- **FR-011a**: Discovery MAY use live web search and page browsing by Claude. This permission applies to discovery only; extraction MUST remain tool-less, one source per call. A discovery run MUST be limited to reading the web and emitting structured proposals into the review queue: it MUST NOT be able to modify the source registry, approved fields, other contests' data, or the site, and MUST NOT see any candidate's extracted fields.
- **FR-011b**: Project governance MUST be amended before this feature ships so the constitution's rule that the model must not browse is clarified to permit browsing during discovery only (with the limits in FR-011a), recorded with a version bump and Sync Impact Report.
- **FR-005a**: Accepting a proposal MUST register the source and then automatically fetch it and run extraction on it using the existing fetch and extract behavior and gates, unchanged. The reviewer MUST NOT have to wait for this to finish before reviewing the next proposal.
- **FR-005b**: Automatic fetch and extraction MUST NOT apply to link-only context sources (never fetched). Failures (unreachable, blocked by site rules, extraction dropped) MUST be recorded against the source and shown in the status view, and a single command MUST retry all failed or not-yet-processed accepted sources for a contest or the whole ballot. Extracted fields MUST still go through the existing human field review before publication.
- **FR-014**: Re-running discovery MUST NOT create duplicates of sources that are already registered, rejected, or pending.
- **FR-015**: Discovery and review decisions MUST be logged with timestamp and reviewer identity; the log MUST be sufficient to reconstruct why a source was or was not registered.
- **FR-015a**: The full queue (pending, accepted, and rejected proposals, with reviewer reasons and discovery run records) MUST be stored as committed project data so decisions are auditable and shared across machines. Because rejected URLs and reasons become public, the review step MUST tell the reviewer that reject reasons are published, and reject reasons MUST be limited to neutral, factual statements about the source (for example, "not this candidate" or "dead link") and MUST NOT characterize a candidate.
- **FR-016**: Discovery MUST honor each site's access rules and rate limits, and failures MUST be reported rather than hidden; partial results MUST be kept.
- **FR-017**: A status view MUST show, per contest, the number of pending, accepted, and rejected proposals and any candidates with zero sources.
- **FR-018**: Contests shared across ballots MUST have discovery and review done once and reused.
- **FR-019**: Existing extraction, validation, and review behavior and all existing published data MUST be unaffected by this feature.

### Key Entities

- **Proposed Source**: A candidate source awaiting human decision. Has URL, proposed class and tier, target (candidate or issue), reason, discovery run, validity findings, and a status (pending, accepted, rejected, skipped) with reviewer and time when decided.
- **Discovery Run**: One execution of discovery for a contest, with when it ran, what was searched, what it found, and any failures.
- **Coverage Report**: Per-contest summary of proposals by candidate and source class, with flags for zero or lopsided coverage.
- **Registered Source**: The existing human-approved source entry; the result of accepting a proposal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a typical contest, the maintainer goes from "no sources" to a reviewed, registered source list in under 10 minutes of their own time (compared with the current manual research effort).
- **SC-002**: For at least 90% of candidates with a public web presence, the proposed list includes their official campaign website or an official government or filing record.
- **SC-003**: 100% of proposals reach the registry only through an explicit human accept; zero unreviewed proposals are fetched or published.
- **SC-004**: The maintainer can process a full ballot's discovery (22 contests) in a single run without manual per-contest setup.
- **SC-005**: 100% of contests with proposals show a coverage report before review begins, and every zero-source candidate is flagged.
- **SC-006**: Re-running discovery produces zero duplicate proposals for already registered, rejected, or pending URLs.
- **SC-006a**: After a source is accepted, it is fetched and extracted with no further manual steps; the maintainer never has to run a per-source command, and any failures can be retried for all sources with one command.
- **SC-007**: Existing automated tests for extraction, validation, review, and site build continue to pass unchanged.

## Assumptions

- The maintainer is the only reviewer; approval identity comes from the existing reviewer setting.
- Because discovery lets Claude browse live pages, the feature depends on a constitution amendment (FR-011b), made through the project's constitution workflow, not by this spec.
- Discovery is run on the maintainer's own machine using their existing Claude access, as extraction already is; no new accounts or paid services are required.
- This feature supports the project's rule that discovery may only propose into a review queue; the rule that extraction runs without tools and browsing is unchanged. Discovery is a separate step from extraction.
- Discovery may propose any source, but accepted sources use the existing classes and tiers; this feature adds no new classes. Anything that fits none is accepted only as link-only context or rejected.
- Review is done in the same terminal workflow as existing field review.
- Only the Delaware County precinct 154/1 ballot (22 contests) is in scope for validation; other ballots work through the same data-driven mechanism.
- A proposal's class and tier are suggestions; the reviewer's edits are final.
