# /job-radar — Job Search Pipeline

Parse the user's subcommand and execute accordingly. If no subcommand is given, show available commands.

## Commands

### Scan

Discovery runs automatically before every scan — there is no standalone `discover` command.

- `/job-radar scan` → Run `node scripts/discover.mjs --add all` (silent), then `node scripts/scan.mjs`. On a cached run (< 12h), skip discover and return cached results. After scan, follow the **Post-scan interactive flow** in SKILL.md.
- `/job-radar scan --force` → Run discover then scan, bypassing the 12h cache.
- `/job-radar scan --dry-run` → Run `discover --dry-run` then `scan --dry-run`. Preview only, no interactive flow.
- `/job-radar scan --source <type>` → Skip discover, scan only one ATS type (greenhouse, ashby, lever, etc.). Always fetches fresh.

### Resume

- `/job-radar resume import` (or `/job-radar import resume`) → Import the user's resume into `resume.md`. Accepts pasted text, file path (PDF, DOCX, TXT, HTML, MD), or LinkedIn URL.
- `/job-radar resume import <path>` → Import from a specific file.
- `/job-radar resume tailor` (or `/job-radar tailor`) → If the user provides a number (from the post-scan list) or a company name, look up the URL from `data/scan-cache.json` (`all_postings`). If they provide a URL, use it directly. Then fetch the JD, match against `resume-bullets.md`, assemble a tailored resume. See **Tailor Resume** in SKILL.md.
- `/job-radar resume audit` → Run the **Resume Audit** flow in SKILL.md.

### Configuration

These commands modify `config/portals.yml` so the user never has to edit YAML directly.

- `/job-radar list` → Read `config/portals.yml` and `config/profile.yml` and print a human-readable summary: role filters, companies tracked by ATS type (first 3 names + count), RSS feeds, and profile settings. No YAML. Omit empty sections.

- `/job-radar add <value>` → Auto-detect: URL → RSS feed; role keyword → `title_filter.positive`; otherwise → company (run `node scripts/resolve-ats.mjs`).
- `/job-radar add company "<name>"` / `add role "<title>"` / `add feed <url>` → Explicit variants.
- `/job-radar remove <value>` → Auto-detect: role keyword → `title_filter.negative`; otherwise → remove company from portals.yml.
- `/job-radar remove company "<name>"` / `remove role "<title>"` → Explicit variants.
- `/job-radar configure` / `/job-radar config` → Run the **Configure Wizard** in SKILL.md.

### Pipeline

- `/job-radar evaluate <url, number, or company name>` → Look up URL from `data/scan-cache.json` (`all_postings`) if a number or name is given; use URL directly if provided. Fetch JD, score against `resume.md`, write evaluation report to `reports/`. Extracts keywords, updates frequency tracker in `resume-bullets.md`, reports skill gaps. After evaluation, offer to tailor or pick another.
- `/job-radar status` → Show pipeline summary from `data/tracker.md`: counts of evaluated, applied, interviewed, offered, rejected. Show cache info from `data/scan-cache.json` if present.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Skills

- `/job-radar skills` (also `/job-radar gaps` or `/job-radar learn` — both alias here) → Two-part view: (1) keyword frequency gaps from `resume-bullets.md` — keywords with 3+ JD appearances and no matching bullet tag; (2) study queue from `data/skills-queue.md` sorted by JD count. After showing both, offer to update statuses or add gap keywords to the queue.

### Support

- `/job-radar donate` → Print the donate QR + Cash App info directly as text output (not via Bash).

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
