# Scan Mode

Scan configured portals for new job postings matching the user's target roles.

## Sources (in order of reliability)

1. **API scanners** (Greenhouse, Ashby, Lever) — direct JSON APIs, no auth
2. **RSS feeds** (LinkedIn alerts, Indeed) — user configures alert URLs
3. **Manual paste** — user provides URL or JD text directly

## Process

1. Read `config/portals.yml` for configured sources
2. Run `node scripts/scan.mjs` to fetch from API sources + RSS
3. New matches go to `data/pipeline.md` as pending URLs
4. Dedup against `data/scan-history.tsv`

## After Scan

Show the user how many new postings were found, grouped by source.
Ask if they want to evaluate any immediately.
