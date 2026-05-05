---
name: job-radar
description: "Job search pipeline: scan, discover, import resume, evaluate, tailor, gaps, learn, add company/role, status, donate"
user_invocable: true
args: subcommand
argument-hint: "[scan | discover | import resume | evaluate | tailor | gaps | learn | add company | add role | remove company | remove role | add feed | configure | status | check | donate | help]"
---

# /job-radar — Job Search Pipeline

Parse the user's subcommand and execute accordingly.

If no subcommand is given (user just types `/job-radar` or `/job-radar help`), print this command reference:

```
/job-radar — Job Search Pipeline

  Scanning & Discovery
    scan                       Scan all portals for new postings
    scan --dry-run             Preview without writing
    scan --source <type>       Scan one ATS type only
    discover                   Find hiring companies from RSS feeds
    discover --fresh           Sort by newest postings
    discover --urgent          Sort by longest-open roles
    discover --add tier1       Auto-add top-tier companies

  Resume & Tailoring
    import resume                  Import resume (paste, PDF, file, LinkedIn)
    import resume <path>           Import from a specific file
    tailor <url>               Build a tailored resume for a specific job
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
    evaluate <url>             Score a posting + extract skill gaps
    status                     Pipeline summary (pending/applied/etc.)
    check <url>                Verify a posting is still live

  Other
    donate                     Support the project
    help                       Show this list
```

## Commands

### Discovery & Scanning

- `/job-radar scan` → Run `node scripts/scan.mjs`. Show the structured summary to the user.
- `/job-radar scan --dry-run` → Run `node scripts/scan.mjs --dry-run`. Preview only.
- `/job-radar scan --source <type>` → Scan only one ATS type (greenhouse, ashby, lever, etc.)
- `/job-radar discover` → Run `node scripts/discover.mjs`. Show tiered results.
- `/job-radar discover --top N` → Show top N per tier.
- `/job-radar discover --add tier1` → Auto-add tier 1 companies to portals.yml via ATS detection.
- `/job-radar discover --add all` → Auto-add all discovered companies.
- `/job-radar discover --fresh` → Sort by newest postings first (just posted = top).
- `/job-radar discover --urgent` → Sort by longest-open roles first (desperate to hire).

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
- `/job-radar configure` → Interactive setup: walk through target roles, location preferences, companies to track. Read and update portals.yml and config/profile.yml.

### Pipeline

- `/job-radar evaluate <url>` → Read `modes/evaluate.md`, fetch the JD, score against resume.md, write evaluation report to reports/. Also extracts keywords, updates the frequency tracker in `resume-bullets.md`, and reports skills gaps with bullet suggestions.
- `/job-radar gaps` → Show the current keyword frequency tracker from `resume-bullets.md` and highlight any keywords with 3+ appearances that have no matching bullet tags.
- `/job-radar learn` → Show `data/skills-queue.md` — the prioritized list of skills to learn, sorted by JD count. Update statuses interactively.
- `/job-radar status` → Show pipeline summary from data/tracker.md and data/pipeline.md: counts of pending, evaluated, applied, interviewed, offered, rejected.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Tailoring

- `/job-radar tailor <url>` → Read the JD, match against `resume-bullets.md`, assemble a tailored resume. See **Tailor Resume** implementation below.

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
4. Ask if they want to generate a PDF: `node scripts/generate-pdf.mjs`

### Step 7 — Update keyword tracker

Append the JD's keywords to the **Keyword Frequency Tracker** table in `resume-bullets.md`. Increment count if the keyword already exists, add a new row if not. Update the "Last Seen" date.

This tracks which skills employers ask for most, so the user can see which bullets are doing heavy lifting and which skills to invest in.
