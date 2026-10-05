# Quickstart run record (2026-10-05)

What was run against `quickstart.md`, and what could not be.

| Step | Result |
|---|---|
| 1. `npm test` | 33 files, 187 tests pass; no network used by tests |
| 2. `ingest` (live direct fetch, no `--from`) | Fetched the county PDF directly; 17 contests and 5 issues; fixture match; snapshot `5dffac2f054f` byte-identical to the saved reference copy; second run diff empty |
| 3. U.S. Senate slice | **Not run.** Needs the maintainer to register Senate sources (`data/sources/…us-senate…`), a real `ANTHROPIC_API_KEY`, and a person to review fields. The pipeline code and every gate are covered by tests with stub extractors |
| 4. `build` | Builds offline (test run with outbound TCP blocked, zero connection attempts). On real data all 22 items render "Not yet reviewed" (nothing is approved yet); Issue 3 and the four levies have `proposed` official fields awaiting your review |
| 5. `verify`, second precinct | `verify` exits 0 (0 quotes yet). Second-precinct reuse covered by `tests/integration/second-precinct.test.ts` |

Deviations from the plan, recorded here and in `tasks.md`:
- `temperature: 0` is not used: current models (including `claude-sonnet-5-5`) reject any temperature other than 1.0. Safety rests on the gates and human review, not determinism.
- `--paste` manual ballot import is deferred (geometry parsing needs the PDF); `--from file.pdf` is supported.
- Snapshot metadata gained an optional `confirmed_at` so a refetch that finds unchanged content resets the staleness clock without rewriting the immutable body.
- Symmetry excludes `ballot_name` and `party_label` (the parser supplies them for every candidate) and `key_vote`.
