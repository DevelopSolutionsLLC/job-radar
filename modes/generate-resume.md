# Resume Generation Mode

When generating a tailored resume:

1. Read `resume.md` for the canonical resume
2. Read the job description
3. Read `templates/resume-template.html`

## Tailoring Rules

- Reorder bullet points to lead with the most relevant experience for this role
- Mirror keywords from the JD naturally (not keyword stuffing)
- Quantify impact where possible (metrics from resume.md)
- Keep it to 1-2 pages
- Never fabricate experience or skills

## Output

1. Generate the tailored HTML file to `output/{company-slug}-resume.html`
2. Run `node scripts/generate-pdf.mjs output/{company-slug}-resume.html output/{company-slug}-resume.pdf`
