# job-radar Work Plan

Last updated: 2026-05-12

## Board Audit

- Project board: DevelopSolutions Dev, https://github.com/orgs/DevelopSolutionsLLC/projects/1
- Open `job-radar` issues:
  - `#10` Local RSS proxy for LinkedIn and Indeed — Todo
  - `#22` Interactive skills gap: augment resume + linked training with completion tracking — Todo
- Closed/resolved:
  - `#23` Add pipeline queue curation and relevance cap — **Resolved**: `data/pipeline.md` was removed; scan-cache.json + interactive pick list replaced it entirely.
  - `#24` Fix scan-history company+role dedup — Done (commit 1c882f6)
  - `#25` Add pipeline maintenance commands — **Resolved**: same as #23; no pipeline.md to maintain.

## Current Local State

- `npm test` passes: 29 passed, 0 failed.
- `data/tracker.md` has 5 evaluated/application rows.
- `data/pipeline.md` — **removed**. Replaced by `data/scan-cache.json` (full ranked pool) + the post-scan interactive pick list. No longer needed.
- `data/scan-history.tsv` — dedup log, ~5,400+ lines.
- `data/scan-cache.json` — full compatible posting pool (1,051 postings last scan), sorted by relevance. TTL 12h.

## Open Issues

### 1. Implement local LinkedIn/Indeed RSS proxy

Existing issue: `#10`

Acceptance:
- Evaluate RSSHub vs a local Playwright-backed generator.
- Generate standard RSS XML or local feed files consumed by the existing RSS adapter.
- Cache proxy output locally.
- Keep the main scanner file-based; no always-on service required.

### 2. Implement interactive skills gap tracking

Existing issue: `#22`

Acceptance:
- Gap prompts during evaluate/tailor let the user add missing experience or skip honestly.
- Skipped gaps are classified by effort and written to `data/skills.md`.
- Re-entry check is non-blocking.
- Done skills can be promoted into `resume.md` and `career-bank.md` with user approval.

## Recommended Order

1. Implement local LinkedIn/Indeed RSS proxy (#10) — broadens the candidate pool with real market data.
2. Implement interactive skills gap tracking (#22) — closes the evaluate → learn → qualify loop.

## Working Notes

- Keep public issues technical and free of private resume/application details.
- Keep personal data in ignored files: `resume.md`, `career-bank.md`, `config/profile.yml`, `config/portals.yml`, `data/*.md`, `data/*.tsv`, `data/*.json`, and `output/`.
- Run `npm test` after script changes.
