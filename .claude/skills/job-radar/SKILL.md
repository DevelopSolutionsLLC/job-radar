---
name: job-radar
description: "Job search pipeline: scan, discover, import resume, evaluate, tailor, gaps, learn, add company/role, status, donate"
user_invocable: true
args: subcommand
argument-hint: |
  scan              Scan portals (cached 24h, pick from results)
  scan --force      Force fresh scan, bypass cache
  scan --dry-run    Preview without writing
  discover          Find hiring companies from RSS feeds
  discover --fresh  Sort by newest postings
  import resume     Import your resume (paste, PDF, file, LinkedIn)
  evaluate          Score a posting (pick from list, URL, or company name)
  tailor            Build a tailored resume (pick from list, URL, or company name)
  gaps              Show keyword frequency + skill gaps
  learn             Skills to study, ranked by market demand
  add company       Auto-detect ATS + add to scan list
  add role          Add to desired roles
  remove company    Remove from scan list
  remove role       Add to excluded roles
  add feed          Add an RSS feed
  configure         Interactive setup wizard
  status            Pipeline summary
  check <url>       Verify a posting is still live
  donate            Support the project
  help              Show all commands
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

Only show setup output if something actually needed to be installed or configured. If everything was already ready, proceed silently to the command.

## Command routing

Parse the user's subcommand and execute accordingly.

If no subcommand is given (user just types `/job-radar` or `/job-radar help`), print this command reference:

```
/job-radar — Job Search Pipeline

  Scanning & Discovery
    scan                       Scan portals → pick best matches → evaluate
    scan --force               Force fresh scan, bypass 24h cache
    scan --dry-run             Preview without writing
    scan --source <type>       Scan one ATS type only
    discover                   Find hiring companies from RSS feeds
    discover --fresh           Sort by newest postings
    discover --urgent          Sort by longest-open roles
    discover --add tier1       Auto-add top-tier companies

  Resume & Tailoring
    import resume              Import resume (paste, PDF, file, LinkedIn)
    import resume <path>       Import from a specific file
    tailor                     Build a tailored resume (pick from list or give URL)
    gaps                       Show keyword frequency + skill gaps
    learn                      Skills to study, ranked by market demand

  Configuration
    add company "<name>"       Auto-detect ATS + add to scan list
    remove company "<name>"    Remove from scan list
    add role "<title>"         Add to desired roles
    remove role "<title>"      Add to excluded roles
    add feed <url>             Add an RSS feed
    configure                  Interactive setup wizard

  Pipeline
    evaluate                   Score a posting (pick from list or give URL)
    status                     Pipeline summary (pending/applied/etc.)
    check <url>                Verify a posting is still live

  Other
    donate                     Support the project
    help                       Show this list
```

## Commands

### Discovery & Scanning

- `/job-radar scan` → Run `node scripts/scan.mjs`. Scan results are cached for 24 hours — repeat scans within that window use cached data instead of re-fetching from ATS APIs. After results are ready (fresh or cached), follow the **Post-scan interactive flow** below.
- `/job-radar scan --force` → Force a fresh scan, bypassing the 24-hour cache.
- `/job-radar scan --dry-run` → Run `node scripts/scan.mjs --dry-run`. Preview only, no interactive flow.
- `/job-radar scan --source <type>` → Scan only one ATS type (greenhouse, ashby, lever, etc.). Always fetches fresh (cache is per-full-scan).
- `/job-radar discover` → Run `node scripts/discover.mjs`. Show tiered results.
- `/job-radar discover --top N` → Show top N per tier.
- `/job-radar discover --add tier1` → Auto-add tier 1 companies to portals.yml via ATS detection.
- `/job-radar discover --add all` → Auto-add all discovered companies.
- `/job-radar discover --fresh` → Sort by newest postings first (just posted = top).
- `/job-radar discover --urgent` → Sort by longest-open roles first (desperate to hire).

#### Post-scan interactive flow

After `scan` finishes (or returns cached results), do NOT just dump a summary and tell the user to go find URLs. Instead:

1. **Parse the scan output JSON** (last line of scan output) to get `new_postings` with titles, companies, URLs, and `relevance` scores. The scanner already scored each posting against the user's resume keywords and target roles. If using cached results, the same data is in `data/scan-cache.json`.

2. **Filter out incompatible postings** before ranking. A posting is incompatible if `compatible: false` in the scan output. This covers:
   - International locations when `willing_to_relocate: false`
   - Non-remote locations when `work_arrangement.preference` is `remote`
   - Postings with `compatible: true` or no `compatible` field (RSS feeds with unknown location) are kept.

   Track the excluded count — you'll show it as a footnote.

3. **Sort compatible postings by relevance score** (highest first). The scanner scores by:
   - Target role match from profile.yml (+3 exact, +2 partial, +1 keyword)
   - Resume skills keyword overlap (+0.5 per matching word)
   - Seniority signals (+1 for manager/director, +0.5 for senior/staff/principal)
   - Location bonus: +1 for confirmed remote (when preference=remote), +0.5 for remote (when preference=hybrid)

4. **Present the top 15 compatible postings as a numbered list**, mixing named companies AND RSS-discovered companies together, ranked purely by relevance. Include location when available — it lets the user filter at a glance without opening the posting:

   ```
   Best matches from this scan (ranked by resume fit):

    1. Anthropic — Manager of Applied AI Architecture       (relevance: 5.5) · Remote
    2. Intercom — Senior Security Engineering Manager        (relevance: 4.5) · Remote
    3. Vanta — Staff Security Engineer                       (relevance: 4.0) · Remote  ← discovered via RSS
    4. Stripe — Engineering Manager, Operator Tooling        (relevance: 3.5) · Remote
    5. Contentful — Manager, Security Engineering            (relevance: 3.5) · Remote
    ...

   Pick a number to evaluate, or multiple (e.g., "1, 3, 5").
   Type "all top" to evaluate the top 5.
   Type "skip" to finish.

   14 postings excluded (location incompatible with your work arrangement).
   ```

   Format the location as a short label after a `·` separator. If location is null or unknown, omit the separator entirely. Normalize common variants: "Remote, USA" → "Remote", "Remote - Texas" → "Remote (TX)", "New York, New York" → "New York, NY".

   Always show the excluded count as the last line so the user knows postings were filtered, not missing.

5. **If the scan found companies worth adding** (3+ matching roles, not in portals.yml), the JSON output includes a `suggest_add` array. Present these to the user:

   ```
   Companies worth adding to your scan list:
    → Vanta — 5 matching roles, avg relevance 3.8
    → Datadog — 4 matching roles, avg relevance 3.2

   Want me to add any of these? (e.g., "add Vanta" or "add all")
   ```

   When the user says yes, run `node scripts/resolve-ats.mjs "<name>"` to detect the ATS and add to portals.yml — same as `/job-radar add company`.

6. **When the user picks a number**, look up the URL from the postings array and run the evaluate flow automatically — no URL copy-pasting needed.
7. **After each evaluation**, offer: evaluate another, tailor a resume for one they liked, or stop.
8. **If the user says "all top"**, evaluate the top 5 sequentially, showing a brief score summary after each.

This turns scan from a data dump into an interactive session where the user goes from "scan" to "evaluate" to "tailor" without ever touching a URL. Companies from RSS feeds sit alongside named companies — the best matches float to the top regardless of source.

### Onboarding

- `/job-radar import resume` → Import the user's resume into `resume.md`. See **Import Resume** implementation below.
- `/job-radar import resume <path>` → Import from a specific file (PDF, DOCX, TXT, HTML, MD).

### Configuration

These commands modify `config/portals.yml` so the user never has to edit YAML directly.

- `/job-radar add role "<title>"` → Add to `title_filter.positive` in portals.yml.
- `/job-radar remove role "<title>"` → Add to `title_filter.negative` in portals.yml.
- `/job-radar add company "<name>"` → Run `node scripts/resolve-ats.mjs "<name>"`, parse the JSON output, and add the company to the correct section in portals.yml. Confirm what was added.
- `/job-radar remove company "<name>"` → Remove from portals.yml. Confirm removal.
- `/job-radar add feed <url>` → Add RSS feed URL to the `rss:` section of portals.yml.
- `/job-radar configure` → Run the **Configure Wizard** below. Covers location, work arrangement, target roles, score threshold, and deal-breakers. Reads and writes `config/profile.yml`.

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
   ```

   Omit the Compensation line if the user skipped Q8.

3. If this wizard was triggered automatically (by the completeness check before scan/discover), say: "All set — starting the scan now." and proceed to the original command.
4. If the user ran `/job-radar configure` directly, say: "Done! Run `/job-radar scan` whenever you're ready."

### Pipeline

- `/job-radar evaluate <url or number>` → If the user provides a number (from the post-scan list) or a company name, look up the URL from `data/pipeline.md`. If they provide a URL, use it directly. Then read `modes/evaluate.md`, fetch the JD, score against resume.md, write evaluation report to reports/. Also extracts keywords, updates the frequency tracker in `resume-bullets.md`, and reports skills gaps with bullet suggestions. After evaluation, offer: "Want to tailor a resume for this one? Or pick another from the list?"
- `/job-radar gaps` → Show the current keyword frequency tracker from `resume-bullets.md` and highlight any keywords with 3+ appearances that have no matching bullet tags.
- `/job-radar learn` → Show `data/skills-queue.md` — the prioritized list of skills to learn, sorted by JD count. Update statuses interactively.
- `/job-radar status` → Show pipeline summary from data/tracker.md and data/pipeline.md: counts of pending, evaluated, applied, interviewed, offered, rejected.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Tailoring

- `/job-radar tailor <url or number>` → If the user provides a number (from the post-scan list) or a company name, look up the URL from `data/pipeline.md`. If they provide a URL, use it directly. Then read the JD, match against `resume-bullets.md`, assemble a tailored resume. See **Tailor Resume** implementation below.

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
3. Pick the 4-6 highest-scoring bullets per position
4. Lead with the strongest keyword match, end with broadest signal

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

1. Write `output/cover-letter-{company-slug}-{date}.md` — 4-5 paragraphs, max 1 page:
   - **Para 1:** The direct hook — what you've been doing that maps to this specific role. Name your most relevant work concretely.
   - **Para 2:** PM/IC/SA credentials — evidence you can do the job's core function at the required level.
   - **Para 3:** Name any real gaps directly and honestly. "The domain is new. The problem is not." Don't hide gaps — acknowledge them and show your transfer path.
   - **Para 4:** Why this company specifically. What they're doing that matters and why you want to build it.
   - **Para 5 (optional):** Invitation to discuss — short, warm close.
   - Sign with: name, email, phone.
   - Date: today's date.
   - Recipient: "{Company} Recruiting Team / Re: {Role Title}"

2. **Rule:** Never pad. Cut anything that doesn't add signal. The reader has 30 seconds.

### Step 8 — Generate HTML and PDF (automatic, always)

PDF generation is not optional — run it automatically for every tailor command.

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
