---
name: job-radar
description: "Job search pipeline: scan, discover, import resume, evaluate, tailor, gaps, learn, add company/role, status, donate"
user_invocable: true
args: subcommand
argument-hint: |
  scan                  Scan portals (cached 24h, pick from results)
  scan --force          Force fresh scan, bypass cache
  scan --dry-run        Preview without writing
  discover              Find hiring companies from RSS feeds
  discover --fresh      Sort by newest postings
  resume import         Import your resume (paste, PDF, file, LinkedIn)
  resume tailor         Build a tailored resume (pick from list, URL, or name)
  resume audit          Check resume freshness + keyword gaps
  evaluate              Score a posting (pick from list, URL, or company name)
  status                Pipeline summary
  add "name or title"   Add a company, role title, or RSS feed URL
  remove "name"         Remove a company or exclude a role title
  config                Full setup wizard (location, targets, preferences)
  check <url>           Verify a posting is still live
  gaps                  Keyword frequency + skill gaps
  learn                 Skills to study, ranked by demand
  donate                Support the project
  help                  Show all commands
---

# /job-radar — Job Search Pipeline

## Before anything: first-run check

Before executing ANY subcommand, silently run `node scripts/setup.mjs` and check the output:

1. **If the script exits with code 1** (Node.js missing), this won't happen since you're already running — but if `node_modules/` is missing or configs are missing, the script handles it automatically.

2. **If the script can't run** (e.g., `node` not found when the user runs this outside Claude Code), detect the OS yourself:
   - Run `uname -s` (or check platform from context)
   - macOS: check `which brew` → if found, run `brew install node` for them. If no brew, tell them: "I need to install Homebrew first to get Node.js. Want me to run the installer?" then run the Homebrew install curl command.
   - Linux: check for `apt`, `dnf`, `pacman` → run the appropriate install command. If it needs `sudo`, tell the user: "I need to install Node.js — this will ask for your password" then suggest they type `! sudo apt install -y nodejs npm` in the prompt.
   - Windows: check for `winget`, `choco`, `scoop` → run the install. If none found, say: "Download Node.js from nodejs.org — I'll wait. Tell me when it's installed."

3. **After node is confirmed**, the setup script auto-handles: `npm install`, Playwright chromium, config file copies. These all run without prompting.

4. **If `resume.md` doesn't exist**, mention it naturally: "You don't have a resume imported yet. Want to do that first? Just run `/job-radar import resume`." Don't block — let the command proceed unless it specifically needs the resume (tailor, evaluate, gaps).

5. **Profile completeness check** — After setup, read `config/profile.yml` and check for these required fields:
   - `location` — must be set (not blank, not the example value "City, State/Country")
   - `work_arrangement.preference` — must be one of: `remote`, `hybrid`, `onsite`, `any`
   - `work_arrangement.max_commute_miles` — required only when preference is `hybrid` or `onsite`

   **If any required field is missing AND the subcommand is `scan`, `discover`, or `configure`:**
   Interrupt before running the command and say:
   > "Before we scan, let me grab a couple of quick preferences — takes 30 seconds."
   Then run the **Configure: Location & Work Arrangement** flow below, save the results, and proceed to the original command.

   **For all other subcommands** (evaluate, tailor, status, etc.): proceed silently — don't block on missing config.

6. **Resume audit reminder** — After the profile check, silently read `data/last-audit.txt`. If it's missing or older than 7 days, set a flag to append a one-line reminder after the current command completes:
   > "Your resume hasn't been audited in {N} days — run `resume audit` when you have a moment."
   Don't block. Don't show it more than once per session.

Only show setup output if something actually needed to be installed or configured. If everything was already ready, proceed silently to the command.

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

  Configure
    add "name or title"        Add a company, role title, or RSS feed URL
    remove "name or title"     Remove a company or exclude a role title
    config                     Full setup wizard (location, targets, preferences)
    check <url>                Verify a posting is still live

  Other
    gaps                       Keyword frequency + skill gaps
    learn                      Skills to study, ranked by demand
    donate                     Support the project
    help                       Show this list
```

## Commands

### Discovery & Scanning

`scan` and `discover` are one unified flow. There is no separate `discover` command. Discover always runs **before** scan so newly found companies are included in the same scan run.

- `/job-radar scan` → Run `node scripts/discover.mjs --add all` first (silent — primes portals.yml with all tier 1/2/3 companies), then `node scripts/scan.mjs`. Scan results are cached for 24 hours — on cached runs, skip discover and return cached results. After scan completes, follow the **Post-scan interactive flow** below.
- `/job-radar scan --force` → Run `discover --add all` then `scan --force`. Bypasses 24h cache.
- `/job-radar scan --dry-run` → Run `discover --dry-run` then `scan --dry-run`. Preview only, no interactive flow.
- `/job-radar scan --source <type>` → Skip discover, scan only one ATS type. Always fetches fresh.

#### Post-scan interactive flow

After `discover` and `scan` both finish (or cached results are returned), do NOT dump a summary and tell the user to find URLs. Instead:

1. **Parse the scan output JSON** (last line of scan output) to get the posting pool. Use `all_postings` if present (full pool of compatible postings with relevance ≥ 2 from this scan run). Fall back to `new_postings` only if `all_postings` is absent. If using cached results, read `data/scan-cache.json` and use the same field priority.

2. **Filter out incompatible postings** before ranking. A posting is incompatible if `compatible: false` in the scan output. This covers:
   - International locations when `willing_to_relocate: false`
   - Non-remote locations when `work_arrangement.preference` is `remote`
   - Postings with `compatible: true` or no `compatible` field (RSS feeds with unknown location) are kept.

   Track the excluded count — you'll show it as a footnote.

3. **Tier compatible postings** by fit quality. First, derive the candidate's seniority level from their resume:

   **Step A — Read `resume.md`** and identify:
   - The **current role title** (most recent position — the role at the top of the Experience section)
   - The **career trajectory** — look at the sequence of prior titles to understand whether the candidate has been progressing on a management track, IC track, or mixed/hybrid path

   **Step B — Use AI judgment to classify each posting title** (no hardcoded keywords) into one of three seniority bands relative to this candidate's resume:
   - **Current-level** — a lateral or peer role: same or similar seniority to the candidate's current title. For example, if the current role is "Senior Manager, Software Engineering", other Senior Manager or similar-scope manager roles are current-level.
   - **Promotion-level** — one step up: roles that represent a natural next step. For a Senior Manager this might be Director, Head of, VP. For a Staff Engineer it might be Principal or Distinguished. Use the candidate's career trajectory to inform what "one step up" means for them.
   - **Demotion/adjacent** — roles below the candidate's current seniority, or on a different track (e.g., IC roles when the candidate is in management, or pure manager roles when the candidate has been IC-only). These may still be relevant — they just rank lower.

   **Named company** — posting type is `greenhouse`, `ashby`, `lever`, `bamboohr`, `teamtailor`, or `workday` (NOT `rss`).

   Assign tiers (mutually exclusive — once a posting is placed, exclude it from lower tiers):
   - **Tier 1** — named company AND (current-level OR promotion-level title)
     *Right seniority at a known company. Sort: current-level first, then promotion-level; each group by relevance desc.*
   - **Tier 2** — named company AND any other relevant title (demotion, adjacent track, or any match from `targets.roles` in profile.yml)
     *Known company, broader title match. Sort by relevance desc.*
   - **Tier 3** — any source (RSS or named), where relevance ≥ 3 OR title is current-level or promotion-level
     *Discovery blast — company may be unknown. Sort within tier: current-level first, then promotion-level, then other — each group by relevance desc.*

4. **Present up to 15 results as a numbered list** using a backfill cascade so the total always reaches 15 (or the size of the compatible pool if smaller):

   ```
   budget_t1 = 5
   actual_t1 = min(len(tier1), budget_t1)
   overflow   = budget_t1 - actual_t1

   budget_t2 = 5 + overflow
   actual_t2 = min(len(tier2), budget_t2)
   overflow   = budget_t2 - actual_t2

   budget_t3 = 5 + overflow
   actual_t3 = min(len(tier3), budget_t3)
   ```

   Separate the three groups with a blank line. **No tier labels.** Continuous numbering 1–15. Omit a blank-line separator if the preceding group was empty.

   Include location when available. Do not show tier labels to the user — just use the visual grouping.

   ```
   Best matches from this scan:

    1. Stripe      — Director of Engineering, Identity          · Remote
    2. GitLab      — Engineering Manager, AI Platform           · Remote (US)
    3. Vanta       — Senior Manager, Corporate Engineering      · Remote
    4. Reddit      — Director of Engineering, Ads Measurement   · Remote (US)
    5. Instacart   — Engineering Manager, Data Platform         · Remote (US)

    6. Veriff      — Senior Software Engineer, Product Platform · Remote
    7. Toast       — Staff Engineer, Payments                   · Remote (US)
    8. Close       — Senior Software Engineer, Backend          · Remote
    9. Consensys   — Senior Software Engineer, MetaMask         · Remote (US)
   10. Stellar AI  — Staff Engineer                             · Remote

   11. WeWorkRemotely — Director of Engineering (Series B)      · Remote
   12. HN Jobs        — Engineering Manager, Infra              · Remote
   13. WeWorkRemotely — Senior Manager, Platform                · Remote
   14. HN Jobs        — Staff Engineer, ML Platform             · Remote
   15. WeWorkRemotely — Senior Software Engineer                · Remote

   Pick a number to evaluate, or multiple (e.g., "1, 3, 5").
   Type "all top" to evaluate the top 5.
   Type "skip" to finish.

   229 postings excluded (location incompatible with your work arrangement).
   ```

   Format location as a short label after `·`. Take only the first segment if multiple locations are listed (split on `;`). Normalize all of these → "Remote (US)": "Remote, USA", "Remote, US", "United States - Remote", "US - Remote", "USA - Remote", "Remote- USA", "US (remote)", "USA (Remote)", "UNITED STATES - Remote". Normalize → "Remote (CA)": "Remote, Canada". Normalize → "Remote (UK)": "Remote, UK", "Remote, United Kingdom". Normalize → "Remote": bare "Remote" or "GLOBAL - Remote". Omit `·` if location is null.

   Show excluded count as the last line so the user knows postings were filtered, not missing.

5. **After the posting list, show a quiet footnote** if discover added any new companies during this run. Parse the discover output for newly added company names and show one line — no action required:

   ```
   Added 3 companies to your scan list: Acme Corp, BuildCo, Veriff.
   ```

   If no new companies were added, omit this line entirely.

6. **When the user picks a number**, look up the URL from the postings array and run the evaluate flow automatically — no URL copy-pasting needed.
7. **After each evaluation**, offer: evaluate another, tailor a resume for one they liked, or stop.
8. **If the user says "all top"**, evaluate the top 5 sequentially, showing a brief score summary after each.

This turns scan into a single interactive session that covers both active postings and company discovery. The user goes from "scan" to "evaluate" to "tailor" without ever touching a URL or running a second command.

### Resume hub

All resume-related commands route through `resume`:

- `/job-radar resume import` (or `/job-radar import resume`) → Import the user's resume into `resume.md`. See **Import Resume** implementation below.
- `/job-radar resume import <path>` (or `/job-radar import resume <path>`) → Import from a specific file (PDF, DOCX, TXT, HTML, MD).
- `/job-radar resume tailor` (or `/job-radar tailor`) → Tailor a resume for a specific role. See **Tailor Resume** implementation below.
- `/job-radar resume audit` → Run the **Resume Audit** flow. See implementation below.

### Configuration

These commands modify `config/portals.yml` so the user never has to edit YAML directly.

**Smart `add` and `remove`** — detect context automatically from the argument:

- `/job-radar add <value>` → Detect what to add:
  - If `<value>` looks like a URL (starts with `http`) → add as an RSS feed to portals.yml
  - If `<value>` contains a role keyword (`Engineer`, `Manager`, `Director`, `Lead`, `Staff`, `Principal`, `Architect`, `Developer`, `Analyst`, `Designer`, `Scientist`, `Specialist`) → add as a role to `title_filter.positive`
  - Otherwise → treat as a company name, run `node scripts/resolve-ats.mjs "<value>"` and add to portals.yml
- `/job-radar add company "<name>"` → Explicit company (bypass detection)
- `/job-radar add role "<title>"` → Explicit role (bypass detection)
- `/job-radar add feed <url>` → Explicit feed (bypass detection)

- `/job-radar remove <value>` → Detect what to remove:
  - If `<value>` contains a role keyword (same list as above) → add to `title_filter.negative`
  - Otherwise → treat as a company name, remove from portals.yml
- `/job-radar remove company "<name>"` → Explicit company removal
- `/job-radar remove role "<title>"` → Explicit role exclusion

- `/job-radar configure` or `/job-radar config` → Run the **Configure Wizard** below. Covers location, work arrangement, target roles, score threshold, deal-breakers, and resume builder settings. Reads and writes `config/profile.yml`.

### Configure Wizard

Run this wizard when the user explicitly calls `/job-radar configure`, or when the profile completeness check (step 5 of "Before anything") detects missing required fields before `scan` or `discover`.

Read `config/profile.yml` first (or `config/profile.example.yml` if profile.yml doesn't exist yet) so you can show current values as defaults.

If `resume.md` exists, extract the user's location from it to pre-fill the location question.

Walk through each question in order. Show the current value (if set) so the user can press Enter to keep it. Save after the final question.

---

**Q1 — Location**

> "Where are you located? (city, state or country)
> Current: {current value or "not set"}"

Accept free-form text. Store as `location` in profile.yml. Examples: "Austin, TX", "London, UK", "Remote".

---

**Q2 — Work arrangement**

> "What's your work arrangement preference?
>   1. Remote only
>   2. Hybrid (some days in office)
>   3. Onsite only
>   4. Any / no preference
> Current: {current value or "not set"}"

Map answer to profile.yml values:
- 1 → `remote`
- 2 → `hybrid`
- 3 → `onsite`
- 4 → `any`

Store as `work_arrangement.preference`.

---

**Q3 — Max commute distance** *(only ask if Q2 answer was hybrid or onsite)*

> "What's the farthest you'd commute one-way (in miles)?
> Current: {current value or 30}"

Accept a number. Default to 30 if blank. Store as `work_arrangement.max_commute_miles`.

Skip this question entirely if preference is `remote` or `any`.

---

**Q4 — Relocation**

> "Are you willing to relocate for the right role? (yes/no)
> Current: {current value or "no"}"

If yes:

> "Which cities would you consider? (comma-separated, e.g., Austin TX, New York NY)
> Current: {current value or "none"}"

Store as `work_arrangement.willing_to_relocate` (true/false) and `work_arrangement.relocation_cities` (list).

---

**Q5 — Target roles**

> "What job titles are you targeting? (comma-separated, or press Enter to keep current)
> Current: {comma-joined list}"

Show current list. Accept additions or a full replacement. Store as `targets.roles` list.

---

**Q6 — Minimum score**

> "What's the minimum evaluation score to consider applying? (1.0–5.0)
> Current: {current value or 3.5}"

Accept a float. Default 3.5. Store as `targets.min_score`.

---

**Q7 — Deal-breakers**

> "Any absolute deal-breakers? (comma-separated, or press Enter to keep current)
> Current: {comma-joined list or "none"}
> Examples: no equity, defense contractor, on-site only"

Store as `preferences.deal_breakers` list.

---

**Q8 — Compensation**

> "What's your compensation range?
>   Minimum (won't apply below this): {current min or "not set"}
>   Target (what you're aiming for):  {current target or "not set"}
>   Currency: {current currency or "USD"}
>
> Enter as: min / target   (e.g., 150000 / 200000)
> Press Enter to skip."

Accept input in any of these forms:
- Single target: `150000 / 200000` → min=150000, target=200000
- Target range: `150000 / 200000 - 225000` → min=150000, target=200000, target_max=225000
- Shorthand: `150k / 200k-225k` → same as above
- With currency: `150000 / 200000 GBP` → currency=GBP

Normalize shorthand: `150k` → `150000`, `1.5M` → `1500000`. Currency defaults to USD.

When the user gives a range for target (e.g., "245000–285000"), store the low end as `target` and the high end as `target_max`.

Store as:
```yaml
compensation:
  currency: USD
  min: 225000
  target: 245000
  target_max: 285000  # omit if user gave a single target number
```

If skipped, leave the `compensation` block out of profile.yml — don't write empty values. The evaluate step will still score compensation if the JD lists a range; it just won't penalize for being below a threshold.

---

**Q9 — Company size**

> "What company size do you prefer?
>   1. Startup (< 200 people)
>   2. Mid-size (200–2,000 people)
>   3. Enterprise (2,000+ people)
>   4. Any / no preference
> Current: {current value or "any"}"

Map to profile.yml values:
- 1 → `startup`
- 2 → `mid`
- 3 → `enterprise`
- 4 → `any`

Store as `preferences.company_size`.

---

**Q10 — Resume builder role type**

> "What type of roles are you targeting?
>   1. Engineering Manager / Team Lead
>   2. Individual Contributor (IC) / Staff / Principal
>   3. Director / VP / Executive
>   4. Hybrid (IC at manager level — player/coach)
> Current: {current value or "not set"}"

Map to `resume_builder.role_type`:
- 1 → `manager`
- 2 → `ic`
- 3 → `director`
- 4 → `hybrid`

Store as `resume_builder.role_type`. This shapes how resume bullets are framed during tailoring — manager leads with team/org impact, ic leads with technical achievement, director leads with business/program impact, hybrid balances both.

---

**After all questions — save and confirm**

1. Write all collected values to `config/profile.yml`, preserving any fields that weren't touched.
2. Show a summary:

   ```
   Profile saved to config/profile.yml:

     Location:        Austin, TX
     Work preference: remote
     Willing to relocate: no

     Target roles:    Senior Manager, Director of Engineering, Staff Engineer
     Min score:       3.5
     Deal-breakers:   no equity

     Compensation:    $150,000 min / $200,000 target (USD)
     Company size:    any
     Role type:       manager
   ```

   Omit the Compensation line if the user skipped Q8. Omit Role type if the user skipped Q10.

3. If this wizard was triggered automatically (by the completeness check before scan/discover), say: "All set — starting the scan now." and proceed to the original command.
4. If the user ran `/job-radar configure` directly, say: "Done! Run `/job-radar scan` whenever you're ready."

### Pipeline

- `/job-radar evaluate <url or number>` → If the user provides a number (from the post-scan list) or a company name, look up the URL from `data/pipeline.md`. If they provide a URL, use it directly. Then read `modes/evaluate.md`, fetch the JD, score against resume.md, write evaluation report to reports/. Also extracts keywords, updates the frequency tracker in `resume-bullets.md`, and reports skills gaps with bullet suggestions. After evaluation, offer: "Want to tailor a resume for this one? Or pick another from the list?"
- `/job-radar gaps` → Show the current keyword frequency tracker from `resume-bullets.md` and highlight any keywords with 3+ appearances that have no matching bullet tags.
- `/job-radar learn` → Show `data/skills-queue.md` — the prioritized list of skills to learn, sorted by JD count. Update statuses interactively.
- `/job-radar status` → Show pipeline summary from data/tracker.md and data/pipeline.md: counts of pending, evaluated, applied, interviewed, offered, rejected.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Resume hub routing

- `/job-radar resume tailor <url or number>` (or `/job-radar tailor`) → If the user provides a number (from the post-scan list) or a company name, look up the URL from `data/pipeline.md`. If they provide a URL, use it directly. Then read the JD, match against `resume-bullets.md`, assemble a tailored resume. See **Tailor Resume** implementation below.
- `/job-radar resume audit` → See **Resume Audit** implementation below.

### Support

- `/job-radar donate` → Print the donate block below directly as text output (do NOT run it via Bash — tool output gets collapsed). Output this exactly:

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

### Help

- `/job-radar` or `/job-radar help` → Show this command list.

## Implementation notes

For `add role`, `remove role`, `add company`, `remove company`, and `add feed`:
1. Read `config/portals.yml` with js-yaml
2. Modify the appropriate section
3. Write back with `yaml.dump()`
4. Confirm the change to the user

For `add company`:
1. Run `node scripts/resolve-ats.mjs "<name>"` and capture stdout
2. Parse the JSON result: `{ name, type, board/slug, tracked }`
3. If `tracked` is true, tell the user it's already configured
4. Otherwise, add to the correct section in portals.yml based on `type`
5. Confirm: "Added <name> (<type>) to your scan list."

## Import Resume

When the user runs `/job-radar import resume`, follow this flow:

### Step 1 — Get the resume

Check if a file path was provided as an argument. If so, read that file directly.

If no path was provided, ask the user ONE question:

> "How would you like to import your resume?
>
> 1. **Paste it** — paste your resume text in the next message
> 2. **From a file** — give me the path to a file (PDF, Word, TXT, HTML, or Markdown)
> 3. **From LinkedIn** — paste your LinkedIn profile URL (public profiles only)"

Then wait for their response.

### Step 2 — Read the content

Based on the input:
- **Pasted text**: use it directly
- **File path**: use the Read tool to read the file (works with PDF, TXT, MD, HTML). For DOCX files, try reading — if it's garbled binary, tell the user to save as PDF or paste the text instead.
- **LinkedIn URL**: use WebFetch to read the public profile page. Extract name, headline, experience, education, skills. If the profile isn't public, tell the user and ask them to paste instead.

### Step 3 — Convert to resume.md format

Restructure the content into this exact format (see `resume.example.md` for reference):

```markdown
# Full Name

**Email:** email | **Location:** city | **LinkedIn:** url | **GitHub:** url

## Summary

2-3 sentences. Professional identity, years of experience, what they're known for, what they want next.

## Experience

### Job Title — Company Name
**Dates** | Location

- Accomplishments with impact and numbers
- Technologies used
- Scale indicators (team size, users, revenue)

(repeat for each role, reverse chronological)

## Projects

### Project Name
**Tech stack** | Link

- What it does, impact, their role

## Education

### Degree — School
**Year** | Honors if applicable

## Skills

**Languages:** ...
**Frameworks:** ...
**Infrastructure:** ...
**Other:** ...
```

Rules for conversion:
- Preserve ALL factual content — never drop experience, skills, projects, or education
- Standardize formatting but keep the user's own words for descriptions
- Add a Summary section if one doesn't exist — synthesize from their experience
- Normalize dates to a consistent format (e.g., "2020-2024" or "Jan 2020 — Present")
- Separate skills into categories (Languages, Frameworks, Infrastructure, Other)
- If contact info is missing, leave those fields blank — don't make anything up
- Strip formatting artifacts from PDF extraction (page numbers, headers/footers, weird spacing)

### Step 4 — Write and confirm

1. Write the converted resume to `resume.md`
2. Show the user a summary of what was imported:
   - Name
   - Number of positions found
   - Number of skills extracted
   - Anything that looked unclear or was dropped
3. Ask: "Does this look right? You can edit `resume.md` directly or tell me what to change."

### Step 5 — Set up profile (if not already done)

If `config/profile.yml` doesn't exist yet, offer to create it:

> "Want me to set up your profile too? I can create `config/profile.yml` with your name, location, and target roles based on your resume."

If they agree, create `config/profile.yml` from `config/profile.example.yml` with their details filled in.

## Tailor Resume

When the user runs `/job-radar tailor <url>`, auto-assemble a targeted resume from the bullet bank.

### Resume rules (apply to all tailoring)

- **2-page limit.** The final resume must fit in 2 pages. If it runs long, trim oldest roles first — recent experience matters most. Shrink roles 10+ years old to 1-2 bullets max.
- **No cross-company references.** Each company's bullets stand alone. Never mention work at another company within a bullet (e.g., don't reference "AT&T's ASPR" in a Stratascale bullet). If a skill spans employers, describe it in the context of the company where the bullet lives.
- **Summaries are the exception** — they can reference career span and multiple employers.
- **Never fabricate** experience, skills, or metrics.
- **Never change locations.** Copy all location fields — the header location and every per-role location — exactly as they appear in `resume.md`. Do not substitute "Remote", "Remote (TX)", or any inferred variant. The user's actual city/state text is the correct value, always.

### Step 0 — Read role-type framing

Before anything else, read `config/profile.yml resume_builder.role_type`. This controls how bullets are framed throughout the resume. Apply the framing rules defined in `modes/generate-resume.md` — the role type shapes which accomplishments lead each bullet, not which bullets are included. Default to `hybrid` if not set.

### Step 1 — Fetch and analyze the JD

1. Use WebFetch to read the job posting URL
2. Extract from the JD:
   - **Role level**: IC/Senior/Staff/Principal vs Manager/Senior Manager vs Director/VP
   - **Domain**: Security, Platform, AI/ML, DevOps, Product, etc.
   - **Required skills**: specific technologies, tools, certifications mentioned
   - **Keywords**: all significant terms that appear in requirements or qualifications
3. Show the user what was extracted before proceeding

### Step 2 — Gap check (interactive)

Compare the JD's required skills/keywords against `resume.md` and `resume-bullets.md` tags. Identify:
- **Covered** — keyword matches existing bullets or skills
- **Gaps** — keyword doesn't appear anywhere in the user's materials

If there are gaps, present them to the user BEFORE assembling the resume:

> **These skills from the JD aren't in your resume yet:**
>
> - **Kubernetes** — Do you have experience with this?
> - **Terraform** — Do you have experience with this?
> - **CISSP** — Do you have this certification?
>
> For any you DO have, tell me about it and I'll write a bullet. Say "skip" for ones you don't have.

For each skill the user confirms:
1. The user can give a quick blurb — a sentence or two about what they did. It doesn't need to be polished.
2. Claude rewrites it as a resume bullet that matches both the JD's language and the tone/style of the user's existing bullets in `resume-bullets.md`. Show the draft and let them approve or adjust.
3. Add the approved bullet to the appropriate role section in `resume-bullets.md` with updated tags.
4. Add the skill to the relevant category in `resume.md`'s Skills section.

For each skill the user says "skip" (they don't have it):
1. Don't just note the gap — suggest a way to close it.
2. Recommend specific free or low-cost training resources:
   - **Certifications**: link to the official study guide or free prep (e.g., CISSP → ISC2 free course, AWS SA → AWS Skill Builder free tier)
   - **Technologies**: link to official docs, tutorials, or interactive labs (e.g., Kubernetes → killer.sh free playground, Terraform → HashiCorp Learn)
   - **General**: Coursera audit mode, edX free courses, YouTube channels, official vendor training
3. Estimate the time investment: "~2 weeks of evenings" or "~40 hours"
4. Frame it as: "You could start this while waiting to hear back from applications."
5. Track it in `data/skills-queue.md` (create if it doesn't exist) so the user has a running list of skills to learn, prioritized by how often they appear in JDs:

```markdown
# Skills Queue

| Skill | JD Count | Priority | Resource | Est. Time | Status |
|-------|----------|----------|----------|-----------|--------|
| Kubernetes | 5 | High | killer.sh, K8s docs | ~2 weeks | not started |
| CISSP | 3 | Medium | ISC2 free course | ~3 months | not started |
```

Status values: `not started`, `in progress`, `done`

This turns every "skip" into a growth opportunity. The skills queue is the learn-to-qualify pipeline — it tells the user exactly what to invest in based on real market signal, not guessing.

### Step 3 — Select summary paragraph

Read `resume-bullets.md` and pick the best summary paragraph based on role level + domain:
- IC/Staff/Principal → Summary #4
- Manager/Senior Manager + Security → Summary #1
- Manager/Senior Manager + Platform/Product → Summary #2
- Director/VP → Summary #3
- AI/ML focus → Summary #5

If the user's experience from Step 2 changes the framing (e.g., they revealed strong AI experience that wasn't in the bank), offer to write an updated summary paragraph and add it to the bank.

### Step 4 — Match bullets to JD keywords

For each position in `resume-bullets.md`:
1. Read the `<!-- tags: ... -->` comments on each bullet section
2. Score each section by how many JD keywords match its tags (including any new bullets from Step 2)
3. Pick bullets per position: **4 for the current role, 3 for all prior roles** — never exceed these limits
4. Lead with the strongest keyword match, end with broadest signal
5. **Blend when it makes the resume stronger:** If two bullets from the same role address the same skill gap or prove a stronger combined point together, merge them into one tight bullet rather than listing them separately. One well-constructed blended bullet is better than two thin ones. Never blend just to hit the count — blend only when the result is genuinely stronger.

**Before including any bullet, apply the Writing Standards from CLAUDE.md.** Rewrite weak bullets on the fly — fix passive voice, remove "responsible for", add numbers if missing from the resume context, eliminate AI-sounding flourishes (echo structures, rhetorical contrasts, self-congratulatory editorializing). The output must read like a FAANG-tier resume writer produced it for a $300K+ candidate, not like a self-written job description.

### Step 5 — Reorder skills

Read the Skills section from `resume-bullets.md`. Reorder skill categories to front-load whatever the JD emphasizes most. Within each category, lead with the specific tools/technologies the JD mentions.

### Step 6 — Assemble and write

1. Combine: Contact → Selected Summary → Tailored positions → Education → Reordered Skills
2. Write to `output/resume-tailored-{company-slug}-{date}.md`
3. Show the user a diff summary:
   - Which summary was picked
   - Which bullet categories were chosen per role
   - Which skills were front-loaded
   - What new bullets were added to the bank (if any)

### Step 7 — Generate cover letter

Always generate a cover letter alongside the tailored resume — it is not optional.

**Voice standard:** Write as a peer-to-peer communication between two senior leaders — not a candidate appealing to a gatekeeper. The candidate has options. The writing must reflect that. Apply the full Writing Standards from CLAUDE.md.

1. Write `output/cover-letter-{company-slug}-{date}.md` — 3 paragraphs max, hard cap at 3/4 of a page. Treat the limit as absolute — if it runs long, cut sentences, not ideas:
   - **Para 1:** Open with the situation or result — never "I am applying for." State what you are doing right now that directly maps to this role. Specific numbers, named technologies, named clients. 3-4 sentences.
   - **Para 2:** Make the case with evidence — credentials, compliance coverage, key accomplishments. If a gap exists, one direct sentence bridges it ("X is the one gap; adjacent experience in Y covers most of the ground"). No self-apologizing. 4-5 sentences.
   - **Para 3:** One specific reason this company over any other, and a confident close. Not "I would be grateful" — something direct like "I'd welcome a conversation" or "Happy to go deeper on any of this." 2-3 sentences.
   - Sign with: name, email, phone.
   - Date: today's date.
   - Recipient: "{Company} Recruiting Team / Re: {Role Title}"

2. **Hard rules:** No excited/grateful/honored language. No cliché closes ("I look forward to hearing from you"). No sentence that could apply to any company. No restating the resume in prose. 3/4 page is not a target — it's a ceiling.

### Step 8 — Generate HTML and PDF (automatic, always)

PDF generation is not optional — run it automatically for every tailor command. PDFs must be generated LAST, after all content edits are complete. If any edit is made to an HTML file after a PDF was generated, regenerate the PDF immediately — never leave an HTML and its PDF out of sync.

1. Convert the resume markdown to HTML at `output/resume-tailored-{company-slug}-{date}.html`:
   - Use `@page { size: letter; margin: 0.6in 0.7in; }`
   - Font: 'Helvetica Neue', Arial, sans-serif at 10.5pt, line-height 1.4
   - CSS classes: `.entry`, `.entry-header` (flex, space-between), `.title` (bold), `.company` (italic), `.date` (9pt, #666)
   - `h2`: 11pt, uppercase, letter-spacing 1px, border-bottom 1.5px solid #333
   - `ul`: margin 4px 0, padding-left 18px; `li`: margin-bottom 2px
   - Escape `&` as `&amp;` in HTML

2. Convert the cover letter markdown to HTML at `output/cover-letter-{company-slug}-{date}.html`:
   - Use `@page { size: letter; margin: 1in; }`
   - Font: 'Helvetica Neue', Arial, sans-serif at 11pt, line-height 1.5
   - Sections: `.header` (name 14pt bold, contact 10pt #555), `.date`, `.recipient`, `.body p` (margin 0 0 12px, text-align justify), `.closing`

3. Run PDF generation for both files:
   ```
   node scripts/generate-pdf.mjs output/resume-tailored-{company-slug}-{date}.html output/resume-tailored-{company-slug}-{date}.pdf
   node scripts/generate-pdf.mjs output/cover-letter-{company-slug}-{date}.html output/cover-letter-{company-slug}-{date}.pdf
   ```

4. Confirm the 4 output files created (2 HTML + 2 PDF) and offer to open them.

### Step 9 — Update keyword tracker

Append the JD's keywords to the **Keyword Frequency Tracker** table in `resume-bullets.md`. Increment count if the keyword already exists, add a new row if not. Update the "Last Seen" date.

This tracks which skills employers ask for most, so the user can see which bullets are doing heavy lifting and which skills to invest in.

## Resume Audit

When the user runs `/job-radar resume audit`, run this flow.

### Freshness check

1. Read `data/last-audit.txt`. If the file doesn't exist, treat the resume as never audited.
2. Parse the date. If it's within the last 7 days, say:
   > "Resume audit is current (last run: {date}). Run `resume audit --force` to audit anyway."
   Stop here unless the user passed `--force`.
3. Otherwise, proceed with the full audit.

### Full audit steps

1. **Read** `resume.md` and `data/scan-history.tsv`.

2. **Extract recent JD keywords** — scan the `title` column of `data/scan-history.tsv` for entries with `first_seen` in the last 30 days. Extract all significant terms (technologies, role types, domain keywords).

3. **Keyword gap check** — any keyword appearing in 3+ JD titles that has no match anywhere in `resume.md` is a gap. Report them as:
   > **Keywords in recent JDs not in your resume:**
   > - Kubernetes (5 JDs)
   > - CISSP (4 JDs)

4. **Bullet count check** — verify bullet counts per role against the hard limits (4 for current role, 3 for all prior roles). Flag any role that exceeds the limit.

5. **Forbidden phrase check** — scan for any of these patterns in `resume.md`: "responsible for", "helped", "assisted", "contributed to", "leveraged", "various", "several", "multiple", "passionate about", "results-driven", "proven track record", "etc.". Flag any matches with the line number.

6. **Report** — format as a short action list:

   ```
   Resume audit — {date}

   Keyword gaps (appear in 3+ recent JDs):
     - Kubernetes (5 JDs) — not in resume
     - CISSP (4 JDs) — not in resume

   Bullet count: OK

   Phrase check: 1 issue
     - resume.md line 23: "responsible for" → rewrite as an action verb

   Run `resume tailor` for a specific role to close keyword gaps.
   ```

7. **Write today's date** to `data/last-audit.txt` (overwrite if exists).

## Session-start proactive audit reminder

Add this check to **"Before anything"** (step 5, after the profile completeness check):

Silently check `data/last-audit.txt`. If the file is missing or the date is more than 7 days ago, note it. After the user's requested command completes, append one line:

> "Your resume hasn't been audited in {N} days — run `resume audit` when you have a moment."

Don't block the command or repeat this message more than once per session.
