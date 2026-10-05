# Ballot Reference

A **sourced reference** for specific Ohio precinct ballots. For every contest and issue on a ballot it
shows short, verbatim quotes from pre-approved sources, each labeled with the kind of evidence it is and
approved by a person before anyone sees it. It does not recommend, rate, score, or summarize, and it is
not a "nonpartisan guide."

First target: Nov 3, 2026 General Election, Delaware County precinct 154/1 (Powell City J).

## How it works

```
ingest ballot -> resolve contests -> source registry -> fetch + snapshot
   -> extract -> validate -> review -> build static site
```

- A language model only **extracts** structured fields from one stored source at a time. It never writes prose.
- Every field carries a quote that is a **literal substring of the stored snapshot** (whitespace-only normalization), at most 25 words.
- Levy and issue wording comes from the official ballot PDF by deterministic parsing, never a model.
- Sources are human-registered per contest before anything is fetched. Fetched text is untrusted data.
- Nothing is published until a human approves each field; per-contest symmetry reports are acknowledged before a contest is ready.
- The site builds offline from `data/`, is unlisted and `noindex`, and has no analytics or third-party requests.

The governing rules are in [`.specify/memory/constitution.md`](.specify/memory/constitution.md); the
full spec, plan, contracts, and task list are in [`specs/001-ballot-reference/`](specs/001-ballot-reference/).

## Setup

```sh
npm install
cp .env.example .env     # ANTHROPIC_API_KEY (extraction only), BALLOT_REF_REVIEWER
npm test
```

Node.js 24 or newer. Edit `site.config.yaml` (set `repo_url` to this repository so "Report an error"
links open GitHub issues here).

## Commands

Run with `npx tsx src/cli.ts <command>` (or the `ballot-ref` bin). Add `--json` for machine-readable output.

| Command | What it does |
|---|---|
| `ingest <ballot-config> [--from file.pdf]` | Fetch (direct, Playwright, then manual) and parse the official ballot; propose official issue/levy fields |
| `sources check <contest-id>` | Validate a contest's source registry |
| `fetch <contest-id> [--refetch]` | Fetch whitelisted sources into snapshots (robots.txt honored, rate limited) |
| `import <source-url> <file>` | Manually import a whitelisted source (text, HTML, PDF) |
| `extract <contest-id> [--entity id]` | Schema-constrained extraction; failures are dropped and logged, never repaired |
| `validate <contest-id>` | Re-run every gate and write the symmetry report |
| `review next [--contest id]` | Approve / reject / edit proposed fields |
| `review symmetry <contest-id> [--ack]` | Show, or acknowledge, the symmetry report |
| `status [--contest id]` | Readiness, stale snapshots, unverifiable sources, retrieval failures |
| `verify` | Best-effort whole-site quote re-verification |
| `build` | Build the static site into `site/dist/` (no network) |

Exit codes: 0 ok, 1 validation or verification failure, 2 usage or config error, 3 retrieval failure needing manual action.

## Adding a ballot

Add `data/ballots/<county>-<precinct>.yaml` (see `data/ballots/delaware-154-1.yaml`) and run `ingest`.
No code changes. Contests shared with an existing ballot are reused, with their approved fields.

## Snapshot policy (open source)

Snapshots of **government and public-record sources** (such as the official ballot) are committed under
`data/snapshots/public/`. Snapshots of candidate sites and other third-party pages are kept in
`data/snapshots/private/` (gitignored) and backed up privately; only their metadata and SHA-256 are
committed. `verify` checks every quote whose snapshot is present and lists the rest as "unverifiable
here" without failing. The extraction, validation, and review gates still require the local snapshot.
`scripts/check-private-snapshots.sh` (also run in CI) refuses any tracked third-party body.

## Corrections

Use the "Report an error" link on any field, or open an issue on this repository. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Visibility

The published site is meant for a small private circle: it is unlisted, sends `noindex` headers and
meta tags, and disallows crawlers. Before sharing more broadly or adding any editorial framing, check
Ohio political-communication disclaimer rules (this project is not legal advice).
