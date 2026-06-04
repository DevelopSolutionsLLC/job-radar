# Skills Mode

Handles the skills queue, gap analysis, study tracking, and promotion of completed skills to the resume.

## Skills command

`/job-radar skills` (also accepts `/job-radar gaps` or `/job-radar learn` as aliases — both route here):

1. **Keyword gaps** — Read `career-bank.md` and show the frequency tracker. Highlight any keyword that appears 3+ times across evaluated JDs with no matching bullet tag. These are the gaps most likely to cost the user a screen.

2. **Study queue** — Read `training/skills.md` and show all rows sorted by JD count descending. Group by status: In Progress first, then Not Started, then Done (collapsed unless user asks). Compute priority from JD Count: High ≥ 6, Medium 3–5, Low < 3.

3. **After showing both**, ask:
   > "Want to update any queue statuses, or add a gap keyword to the queue?"
   - If yes to statuses: for each in-progress or not-started item, ask "Still working on [skill]? (done / still going / not yet)"
     - done → set Status to `done`, set Completed to today. Offer to promote to resume (run **Promote skill to resume** flow).
     - still going / not yet → no change
   - If yes to adding gaps: for each uncovered keyword gap (3+ appearances, no bullet), ask if they want to add it to the queue. If yes, append a row to `training/skills.md` with Status = `not started` and JD count from the tracker.

## Skills Gap Branching Rules

These rules apply whenever a skills gap is presented to the user — in the Post-Evaluate Gap Check and in the tailor gap check. Both flows follow these rules.

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
- Track in `training/skills.md` with Status = `not started`
- After user marks done in check-in: offer to write a resume bullet + add to Skills section

**Long investment framing (≥ 1 week):**
- Lead with 📚 and "worth tracking — appears in [N] JDs"
- Track in `training/skills.md` with Status = `not started`
- Revisit in the skills check-in flow

**Paid certification transparency:**
- Always show: "[Cert] — [Free prep resource]; exam cost: $[N] USD"
- Frame as: "The cert pays off if this role type keeps appearing — start with the free prep"

**Present gaps grouped by effort:**

```
⚡ Quick wins — learnable while your application is in review:
  1. [Skill] (~[time]) — [Resource name] (free): [URL]

📚 Longer investments — worth tracking:
  2. [Skill] (~[time]) — [Resource]; [cost if paid cert]

Want me to add any of these to your skills queue? (list numbers, "all", or "skip")
```

When the user selects items:
- Add rows to `training/skills.md`: Skill, JD Count (from career-bank.md tracker or 1 if new), Resource (the URL), Est. Time, Status = `not started`, Started = `—`, Completed = `—`
- If skill already exists in table (case-insensitive match): increment JD Count, update Resource if a better URL was found — no duplicate rows

## Promote skill to resume

Run this flow when a skill is marked `done` in the skills queue check-in and the user agrees to add it.

1. Ask: "Tell me about your experience with [skill] — one or two sentences, doesn't need to be polished."
2. Rewrite their response as a resume bullet matching the tone and structure of existing bullets in `career-bank.md`. Show the draft and ask for approval or adjustments.
3. Once approved:
   - Add the bullet to the appropriate role section in `career-bank.md` with tags matching the skill name
   - Add the skill to the relevant category in the Skills section of `resume.md` (if not already present)
4. Confirm: "[Skill] added to your resume and bullet bank."
