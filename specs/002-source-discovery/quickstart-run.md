# Quickstart run record: Source Discovery Queue

Date: 2026-10-06. Claude Code 2.1.291 (`/Users/phil/.local/bin/claude` on PATH), model `claude-sonnet-5-5`.

## Automated

`npm run lint`, `npm run typecheck`, `npm test` (272 tests), `npm run build:site`: all pass. The only change to
the built site is the methodology page's corrected source-selection wording.

## Live discovery: `2026-11-03:us-house:oh-12:unspecified`

Three runs, which shaped the design:

1. **One call for the whole contest**: 4 proposals in 25 s. Safety checks worked (redirect recorded,
   `identity-matched` verified from the page text, Ballotpedia forced to link-only context and not fetched).
   Research was shallow: no FEC pages.
2. **Same, with a stricter prompt**: found Balderson's FEC page but dropped sources the previous run had
   found. Run-to-run variance was too high, and the model returned a URL containing a space (now
   canonicalized in code).
3. **One call per candidate (final design)**: 8 proposals in 55 s. Balderson: FEC candidate page, official
   `balderson.house.gov`, Wikipedia (link-only). Christian: campaign site (`identity matched`), two FEC pages,
   Ballotpedia district page, and an AOL article flagged `unreachable`. The coverage report flagged
   "Troy Balderson: lopsided coverage (3 vs 5)" and did not block anything.

Registry (`data/sources/`) and fields (`data/fields/`) were unchanged by discovery (SC-003).

## Not yet exercised against the live web

- `sources review` (interactive accept/reject with real background fetch + extract): covered by
  `tests/integration/discovery-review-cli.test.ts` with scripted input and stubs only.
- `discover --ballot` across all 22 contests (expected cost: about one call per candidate).
- Candidate-site ownership prompt on a real site.

## Follow-ups

- Balderson's separate campaign site was not found in any run; discovery is best effort, and a missing site
  shows up as a gap in the coverage report rather than being filled in.
- The live proposals and run log are in `data/discovery/proposals/` and `data/logs/discovery-runs.jsonl`,
  uncommitted, for the maintainer to review or discard.
