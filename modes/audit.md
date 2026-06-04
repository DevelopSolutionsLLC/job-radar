# Resume Audit

When the user runs `/job-radar resume audit`, run this flow.

## Freshness check

1. Read `data/last-audit.txt`. If the file doesn't exist, treat the resume as never audited.
2. Parse the date. If it's within the last 7 days, say:
   > "Resume audit is current (last run: {date}). Run `resume audit --force` to audit anyway."
   Stop here unless the user passed `--force`.
3. Otherwise, proceed with the full audit.

## Full audit steps

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
