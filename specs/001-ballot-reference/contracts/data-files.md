# Contract: Data files

All files are validated by Zod on load; unknown keys are errors. Paths are relative to the repo root.

- `data/ballots/<county>-<precinct>.yaml`: `county`, `precinct_code`, `precinct_name`, `election`, `ballot_source {county_slug, election_code, precinct_code}`, `contests: [contest-id, ...]` in official order. Adding a precinct is adding one of these files; no code changes.
- `data/contests/<contest-id>.yaml`: canonical contest (see data-model.md). The `:` in IDs is stored as `__` in filenames.
- `data/sources/<contest-id>.yaml`: list of Source entries, each with `url`, `domain_class`, `tier`, `entity_id?`, `redistributable`, `whitelisted_by`, `whitelisted_at`, `notes`.
- `data/snapshots/<public|private>/<sha256>.txt|.html|.pdf` plus `data/snapshots/meta/<sha256>.json` (always committed).
- `data/fields/<contest-id>/<entity-id>.json`: `{ fields: Field[] }`.
- `data/logs/*.jsonl`: append-only; one JSON object per line with timestamp.
- `data/reports/*.json`: generated.
- `site.config.yaml`: `repo_url`, `quote_max_words` (25), `stale_days` (7), `symmetry_threshold` (2), `priorities_per_candidate` (3), `key_vote_count` (10), `model {provider, id}`, `prompt_versions`, `rate_limit_seconds`, `user_agent`.

Invariants checked in CI: every ballot contest ref resolves; every committed `approved|edited` field has a `source_hash` with metadata present; no non-redistributable snapshot body is tracked; no `proposed` field is referenced by the build.
