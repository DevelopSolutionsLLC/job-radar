# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI-powered job search pipeline: scan portals, evaluate offers against your resume, generate tailored PDFs, track applications. Agent-driven — no server, no database, everything is files.

Inspired by career-ops (`~/Documents/Claude/career-ops`) but built from scratch with its own identity. File names, feature names, and concepts must not overlap with career-ops. When in doubt, check the career-ops folder before naming anything. job-radar's differentiator is the skills progression loop (gap analysis, resume polish, progression tracking).

## Skill Commands

The primary interface is `/job-radar` — auto-discovered from `.claude/skills/job-radar/SKILL.md`.

```
/job-radar scan                    # Scan all portals for new postings
/job-radar scan --dry-run          # Preview without writing
/job-radar discover                # Find new companies from RSS feeds
/job-radar discover --fresh        # Sort by newest postings first
/job-radar discover --urgent       # Sort by longest-open roles
/job-radar discover --add tier1    # Auto-add tier 1 companies
/job-radar add company "Anthropic" # Detect ATS + add to portals.yml
/job-radar add role "Engineer"     # Add to desired roles
/job-radar remove role "Junior"    # Add to excluded roles
/job-radar import resume               # Import resume (paste, file, or LinkedIn)
/job-radar import resume <path>        # Import from PDF, DOCX, TXT, HTML, MD
/job-radar evaluate <url>          # Score + extract keywords + report gaps
/job-radar tailor <url>            # Auto-assemble tailored resume from bullet bank
/job-radar gaps                    # Show keyword frequency + uncovered gaps
/job-radar learn                   # Show skills queue — what to study next
/job-radar status                  # Pipeline summary
```

## Commands

```bash
npm run setup                      # First-run setup (auto-runs on /job-radar)
npm test                           # 28-check test suite
npm run scan                       # Scan portals for new postings
npm run discover                   # Discovery engine — find hiring companies
npm run resolve -- "<name>"        # Auto-detect a company's ATS
npm run pdf                        # Generate resume PDF (see usage below)
npm run verify                     # Pipeline integrity check
npm run dedup                      # Remove duplicate tracker entries
npm run normalize                  # Fix non-canonical statuses
npm run liveness -- <url>          # Check if a posting is still live
```

PDF generation requires two args: `node scripts/generate-pdf.mjs <input.html> <output.pdf>`

Liveness checker exit codes: 0 = ACTIVE, 1 = CLOSED, 2 = UNKNOWN

Scanner flags: `--dry-run`, `--force`, `--cached`, `--source <type>` (greenhouse, ashby, lever, etc.)

Scan results are cached to `data/scan-cache.json` for 24 hours. Repeat scans use cached data. `--force` bypasses cache. `--cached` returns cache without scanning (for Claude to read the pick list).

Cache fields: `new_postings` (postings not previously seen in scan-history), `all_postings` (full compatible pool — all title-filtered postings with relevance ≥ 2 and compatible !== false, sorted by relevance desc). The post-scan interactive flow uses `all_postings` so the pick list always shows the full ranked pool, not just the handful of genuinely new postings on a repeat scan.

Discovery flags: `--dry-run`, `--top N`, `--fresh`, `--urgent`, `--add tier1|all`

## Prerequisites

Handled automatically by `scripts/setup.mjs` — runs on first `/job-radar` command. Detects OS, installs npm deps, Playwright chromium, and copies config examples. If Node.js itself is missing, it detects the package manager and either installs it or tells the user the one command to run.

Manual: `npm run setup`

## Architecture

ESM-only project (`"type": "module"` in package.json). Two dependencies: `js-yaml`, `playwright`.

**Pipeline flow:** URL → fetch JD → evaluate per `modes/evaluate.md` + `resume.md` → write report → generate tailored resume → update tracker

**Mode files** (`modes/`) are prompt instructions the AI agent reads at runtime. They define the evaluation rubric, resume tailoring rules, scan workflow, and the `/job-radar` skill command system. The agent follows these as its operating instructions — they are not code.

**Scanner architecture:** Adapter registry pattern — each ATS type (greenhouse, ashby, lever, bamboohr, teamtailor, workday, rss) is a plain object with `url()`, `parse()`, and optional `method`/`headers`/`body`. One `scanSource(type, entry)` function drives all adapters. Concurrency-limited (10 parallel), 10s fetch timeout.

**Discovery engine:** RSS feeds → filter by role → extract company names → score by hiring signal + freshness → tier 1/2/3. `resolve-ats.mjs` auto-detects ATS type from company name or URL.

**Key directories:**
- `modes/` — agent instruction files (evaluate, generate-resume, scan, job-radar)
- `config/` — profile.yml (user identity/targets), portals.yml (scanner config)
- `scripts/` — all automation (ESM, `.mjs` files)
- `data/` — tracker.md, pipeline.md, scan-history.tsv, companies.md
- `reports/` — evaluation reports
- `output/` — generated PDFs (gitignored)
- `templates/` — Resume HTML template

## Data Files

- `resume.md` — canonical CV (copy from `resume.example.md`, gitignored)
- `resume-bullets.md` — bullet bank with keyword-tagged sections for tailored resume generation (gitignored)
- `data/skills-queue.md` — learn-to-qualify pipeline: skills to study, prioritized by JD frequency (gitignored)
- `config/profile.yml` — copy from `config/profile.example.yml` (gitignored)
- `config/portals.yml` — copy from `config/portals.example.yml` (gitignored)

Document length rules:
- Tailored resumes must be no more than 2 pages.
- Tailored cover letters must be no more than 3/4 of a page.

**PDF rule:** Generate PDFs automatically at the end of every tailor command — do not wait for approval. PDFs are always the last step. If any edit is made to an HTML file after PDF generation, regenerate the PDF immediately. Never leave an HTML and its PDF out of sync.

**Location rule:** Never change or infer locations when tailoring. Copy all location fields (header and per-role) exactly as they appear in `resume.md`. Do not substitute "Remote", "Remote (TX)", or any variation — use the original city/state text verbatim.

## Writing Standards

Every resume and cover letter produced by this pipeline must meet the bar a top-tier professional resume writer would set for a senior candidate targeting Apple, Google, Microsoft, Meta, or equivalent. The candidate is not desperate — they are desirable. The writing must reflect that.

### Resume Bullets

**Structure:** Action verb → what/how → result or scale. Every bullet earns its place with specificity.

**Bullet counts per role (hard limits):**
- Current role: 4 bullets max
- All prior roles: 3 bullets max
- Blend two bullets into one when they prove a stronger combined point or together address a skill gap — a tight blended bullet beats two thin separate ones
- Never pad to hit the limit; never exceed it

**Required:**
- Lead with a strong past-tense action verb (current role uses present tense): Built, Shipped, Led, Drove, Reduced, Increased, Designed, Established, Negotiated, Rebuilt, Scaled
- Quantify wherever possible: headcount, budget, client count, time saved, percentage improvement, revenue impact, scale (users, endpoints, requests)
- One idea per bullet, fully formed
- Prefer specific nouns over vague categories: "Tenable, Qualys, Rapid7" not "security tools"; "10-person" not "a team"

**Forbidden:**
- "Responsible for" — rewrite as an action
- "Helped", "assisted with", "contributed to" — own it or cut it
- "Various", "several", "multiple" — use the actual number
- "Leveraged" — say what you did with it
- "Passionate about", "results-driven", "proven track record" — show, don't tell
- "Etc." — name them or stop the list
- Passive voice when active is possible
- Stylistic flourishes that read as AI: echo structures ("not as X, as Y"), rhetorical contrasts ("the right kind"), self-congratulatory editorializing ("that most teams never achieve")

### Cover Letters

**Voice:** Peer-to-peer. The reader is a senior leader evaluating a candidate who has options. Write like someone who belongs in the room, not someone hoping to get in.

**Required:**
- Open with the result or the situation — never "I am applying for" or "I am excited to"
- Every sentence must carry signal: a number, a named technology, a concrete outcome
- Confident close — not "I would be grateful", not "I look forward to hearing from you"
- If there's a skills gap, one direct sentence bridges it — no paragraph dedicated to self-apologizing

**Forbidden:**
- "I am excited/thrilled/honored to apply"
- "I believe I could", "I hope to", "I think I might" — hedge language
- "I look forward to hearing from you" — cliché
- "Thank you for your time/consideration"
- Any sentence that could apply to any company or any job
- Restating the resume in prose form

## Tracker Schema (data/tracker.md)

The tracker is a markdown table. **Column order matters** — scripts index by position:

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|-------|---|---|---|---|---|---|---|---|---|
| Column | # | Date | Company | Role | Score | Status | PDF | Report | Notes |

- **Score format:** `X.X/5` or `N/A` (enforced by `verify-pipeline.mjs`)
- **Report links:** `[label](reports/NNN-slug-date.md)` — verified against filesystem
- **Dedup key:** company + role (case-insensitive)

### Canonical Statuses

Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP

The normalize script maps common variants (e.g., "submitted" → Applied, "expired" → Discarded, "interviewing" → Interview).

## Report Naming Convention

`reports/{num}-{company-slug}-{date}.md`

## Scanner Sources

All sources use the adapter registry in `scripts/scan.mjs`:

1. **Greenhouse** — `boards-api.greenhouse.io` JSON API
2. **Ashby** — `api.ashbyhq.com` REST API
3. **Lever** — `api.lever.co` JSON API
4. **BambooHR** — `{company}.bamboohr.com/careers/list`
5. **Teamtailor** — native RSS at `{company}.teamtailor.com/jobs.rss`
6. **Workday** — JSON POST to `myworkdayjobs.com`
7. **RSS feeds** — WeWorkRemotely, HN Jobs, rss.app proxies for LinkedIn/Indeed
8. **Manual paste** — user provides URL directly

Scan results go to `data/pipeline.md` as pending items. `data/scan-history.tsv` has 6 columns with a header row: `url`, `first_seen`, `source`, `title`, `company`, `status`. Dedup is by URL + company+role pair.

## Discovery Engine

`scripts/discover.mjs` scans RSS feeds, extracts company names, and tiers them:

- **Tier 1** (score 5+) — multiple roles + fresh posting
- **Tier 2** (score 3-4) — good match
- **Tier 3** (score 1-2) — worth a look

Scoring: role count (+1/2/3), keyword variety (+1 per extra), freshness (<24h = +2, <7d = +1), urgency (>30d open = +1).

`data/companies.md` tracks discovered companies with status: suggested, added, skipped, applied.

## Resume Template

`templates/resume-template.html` uses `{{PLACEHOLDER}}` syntax: `{{NAME}}`, `{{EMAIL}}`, `{{LOCATION}}`, `{{LINKS}}`, `{{SUMMARY}}`, `{{EXPERIENCE}}`, `{{PROJECTS}}`, `{{EDUCATION}}`, `{{SKILLS}}`.

## Evaluation Scoring

Six weighted dimensions (defined in `modes/evaluate.md`):
- Role Fit (2x), Skills Match (2x), Compensation (1.5x), Company & Culture (1x), Location & Remote (1x), Growth Potential (0.5x)

Each scored 1–5, overall = weighted average on a 1–5 scale.

## Project Board

https://github.com/orgs/DevelopSolutionsLLC/projects/1 ("DevelopSolutions Dev")

## GitHub Repo

https://github.com/DevelopSolutionsLLC/job-radar (public)
