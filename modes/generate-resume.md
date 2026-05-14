# Resume Generation Mode

When generating a tailored resume:

1. Read `resume.md` for the canonical resume
2. Read the job description
3. Read `templates/resume-template.html`

## Tailoring Rules

### Page limit
- Target 2 pages. Never exceed 2 pages.
- If content runs long, cut bullets from the oldest roles first — recent experience matters most.
- Shrink older roles (10+ years ago) to 1-2 bullets max.
- Education and Skills sections should be compact — no padding.

### Content boundaries
- Each company's bullets must stand alone. Never reference work at another company within a bullet (e.g., don't mention "AT&T's ASPR framework" in a Stratascale bullet).
- If a skill was developed across multiple companies, describe it in the context of the company where the bullet lives.
- Summary paragraphs can reference career span and multiple employers — that's their purpose.

### Role-type framing

Before writing bullets, read `config/profile.yml resume_builder.role_type` and apply the matching rules below. The role type shapes how accomplishments are framed, not which bullets are included.

**`manager`** — Lead with org/team impact:
- Open bullets with team scale, headcount, budget, or reporting chain
- Technical details are the "how," not the "what"
- Emphasize cross-functional ownership, roadmap delivery, hiring/growing teams
- Pattern: "Led [N]-person team to ship X, resulting in Y"

**`ic`** — Lead with technical achievement:
- Open bullets with what was built, designed, or shipped
- Quantify technical scale: throughput, latency, users, data volume, endpoints
- Emphasize architecture decisions, systems ownership, individual technical contribution
- Pattern: "Designed and built X system handling Y at Z scale"

**`director`** — Lead with business/program impact:
- Open bullets with business outcome or org transformation
- Technical credibility appears as supporting evidence, not the headline
- Emphasize strategy, program scope, stakeholder influence, P&L impact
- Pattern: "Defined and drove X program across Y business units, delivering Z"

**`hybrid`** — Balance both:
- Alternate between technical and organizational leads across bullets
- Show credibility in both domains — delivery ownership + hands-on capability
- Pattern: blend manager and ic patterns, alternating emphasis per bullet

If `resume_builder.role_type` is not set in profile.yml, default to `hybrid`.

### Keyword matching
- Mirror keywords from the JD naturally (not keyword stuffing)
- Reorder bullet points to lead with the most relevant experience for this role
- Quantify impact where possible (metrics from resume.md)

### Hard rules
- Never fabricate experience or skills
- Never invent metrics or numbers that aren't in the source material

## Writing Quality Enforcement

Both the resume and cover letter must pass this checklist before output. Rewrite any sentence that fails.

**Prohibited everywhere:**
- Em dashes "—" used to split a sentence into two halves. Use a comma, semicolon, or rewrite.
- "Responsible for", "Helped", "Assisted with", "Leveraged", "Various", "Several", "Multiple", "Etc."
- Passive voice where active is possible
- AI structural patterns: "treating X with the same Y as Z", "rather than waiting on", echo structures

**Cover letter — prohibited:**
- Narrative frames: "The engineering story is...", "What [company] is building is...", "The X problem is..."
- Hollow qualifiers: "more than the usual X", "exactly the kind of X", "in the best possible way"
- Pithy one-liner closers: "The race is the truth-teller.", "That's the job."
- Braggy editorializing: "unforgiving in the best possible way", "moves faster or gets out of the way"
- Mechanical parallel triplets that read assembled rather than written
- "I am excited/thrilled/honored to apply", "I look forward to hearing from you", "Thank you for your consideration"
- Any sentence that could appear unedited in a cover letter for a different company

**Cover letter — required:**
- Open with a concrete fact, situation, or result
- Every sentence carries a number, a named technology, or a specific outcome
- Gap acknowledged in one plain sentence, no apology
- Close: two sentences max, direct statement that logistics work, invite to talk
- Sentence length varies — short sentences after long ones

**Standard:** The output must read like a $400/hr professional resume editor wrote it. No AI tells. A senior hiring manager should not be able to distinguish it from a letter a human professional crafted.

## Output

See SKILL.md Step 8 for the full HTML/PDF generation spec and naming convention.

Files to generate (using today's date as YYYY-MM-DD):
- `output/resume-tailored-{company-slug}-{date}.md`
- `output/resume-tailored-{company-slug}-{date}.html`
- `output/resume-tailored-{company-slug}-{date}.pdf`
- `output/cover-letter-{company-slug}-{date}.md`
- `output/cover-letter-{company-slug}-{date}.html`
- `output/cover-letter-{company-slug}-{date}.pdf`

Run PDF generation last, after all content edits are final:
```
node scripts/generate-pdf.mjs output/resume-tailored-{company-slug}-{date}.html output/resume-tailored-{company-slug}-{date}.pdf
node scripts/generate-pdf.mjs output/cover-letter-{company-slug}-{date}.html output/cover-letter-{company-slug}-{date}.pdf
```
