# Quickstart: validating the feature end to end

Prerequisites: Node.js 24, `npm install`, an Anthropic API key in `ANTHROPIC_API_KEY` (extraction only), `BALLOT_REF_REVIEWER` set to your name.

## 1. Tests (no network)
```
npm test
```
Expect: quote-validator negative cases (paraphrase, altered word, wrong source) rejected; symmetry fails on `fixtures/synthetic/lopsided`; injection and namesake fixtures neutralized; ballot parser reproduces `fixtures/powell-j/expected.json` (17 contests, 5 issues).

## 2. Ingest the Powell J ballot
```
ballot-ref ingest data/ballots/delaware-154-1.yaml
```
Expect: 17 contests and 5 issues, zero manual edits, raw ballot snapshot stored, ballot diff report empty on first run. If fetch is blocked, rerun with `--from specs/001-ballot-reference/reference/powell-j-ballot-2026-11-03.pdf`.

## 3. U.S. Senate vertical slice
```
ballot-ref sources check 2026-11-03:us-senate:oh:special-2029
ballot-ref fetch 2026-11-03:us-senate:oh:special-2029
ballot-ref extract 2026-11-03:us-senate:oh:special-2029
ballot-ref validate 2026-11-03:us-senate:oh:special-2029
ballot-ref review next
ballot-ref review symmetry 2026-11-03:us-senate:oh:special-2029
ballot-ref status
```
Expect: snapshots written (private for candidate sites), proposed fields with quotes, drops logged, symmetry matrix shown, readiness `ready` only after all fields reviewed and symmetry acknowledged.

## 4. Build and inspect the site (offline)
```
ballot-ref build   # run with the network disabled
```
Open `site/dist/b/delaware-154-1/`. Expect: all 22 items in ballot order; Senate contest shows approved fields with quote, source link, tier badge, dates; other contests labeled "Not yet reviewed"; no external requests; `noindex` present.

## 5. Verify and second precinct
```
ballot-ref verify
```
Expect: zero mismatches; any source lacking a local body listed as "unverifiable here". Add a second `data/ballots/*.yaml` with shared statewide contests, run `ingest` and `build`: shared contests reuse approved fields and no `extract` runs.
