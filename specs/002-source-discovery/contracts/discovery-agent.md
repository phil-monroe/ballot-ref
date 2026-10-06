# Contract: Discovery agent

Interface (`src/discovery/agent.ts`):

```ts
interface DiscoveryAgent {
  readonly provider: string; readonly model: string;
  discover(input: DiscoveryInput): Promise<DiscoveryOutput>;
}
```

## Input (the only data the agent sees)

`contest_title`, `office/kind`, `jurisdiction`, `election_date`, and for each candidate: `entity_id`,
`ballot_name`, `party_label`. For issues and levies: title and taxing entity name. No registry contents, no
extracted fields, no snapshots, no other contests.

## Task template (same for every candidate in a contest)

For each candidate, look for: (1) official records (county BOE, Ohio SOS, FEC, Congress, Ohio legislature,
county auditor); (2) the candidate's own campaign website; (3) other relevant pages. For issues: sponsor or
entity pages and official government pages. Report what was searched. Propose only; do not describe,
rate, or characterize anyone.

## Output (JSON schema enforced by the CLI and re-validated by Zod)

```json
{
  "results": [{
    "entity_id": "troy-balderson | null",
    "url": "https://...",
    "class_guess": "ohio-boe|ohio-sos|fec|congress|ohio-legislature|county-auditor|candidate-site|sponsor-site|other",
    "tier_guess": "official|says|done|context",
    "reason": "string, max 160 chars, what the source is and covers",
    "site_shows_name_and_office": true
  }],
  "searched": [{ "entity_id": "string|null", "topic": "string" }]
}
```

A candidate absent from `results` is recorded as "no sources found" by code, not by the agent (FR-009).

## Isolation (asserted by contract test)

Args include only web tools (`WebSearch`, `WebFetch`); `--strict-mcp-config` with empty config;
`--setting-sources ""`; `--disable-slash-commands`; `--no-session-persistence`; empty temp cwd; model and
`prompt_version` pinned from `site.config.yaml` (`prompt_versions.discovery: v1`). The test fails if any
other tool name appears. Output text containing instructions has no effect because only the validated JSON
is consumed.
