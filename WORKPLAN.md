# job-radar Work Plan

Last updated: 2026-05-12

## Board Audit

- Project board: DevelopSolutions Dev, https://github.com/orgs/DevelopSolutionsLLC/projects/1
- Open `job-radar` issues:
  - `#10` Local RSS proxy for LinkedIn and Indeed — Todo
- Closed/resolved:
  - `#22` Interactive skills gap: augment resume + linked training with completion tracking — **Done**: post-evaluate gap check + tailor Step 2 research + branching + Skills Gap Branching Rules section added to SKILL.md. Real URLs via WebSearch, ⚡/📚 effort grouping, paid cert cost transparency, data/skills.md row writing.
  - `#23` Add pipeline queue curation and relevance cap — **Resolved**: `data/pipeline.md` was removed; scan-cache.json + interactive pick list replaced it entirely.
  - `#24` Fix scan-history company+role dedup — Done (commit 1c882f6)
  - `#25` Add pipeline maintenance commands — **Resolved**: same as #23; no pipeline.md to maintain.

## Current Local State

- `npm test` passes: 31 passed, 0 failed.
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

## Recommended Order

1. Implement local LinkedIn/Indeed RSS proxy (#10) — broadens the candidate pool with real market data.

## Working Notes

- Keep public issues technical and free of private resume/application details.
- Keep personal data in ignored files: `resume.md`, `career-bank.md`, `config/profile.yml`, `config/portals.yml`, `data/*.md`, `data/*.tsv`, `data/*.json`, and `output/`.
- Run `npm test` after script changes.
