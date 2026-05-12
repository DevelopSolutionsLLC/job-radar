# Scan Mode

Scan configured portals for new job postings matching the user's target roles.

## Quick start

Use `/job-radar scan` or `/job-radar discover` — see `modes/job-radar.md` for all commands.

## Sources (adapter registry)

All ATS types are handled through a single adapter pattern in `scripts/scan.mjs`:

1. **Greenhouse** — `boards-api.greenhouse.io` JSON API
2. **Ashby** — `api.ashbyhq.com` REST API
3. **Lever** — `api.lever.co` JSON API
4. **BambooHR** — `{company}.bamboohr.com/careers/list`
5. **Teamtailor** — native RSS at `{company}.teamtailor.com/jobs.rss`
6. **Workday** — JSON POST to `myworkdayjobs.com` endpoint
7. **RSS feeds** — WeWorkRemotely, HN Jobs, rss.app proxies

## Process

1. Read `config/portals.yml` for configured sources
2. Run `node scripts/scan.mjs` to fetch all sources in parallel (10 concurrent)
3. Filter by title (positive/negative keywords)
4. Dedup by URL and company+role pair against `data/scan-history.tsv`
5. New matches written to `data/scan-history.tsv`; full ranked pool saved to `data/scan-cache.json`

## CLI flags

```bash
node scripts/scan.mjs                  # scan all sources
node scripts/scan.mjs --dry-run        # preview without writing
node scripts/scan.mjs --source lever   # scan only Lever boards
```

## After scan

Show the user how many new postings were found, grouped by source.
Ask if they want to evaluate any immediately or run discovery for new targets.
