# Contributing

## Reporting an error in the reference

Every field on the site has a **Report an error** link. It opens a new GitHub issue pre-filled with the
contest, candidate, field, and page. Please say what is wrong and link the source that shows the correct
information. You need a GitHub account to file an issue; corrections are tracked publicly.

A report can be about:
- a quote that does not appear in the cited source,
- a field attributed to the wrong person (a namesake),
- a source that should be added to a contest's whitelist,
- a contest that is missing or out of order compared with the official ballot.

## Ground rules for changes

The rules in [`.specify/memory/constitution.md`](.specify/memory/constitution.md) are not negotiable:

- The model extracts; it never writes descriptions. Do not add free-text fields to schemas.
- Every displayed claim has a verbatim quote from a stored snapshot. Do not weaken or bypass the quote, whitelist, schema, entity, symmetry, or staleness gates, and do not add a flag that does.
- Coverage differences between candidates are surfaced by the symmetry report, never filled with generated text.
- No endorsements, ratings, scores, news summaries, trackers, or analytics.
- Do not commit third-party page copies (`data/snapshots/private/`) or credentials.

Run `npm run lint && npm run typecheck && npm test` before opening a pull request.
