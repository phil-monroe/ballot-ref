# Data Model: Ballot Reference

Types are described as Zod-validated shapes (all objects strict: unknown keys rejected). IDs are stable strings.

## Election
- `id` (e.g. `2026-11-03-general`), `date`, `type` (`general|primary|special`)

## Contest (canonical, shared across ballots)
- `id`: `<election>:<office>:<jurisdiction/district>:<term>`, e.g. `2026-11-03:us-senate:oh:special-2029`
- `kind`: `candidate | judicial | constitutional-issue | levy`
- `office`/`title`, `jurisdiction`, `term` (text as printed), `vote_for` (integer)
- `options[]` (ordered):
  - Candidate option: `id`, `ballot_name`, `party_label` (as printed or null), `order`, `write_in` (bool), `incumbent` (bool|null, only if verifiable), `ticket_id` (null, or shared id for Governor/Lt. Governor tickets)
  - Ticket: `ticket_id`, `order`, `persons[]` (each a candidate option with role `governor|lieutenant-governor`)
  - Issue option: `YES|NO` or `FOR|AGAINST` as printed
- `ballot_text` (issues only): title, sponsor/entity, full official text, parsed from the ballot snapshot
- `ballot_snapshot_hash`, `ballot_page`

## Ballot
- `county`, `precinct_code`, `precinct_name`, `election`, `source` (URL config: county slug, election code, precinct code), `contests[]` (ordered refs to Contest ids as printed)
- Validation: every ref resolves to a Contest file; order matches the parsed ballot

## Source (registry entry, per contest and optionally per entity)
- `url` (or URL prefix/pattern), `domain_class` (`ohio-boe|ohio-sos|fec|congress|ohio-legislature|county-auditor|candidate-site|sponsor-site`), `tier` (`official|says|done|context`), `entity_id` (optional), `redistributable` (bool), `whitelisted_by`, `whitelisted_at`, `notes`
- `context` tier sources are link-only and are never fetched for extraction

## Snapshot
- `sha256`, `url`, `retrieved_at`, `content_type`, `method` (`direct|playwright|manual`), `redistributable`, `body_path` (public or private dir), `text_path` (extracted plain text)
- Metadata JSON always committed; body committed only if `redistributable`

## Field
- `contest_id`, `entity_id`, `field_key`, `slot` (integer for repeated slots such as priorities 1–3, or null)
- `value` (typed per `field_key`), `quote` (<= 25 words by default), `source_url`, `source_hash`, `retrieved_at`
- `tier` (copied from the Source entry), `status` (`proposed|approved|rejected|edited`), `reviewer`, `reviewed_at`
- `extractor`: `{kind: "model", model, prompt_version}` or `{kind: "parser", name, version}` (ballot parser) or `{kind: "manual"}`
- `author` (argument-for/against fields only: who wrote the argument, as quoted from the official source)
- `needs_rereview` (bool)

### Field keys by contest kind
- **candidate** (also each person in a ticket): `ballot_name` (official), `party_label` (official), `campaign_website`, `priority` (slots 1–3, `says`), `office_held` / `prior_office` (official), `finance_raised`, `finance_spent`, `finance_period_end` (`done`)
- **incumbent addendum**: `key_vote` (repeated, `done`, same bill set for all with a record)
- **judicial**: `ballot_name`, `current_office`, `bar_admission` (official only), `campaign_website`
- **constitutional-issue**: `ballot_language`, `official_explanation`, `argument_for` (+author), `argument_against` (+author), `effect_yes`, `effect_no` (only if quotable), `current_law` (official source only)
- **levy**: `taxing_entity`, `levy_type` (`renewal|additional|replacement|decrease|renewal-and-increase|renewal-and-decrease|sales-use-tax`), `millage`, `duration`, `purpose`, `auditor_estimated_cost_per_100k`, `auditor_estimated_annual_collection`, `sponsor_materials` (`says`), `official_text_link`

## Report (generated, committed)
- **Symmetry**: per contest, matrix candidate × slot → filled/empty, counts, flags, `acknowledged_by`, `acknowledged_at`
- **Status**: per source, last fetch outcome (ok / retried / failed / blocked / manual), errors
- **Drops**: each dropped field with reason (`quote-not-substring`, `quote-too-long`, `source-not-whitelisted`, `schema`, `entity-mismatch`)
- **Unverifiable-here**: fields whose snapshot body is not present in the current checkout
- **Ballot diff**: added/removed/changed contests and options between ingestions

## State transitions
- Field: `proposed → approved | rejected | edited`; `approved|edited → needs_rereview` when its source changes (still displayed from its original snapshot until cleared)
- Contest readiness: `ready` iff all fields reviewed, symmetry acknowledged (and not invalidated by later changes), no stale snapshots, no `needs_rereview`
- Snapshot: immutable once written; a changed source creates a new snapshot
