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

### Keyword matching
- Mirror keywords from the JD naturally (not keyword stuffing)
- Reorder bullet points to lead with the most relevant experience for this role
- Quantify impact where possible (metrics from resume.md)

### Hard rules
- Never fabricate experience or skills
- Never invent metrics or numbers that aren't in the source material

## Output

1. Generate the tailored HTML file to `output/{company-slug}-resume.html`
2. Run `node scripts/generate-pdf.mjs output/{company-slug}-resume.html output/{company-slug}-resume.pdf`
