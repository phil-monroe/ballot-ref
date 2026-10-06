# Quickstart: Source Discovery Queue (validation guide)

Prerequisites: `npm install`, `.env` with `BALLOT_REF_REVIEWER`, `claude` on PATH and logged in, constitution
v1.1.0 present, the Powell J ballot already ingested.

1. **Spike (done 2026-10-06)**: web-only CLI run confirmed (see research R1). Set `model.cli_path: /Users/phil/.local/bin/claude` in `site.config.yaml` if `claude` isn't on PATH.
2. **Discover one contest**: `npx tsx src/cli.ts discover 2026-11-03:us-house:oh-12:unspecified`.
   Expect a proposals file under `data/discovery/proposals/`, a coverage summary, a line in
   `data/logs/discovery-runs.jsonl`, and **no change** to `data/sources/` or `data/fields/` (SC-003).
3. **Coverage**: `... sources coverage <contest-id>` shows both candidates, flags any with zero proposals.
4. **Review**: `... sources review --contest <contest-id>`. Accept one official source, reject one with a
   reason, skip one, quit. Expect: registry has only the accepted entry with your id; rejected is logged;
   skipped remains pending; background fetch and extract ran for the accepted source; extracted fields
   appear as `proposed` for `review next`.
5. **Candidate site guard**: accepting a candidate-site proposal requires typing `y` to the ownership prompt.
6. **Re-run**: run `discover` again. Expect zero duplicate proposals for registered, rejected, or pending URLs
   (SC-006).
7. **Retry**: make a fetch fail (offline), accept a source, then `... process --contest <id>` retries it.
8. **Whole ballot**: `... discover --ballot data/ballots/delaware-154-1.yaml`; `... status` shows pending
   counts per contest.
9. **Regression**: `npm test && npm run typecheck && npm run lint` pass; site build output is unchanged
   (SC-007).
