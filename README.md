# job-radar

**AI-powered job search pipeline** — scan portals, discover who's hiring, evaluate offers, generate tailored resumes, and track applications.

Built by [Victor T. Chevalier](https://github.com/VTChevalier).

## **Why**

Job searching is broken. You spend hours on forms, lose track of what you applied to, and never know if a listing is even still open. job-radar automates the grunt work so you can focus on the roles that actually matter.

## **Features**

- **Smart scanner** — adapter registry scans Greenhouse, Ashby, Lever, BambooHR, Teamtailor, Workday APIs + RSS feeds, all in parallel
- **Interactive scan flow** — scan ranks the full posting pool into three tiers based on your resume, presents 15 best matches, lets you pick a number to evaluate inline — no URL copy-pasting
- **Resume-driven tiering** — Claude reads your resume to determine your seniority level, then classifies each posting as current-level, promotion-level, or adjacent. The ranking reflects your actual career trajectory, not hardcoded keywords.
- **Discovery engine** — finds companies actively hiring for your target roles, tiers them by signal strength and freshness
- **ATS auto-detection** — give it a company name, it figures out which job board they use
- **Resume import** — paste text, point to a PDF, or give a LinkedIn URL — Claude converts it to the right format
- **Bullet bank + tailored resumes** — modular resume system with keyword-tagged bullets, auto-assembled per job description with role-level targeting
- **Skills intelligence** — every evaluation extracts keywords, tracks frequency, reports gaps, and suggests new resume bullets
- **Learn-to-qualify pipeline** — skills you don't have get queued with free training resources, prioritized by market demand
- **Offer evaluation** — weighted scoring across 6 dimensions against your resume
- **Liveness checker** — verifies postings are still open before you waste time
- **Pipeline integrity** — dedup, status normalization, health checks
- **Zero-config setup** — first `/job-radar` command auto-installs everything, detects your OS, no manual steps
- **Skill commands** — `/job-radar` slash commands so you never touch YAML or raw scripts

## **Quick Start**

Open [Claude Code](https://claude.ai/code) in this directory and run any `/job-radar` command — setup is automatic. No manual install steps needed.

The `/job-radar` skill command is the primary interface:

```
/job-radar resume import           # Import your resume (paste, file, or LinkedIn)
/job-radar scan                    # Auto-discover companies + scan portals → pick → evaluate
/job-radar scan --force            # Force fresh scan, bypass 12h cache
/job-radar evaluate                # Score a posting (pick from list, URL, or company name)
/job-radar resume tailor           # Build a tailored resume from your bullet bank
/job-radar resume audit            # Check resume freshness + keyword gaps
/job-radar skills                  # Keyword gaps + study queue
/job-radar status                  # Pipeline summary
/job-radar check <url>             # Verify a posting is still live
/job-radar list                    # Show current config: companies, roles, feeds, profile
/job-radar add "Anthropic"         # Auto-detect ATS + add company (or role/feed by context)
/job-radar remove "Junior"         # Remove company or exclude role
/job-radar config                  # Setup wizard: location, targets, preferences
/job-radar donate                  # Support the project
```

## **CLI Commands**

For direct script access, CI, or debugging — the skill commands above are the normal workflow.

```bash
npm run setup         # First-run setup (auto-runs on /job-radar)
npm test              # Run test suite
npm run scan          # Scan portals for new postings
npm run discover      # Discovery engine — find hiring companies (runs before scan automatically)
npm run resolve       # Auto-detect a company's ATS
npm run pdf           # Generate resume PDF
npm run verify        # Pipeline health check
npm run dedup         # Remove duplicate tracker entries
npm run normalize     # Fix non-canonical statuses
npm run liveness      # Check if a posting is still live
```

## **How It Works**

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
                              pick from ranked list (1–15) ←────────┘
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

## **Structure**

```
.claude/skills/  /job-radar skill definition (auto-discovered)
config/          Profile, portals, preferences
modes/           Agent instructions (evaluate, scan, tailor, job-radar skill)
scripts/         Automation (scanner, discovery, PDF gen, liveness, pipeline tools)
data/            Tracker, scan history, scan cache, discovered companies, skills queue
reports/         Evaluation reports
templates/       Resume template (HTML)
output/          Generated PDFs + tailored resumes (gitignored)
```

## **Scanner Sources**

All ATS platforms use a single adapter registry — adding a new source is one object:

| Source | Method | Auth |
|:-----------|:-----------|:-----|
| Greenhouse | REST API   | None |
| Ashby      | REST API   | None |
| Lever      | REST API   | None |
| BambooHR   | REST API   | None |
| Teamtailor | Native RSS | None |
| Workday    | JSON POST  | None |
| RSS feeds  | Standard RSS | None |

## **Support**

If job-radar helped you land a role, consider buying me a coffee:

<a href="https://cash.app/$vtchevalier"><img src="assets/qr-cashapp.png" alt="Cash App QR code" width="200"></a>

**Cash App:** [`$vtchevalier`](https://cash.app/$vtchevalier)

## **License**

MIT — Victor T. Chevalier
