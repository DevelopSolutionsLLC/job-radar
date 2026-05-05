# /job-radar — Job Search Pipeline

Parse the user's subcommand and execute accordingly. If no subcommand is given, show available commands.

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

### Configuration

These commands modify `config/portals.yml` so the user never has to edit YAML directly.

- `/job-radar add role "<title>"` → Add to `title_filter.positive` in portals.yml.
- `/job-radar remove role "<title>"` → Add to `title_filter.negative` in portals.yml.
- `/job-radar add company "<name>"` → Run `node scripts/resolve-ats.mjs "<name>"`, parse the JSON output, and add the company to the correct section in portals.yml. Confirm what was added.
- `/job-radar remove company "<name>"` → Remove from portals.yml. Confirm removal.
- `/job-radar add feed <url>` → Add RSS feed URL to the `rss:` section of portals.yml.
- `/job-radar configure` → Interactive setup: walk through target roles, location preferences, companies to track. Read and update portals.yml and config/profile.yml.

### Pipeline

- `/job-radar evaluate <url>` → Read `modes/evaluate.md`, fetch the job description from the URL, score against cv.md, write evaluation report to reports/.
- `/job-radar status` → Show pipeline summary from data/tracker.md and data/pipeline.md: counts of pending, evaluated, applied, interviewed, offered, rejected.
- `/job-radar check <url>` → Run `node scripts/check-liveness.mjs <url>` to verify a posting is still live.

### Support

- `/job-radar donate` → Run `node scripts/donate.mjs`. Shows a QR code and Cash App link.

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
