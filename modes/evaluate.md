# Evaluation Mode

When evaluating a job offer, read `resume.md` and `config/profile.yml`, then score across these dimensions. Each dimension is 1-5.

## Scoring Dimensions

### A. Role Fit (weight: 2x)
How well does this role match the user's target roles and experience?
- 5: exact match to target role, seniority aligns
- 3: adjacent role, some overlap
- 1: different field or level entirely

### B. Skills Match (weight: 2x)
How many of the required skills does the user have?
- 5: 90%+ match, user exceeds requirements
- 3: 60-70% match, gaps are learnable
- 1: major gaps in core requirements

### C. Compensation (weight: 1.5x)
Does the compensation meet the user's targets?
- 5: at or above target range
- 3: meets minimum, below target
- 1: below minimum or undisclosed with red flags

### D. Company & Culture (weight: 1x)
Company reputation, growth stage, engineering culture.
- 5: strong reputation, good signals (eng blog, OSS, glassdoor)
- 3: average, limited info
- 1: red flags (high turnover, poor reviews, unclear business)

### E. Location & Remote (weight: 1x)
Does the work arrangement match preferences?
- 5: perfect match (e.g., remote when user wants remote)
- 3: acceptable compromise
- 1: deal-breaker (e.g., on-site only when user needs remote)

### F. Growth Potential (weight: 0.5x)
Career growth, learning opportunities, scope of impact.
- 5: clear growth path, high-impact scope
- 3: stable but limited growth signals
- 1: dead-end or narrow scope

## Output Format

Write a report to `reports/{num}-{company-slug}-{date}.md` with:
1. Header: company, role, URL, date, overall score
2. One paragraph per dimension with score and reasoning
3. Strengths and concerns (bullet points)
4. Recommendation: Apply / Consider / Skip

Overall score = weighted average of all dimensions, on a 1-5 scale.

## Skills Intelligence

After scoring, perform these additional steps:

### Keyword Extraction

Extract all significant technical skills, tools, certifications, and domain keywords from the JD. Ignore generic terms (e.g., "team player", "communication skills"). Focus on:
- Technologies and languages (Python, Go, Kubernetes, etc.)
- Tools and platforms (Tenable, Splunk, AWS, etc.)
- Domains and methodologies (CTEM, SOAR, Agile, etc.)
- Certifications (CISSP, OSCP, AWS SA, etc.)
- Role-specific terms (threat modeling, incident response, etc.)

### Update Keyword Frequency Tracker

If `resume-bullets.md` exists, update the **Keyword Frequency Tracker** table:
- Increment count for keywords already in the table
- Add new rows for keywords not yet tracked
- Update "Last Seen" date to today

### Skills Gap Report

At the end of the evaluation report, add a **Skills Gap** section:

1. **Matched skills** — JD keywords that appear in `resume.md` or have matching tags in `resume-bullets.md`
2. **Gaps** — JD keywords that don't appear anywhere in the user's materials
3. **Bullet suggestions** — for each gap, check if the user has adjacent experience that could be reframed. If so, suggest a new bullet for `resume-bullets.md` that honestly claims the skill. Never fabricate experience.

### New Bullet Proposals

If a keyword appears 3+ times in the tracker but has no matching bullet tag, flag it:

> "The keyword **{keyword}** has appeared in {count} job descriptions but isn't covered by any bullet in your bank. Consider adding a bullet to one of your roles that demonstrates this skill."

This turns every evaluation into a resume improvement opportunity.
