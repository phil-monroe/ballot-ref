# Contract: Published site

- **URLs**: `/` (links only to configured ballots, unlisted), `/b/<county>-<precinct>/` (one page per ballot), `/b/<county>-<precinct>/#<contest-slug>` deep links, `/methodology/`.
- **Ballot page**: contests in official ballot order; each contest shows options in ballot order using one layout. Joint tickets render one ballot choice containing two person blocks with identical slots. Write-in lines render as printed with no slots.
- **Field display**: value, quote, source link, tier badge (`official|says|done`), retrieved date, reviewed date, "Report an error" link (GitHub new-issue URL pre-filled with contest, entity, field, page URL). `context` links appear only as links.
- **States**: approved field; "Not found in whitelisted sources."; contest-level "Not yet reviewed" (no fields shown).
- **Footer**: Vote411, county BOE ballot viewer, and SOS issue report links per issue.
- **Methodology page**: what the tool does and does not do, tier definitions, whitelist rules, review process, key-vote rule and N, symmetry threshold, known gaps (generated from unpublished contests), correction method (GitHub Issues), not described as a "nonpartisan guide".
- **Privacy and indexing**: no analytics, no third-party requests, no client-side tracking; `noindex` meta on every page, `X-Robots-Tag: noindex` header file, `robots.txt` disallow.
- **Quality**: mobile-first layout, print stylesheet, works without JavaScript. A build test asserts no external URLs other than outbound `<a href>` links.
