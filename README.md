# job-radar

**AI-powered job search pipeline** — scan portals, discover who's hiring, evaluate offers, generate tailored resumes, and track applications.

Built by [Victor T. Chevalier](https://github.com/VTChevalier).

## Why

Job searching is broken. You spend hours on forms, lose track of what you applied to, and never know if a listing is even still open. job-radar automates the grunt work so you can focus on the roles that actually matter.

## Features

- **Smart scanner** — adapter registry scans Greenhouse, Ashby, Lever, BambooHR, Teamtailor, Workday APIs + RSS feeds, all in parallel
- **Resume-driven tiering** — reads your resume to determine your seniority level, classifies each posting as current-level, promotion-level, or adjacent; ranking reflects your actual career trajectory, not hardcoded keywords
- **Two-phase pre-screen** — Phase 1 scores all postings instantly from metadata (title fit, relevance, location, source quality); Phase 2 fetches JD snippets in parallel and keyword-scores them; final ranked pick list of up to 20 results
- **Interactive scan flow** — presents scored matches, lets you pick a number to evaluate inline — no URL copy-pasting; pick list refreshes after each evaluation
- **Discovery engine** — finds companies actively hiring for your target roles, tiers them by signal strength and freshness
- **ATS auto-detection** — give it a company name, it figures out which job board they use
- **Resume import** — paste text, point to a PDF, or give a LinkedIn URL — Claude converts it to the right format
- **Bullet bank + tailored resumes** — modular resume system with keyword-tagged bullets, auto-assembled per job description with role-level targeting; enforced writing standards eliminate AI tells, em dash clause separators, hollow qualifiers, and braggy editorializing
- **Skills intelligence** — every evaluation extracts keywords, tracks frequency, reports gaps, and suggests new resume bullets
- **Learn-to-qualify pipeline** — skills you don't have get queued with free training resources, prioritized by market demand
- **Offer evaluation** — weighted scoring across 6 dimensions against your resume
- **Liveness checker** — verifies postings are still open before you waste time
- **Pipeline integrity** — dedup, status normalization, health checks
- **TWC work search log** — generates a Texas Workforce Commission BN900E-faithful activity log; entries grouped by ISO week, 5 per page, per-week PDFs; Week of dates and Required Searches count auto-filled
- **Employer info auto-fetch** — when you confirm an application, company HQ address and phone are looked up and cached automatically so the TWC log is always ready
- **Zero-config setup** — first `/job-radar` command auto-installs everything, detects your OS, no manual steps

## Prerequisites

- [Claude Code](https://claude.ai/code) — the `/job-radar` skill commands run inside it
- Node.js 18+ — auto-installed by the setup script if missing on macOS or Windows
- No API keys required — all job board sources are public APIs

## Quick Start

```bash
git clone https://github.com/DevelopSolutionsLLC/job-radar
cd job-radar
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` — set your location, target roles, work preference, and compensation targets.

Then open [Claude Code](https://claude.ai/code) in this directory:

```
/job-radar resume import    # paste your resume or give it a file path
/job-radar scan             # discover companies → scan portals → pick matches → evaluate
```

Setup (npm deps, Playwright) runs automatically on the first `/job-radar` command.

## Configuration

All configuration lives in `config/profile.yml` (copy from `config/profile.example.yml`). Key fields:

| Field | Description |
|:------|:------------|
| `location` | Your city/region — shown in resume headers |
| `work_arrangement.preference` | `remote`, `hybrid`, `onsite`, or `any` |
| `work_arrangement.home_zip` | Zip code for proximity-based local job tier |
| `work_arrangement.local_radius_miles` | Miles radius for local tier (default: 100) |
| `targets.roles` | Job titles to match (e.g. `Engineering Manager`, `Staff Engineer`) |
| `targets.min_score` | Score threshold for auto-tailor (default: 3.5 / 5) |
| `compensation.min` / `.target` | Salary range for offer evaluation |
| `resume_builder.role_type` | `manager`, `ic`, `director`, or `hybrid` — controls bullet framing |

Company scan targets live in `config/portals.yml` (copy from `config/portals.example.yml`). You rarely edit this directly — use `/job-radar add "CompanyName"` instead.

## Slash Commands

The `/job-radar` skill is the primary interface — run all of these inside Claude Code:

```
/job-radar resume import           # Import your resume (paste, file, or LinkedIn)
/job-radar scan                    # Discover + scan + score → pick → evaluate
/job-radar scan --force            # Force fresh scan, bypass 12h cache
/job-radar scan --dry-run          # Preview only, no writes
/job-radar evaluate                # Score a posting (pick from list, URL, or company name)
/job-radar resume tailor           # Build a tailored resume from your bullet bank
/job-radar resume audit            # Check resume freshness + keyword gaps
/job-radar skills                  # Keyword gaps + study queue (also: gaps, learn)
/job-radar status                  # Pipeline summary
/job-radar check <url>             # Verify a posting is still live
/job-radar list                    # Show current config: companies, roles, feeds, profile
/job-radar add "Anthropic"         # Auto-detect ATS + add company (or role/feed by context)
/job-radar remove "Junior"         # Remove company or exclude role keyword
/job-radar config                  # Setup wizard: location, targets, preferences
/job-radar log                     # Generate TWC BN900E work search activity log
/job-radar donate                  # Support the project
```

## CLI Commands

For direct script access, CI, or debugging — the slash commands above are the normal workflow.

```bash
npm run setup         # First-run setup (auto-runs on /job-radar)
npm test              # Run test suite
npm run scan          # Scan portals for new postings
npm run discover      # Discovery engine — find hiring companies (runs before scan automatically)
npm run resolve -- "<name>"  # Auto-detect a company's ATS
npm run pdf           # Generate resume PDF
npm run verify        # Pipeline health check
npm run log           # Generate TWC BN900E work search log
npm run dedup         # Remove duplicate tracker entries
npm run normalize     # Fix non-canonical statuses
npm run liveness -- <url>    # Check if a posting is still live
npm run donate        # Display donation QR code
```

## How It Works

```
         ┌────────────────────────────────────┐
         │      /job-radar resume import       │
         │    paste / PDF / file / LinkedIn     │
         └────────────────┬───────────────────┘
                          ▼
                 resume.md + career-bank.md
                          │
   ┌────────────┐         │
   │ RSS feeds  │──→ discover.mjs ──→ tier ──→ resolve ATS ──→ portals.yml
   └────────────┘                                                    │
                                                                     ▼
                                             scan.mjs ──→ dedup ──→ scan-cache.json
                                                                     │
                                                         two-phase pre-screen
                                                        (metadata + JD snippets)
                                                                     │
                                         scored pick list (1–20) ←──┘
                                                     │
                                                  evaluate
                                                     │
                                        ┌────────────┴────────────┐
                                        ▼                         ▼
                                 write report               skills gaps
                                        │                         │
                                        ▼                         ▼
                             /job-radar resume tailor      /job-radar skills
                                        │                         │
                                        ▼                         ▼
                               tailored resume + PDF        skills.md
```

## What Gets Generated

All output files are gitignored — only yours, never committed.

| Path | Contents |
|:-----|:---------|
| `reports/` | Evaluation reports (one `.md` per posting scored) |
| `output/` | Tailored resumes + cover letters as `.md`, `.html`, and `.pdf` |
| `data/tracker.md` | Application tracker — status, score, PDF links, notes |
| `data/scan-history.tsv` | Permanent log of every posting ever seen |
| `data/scan-cache.json` | 12-hour scan cache (skip re-fetching on repeat runs) |

## Structure

```
.claude/          Claude Code config — skill definition, settings, CLAUDE.md
config/           Profile + portals (copy from *.example.* to set up)
modes/            Agent instruction files (scan, evaluate, import, tailor, audit, skills)
scripts/          Automation: scanner, discovery, PDF gen, liveness, pipeline tools
scripts/lib/      Shared modules: config, cache, geocode, adapters
data/             Tracker, scan history, cache, skills queue (all gitignored)
reports/          Evaluation reports (gitignored)
templates/        Resume HTML template + TWC log template
output/           Generated PDFs + tailored resumes (gitignored)
```

`modes/` contains the agent instruction files that define how each flow works — they're not user-facing documentation. `.claude/CLAUDE.md` is the operating context for Claude Code, not developer docs.

## Scanner Sources

All ATS platforms use a single adapter registry — adding a new source is one object in `scripts/lib/adapters/`:

| Source | Method | Auth |
|:-----------|:-----------|:-----|
| Greenhouse | REST API   | None |
| Ashby      | REST API   | None |
| Lever      | REST API   | None |
| BambooHR   | REST API   | None |
| Teamtailor | Native RSS | None |
| Workday    | JSON POST  | None |
| iCIMS      | REST API   | None |
| RSS feeds  | Standard RSS | None |

## Contributing

Bug reports and PRs welcome at [github.com/DevelopSolutionsLLC/job-radar](https://github.com/DevelopSolutionsLLC/job-radar/issues).

To add a new ATS adapter: create `scripts/lib/adapters/<name>.mjs` following the existing adapter pattern (export `url()`, `parse()`, optional `method`/`headers`/`body`), then register it in `scripts/lib/adapters/index.mjs`.

## Support

If job-radar helped you land a role, consider buying me a coffee:

**Cash App:** [`$vtchevalier`](https://cash.app/$vtchevalier)

## License

MIT — Victor T. Chevalier
