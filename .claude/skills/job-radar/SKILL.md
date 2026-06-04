---
name: job-radar
description: "Job search pipeline: scan portals, evaluate postings, tailor resume, track skills gaps, manage companies and roles"
user_invocable: true
args: subcommand
argument-hint: |
  scan                  Scan portals (cached 12h, pick from results)
  scan --force          Force fresh scan, bypass cache
  scan --dry-run        Preview without writing
  resume import         Import your resume (paste, PDF, file, LinkedIn)
  resume tailor         Build a tailored resume (pick from list, URL, or name)
  resume audit          Check resume freshness + keyword gaps
  evaluate              Score a posting (pick from list, URL, or company name)
  status                Pipeline summary
  check <url>           Verify a posting is still live
  skills                Keyword gaps + study queue
  list                  Show current configuration (companies, roles, profile)
  add "name or title"   Add a company, role title, or RSS feed URL
  remove "name"         Remove a company or exclude a role title
  config                Full setup wizard (location, targets, preferences)
  log                   Generate styled HTML + PDF application log
  donate                Support the project
  help                  Show all commands
---

# /job-radar — Job Search Pipeline

## Before anything: first-run check

Before executing ANY subcommand, silently run `node scripts/setup.mjs` and check the output:

1. **If the script can't run** (e.g., `node` not found), detect the OS and handle per platform:

   - **macOS + Homebrew** (`which brew` succeeds): attempt `brew install node` via Bash — user will see a permission prompt and can approve it directly. No sudo needed.
   - **macOS without Homebrew**: print the following and stop:
     ```
     Node.js isn't installed. Install Homebrew first, then re-run /job-radar:

         /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

     Or paste it here with:  ! /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
     ```
   - **Windows** (`where winget`, `where choco`, or `where scoop` succeeds): attempt the install via Bash — user will see a permission prompt and can approve directly.
   - **Windows without a package manager**: print the following and stop:
     ```
     Node.js isn't installed. Download and run the installer from:

         https://nodejs.org
     ```
   - **Linux/WSL** (`which apt`, `which dnf`, `which pacman`, or `which nix-env` found): do NOT attempt via Bash (requires sudo). Print the appropriate command and stop:
     ```
     Node.js isn't installed. Run this, then re-run /job-radar:

         sudo apt update && sudo apt install -y nodejs npm   # Debian/Ubuntu/WSL

     Or paste it directly here with:  ! sudo apt update && sudo apt install -y nodejs npm
     ```
     Substitute the correct command for the detected package manager (dnf, pacman, nix-env).
   - **Linux with no known package manager**: direct to nodejs.org and stop.

2. **After node is confirmed**, the setup script auto-handles: `npm install`, Playwright chromium, config file copies. These all run without prompting.

3. **If `resume.md` doesn't exist AND `firstRun` is true** — stop immediately after showing the welcome message (step 8). Do not proceed to the profile check, configure wizard, or the requested command. The welcome block already directs the user to `/job-radar resume import`; add nothing more here.

   **If `resume.md` doesn't exist AND `firstRun` is false** (returning user who deleted their resume) — mention it naturally *after* the command: "Your resume file is missing — run `/job-radar resume import` to restore it." Don't block unless the subcommand specifically requires a resume (tailor, evaluate, skills).

4. **Profile completeness check** — After setup, read `config/profile.yml` and check for these required fields:
   - `location` — must be set (not blank, not the example value "City, State/Country")
   - `work_arrangement.preference` — must be one of: `remote`, `hybrid`, `onsite`, `any`
   - `work_arrangement.max_commute_miles` — required only when preference is `hybrid` or `onsite`

   **If any required field is missing AND the subcommand is `scan`, `discover`, or `configure`:**
   Interrupt before running the command and say:
   > "Before we scan, let me grab a couple of quick preferences — takes 30 seconds."
   Then run the **Configure Wizard** (`modes/configure.md`), save the results, and proceed to the original command.

   **For all other subcommands** (evaluate, tailor, status, etc.): proceed silently.

5. **Resume audit reminder** — Silently read `data/last-audit.txt`. If it's missing or older than 7 days, set a flag to append a one-line reminder after the current command completes:
   > "Your resume hasn't been audited in {N} days — run `resume audit` when you have a moment."
   Don't block. Don't show it more than once per session.

6. **Skills queue check-in** — Silently read `training/skills.md`. If it exists and has any rows where `Status` is `in progress`, or `not started` with a `Started` date set, set a flag to show the following prompt **after the current command completes** (once per session, non-blocking):

   > "You have {N} skill(s) in progress — quick check-in before you go?
   > - Kubernetes (~2 weeks) — in progress since May 6
   > - Apache Spark (~20 hrs) — not started
   >
   > Type "yes" to update statuses, or "skip" to continue."

   If the user says yes, for each item ask: "Have you completed [skill]? (yes / still going / not yet)"
   - **yes** → set `Status` to `done`, set `Completed` to today's date. Offer to promote to resume (see **Promote skill to resume** in `modes/skills.md`).
   - **still going / not yet** → no change

   If the user says skip, do nothing. Do not show this prompt again in the same session.

7. **Skills bootstrap** — Silently check `training/skills.md`. If it exists but has no data rows AND `career-bank.md` exists with keyword frequency tracker entries where Count ≥ 3:
   - Identify all keywords with Count ≥ 3 that have no matching tag in any bullet section of `career-bank.md`
   - For each gap: add a row to `training/skills.md` with `JD Count`, `Resource = —`, `Est. Time = —`, `Status = not started`, `Started = —`, `Completed = —`
   - Sort rows by JD Count descending
   - After the current command completes, show one quiet line: "Seeded your skills list with {N} gaps from your JD history — run `/job-radar skills` to review."
   - Skip if: `career-bank.md` doesn't exist, no keywords with Count ≥ 3, or `training/skills.md` already has data rows.

8. **First-run welcome** — If the setup JSON output includes `"firstRun": true` (no scan history yet), show this message and **stop** — do not proceed to the profile check, configure wizard, or the requested command. The user must import their resume before anything else runs.

   ```
   Welcome to job-radar! Here's how to get started:

     1. Import your resume        /job-radar resume import
     2. Configure your profile    /job-radar config
     3. Scan for open roles       /job-radar scan

   Run /job-radar help at any time to see all commands.

   To get started, paste your resume below — or share a file path or URL (.md, .pdf, .docx, .txt, or a LinkedIn profile URL).
   ```

   Do not show this message again once `data/scan-history.tsv` exists.

Only show setup output if something actually needed to be installed or configured. If everything was already ready, proceed silently.

## Command routing

Parse the user's subcommand and execute accordingly.

If no subcommand is given (user just types `/job-radar` or `/job-radar help`), print this command reference:

```
/job-radar — Job Search Pipeline

  Scan & Discover
    scan                       Auto-discover companies + scan portals → pick matches → evaluate
    scan --force               Force fresh scan
    scan --dry-run             Preview only

  Resume
    resume import              Import resume (paste, PDF, file, LinkedIn)
    resume tailor              Build a tailored resume
    resume audit               Check resume freshness + keyword gaps

  Evaluate & Apply
    evaluate                   Score a posting (pick from list, URL, or name)
    status                     Pipeline summary
    check <url>                Verify a posting is still live

  Skills
    skills                     Keyword gaps + study queue

  Configure
    list                       Show current configuration (companies, roles, profile)
    add "name or title"        Add a company, role title, or RSS feed URL
    remove "name or title"     Remove a company or exclude a role title
    config                     Full setup wizard (location, targets, preferences)

  Other
    log                        Generate styled HTML + PDF application log (output/)
    donate                     Support the project
    help                       Show this list
```

## Commands

### Discovery & Scanning

`scan` and `discover` are one unified flow. Discovery always runs **before** scan so newly found companies are included in the same scan run.

**Scan UX rules:** Do NOT narrate which bash commands you are running. Do NOT echo raw script output. Show only human-readable progress:
- Fresh scan: `"Discovering companies..."` before discover.mjs, then `"Scanning {N} portals..."` before scan.mjs
- Cached scan: `"Loading your last scan..."` before running read-cache.mjs

After scripts finish, go directly to the post-scan pick list. No summaries, no script headers.

**Full scan flow and post-scan interactive flow → `modes/scan.md`**

### Resume hub

All resume-related commands route through `resume`:

- `/job-radar resume import` → Import the user's resume into `resume.md`. **→ `modes/import.md`**
- `/job-radar resume import <path>` → Import from a specific file (PDF, DOCX, TXT, HTML, MD).
- `/job-radar resume tailor` → Tailor a resume for a specific role. **→ `modes/generate-resume.md`**
- `/job-radar resume audit` → Run the resume audit flow. **→ `modes/audit.md`**

### Configuration

#### List

`/job-radar list` → Read `config/portals.yml` and `config/profile.yml` and print a human-readable summary. No YAML, no file paths — just the values.

Format:

```
Configuration summary

  Target roles (positive)   engineer, manager, director, lead, principal
  Excluded keywords         intern, junior, contractor, recruiter

  Companies tracked         42 total
    Greenhouse              18  (Anthropic, Stripe, Figma +15 more)
    Ashby                    9  (Linear, Notion, Vercel +6 more)
    Lever                    7  (Greenhouse, ... +4 more)
    BambooHR                 4
    Teamtailor               2
    Workday                  2

  RSS feeds                  3
    WeWorkRemotely, HN Jobs, rss.app/...

  Profile
    Location                Austin, TX
    Work preference         remote
    Target roles            Senior Manager, Director of Engineering
    Min score               3.5
    Compensation            $150,000 min / $200,000 target
```

Rules:
- Show the first 3 company names per ATS type, then "+N more" if there are more.
- Omit any section or field that is empty or not set.
- Format compensation as "$X min / $Y target"; omit if not set in profile.
- If `config/profile.yml` doesn't exist yet, show only the portals summary and add: "Run `/job-radar config` to set up your profile."

#### Add and remove

**Smart `add`** — detect context automatically from the argument:

- `/job-radar add <value>` → Detect what to add:
  - URL (starts with `http`) → add as an RSS feed to portals.yml
  - Contains a role keyword (`Engineer`, `Manager`, `Director`, `Lead`, `Staff`, `Principal`, `Architect`, `Developer`, `Analyst`, `Designer`, `Scientist`, `Specialist`) → add as a role to `title_filter.positive`
  - Otherwise → treat as a company name, run `node scripts/resolve-ats.mjs "<value>"` and add to portals.yml
- `/job-radar add company "<name>"` / `add role "<title>"` / `add feed <url>` → Explicit variants

**Smart `remove`:**

- `/job-radar remove <value>` → Contains a role keyword → add to `title_filter.negative`; otherwise → remove company from portals.yml
- `/job-radar remove company "<name>"` / `remove role "<title>"` → Explicit variants

#### Configure Wizard

`/job-radar configure` or `/job-radar config` → **→ `modes/configure.md`**

### Pipeline

- `/job-radar evaluate <url or number>` → If URL provided, use it directly. If a pick-list number is given: use URL from current scan session context if available; otherwise run `node scripts/read-cache.mjs --top 150`. If a company/role name: run `node scripts/read-cache.mjs --find "<name>"` (returns max 5 matching postings). Never read `data/scan-cache.json` directly — it can exceed 1,000 entries.

  Read `modes/evaluate.md`, fetch the JD, score against `resume.md`, write evaluation report to `reports/`. Extracts keywords, updates the frequency tracker in `career-bank.md`, reports skills gaps.

  After evaluation, run the **Post-Evaluate Gap Check** below. If score ≥ `targets.min_score`, automatically proceed to the full tailor flow (resume + cover letter + PDFs + open URL) without asking. If score < `targets.min_score`, add to tracker as Discarded and offer to pick another.

#### Post-Evaluate Gap Check

After writing the evaluation report, extract the Gaps list from the Skills Gap section of the report. If there are no gaps, skip silently.

For each gap keyword:
1. Use WebSearch to find the best free (or near-free) training resource.
2. Estimate time to learn honestly (< 1 week, 1–4 weeks, 1–3 months, 3+ months).

Present gaps grouped by effort. Full branching rules and framing → `modes/skills.md`.

When the user selects items to add to the skills queue:
- Add rows to `training/skills.md`: Skill, JD Count (from career-bank.md tracker or 1 if new), Resource (URL), Est. Time, Status = `not started`, Started = `—`, Completed = `—`
- If skill already exists (case-insensitive): increment JD Count, update Resource if better — no duplicate rows

#### Auto-fetch employer info on apply

When the user confirms they applied (status → Applied), silently check `data/company-info.json` for the company name (case-insensitive). If the entry is missing or has `address: PLACEHOLDER`:

1. Use WebSearch to find the company's headquarters address, city, state, zip, and main phone number.
2. Write the entry to `data/company-info.json` without prompting:
   ```json
   "CompanyName": {
     "address": "123 Main St",
     "city": "City",
     "state": "ST",
     "zip": "12345",
     "phone": "(555) 555-5555",
     "website": "https://company.com"
   }
   ```
3. If the WebSearch returns no reliable HQ address, write `"address": "PLACEHOLDER"` and move on. Do not block or prompt.

This runs silently — show no output to the user. The data is only needed the next time `log` is run.

- `/job-radar status` → Show pipeline summary from `data/tracker.md`: counts of evaluated, applied, interviewed, offered, rejected. If `data/scan-cache.json` exists, show how many postings are available and when the cache was last updated.

- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Skills

**→ `modes/skills.md`**

`/job-radar skills` (also accepts `/job-radar gaps` or `/job-radar learn`): two-part view — keyword frequency gaps from `career-bank.md`, then study queue from `training/skills.md`. After showing both, offer to update statuses or add gap keywords to the queue.

### Support

- `/job-radar donate` → Print the donate block below directly as text output (do NOT run it via Bash). Output this exactly:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thanks for using job-radar!

 ▄▄▄▄▄▄▄ ▄ ▄▄▄▄▄ ▄ ▄▄▄▄▄▄▄
 █ ▄▄▄ █ ▀▀█ ▄▄█ ▀ █ ▄▄▄ █
 █ ███ █ ▄▄█ ▀█▀▀▄ █ ███ █
 █▄▄▄▄▄█ █ ▄ █▀█ ▄ █▄▄▄▄▄█
 ▄▄▄  ▄▄ █▄█▄█  ▄ ▄▄▄▄  ▄▄
 █ ▀ ██▄▀▄▀▀█▀▄▀██▄█▀ █▄▀█
 ▄   ▄ ▄▀▄█  ▄  ▄ ▀▄▄ ▀  ▄
 ▄█▄▀▄▄▄▄▄▄ ██ ▄█▀██▀ ▄▄▀█
 ▄▄█▄▄ ▄▀  █ █ ▀▄▄████▀ ▄
 ▄▄▄▄▄▄▄ ▀█ █▀█▄ █ ▄ █   █
 █ ▄▄▄ █ ▀█▀▄▄  ██▄▄▄█  ▀
 █ ███ █ ▄▀▄██▄  ▀█ ▄█▄▀█▄
 █▄▄▄▄▄█ ████▀ ▀▄█▄█▀▀▄  ▄

Cash App: $vtchevalier
https://cash.app/$vtchevalier

Built by Victor T. Chevalier
https://github.com/VTChevalier

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Log

`/job-radar log` — Generate a TWC Work Search Activity Log as HTML + PDF.

Run: `node scripts/generate-log.mjs` (or `npm run log`). This is a fully automated script — do not re-implement the log manually.

**What the script produces:**

Faithful BN900E (10-12-23) layout — four columns, light-blue field shading, CSS checkboxes, per-page TWC sidebar:
1. **Date / Work Search Activity / Type of Job** — date from tracker, "Applied for job", role title
2. **Employer Name, Location, Phone** — from `data/company-info.json`
3. **Contact Information** — Person Contacted: career portal URL (from portals.yml / employer-urls.json) or "Online application"; Email checkbox checked
4. **Results** — checkbox: Application filed (Applied/Evaluated/Responded/Interview), Not hiring (Rejected), Hired (Offer)

**Pagination:** Entries are grouped by ISO week (Mon–Sun), sorted newest-to-oldest. Each week gets its own sheet(s) — max 5 entries per sheet. If a week has more than 5 entries it produces multiple sheets numbered per-week.

**Header fields auto-filled per sheet:**
- **Week of:** Monday–Sunday date range (e.g. `05/25/2026 to 05/31/2026`)
- **Number of Required Searches:** total entry count for that whole week
- **Name:** from `config/profile.yml`
- **Social Security #:** left blank for hand-entry

**Output files:**
- `output/application-log-{today}.html` — combined all-weeks HTML
- `output/twc-wsal-week-MM-DD-YY-N.html` + `.pdf` — one file pair per sheet

**Data sources:**
- `data/tracker.md` — application rows (Discarded and SKIP rows excluded)
- `data/company-info.json` — company HQ addresses and phone numbers
- `data/employer-urls.json` — career URL overrides for companies not in portals.yml
- `config/portals.yml` — auto-builds career URLs for Greenhouse, Ashby, Lever, Workday, iCIMS, BambooHR, Teamtailor companies

**Custom template:** If `templates/log-custom.html` exists, the script uses it instead of `templates/log-default.html`. The custom template must contain `{{TITLE}}` and `{{BODY}}` placeholders. To customize layout or styling, copy `templates/log-default.html` to `templates/log-custom.html` and edit.

**After running**, confirm:
```
Log generated:
  HTML: output/application-log-{today}.html
  Per-week PDFs: output/twc-wsal-week-*.pdf

{total} entries across {N} week(s) — {active} active, {closed} not hiring/closed.
```

### Help

- `/job-radar` or `/job-radar help` → Show the command list above.

## Implementation notes

**Native tools for all data file edits** — use the Read, Edit, and Write tools directly for all modifications to `training/skills.md`, `career-bank.md`, `data/tracker.md`, `resume.md`, and config files. Never spawn a shell script to read or write these files.

For `add role`, `remove role`, `add company`, `remove company`, and `add feed`:
1. Use the Read tool to read `config/portals.yml`
2. Modify the appropriate section in the YAML
3. Use the Write tool to save the updated file
4. Confirm the change to the user

For `add company`:
1. Run `node scripts/resolve-ats.mjs "<name>"` and capture stdout
2. Parse the JSON result: `{ name, type, board/slug, tracked }`
3. If `tracked` is true, tell the user it's already configured
4. Otherwise, add to the correct section in portals.yml based on `type`
5. Confirm: "Added <name> (<type>) to your scan list."
