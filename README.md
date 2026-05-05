# job-radar

**AI-powered job search pipeline** — scan portals, discover who's hiring, evaluate offers, generate tailored resumes, and track applications.

Built by [Victor T. Chevalier](https://github.com/VTChevalier).

## **Why**

Job searching is broken. You spend hours on forms, lose track of what you applied to, and never know if a listing is even still open. job-radar automates the grunt work so you can focus on the roles that actually matter.

## **Features**

- **Smart scanner** — adapter registry scans Greenhouse, Ashby, Lever, BambooHR, Teamtailor, Workday APIs + RSS feeds, all in parallel
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
/job-radar import resume               # Import your resume (paste, file, or LinkedIn)
/job-radar scan                    # Scan all portals for new postings
/job-radar discover                # Find new companies from RSS feeds
/job-radar discover --fresh        # Sort by newest postings first
/job-radar add company "Anthropic" # Auto-detect ATS + add to scan list
/job-radar add role "Engineer"     # Add to desired roles
/job-radar evaluate <url>          # Score a posting + extract skill gaps
/job-radar tailor <url>            # Build a tailored resume from your bullet bank
/job-radar gaps                    # Show what the market keeps asking for
/job-radar learn                   # Skills to study, ranked by JD frequency
/job-radar status                  # Pipeline summary
/job-radar donate                  # Support the project
```

## **CLI Commands**

```bash
npm run setup         # First-run setup (auto-runs on /job-radar)
npm test              # Run 28-check test suite
npm run scan          # Scan portals for new postings
npm run discover      # Discovery engine — find hiring companies
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
         │      /job-radar import resume       │
         │    paste / PDF / file / LinkedIn     │
         └────────────────┬───────────────────┘
                          ▼
                 resume.md + resume-bullets.md
                          │
   ┌────────────┐         │
   │ RSS feeds  │──→ discover.mjs ──→ tier ──→ resolve ATS
   └────────────┘                                   │
                                                    ▼
      portals.yml ──→ scan.mjs ──→ dedup ──→ pipeline.md
                                                    │
                        evaluate ←── pick a role ←──┘
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
           write report         skills gaps
                  │                   │
                  ▼                   ▼
      /job-radar tailor       /job-radar learn
                  │                   │
                  ▼                   ▼
        tailored resume         skills-queue.md
```

## **Structure**

```
.claude/skills/  /job-radar skill definition (auto-discovered)
config/          Profile, portals, preferences
modes/           Agent instructions (evaluate, scan, tailor, job-radar skill)
scripts/         Automation (scanner, discovery, PDF gen, liveness, pipeline tools)
data/            Tracker, pipeline inbox, scan history, discovered companies, skills queue
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
