# CV Generation Mode

When generating a tailored CV:

1. Read `cv.md` for the canonical CV
2. Read the job description
3. Read `templates/cv-template.html`

## Tailoring Rules

- Reorder bullet points to lead with the most relevant experience for this role
- Mirror keywords from the JD naturally (not keyword stuffing)
- Quantify impact where possible (metrics from cv.md)
- Keep it to 1-2 pages
- Never fabricate experience or skills

## Output

1. Generate the tailored HTML file to `output/{company-slug}-cv.html`
2. Run `node scripts/generate-pdf.mjs output/{company-slug}-cv.html output/{company-slug}-cv.pdf`
