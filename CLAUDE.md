# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI-powered job search pipeline: scan portals, evaluate offers against your resume, generate tailored PDFs, track applications. Agent-driven — no server, no database, everything is files.

Inspired by career-ops (`~/Documents/Claude/career-ops`) but built from scratch with its own identity. File names, feature names, and concepts must not overlap with career-ops. When in doubt, check the career-ops folder before naming anything. job-radar's differentiator is the skills progression loop (gap analysis, resume polish, progression tracking).

## Skill Commands

The primary interface is `/job-radar` — auto-discovered from `.claude/skills/job-radar/SKILL.md`.

```
/job-radar scan                    # Auto-discover companies + scan portals → pick matches → evaluate
/job-radar scan --force            # Force fresh scan, bypass cache
/job-radar scan --dry-run          # Preview without writing
/job-radar resume import           # Import resume (paste, file, or LinkedIn)
/job-radar resume import <path>    # Import from PDF, DOCX, TXT, HTML, MD
/job-radar resume tailor           # Auto-assemble tailored resume from bullet bank
/job-radar resume audit            # Check resume freshness + keyword gaps
/job-radar evaluate                # Score a posting (pick from list, URL, or company name)
/job-radar status                  # Pipeline summary
/job-radar check <url>             # Verify a posting is still live
/job-radar skills                  # Keyword gaps + study queue (also: /job-radar gaps, /job-radar learn)
/job-radar list                    # Show current config: companies, roles, feeds, profile
/job-radar add "Anthropic"         # Detect ATS + add company, or add role/feed by context
/job-radar remove "Junior"         # Remove company or exclude role
/job-radar config                  # Full setup wizard (location, targets, preferences)
```

## Commands

```bash
npm run setup                      # First-run setup (auto-runs on /job-radar)
npm test                           # Test suite: syntax checks, config validation, file existence (no unit tests)
npm run scan                       # Scan portals for new postings
npm run discover                   # Discovery engine — find hiring companies
npm run resolve -- "<name>"        # Auto-detect a company's ATS
npm run pdf                        # Generate resume PDF (see usage below)
npm run verify                     # Pipeline integrity check
npm run dedup                      # Remove duplicate tracker entries
npm run normalize                  # Fix non-canonical statuses
npm run liveness -- <url>          # Check if a posting is still live
npm run donate                     # Display donation QR code
node scripts/test-rss.mjs          # Test RSS feed connectivity (run standalone, not part of npm test)
node scripts/read-cache.mjs        # Inspect scan cache: freshness, count, top postings as JSON (--top N, --find <query>)
```

PDF generation requires two args: `node scripts/generate-pdf.mjs <input.html> <output.pdf>`

Liveness checker exit codes: 0 = ACTIVE, 1 = CLOSED, 2 = UNKNOWN

Scanner flags: `--dry-run`, `--force`, `--cached`, `--source <type>` (greenhouse, ashby, lever, etc.)

Scan results are cached to `data/scan-cache.json` for 12 hours. Repeat scans use cached data. `--force` bypasses cache. `--cached` returns cache without scanning (for Claude to read the pick list).

Cache fields: `new_postings` (postings not previously seen in scan-history), `all_postings` (full compatible pool — all title-filtered postings with relevance ≥ 2 and compatible !== false, sorted by relevance desc). The post-scan interactive flow uses `all_postings` so the pick list always shows the full ranked pool, not just the handful of genuinely new postings on a repeat scan.

**Tier sort order:** Across all tiers (T1, T2, T3), title proximity to the candidate's current position is the primary sort key. Sort within each tier: current-level titles first, promotion-level second, other/adjacent third. Relevance score breaks ties within each band.

**Pick list layout:** Up to 20 entries in four fixed groups — 5 T1 (named company, right seniority), 5 T2 (named company, any title), 5 T3 (discovery/RSS), 5 Local (postings within `local_radius_miles` of `home_zip`). No overflow cascade between remote tiers. If `home_zip` is not set or no local postings found, the 4th group is omitted and the total is 15. Local entries are sorted by `distanceMiles` ascending (closest first).

**Pre-screen:** After displaying the pick list, the skill offers to fetch all shown JD URLs in parallel (up to 20), score each with the 6-dimension weighted system (score-only — no report written, no tracker updated), and re-display the list with ✓ (≥ min_score) / ✗ indicators.

Discovery flags: `--dry-run`, `--top N`, `--fresh`, `--urgent`, `--add tier1|all`

## Prerequisites

Handled automatically by `scripts/setup.mjs` — runs on first `/job-radar` command. Detects OS, installs npm deps, Playwright chromium, and copies config examples. If Node.js itself is missing, it detects the package manager and either installs it or tells the user the one command to run.

Manual: `npm run setup`

## Architecture

ESM-only project (`"type": "module"` in package.json). Two dependencies: `js-yaml`, `playwright`.

**Pipeline flow:** URL → fetch JD → evaluate per `modes/evaluate.md` + `resume.md` → write report → generate tailored resume → update tracker

**Skill vs modes:** `.claude/skills/job-radar/SKILL.md` is the skill entrypoint — it defines the `/job-radar` command interface and dispatch logic. `modes/` contains the runtime instruction files the agent reads during execution (evaluate, generate-resume, scan, job-radar). These are not code — they are agent operating instructions.

**Scanner architecture:** Adapter registry pattern — each ATS type (greenhouse, ashby, lever, bamboohr, teamtailor, workday, rss) is a plain object with `url()`, `parse()`, and optional `method`/`headers`/`body`. One `scanSource(type, entry)` function drives all adapters. Concurrency-limited (10 parallel), 10s fetch timeout.

**Discovery engine:** RSS feeds → filter by role → extract company names → score by hiring signal + freshness → tier 1/2/3. `resolve-ats.mjs` auto-detects ATS type from company name or URL.

**Key directories:**
- `.claude/skills/job-radar/` — skill entrypoint (`SKILL.md`)
- `modes/` — agent runtime instruction files (evaluate, generate-resume, scan, job-radar)
- `config/` — profile.yml (user identity/targets), portals.yml (scanner config)
- `scripts/` — all automation (ESM, `.mjs` files)
- `data/` — tracker.md, scan-history.tsv, scan-cache.json, companies.md
- `reports/` — evaluation reports
- `output/` — generated PDFs (gitignored)
- `templates/` — Resume HTML template
- `assets/` — static assets (e.g. QR code image for donate)

## Pre-approved Tool Allowlist

`.claude/settings.json` pre-approves common Bash calls (all `node scripts/*.mjs` invocations, `npm install`, `npm test`, `npx playwright install chromium`) so they run without a permission prompt. When adding new scripts, add a corresponding entry there.

## Data Files

- `resume.md` — canonical CV (copy from `resume.example.md`, gitignored)
- `career-bank.md` — bullet bank, summary paragraphs, and keyword frequency tracker for tailored resume generation (gitignored). Structure: numbered Summary paragraphs (1–5, role-type keyed), per-role bullet sections with `<!-- tags: keyword1, keyword2 -->` comments for keyword matching, and a Keyword Frequency Tracker table (`Keyword | Count | Last Seen`). Summaries are indexed by role type: 1=Manager+Security, 2=Manager+Platform/Product, 3=Director/VP, 4=IC/Staff, 5=AI/ML.
- `data/skills.md` — learn-to-qualify pipeline: skills to study, prioritized by JD frequency (gitignored). Columns: `Skill | JD Count | Resource | Est. Time | Status | Started | Completed`. Status values: `not started`, `in progress`, `done`. Priority derived at display time from JD Count: High ≥ 6, Medium 3–5, Low < 3.
- `data/last-audit.txt` — ISO timestamp of the last resume audit; created/updated by the skill; triggers reminder if older than 7 days (gitignored)
- `data/session-pick-list.json` — session-scoped pick list with pre-classified tier buffers; written on first scan, read on subsequent scans in the same session (skips full tiering); cleared on "skip"; gitignored
- `config/profile.yml` — copy from `config/profile.example.yml` (gitignored). Key fields: `location`, `work_arrangement.preference` (remote/hybrid/onsite/any), `work_arrangement.home_zip` (zip code used for proximity-based local tier detection), `work_arrangement.local_radius_miles` (cities within this radius appear as local; default 100), `work_arrangement.max_commute_miles` (for hybrid/onsite preference filtering only), `targets.roles`, `targets.min_score`, `compensation.min/target`, `preferences.deal_breakers`, `resume_builder.role_type` (manager/ic/director/hybrid — controls bullet framing during tailoring).
- `data/geocode-cache.json` — persistent cache of Nominatim geocoding results (city name → lat/lon); populated on first scan with `home_zip` set, near-instant on subsequent scans; gitignored.
- `config/portals.yml` — copy from `config/portals.example.yml` (gitignored)

Document length rules:
- Tailored resumes must be no more than 2 pages.
- Tailored cover letters must be no more than 3/4 of a page.

**PDF rule:** Generate PDFs automatically at the end of every tailor command — do not wait for approval. PDFs are always the last step. If any edit is made to an HTML file after PDF generation, regenerate the PDF immediately. Never leave an HTML and its PDF out of sync.

**Location rule:** Never change or infer locations when tailoring. Copy all location fields (header and per-role) exactly as they appear in `resume.md`. Do not substitute "Remote", "Remote (TX)", or any variation — use the original city/state text verbatim.

## Writing Standards

Every resume and cover letter produced by this pipeline must meet the bar a $400/hr professional resume editor would set for a senior candidate targeting Apple, Google, Microsoft, Meta, or equivalent. The output must read like a human professional wrote it. There must be zero tells that AI produced it. The candidate is not desperate — they are desirable. The writing must reflect that.

Before finalizing any cover letter or resume, self-audit against the AI-tell checklist below. If any item fires, rewrite that sentence.

### AI-Tell Checklist (apply to every cover letter and resume bullet before output)

**Punctuation tells — prohibited:**
- Em dashes "—" used as inline clause separators. Use a comma, semicolon, or rewrite the sentence. Em dashes in resumes for company/date formatting are fine; em dashes splitting a sentence in half are not.
- Parenthetical asides set off by em dashes: "a subscription sports media product — one that has to survive at scale — is exactly..."

**Structural tells — prohibited:**
- Narrative-frame openers: "The engineering story is...", "The X problem is...", "What X is building is..."
- Wisdom/insight openers that read as domain commentary rather than candidate facts: "Building X requires more than Y", "When X happens, Y happens", "X is harder than it looks" — if the first sentence of a cover letter could open a blog post or think-piece, rewrite it as a specific result or situation from the candidate's actual work
- Hollow qualifiers: "more than the usual X", "exactly the kind of X", "the best possible way", "in all the right ways", "exactly where I want to operate", "exactly what X needs"
- Pithy one-liner paragraph closers: "The race is the truth-teller.", "That's the job.", "That feedback loop matters.", "That feedback loop is where I do my best work.", "That's where I do my best work.", "Moving from X to Y is the work I'm signing up for.", "Building the runtime is the work I'm here to do." — any declarative sentence that closes a paragraph with a performance flourish instead of a fact
- Scene-setter openers followed by a colon: "The scope here is compelling: ...", "The challenge here is [adjective]: ..." — hollow framing that says nothing about the candidate; cut the opener and start with the substance
- Mechanical parallel triplets that feel constructed, not spoken: "serve a deeply engaged audience, compete on experience, and survive at scale"
- Mechanical expertise-proof triplets assembled to project authority: "I know how X works, what Y needs, and where Z fails" — three perfectly parallel knowledge claims read as template output, not as human writing
- "treating X with the same Y as Z" constructions
- "rather than" contrast used more than once per document
- "where the line between X and Y was deliberately blurred" — blog-post framing for a dual role; state what the role actually was
- "a bias toward X over Y" as a standalone self-description sentence — a cliché in every engineering cover letter; show the preference through a specific decision or result instead
- Near-duplicate bullets in the same role: two bullets that describe the same project, the same framework, or share 5+ consecutive words are a quality failure — blend into one or cut the weaker one
- Any sentence that reads like it was assembled from a template

**Tone tells — prohibited:**
- Braggy editorializing: "unforgiving in the best possible way", "moves faster or gets out of the way", "that most teams never achieve"
- Self-congratulatory framing that the reader would never say out loud about themselves
- Clever observations about the company's product that read as performance ("your audience knows immediately when the app is slow")
- Time-compression clichés: "reducing X to days", "quarters to days", "made months into days" — these sound invented; state the actual before/after metric or cut the claim
- Robotic logistics-acknowledgment: "The comp range works.", "The pay range works.", "The range works for me.", "Remote works.", "Remote works, and 10% travel is fine." — no professional says this out loud; omit entirely or fold into the closing naturally if truly needed
- Fabricated experience: Never invent claims not in resume.md. Cover letters especially — agents have fabricated GovCloud experience, green-field/brown-field migrations, and governance frameworks the candidate never claimed. Every factual claim in a cover letter must trace to a specific line in resume.md. If the JD mentions a technology or environment the candidate has no experience with, omit it — do not invent it.
- Repeating the same tic phrase across multiple letters: "I'd rather name that directly", "paper over it", "I won't pretend otherwise" — each is fine once; appearing in more than one document in a session makes it a recognizable AI pattern

**Test:** Read each sentence aloud. If it sounds like a TED Talk, a LinkedIn post, or a ChatGPT output, rewrite it as plain declarative prose.

### Resume Tailoring

**Role completeness (non-negotiable):** Never omit a role from the candidate's timeline when tailoring. Every role in `resume.md` must appear in every tailored resume. If space is tight, reduce bullets to the per-role minimum (1 bullet); never cut an entire role. The complete work history must be present.

### Resume Bullets

**Structure:** Action verb → what/how → result or scale. Every bullet earns its place with specificity.

**Bullet counts per role (hard limits):**
- Current role: 4 bullets max
- All prior roles: 3 bullets max
- Blend two bullets into one when they prove a stronger combined point or together address a skill gap. A tight blended bullet beats two thin ones.
- Never pad to hit the limit; never exceed it

**Required:**
- Lead with a strong past-tense action verb (current role uses present tense): Built, Shipped, Led, Drove, Reduced, Increased, Designed, Established, Negotiated, Rebuilt, Scaled
- Quantify wherever possible: headcount, budget, client count, time saved, percentage improvement, revenue impact, scale (users, endpoints, requests)
- One idea per bullet, fully formed
- Prefer specific nouns over vague categories: "Tenable, Qualys, Rapid7" not "security tools"; "10-person" not "a team"
- Use commas and periods. No em dash clause separators inside bullets.

**Forbidden:**
- "Responsible for" — rewrite as an action
- "Helped", "assisted with", "contributed to" — own it or cut it
- "Various", "several", "multiple" — use the actual number
- "Leveraged" — say what you did with it
- "Passionate about", "results-driven", "proven track record" — show, don't tell
- "Etc." — name them or stop the list
- Passive voice when active is possible
- AI structural patterns: "treating X with the same Y as Z", "rather than waiting on", echo structures ("not as X, as Y"), rhetorical contrasts ("the right kind")
- Em dashes splitting a bullet into two halves — rewrite as one clean sentence

### Cover Letters

**Voice:** Peer-to-peer. The reader is a senior leader evaluating a candidate who has options. Write like someone who belongs in the room, not someone hoping to get in. Every sentence is plain, direct, and specific. No performance. No flourish.

**Required:**
- Open like an email: salutation "Hello," on its own line/paragraph, then the body starts in the next paragraph with "My name is Victor Chevalier and I'm reaching out about the [exact role title] at [Company]." That intro sentence is followed in the same paragraph by a sentence grounding the reader in Victor's relevant prior experience. Never open cold with a fact, domain observation, or "I am excited to."
- Every sentence must carry signal: a number, a named technology, a named company, a concrete outcome
- Confident, short close: use an affirmative, forward-looking opener ("Looking forward to connecting.") followed by a brief sign-off thank-you. No more than three sentences total. End with a name-only sign-off ("Victor"). Acceptable closing thank-yous: "Thanks for your time.", "Thanks for reading.", "Appreciate the time." — short and casual, not ceremonial.
- Never acknowledge gaps, shortcomings, or missing credentials. Do not name what you don't have. Name only what you bring.
- Vary sentence length. Short sentences after long ones. No three-sentence stretch of identical structure.
- Every cover letter HTML file must include a contact header immediately after `<body>`: `<div class="contact">Victor Chevalier · vtchevalier@proton.me · 512.765.5740</div>` with `.contact { font-size: 9pt; color: #555; margin-bottom: 16px; }` in the style block.

**Forbidden:**
- "I am excited/thrilled/honored to apply"
- "I believe I could", "I hope to", "I think I might" — hedge language
- "I look forward to hearing from you" — cliché
- "Thank you for your time and consideration" or any multi-word ceremonial variant — use the short casual form instead ("Thanks for your time.")
- Any sentence that could appear in a cover letter for a different company without editing
- Restating the resume in prose form
- Em dashes as clause separators anywhere in the letter
- Narrative frames: "The X story is...", "What X is building is...", "The X problem is..."
- Hollow qualifiers and braggy editorializing (see AI-Tell Checklist above)
- Pithy one-liners at paragraph ends
- Mechanical parallel lists that feel assembled rather than written

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

## Output Naming Conventions

Reports: `reports/{num}-{company-slug}-{date}.md`

Tailored resumes (4 files each): `output/resume-tailored-{company-slug}-{date}.{md,html,pdf}`

Cover letters (4 files each): `output/cover-letter-{company-slug}-{date}.{md,html,pdf}`

PDFs are always the last step. HTML and PDF must stay in sync — regenerate PDF any time the HTML changes.

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

`data/scan-history.tsv` has 6 columns with a header row: `url`, `first_seen`, `source`, `title`, `company`, `status`. Dedup is by URL + company+role pair. Full ranked pool is saved to `data/scan-cache.json`.

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

## Issue Backlog

`WORKPLAN.md` tracks the current issue backlog, recommended work order, and known bugs. Check it before starting any script work.

## Project Board

https://github.com/orgs/DevelopSolutionsLLC/projects/1 ("DevelopSolutions Dev")

## GitHub Repo

https://github.com/DevelopSolutionsLLC/job-radar (public)
