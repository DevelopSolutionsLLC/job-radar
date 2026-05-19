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

4. **If `resume.md` doesn't exist**, mention it naturally: "You don't have a resume imported yet. Want to do that first? Just run `/job-radar import resume`." Don't block — let the command proceed unless it specifically needs the resume (tailor, evaluate, skills).

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

7. **Skills queue check-in** — Silently read `data/skills.md`. If it exists and has any rows where `Status` is `in progress`, or `not started` with a `Started` date set, set a flag to show the following prompt **after the current command completes** (once per session, non-blocking):

   > "You have {N} skill(s) in progress — quick check-in before you go?
   > - Kubernetes (~2 weeks) — in progress since May 6
   > - Apache Spark (~20 hrs) — not started
   >
   > Type "yes" to update statuses, or "skip" to continue."

   If the user says yes, for each item ask: "Have you completed [skill]? (yes / still going / not yet)"
   - **yes** → set `Status` to `done`, set `Completed` to today's date. Then offer: "Want me to add [skill] to your resume? I'll write a bullet and add it to your skills section." If they agree, run the **Promote skill to resume** flow below.
   - **still going** → no change
   - **not yet** → no change

   If the user says skip, do nothing. Do not show this prompt again in the same session.

8. **Skills bootstrap** — Silently check `data/skills.md`. If it exists but has no data rows (only a header or is empty), AND `career-bank.md` exists with keyword frequency tracker entries where Count ≥ 3:

   Run gap analysis silently:
   - Identify all keywords in the tracker with Count ≥ 3
   - A gap = keyword with Count ≥ 3 that has no matching tag in any bullet section of `career-bank.md`
   - For each gap: add a row to `data/skills.md` with `JD Count` from the tracker, `Resource = —`, `Est. Time = —`, `Status = not started`, `Started = —`, `Completed = —`
   - Sort rows by JD Count descending

   After the current command completes, show one quiet line:
   > "Seeded your skills list with {N} gaps from your JD history — run `/job-radar skills` to review."

   Skip silently if: `career-bank.md` doesn't exist, no keywords with Count ≥ 3 exist, or `data/skills.md` already has data rows.
   Do not block or interrupt the requested command.

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
    check <url>                Verify a posting is still live

  Skills
    skills                     Keyword gaps + study queue

  Configure
    list                       Show current configuration (companies, roles, profile)
    add "name or title"        Add a company, role title, or RSS feed URL
    remove "name or title"     Remove a company or exclude a role title
    config                     Full setup wizard (location, targets, preferences)

  Other
    donate                     Support the project
    help                       Show this list
```

## Commands

### Discovery & Scanning

`scan` and `discover` are one unified flow. There is no separate `discover` command. Discover always runs **before** scan so newly found companies are included in the same scan run.

**Scan UX rules:** Do NOT narrate which bash commands you are running. Do NOT echo raw script output. Show only human-readable progress:
- Fresh scan (cache miss or --force): `"Discovering companies..."` before discover.mjs, then `"Scanning {N} portals..."` before scan.mjs
- Cached scan: `"Loading your last scan..."` before running read-cache.mjs
After scripts finish, go directly to the post-scan pick list. No summaries, no script headers.

**Cache check — always the first step for `scan`:**
Run `node scripts/read-cache.mjs` (single call). This returns JSON with `{ fresh, ageHours, total, excluded, postings[] }`.
- If `fresh: true` → cached run. Show "Loading your last scan..." then proceed to the pick list using `postings`.
- If `fresh: false` → fresh run. Run `node scripts/discover.mjs --add all` (show "Discovering companies..."), then `node scripts/scan.mjs` (show "Scanning portals..."), then run `node scripts/read-cache.mjs` again to get the updated postings.

- `/job-radar scan --force` → Skip cache check. Run discover then scan, then read-cache.mjs.
- `/job-radar scan --dry-run` → Run `discover --dry-run` then `scan --dry-run`. Preview only, no interactive flow.
- `/job-radar scan --source <type>` → Skip discover, scan only one ATS type. Always fetches fresh.

#### Post-scan interactive flow

After `node scripts/read-cache.mjs` returns (or fresh scan completes), do NOT dump a summary. Instead, use the `postings` array from the JSON output directly:

1. **The posting pool is already filtered and sorted** by `read-cache.mjs`: compatible only (no `compatible: false`), tracker-matched and snoozed postings removed, sorted by relevance desc, top 150 returned. The JSON now includes:
   - `excluded` — total filtered (incompatible + already tracked + snoozed)
   - `excludedTracked` — count filtered because they're in tracker.md
   - `excludedDismissed` — count filtered because they were snoozed (dismissed.json)

2. **Filter out incompatible postings** — already done by read-cache.mjs. No additional filtering needed.

   The `excludedTracked` and `excludedDismissed` counts are available in the JSON but are not shown to the user inline — they are internal metrics only.

2a. **Session pick list check — do this BEFORE tiering:**

   Read `data/session-pick-list.json` (if it exists). If it exists:
   - Compare its `cache_timestamp` field to the `scanTimestamp` from the current `read-cache.mjs` output.
   - If they **don't match** (cache was refreshed) → ignore the session file. Proceed with step 3 to rebuild tiers. The new session file will be written after tiering.
   - If they **match** → the scan cache is the same, but the tracker may have changed since the session file was built (user evaluated/applied/discarded entries this session). Before displaying, **reconcile `shown` against the current postings pool**:
     1. Build a Set of valid URLs from the `postings[]` array returned by `read-cache.mjs` (these are already filtered — no tracked, no dismissed entries).
     2. Partition `shown` into `keep` (URL is in the valid set) and `stale` (URL is no longer in the valid set — it was tracked or dismissed since this session file was written).
     3. For each stale entry, pull a replacement from the tier buffer matching that entry's `tier` field (same cascade logic as post-evaluate slot replacement: tier 1 → t1 buffer → t2 → t3; tier 2 → t2 → t3; tier 3 → t3 only; local → buffers.local only, no cascade). If all buffers are empty, skip — the list may be shorter than 20.
     4. Renumber all entries in `shown` (keep + replacements) consecutively starting at 1. Replacements go at the bottom.
     5. Write the updated `data/session-pick-list.json`.
     6. Proceed to step 4 with the reconciled `shown`.

   If the session file doesn't exist, proceed with step 3 normally.

   **OUTPUT RULE (non-negotiable):** Between outputting "Loading your last scan..." and outputting "Best matches from this scan:", output zero lines of text. No cache status, no session status, no match confirmation, no explanatory text. Any text here exposes backend plumbing to the user — that is always wrong.

3. **Tier compatible postings** by fit quality. First, derive the candidate's seniority level from their resume:

   **Step A — Read `resume.md`** and identify:
   - The **current role title** (most recent position — the role at the top of the Experience section)
   - The **career trajectory** — look at the sequence of prior titles to understand whether the candidate has been progressing on a management track, IC track, or mixed/hybrid path

   **Step B — Use AI judgment to classify each posting title** (no hardcoded keywords) into one of three seniority bands relative to this candidate's resume:
   - **Current-level** — a lateral or peer role: same or similar seniority to the candidate's current title. For example, if the current role is "Senior Manager, Software Engineering", other Senior Manager or similar-scope manager roles are current-level.
   - **Promotion-level** — one step up: roles that represent a natural next step. For a Senior Manager this might be Director, Head of, VP. For a Staff Engineer it might be Principal or Distinguished. Use the candidate's career trajectory to inform what "one step up" means for them.
   - **Demotion/adjacent** — roles below the candidate's current seniority, or on a different track (e.g., IC roles when the candidate is in management, or pure manager roles when the candidate has been IC-only). These may still be relevant — they just rank lower.

   **Named company** — posting type is `greenhouse`, `ashby`, `lever`, `bamboohr`, `teamtailor`, or `workday` (NOT `rss`).

   **Before assigning T1/T2/T3**, split the compatible postings into two pools:
   - **`localPool`** — postings where `distanceMiles` is not null. `scan.mjs` pre-computes this by geocoding each unique non-remote job city and measuring haversine distance from `home_zip`. Any city within `local_radius_miles` of home gets a numeric `distanceMiles` value. If `home_zip` is not configured in `config/profile.yml`, or if the scan was run with `--dry-run`, `distanceMiles` is always null and `localPool` is always empty.
   - **`remotePool`** — all remaining compatible postings (anything where `distanceMiles` is null).

   T1/T2/T3 tiering operates **only on `remotePool`**. Local postings never compete for remote-tier slots.

   **Local pool sort:** Sort `localPool` by `distanceMiles` ascending (closest to home first). Within the same distance band (within 5 miles of each other), sort current-level titles above promotion-level, then other. Relevance breaks ties within the same distance + title band.

   Assign tiers from `remotePool` (mutually exclusive — once a posting is placed, exclude it from lower tiers):
   - **Tier 1** — named company AND (current-level OR promotion-level title)
     *Right seniority at a known company. Sort: current-level first, then promotion-level; each group by relevance desc.*
   - **Tier 2** — named company AND any other relevant title (demotion, adjacent track, or any match from `targets.roles` in profile.yml)
     *Known company, broader title match. Sort: current-level first, then promotion-level, then other; each group by relevance desc.*
   - **Tier 3** — any source (RSS or named), where relevance ≥ 3 OR title is current-level or promotion-level
     *Discovery blast — company may be unknown. Sort: current-level first, then promotion-level, then other; each group by relevance desc.*

   **Across all tiers, title proximity to the candidate's current position is the primary sort key.** Relevance score breaks ties within each title band. A current-level manager role at a lesser-known company always ranks above a high-relevance IC role within the same tier.

   **After tiering, write `data/session-pick-list.json`** (do this during step 3, before displaying the list):
   - `cache_timestamp`: the `scanTimestamp` value from the read-cache.mjs output
   - `built_at`: current ISO timestamp
   - `shown`: up to 20 postings that will be displayed (see step 4 for slot allocation), each with `{ slot, tier, url, company, title, location }`. Local entries use `tier: "local"`.
   - `buffers.t1`: ALL tier-1 candidates beyond what's shown
   - `buffers.t2`: ALL tier-2 candidates beyond what's shown
   - `buffers.t3`: ALL tier-3 candidates beyond what's shown
   - `buffers.local`: ALL localPool candidates beyond what's shown

   Writing the session file adds no visible latency — it's just serializing data already in context.

4. **Present up to 20 results as a numbered list.** Each tier and the local pool get exactly 5 slots — no overflow cascade between them:

   ```
   shown_t1    = tier1[:5]
   shown_t2    = tier2[:5]
   shown_t3    = tier3[:5]
   shown_local = localPool[:5]
   total shown = up to 20
   ```

   Separate the four groups with a blank line. **No tier labels.** Continuous numbering 1–20. Omit a group's blank-line separator if the preceding group was empty. If `localPool` is empty, omit the local group entirely — no empty section, no placeholder text.

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

   16. CrowdStrike    — Senior Software Engineer, Detection     · Austin, TX
   17. Rackspace      — Engineering Manager, Cloud Platform     · San Antonio, TX
   18. Leidos         — Staff Engineer, Cybersecurity           · San Antonio, TX
   19. General Motors — Senior Software Engineer, Platform      · Austin, TX
   20. Dell Technologies — Principal Engineer, Infrastructure   · Austin, TX

   Pick a number to evaluate, or multiple (e.g., "1, 3, 5").
   Type "all top" to evaluate the top 5.
   Type "skip" to finish.

   ```

   Format location as a short label after `·`. Take only the first segment if multiple locations are listed (split on `;`). Normalize all of these → "Remote (US)": "Remote, USA", "Remote, US", "United States - Remote", "US - Remote", "USA - Remote", "Remote- USA", "US (remote)", "USA (Remote)", "UNITED STATES - Remote". Normalize → "Remote (CA)": "Remote, Canada". Normalize → "Remote (UK)": "Remote, UK", "Remote, United Kingdom". Normalize → "Remote": bare "Remote" or "GLOBAL - Remote". Omit `·` if location is null.

   **Local tier location labels:** For local pool entries, show the nearest city and distance instead of the raw location string. Find the city segment within `local_radius_miles` that has the smallest `distanceMiles` value (use the same segment parsing as scan.mjs: split on `;`, take city before first `,`). Format as `City (Nmi)` — e.g. `San Antonio (8mi)` or `Austin (79mi)`. If `distanceMiles` ≥ 100, omit the distance and show only the city name.

   Do not show any footnote about excluded or snoozed counts. That information is implementation detail — the list is already filtered and the user doesn't need to know the mechanics.

   Note: Discarded tracker entries are automatically suppressed for 60 days from their date, then reappear in the pick list. Snoozed (skipped) postings are suppressed for 30 days. All other tracker statuses (Applied, Evaluated, Interview, etc.) are suppressed indefinitely.

5. **After the posting list, show a quiet footnote** if discover added any new companies during this run. Parse the discover output for newly added company names and show one line — no action required:

   ```
   Added 3 companies to your scan list: Acme Corp, BuildCo, Veriff.
   ```

   If no new companies were added, omit this line entirely.

5a. **Pre-screen offer** — immediately after the footnotes, show:

   ```
   Want me to pre-screen these before you pick? I'll score each one and flag the strong matches. (~1 min)
   ```

   If the user says yes (or "y", "sure", "yeah", or similar):

   - Fetch all shown JD URLs in parallel — up to 20 (same fetch logic as the evaluate flow — use `modes/evaluate.md` scoring)
   - For each posting, produce only the overall weighted score (1–5). Do not generate a report or write to tracker.
   - Re-present the full list with scores inline, sorted within each tier group by score desc. Use `✓` for score ≥ `targets.min_score` (from profile.yml) and `✗` for below. Include a one-line header explaining the scale:

   ```
   Scores: 1–5 scale · ✓ = strong match (≥ 3.5) · ✗ = below threshold

    1. ✓ 4.2  Deepgram   — Engineering Manager, Console Team    · Remote (US)
    2. ✓ 3.9  Airbnb     — Engineering Manager, Identity        · Remote (US)
    3. ✓ 3.7  GitLab     — Engineering Manager, Infrastructure  · Remote (US)
    4. ✗ 2.6  Affirm     — IT Engineering Manager (Endpoint)    · Remote (US)
    5. ✓ 4.0  Deepgram   — Engineering Manager, Engine Team     · Remote (US)

    6. ✓ 3.6  Cloudflare — Solutions Engineering Manager        · Remote
   ...

   Pick a number to evaluate fully, or multiple (e.g., "1, 3, 5").
   Type "all top" to evaluate the top 5.
   Type "skip" to finish.
   ```

   - Update `data/session-pick-list.json`: add a `prescreened: true` flag and store `score` on each entry in `shown` so slot replacement can use it.
   - If a posting's JD is unreachable (404, timeout), show `score: —` and omit the ✓/✗ indicator for that entry.
   - If the user says no (or skips), proceed directly to step 6 with the original numbered list.

6. **When the user picks a number**, look up the URL from the `shown` array in `data/session-pick-list.json` (or from the postings array if the session file wasn't written yet) and run the evaluate flow automatically — no URL copy-pasting needed.
7. **After each evaluation**:
   - If score ≥ `targets.min_score` (from profile.yml): automatically run the full tailor flow (resume + cover letter + PDFs) without asking — then open the job posting URL in the browser with `open <url>`, then ask: **"Did you apply? (y/n)"**
     - **y** → add to tracker.md with status `Applied`, include PDF links in the PDF column
     - **n** → add to tracker.md with status `Evaluated`, no PDF links; offer to pick another from the list
   - If score < `targets.min_score`: add to tracker.md with status `Discarded`; offer to pick another from the list or stop.

   **MANDATORY — slot replacement (do this before any user prompting):**
   Every evaluate outcome (Applied, Evaluated, Discarded) must trigger a slot replacement. Do not skip this step.

   1. Read `data/session-pick-list.json`
   2. Remove the evaluated posting from `shown`
   3. Renumber all remaining `shown` entries consecutively starting at slot 1
   4. Pull the next candidate from the tier buffer matching the removed entry's `tier` field:
      - `tier: "t1"` → pull from `buffers.t1`; if empty, try `buffers.t2`; if still empty, `buffers.t3`
      - `tier: "t2"` → pull from `buffers.t2`; if empty, try `buffers.t3`
      - `tier: "t3"` → pull from `buffers.t3` only
      - `tier: "local"` → pull from `buffers.local` only (no cascade to remote tiers)
   5. If the matching buffer (and all fallback buffers) are empty, do a lazy refill before giving up:
      a. Run `node scripts/read-cache.mjs --top 150`
      b. Filter out all URLs currently in `shown`
      c. Classify the remaining postings into local/t1/t2/t3 using the same logic as step 3
      d. Populate `buffers.t1/t2/t3/local` with ALL newly classified candidates
      e. Write the updated session file
      f. Pull from the appropriate tier buffer
      If even after lazy refill no candidates exist, show the list with fewer than 20 entries (final fallback only).
   6. Append the replacement at slot = (length of remaining shown + 1) — always goes at the bottom
   7. Write the updated `data/session-pick-list.json`
   8. Display the full refreshed pick list with `*` next to the new entry

   **Then** offer to pick another from the list or stop.

8. **If the user says "all top"**, evaluate the top 5 sequentially, showing a brief score summary after each.
9. **When the user types "skip"** — snooze all postings from the current pick list that were NOT evaluated in this session:

   - Collect the URLs + company + title for every posting in the pick list (up to 20 entries) that the user did not pick for evaluation.
   - Read `data/dismissed.json` (parse as array; treat as `[]` if missing or unreadable).
   - For each unselected posting, upsert into the array using `url` as the dedup key:
     ```json
     {
       "url": "...",
       "company": "...",
       "title": "...",
       "shown_at": "<current ISO timestamp>",
       "hide_until": "<current ISO timestamp + 30 days>"
     }
     ```
     If the URL already exists, overwrite the entry (resets the 30-day window).
   - Write the updated array back to `data/dismissed.json`.
   - Delete `data/session-pick-list.json` (use Bash `rm -f`) so stale session state doesn't persist into the next session.
   - Output exactly one quiet line (no blank line before it):
     ```
     {N} postings snoozed for 30 days.
     ```
   - Do NOT show this snooze line if every posting in the pick list was evaluated (nothing left to snooze).

This turns scan into a single interactive session that covers both active postings and company discovery. The user goes from "scan" to "evaluate" to "tailor" without ever touching a URL or running a second command.

### Resume hub

All resume-related commands route through `resume`:

- `/job-radar resume import` (or `/job-radar import resume`) → Import the user's resume into `resume.md`. See **Import Resume** implementation below.
- `/job-radar resume import <path>` (or `/job-radar import resume <path>`) → Import from a specific file (PDF, DOCX, TXT, HTML, MD).
- `/job-radar resume tailor` (or `/job-radar tailor`) → Tailor a resume for a specific role. See **Tailor Resume** implementation below.
- `/job-radar resume audit` → Run the **Resume Audit** flow. See implementation below.

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
    Company size            any
    Deal-breakers           no equity
```

Rules:
- Show the first 3 company names per ATS type, then "+N more" if there are more.
- Omit any section or field that is empty or not set.
- Format compensation as "$X min / $Y target"; omit if not set in profile.
- If `config/profile.yml` doesn't exist yet, show only the portals summary and add: "Run `/job-radar config` to set up your profile."

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

- `/job-radar evaluate <url or number>` → If the user provides a URL, use it directly. If they provide a number (from the post-scan list): first check if the posting is already in context from the current scan session — if so, use that URL directly without re-reading any file. If not in context, run `node scripts/read-cache.mjs --top 150` to rebuild the ranked list and pick the matching index. If they provide a company or role name: run `node scripts/read-cache.mjs --find "<name>"` (returns only matching postings, max 5, a few hundred bytes). Do not read `data/scan-cache.json` directly — it can exceed 1,000 entries. Then read `modes/evaluate.md`, fetch the JD, score against resume.md, write evaluation report to reports/. Also extracts keywords, updates the frequency tracker in `career-bank.md`, and reports skills gaps with bullet suggestions. After evaluation, run the **Post-Evaluate Gap Check** below. If score ≥ `targets.min_score`, automatically proceed to the full tailor flow (resume + cover letter + PDFs + open URL) without asking — do not wait for user confirmation. If score < `targets.min_score`, add to tracker as Discarded and offer to pick another.

#### Post-Evaluate Gap Check

After writing the evaluation report, extract the Gaps list from the Skills Gap section of the report. If there are no gaps, skip this section silently.

For each gap keyword:
1. Use WebSearch to find the best free (or near-free) training resource:
   - Query: `"[skill name] free course tutorial"` or `"[cert name] free prep guide"`
   - Prefer: official docs → vendor free labs → Coursera audit → YouTube playlist → paid course
   - For paid certifications: note the exam cost (e.g., "CISSP: $699 USD exam fee")
2. Estimate time to learn honestly:
   - < 1 week (~5–15 hrs): CLI tools, language basics, quick platform walkthroughs
   - 1–4 weeks: Kubernetes, cert prep modules, new frameworks
   - 1–3 months: AWS SA cert, CISSP
   - 3+ months: OSCP, advanced ML/DL

Present gaps grouped by effort (see **Skills Gap Branching Rules** for framing details):

```
⚡ Quick wins — learnable while your application is in review:
  1. [Skill] (~[time]) — [Resource name] (free): [URL]

📚 Longer investments — worth tracking:
  2. [Skill] (~[time]) — [Resource]; [cost if paid cert]

Want me to add any of these to your skills queue? (list numbers, "all", or "skip")
```

When the user selects items:
- Add rows to `data/skills.md`: Skill, JD Count (from career-bank.md tracker or 1 if new), Resource (the URL), Est. Time, Status = `not started`, Started = `—`, Completed = `—`
- If skill already exists in table (case-insensitive match): increment JD Count, update Resource if a better URL was found — no duplicate rows
- `/job-radar status` → Show pipeline summary from data/tracker.md: counts of evaluated, applied, interviewed, offered, rejected. If data/scan-cache.json exists, show how many postings are available and when the cache was last updated.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Skills

`/job-radar skills` (also accepts `/job-radar gaps` or `/job-radar learn` as aliases — both route here):

1. **Keyword gaps** — Read `career-bank.md` and show the frequency tracker. Highlight any keyword that appears 3+ times across evaluated JDs with no matching bullet tag. These are the gaps most likely to cost the user a screen.

2. **Study queue** — Read `data/skills.md` and show all rows sorted by JD count descending. Group by status: In Progress first, then Not Started, then Done (collapsed unless user asks). Compute priority from JD Count: High ≥ 6, Medium 3–5, Low < 3.

3. **After showing both**, ask:
   > "Want to update any queue statuses, or add a gap keyword to the queue?"
   - If yes to statuses: for each in-progress or not-started item, ask "Still working on [skill]? (done / still going / not yet)"
     - done → set Status to `done`, set Completed to today. Offer to promote to resume (run **Promote skill to resume** flow).
     - still going / not yet → no change
   - If yes to adding gaps: for each uncovered keyword gap (3+ appearances, no bullet), ask if they want to add it to the queue. If yes, append a row to `data/skills.md` with Status = `not started` and JD count from the tracker.

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

**Native tools for all data file edits** — use the Read, Edit, and Write tools directly for all modifications to `data/skills.md`, `career-bank.md`, `data/tracker.md`, `resume.md`, and config files. Never spawn a shell script to read or write these files.

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

Compare the JD's required skills/keywords against `resume.md` and `career-bank.md` tags. Identify:
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
2. Claude rewrites it as a resume bullet that matches both the JD's language and the tone/style of the user's existing bullets in `career-bank.md`. Show the draft and let them approve or adjust.
3. Add the approved bullet to the appropriate role section in `career-bank.md` with updated tags.
4. Add the skill to the relevant category in `resume.md`'s Skills section.

For each skill the user says "skip" (they don't have it):
1. Use WebSearch to find the best free or near-free resource for that specific skill (query: `"[skill] free course"` or `"[skill] free tutorial"`).
2. Estimate the time to learn honestly (< 1 week, 1–4 weeks, 1–3 months, 3+ months).
3. If it's a paid certification, show the exam cost alongside the free prep.
4. Apply effort branching (see **Skills Gap Branching Rules**):

   **⚡ If < 1 week:**
   Show the specific resource URL found, frame as "learnable while your application is in review."
   Offer: "Add to your skills queue? If you pick this up before the interview, I can help you add it to your resume."

   **📚 If ≥ 1 week:**
   Show the resource URL + cost if paid.
   Offer: "Add to your skills queue?"

5. If user says yes: write a row to `data/skills.md`:

   ```
   | [Skill] | [JD Count from tracker or 1] | [URL] | [Est. Time] | not started | — | — |
   ```

   If skill already exists in table (case-insensitive): increment `JD Count`, update Resource if a better URL was found. No duplicate rows.

6. If user says no or skip: note the gap, move on.

Status values: `not started`, `in progress`, `done`. Set `Started` to today's date when the user begins a skill (via check-in). Set `Completed` when marked done. Use `—` for unset dates. Priority is computed from JD Count at display time: High ≥ 6, Medium 3–5, Low < 3.

This turns every "skip" into a concrete next step — a researched path with a real URL and an honest time estimate, not a generic suggestion.

### Step 3 — Select summary paragraph

Read `career-bank.md` and pick the best summary paragraph based on role level + domain:
- IC/Staff/Principal → Summary #4
- Manager/Senior Manager + Security → Summary #1
- Manager/Senior Manager + Platform/Product → Summary #2
- Director/VP → Summary #3
- AI/ML focus → Summary #5

If the user's experience from Step 2 changes the framing (e.g., they revealed strong AI experience that wasn't in the bank), offer to write an updated summary paragraph and add it to the bank.

### Step 4 — Match bullets to JD keywords

For each position in `career-bank.md`:
1. Read the `<!-- tags: ... -->` comments on each bullet section
2. Score each section by how many JD keywords match its tags (including any new bullets from Step 2)
3. Pick bullets per position: **4 for the current role, 3 for all prior roles** — never exceed these limits
4. Lead with the strongest keyword match, end with broadest signal
5. **Blend when it makes the resume stronger:** If two bullets from the same role address the same skill gap or prove a stronger combined point together, merge them into one tight bullet rather than listing them separately. One well-constructed blended bullet is better than two thin ones. Never blend just to hit the count — blend only when the result is genuinely stronger.

**Before including any bullet, apply the Writing Standards from CLAUDE.md.** Rewrite weak bullets on the fly — fix passive voice, remove "responsible for", add numbers if missing from the resume context, eliminate AI-sounding flourishes (echo structures, rhetorical contrasts, self-congratulatory editorializing). The output must read like a FAANG-tier resume writer produced it for a $300K+ candidate, not like a self-written job description.

### Step 5 — Reorder skills

Read the Skills section from `career-bank.md`. Reorder skill categories to front-load whatever the JD emphasizes most. Within each category, lead with the specific tools/technologies the JD mentions.

### Step 6 — Assemble and write

1. Combine: Contact → Selected Summary → Tailored positions → Education → Reordered Skills
2. **Before writing to disk:** Run the full Editor Pass defined in `modes/generate-resume.md` against every bullet in the assembled resume. Every resume-bullet check must pass. Rewrite anything that fires. Specifically: check for near-duplicate bullets within each role and blend or cut before writing.
3. Write to `output/resume-tailored-{company-slug}-{date}.md`
4. Show the user a diff summary:
   - Which summary was picked
   - Which bullet categories were chosen per role
   - Which skills were front-loaded
   - What new bullets were added to the bank (if any)

### Step 7 — Generate cover letter

Always generate a cover letter alongside the tailored resume — it is not optional.

**Voice standard:** Write as a peer-to-peer communication between two senior leaders — not a candidate appealing to a gatekeeper. The candidate has options. The writing must reflect that. Apply the full Writing Standards from CLAUDE.md.

1. Write `output/cover-letter-{company-slug}-{date}.md` — 3 paragraphs max, hard cap at 3/4 of a page. Treat the limit as absolute — if it runs long, cut sentences, not ideas:
   - **Para 1:** Open with a concrete fact or result from the candidate's own work — never "I am applying for", never a domain insight or wisdom statement. Banned openers: "Building X requires more than Y" (domain observation, not candidate fact), "When X happens, Y happens" (industry insight), any sentence that could open a blog post or think-piece instead of a letter. State what you are doing right now that directly maps to this role. Specific numbers, named technologies, named clients. 3-4 sentences.
   - **Para 2:** Make the case with evidence — credentials, compliance coverage, key accomplishments. If a gap exists, one direct sentence bridges it ("X is the one gap; adjacent experience in Y covers most of the ground"). No self-apologizing. 4-5 sentences.
   - **Para 3:** One specific reason this company over any other, and a confident close. Not "I would be grateful" or "I'd be glad to" — something direct like "I can start a conversation in the next two weeks" or "Happy to go deeper on any of this." 2-3 sentences. **The final sentence must not be a one-liner flourish or self-summary** ("That's where I do my best work", "That's the job", "That feedback loop is where I do my best work") — close with logistics and an invitation, nothing more.
   - Sign with: name, email, phone.
   - Date: today's date.
   - Recipient: "{Company} Recruiting Team / Re: {Role Title}"

2. **Hard rules:** No excited/grateful/honored language. No cliché closes ("I look forward to hearing from you"). No sentence that could apply to any company. No restating the resume in prose. 3/4 page is not a target — it's a ceiling.

3. **Before writing to disk:** Run the full Editor Pass defined in `modes/generate-resume.md` against the cover letter draft. Every cover-letter check must pass. Rewrite anything that fires. Do not write the file until the pass is clean.

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

4. After both PDFs are generated, confirm the output filenames in one line. Then automatically open the original job posting URL (not the PDF files) in the default browser with `open <url>` — do not ask first. Then ask: **"Did you apply? (y/n)"**
   - **y** → add to tracker.md with status `Applied`, include PDF links in the PDF column
   - **n** → add to tracker.md with status `Evaluated`, no PDF links; offer next steps

### Step 9 — Update keyword tracker

Append the JD's keywords to the **Keyword Frequency Tracker** table in `career-bank.md`. Increment count if the keyword already exists, add a new row if not. Update the "Last Seen" date.

This tracks which skills employers ask for most, so the user can see which bullets are doing heavy lifting and which skills to invest in.

## Skills Gap Branching Rules

These rules apply whenever a skills gap is presented to the user — in the Post-Evaluate Gap Check and in tailor Step 2. Both flows follow these rules.

**Effort threshold:** < 1 week ≈ up to ~15 hours of focused self-study. Examples:
- CLI tool basics: Terraform intro, Docker fundamentals, kubectl basics
- Language quick-start: Go basics, Python scripting, SQL fundamentals
- Platform walkthroughs: AWS free tier labs, GCP Qwiklabs free tier, Play with Docker

**Research rules (apply to every gap):**
- Use WebSearch: `"[skill] free course"` or `"[skill] free tutorial [current year]"`
- Prefer: official docs > vendor free labs > Coursera audit mode > YouTube > paid course
- For paid certifications: always state exam cost (e.g., "CISSP: $699 USD"), not just study material cost
- Never link to paywalled or pirated content
- If WebSearch returns nothing reliable: link the official docs page + label "free"

**Quick win framing (< 1 week):**
- Lead with ⚡ and "learnable while your application is in review"
- Track in `data/skills.md` with Status = `not started`
- After user marks done in check-in: offer to write a resume bullet + add to Skills section

**Long investment framing (≥ 1 week):**
- Lead with 📚 and "worth tracking — appears in [N] JDs"
- Track in `data/skills.md` with Status = `not started`
- Revisit in the skills check-in flow

**Paid certification transparency:**
- Always show: "[Cert] — [Free prep resource]; exam cost: $[N] USD"
- Frame as: "The cert pays off if this role type keeps appearing — start with the free prep"

---

## Promote skill to resume

Run this flow when a skill is marked `done` in the skills queue check-in and the user agrees to add it.

1. Ask: "Tell me about your experience with [skill] — one or two sentences, doesn't need to be polished."
2. Rewrite their response as a resume bullet matching the tone and structure of existing bullets in `career-bank.md`. Show the draft and ask for approval or adjustments.
3. Once approved:
   - Add the bullet to the appropriate role section in `career-bank.md` with tags matching the skill name
   - Add the skill to the relevant category in the Skills section of `resume.md` (if not already present)
4. Confirm: "[Skill] added to your resume and bullet bank."

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
