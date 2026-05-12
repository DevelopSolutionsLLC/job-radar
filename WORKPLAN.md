# job-radar Work Plan

Last updated: 2026-05-08

## Board Audit

- Project board: DevelopSolutions Dev, https://github.com/orgs/DevelopSolutionsLLC/projects/1
- Board item count after cleanup: 40
- Open `job-radar` issues now on the board:
  - `#10` Local RSS proxy for LinkedIn and Indeed — Todo
  - `#22` Interactive skills gap: augment resume + linked training with completion tracking — Todo
  - `#23` Add pipeline queue curation and relevance cap — Todo
  - `#25` Add pipeline maintenance commands — Todo
- Fixed:
  - Added missing open issue `#10` to the project board.
  - Created and added issues `#23`, `#24`, and `#25`.
  - `#24` Fix scan-history company+role dedup — Done (commit 1c882f6)

## Current Local State

- `npm test` passes: 29 passed, 0 failed.
- `data/tracker.md` has 5 evaluated/application rows.
- `data/pipeline.md` has 5,460 lines and is too large to be usable as a human queue.
- `data/scan-history.tsv` has 5,458 lines.
- Scanner documentation says scan-history columns are `url`, `first_seen`, `source`, `title`, `company`, `status`.
- `scripts/scan.mjs` role dedup was fixed in commit 1c882f6 — `loadDedup()` correctly reads `company` (col 4) and `title` (col 3).

## Proposed Issues

### 1. Add pipeline queue curation and ranking

Issue: `#23`

Problem: scans append thousands of broad matches into `data/pipeline.md`. The result is technically complete but operationally noisy.

Acceptance:
- Scanner sorts new postings by compatibility and relevance before appending.
- Default append count is capped to a small actionable queue.
- Full scan results remain available in `data/scan-cache.json`.
- User can override the cap when they explicitly want a full append.

### 3. Add pipeline maintenance commands

Issue: `#25`

Problem: once `data/pipeline.md` is oversized, there is no clean command to summarize, prune, or rebuild it from cached results.

Acceptance:
- Add a command or script to show top pending roles by relevance.
- Add a dry-run prune/rebuild path for `data/pipeline.md`.
- Preserve evaluated/applied tracker data.
- Document the workflow in the `/job-radar status` or scan instructions.

### 4. Implement local LinkedIn/Indeed RSS proxy

Existing issue: `#10`.

Acceptance:
- Evaluate RSSHub vs a local Playwright-backed generator.
- Generate standard RSS XML or local feed files consumed by the existing RSS adapter.
- Cache proxy output locally.
- Keep the main scanner file-based; no always-on service required.

### 5. Implement interactive skills gap tracking

Existing issue: `#22`.

Acceptance:
- Gap prompts during evaluate/tailor let the user add missing experience or skip honestly.
- Skipped gaps are classified by effort and written to `data/skills-queue.md`.
- Re-entry check is non-blocking.
- Done skills can be promoted into `resume.md` and `resume-bullets.md` with user approval.

## Recommended Order

1. Fix scan-history company+role dedup.
2. Add pipeline queue curation and ranking.
3. Add pipeline maintenance commands.
4. Implement local LinkedIn/Indeed RSS proxy.
5. Implement interactive skills gap tracking.

## Working Notes

- Keep public issues technical and free of private resume/application details.
- Keep personal data in ignored files: `resume.md`, `resume-bullets.md`, `config/profile.yml`, `config/portals.yml`, `data/*.md`, `data/*.tsv`, `data/*.json`, and `output/`.
- Run `npm test` after script changes.
