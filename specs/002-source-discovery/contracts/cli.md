# Contract: CLI additions

All commands honor `--json`, `--reviewer` / `BALLOT_REF_REVIEWER`, and the existing exit codes
(0 ok, 1 validation, 2 usage/config, 3 retrieval needing manual action).

| Command | Purpose | Notes |
|---|---|---|
| `discover <contest-id>` | Run discovery for one contest and write new proposals to the queue | Prints coverage summary on completion. Partial results are kept on failure; exit 3 if the agent or network failed. |
| `discover --ballot <ballot-config>` | Run discovery for every contest on a ballot, one contest at a time | Shared contests discovered once (FR-018). Continues past a failed contest and reports it. |
| `sources coverage <contest-id>` | Show proposals per candidate x class group, with zero/lopsided flags | Read-only. Also printed before review starts. |
| `sources review [--contest id]` | Interactive review: accept / reject / edit / skip / quit | Order per R8. Shows excerpt in-terminal only. Candidate-site accept asks "Confirm this site belongs to <name>, <office>? [y/N]". Reject warns that reasons are published. Accept registers then processes in the background. |
| `process [--contest id\|--all]` | Fetch and extract every accepted source not yet fetched or extracted | Retry path for failures (FR-005b). Reuses `fetch` and `extract` code. |
| `status [--contest id]` | Extended with per-contest pending/accepted/rejected counts, zero-source candidates, and processing failures | FR-017 |

## Review actions

| Key | Effect |
|---|---|
| `a` | Accept as proposed (asks ownership confirmation for candidate sites) |
| `e` | Edit class, tier, target entity, then accept. `other` class must be changed or tier left `context`. |
| `r` | Reject with optional neutral reason |
| `s` | Skip for this session |
| `q` | Quit; waits for background processing to finish and prints its summary |

Accepting writes a registry entry `{ url, domain_class, tier, entity_id?, redistributable, whitelisted_by,
whitelisted_at, notes }`, then appends a Decision log line, then enqueues processing. Link-only
(`tier: context`) accepts are registered but never fetched.
