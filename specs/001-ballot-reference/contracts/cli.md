# Contract: Command-line interface

Binary: `ballot-ref` (all commands idempotent and resumable; `--json` on any command prints machine-readable output).

| Command | Purpose | Notes |
|---|---|---|
| `ingest <ballot-config> [--from file.pdf\|--paste file.txt]` | Fetch the official ballot (direct, then Playwright, then manual), snapshot it, parse to Contest/Ballot files | Exits non-zero if parsed output mismatches `expected` when a fixture is configured; prints ballot diff vs previous run |
| `sources check <contest-id>` | Validate the registry file for a contest | Reports non-whitelisted or missing entries |
| `fetch <contest-id> [--refetch]` | Fetch whitelisted sources, honor robots.txt and rate limit, write snapshots | Failures go to the status report; `--refetch` marks changed sources and sets `needs_rereview` |
| `import <source-url> <file>` | Manual import of pasted text or PDF as a snapshot | Records `method: manual` |
| `extract <contest-id> [--entity id]` | Run schema-constrained extraction, one snapshot and one entity per call | Writes `proposed` fields; drops are logged with reasons |
| `validate <contest-id>` | Run all gates (quote, length, whitelist, schema, entity) and the symmetry report | Never "fixes" values; exit code 1 if any gate failed |
| `review next [--contest id]` | Show the next `proposed` field with highlighted quote context, source link; approve / reject / edit | Edits require reviewer id and re-run validation |
| `review symmetry <contest-id>` | Show and acknowledge the symmetry report | Acknowledgment invalidated by later field changes |
| `status [--contest id]` | Readiness per contest, stale snapshots, unverifiable sources, retrieval failures | |
| `verify` | Best-effort whole-site quote re-verification | Exit 0 unless a present snapshot mismatches; lists "unverifiable here" |
| `build` | Generate the static site from `data/` (no network) | Includes only `approved|edited` fields; warns on stale snapshots; blocks contests not ready (they render "Not yet reviewed") |

Exit codes: 0 ok; 1 validation or verification failure; 2 usage/config error; 3 retrieval failure requiring manual action.
Reviewer id comes from `--reviewer` or `BALLOT_REF_REVIEWER`.
