# Resume Generation Mode

When generating a tailored resume, follow the steps below and apply all tailoring and writing rules.

## Tailor flow

### Step 0 — Role-type framing

Read `config/profile.yml resume_builder.role_type`. This controls how bullets are framed throughout the resume. Apply the role-type framing rules in this file. Default to `hybrid` if not set.

### Step 1 — Fetch and analyze the JD

1. Use WebFetch to read the job posting URL
2. Extract from the JD:
   - **Role level**: IC/Senior/Staff/Principal vs Manager/Senior Manager vs Director/VP
   - **Domain**: Security, Platform, AI/ML, DevOps, Product, etc.
   - **Required skills**: specific technologies, tools, certifications mentioned
   - **Keywords**: all significant terms that appear in requirements or qualifications
3. Show the user what was extracted before proceeding

### Step 2 — Gap check (interactive)

Compare the JD's required skills/keywords against `resume.md` and `career-bank.md` tags. Identify:
- **Covered** — keyword matches existing bullets or skills
- **Gaps** — keyword doesn't appear anywhere in the user's materials

If there are gaps, present them to the user BEFORE assembling the resume:

> **These skills from the JD aren't in your resume yet:**
>
> - **Kubernetes** — Do you have experience with this?
> - **Terraform** — Do you have experience with this?
> - **CISSP** — Do you have this certification?
>
> For any you DO have, tell me about it and I'll write a bullet. Say "skip" for ones you don't have.

For each skill the user confirms:
1. The user gives a quick blurb — a sentence or two about what they did.
2. Rewrite it as a resume bullet matching the JD's language and the tone of existing bullets in `career-bank.md`. Show the draft and let them approve or adjust.
3. Add the approved bullet to the appropriate role section in `career-bank.md` with updated tags.
4. Add the skill to the relevant category in `resume.md`'s Skills section.

For each skill the user says "skip" (they don't have it):
1. Use WebSearch to find the best free or near-free resource (query: `"[skill] free course"` or `"[skill] free tutorial"`).
2. Estimate the time to learn honestly (< 1 week, 1–4 weeks, 1–3 months, 3+ months).
3. If it's a paid certification, show the exam cost alongside the free prep.
4. Apply effort branching (see `modes/skills.md` — Skills Gap Branching Rules).
5. If user says yes: write a row to `training/skills.md` with Status = `not started`.
6. If user says no or skip: note the gap, move on.

### Step 3 — Select summary paragraph

Read `career-bank.md` and pick the best summary paragraph based on role level + domain:
- IC/Staff/Principal → Summary #4
- Manager/Senior Manager + Security → Summary #1
- Manager/Senior Manager + Platform/Product → Summary #2
- Director/VP → Summary #3
- AI/ML focus → Summary #5

If the user's experience from Step 2 changes the framing, offer to write an updated summary paragraph and add it to the bank.

### Step 4 — Match bullets to JD keywords

For each position in `career-bank.md`:
1. Read the `<!-- tags: ... -->` comments on each bullet section
2. Score each section by how many JD keywords match its tags (including any new bullets from Step 2)
3. Pick bullets per position: **4 for the current role, 3 for all prior roles** — never exceed these limits
4. Lead with the strongest keyword match, end with broadest signal
5. **Blend when it makes the resume stronger:** If two bullets from the same role address the same skill gap or prove a stronger combined point, merge them into one tight bullet. Never blend just to hit the count.

**Before including any bullet, apply Writing Standards.** Rewrite weak bullets on the fly — fix passive voice, remove "responsible for", add numbers if missing, eliminate AI-sounding flourishes.

### Step 5 — Reorder skills

Read the Skills section from `career-bank.md`. Reorder skill categories to front-load whatever the JD emphasizes most. Within each category, lead with the specific tools/technologies the JD mentions.

### Step 6 — Assemble and write

1. Combine: Contact → Selected Summary → Tailored positions → Education → Reordered Skills
2. **Before writing to disk:** Run the full Editor Pass (below) against every bullet and cover letter sentence. Rewrite anything that fires. Check for near-duplicate bullets within each role and blend or cut before writing.
3. Write to `output/resume-tailored-{company-slug}-{date}.md`
4. Show the user a diff summary:
   - Which summary was picked
   - Which bullet categories were chosen per role
   - Which skills were front-loaded
   - What new bullets were added to the bank (if any)

### Step 7 — Generate cover letter

Always generate a cover letter alongside the tailored resume — it is not optional.

1. Write `output/cover-letter-{company-slug}-{date}.md` — 3 paragraphs max, hard cap at 3/4 of a page:
   - **Para 1:** Open with a concrete fact or result from the candidate's own work — never "I am applying for", never a domain insight or wisdom statement. State what you are doing right now that directly maps to this role. Specific numbers, named technologies, named clients. 3-4 sentences.
   - **Para 2:** Make the case with evidence — credentials, compliance coverage, key accomplishments. If a gap exists, one direct sentence bridges it. No self-apologizing. 4-5 sentences.
   - **Para 3:** One specific reason this company over any other, and a confident close. 2-3 sentences. **The final sentence must not be a one-liner flourish or self-summary** — close with logistics and an invitation.
   - Sign with: name, email, phone.
   - Date: today's date.
   - Recipient: "{Company} Recruiting Team / Re: {Role Title}"

2. **Hard rules:** No excited/grateful/honored language. No cliché closes. No sentence that could apply to any company. No restating the resume in prose. 3/4 page is a ceiling, not a target.

3. **Before writing to disk:** Run the full Editor Pass (below) against the cover letter draft. Every check must pass. Do not write the file until the pass is clean.

### Step 8 — Generate HTML and PDF

PDF generation is not optional — run it automatically for every tailor command. Generate PDFs LAST, after all content edits are complete.

**Resume HTML** at `output/resume-tailored-{company-slug}-{date}.html`:
- `@page { size: letter; margin: 0.6in 0.7in; }`
- Font: 'Helvetica Neue', Arial, sans-serif at 10.5pt, line-height 1.4
- CSS classes: `.entry`, `.entry-header` (flex, space-between), `.title` (bold), `.company` (italic), `.date` (9pt, #666)
- `h2`: 11pt, uppercase, letter-spacing 1px, border-bottom 1.5px solid #333
- `ul`: margin 4px 0, padding-left 18px; `li`: margin-bottom 2px
- Escape `&` as `&amp;` in HTML

**Cover letter HTML** at `output/cover-letter-{company-slug}-{date}.html`:
- `@page { size: letter; margin: 1in; }`
- Font: 'Helvetica Neue', Arial, sans-serif at 11pt, line-height 1.5
- Sections: `.header` (name 14pt bold, contact 10pt #555), `.date`, `.recipient`, `.body p` (margin 0 0 12px, text-align justify), `.closing`

**PDF generation:**
```
node scripts/generate-pdf.mjs output/resume-tailored-{company-slug}-{date}.html output/resume-tailored-{company-slug}-{date}.pdf
node scripts/generate-pdf.mjs output/cover-letter-{company-slug}-{date}.html output/cover-letter-{company-slug}-{date}.pdf
```

After both PDFs are generated, confirm the output filenames in one line. Then automatically open the original job posting URL (not the PDF files) in the default browser with `open <url>` — do not ask first. Then ask: **"Did you apply? (y/n)"**
- **y** → add to tracker.md with status `Applied`, include PDF links in the PDF column
- **n** → add to tracker.md with status `Evaluated`, no PDF links; offer next steps

### Step 9 — Update keyword tracker

Append the JD's keywords to the **Keyword Frequency Tracker** table in `career-bank.md`. Increment count if the keyword already exists, add a new row if not. Update the "Last Seen" date.

---

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
- Time-compression clichés: "reducing X to days", "quarters to days", "made months into days" — state the actual before/after metric or cut the claim
- "where the line between X and Y was deliberately blurred" — say what the role actually was
- Near-duplicate bullets: two bullets in the same role that describe the same project, framework, or share 5+ consecutive words — blend into one or cut the weaker one

**Cover letter — prohibited:**
- Narrative frames: "The engineering story is...", "What [company] is building is...", "The X problem is..."
- Wisdom/insight openers: "Building X requires more than Y", "When X happens, Y happens", "X is harder than it looks" — if the first sentence could open a blog post, rewrite it as a specific candidate fact or result
- Hollow qualifiers: "more than the usual X", "exactly the kind of X", "in the best possible way", "exactly where I want to operate", "exactly what X needs"
- Pithy one-liner closers: "The race is the truth-teller.", "That's the job.", "That feedback loop is where I do my best work.", "That's where I do my best work.", "Moving from X to Y is the work I'm signing up for." — any declarative performance flourish that closes a paragraph
- Scene-setter openers with colon: "The scope here is compelling: ...", "The challenge here is [adjective]: ..." — hollow framing; cut the opener and start with the substance
- Robotic logistics-acknowledgment: "The comp range works.", "The pay range works." — write it as a human would or skip it
- Braggy editorializing: "unforgiving in the best possible way", "moves faster or gets out of the way"
- Mechanical parallel triplets that read assembled rather than written
- Mechanical expertise-proof triplets: "I know X, what Y needs, and where Z fails" — three perfectly parallel knowledge claims read as template output
- "a bias toward X over Y" as a standalone self-description — show it through a decision or result
- "I'd be glad to" / "I'd be happy to" as the closer verb — use "I can" or "Happy to"
- "I am excited/thrilled/honored to apply", "I look forward to hearing from you", "Thank you for your consideration"
- Any sentence that could appear unedited in a cover letter for a different company

**Cover letter — required:**
- Open like an email: salutation "Hello," on its own line/paragraph, then the body starts in the next paragraph with "My name is {{YOUR_NAME}} and I'm reaching out about the [exact role title] at [Company]." That intro sentence is followed in the same paragraph by a sentence grounding the reader in the candidate's relevant prior experience. Never open cold with a fact, domain observation, or "I am excited to."
- Every sentence carries a number, a named technology, or a specific outcome
- Gap acknowledged in one plain sentence, no apology
- Close: two sentences max, direct statement that logistics work, invite to talk. Last sentence must not be a one-liner flourish or self-summary.
- Sentence length varies — short sentences after long ones

**Standard:** The output must read like a $400/hr professional resume editor wrote it. No AI tells. A senior hiring manager should not be able to distinguish it from a letter a human professional crafted.

## Editor Pass (mandatory before writing any file to disk)

After drafting the resume and cover letter, run this pass in full before writing to `output/`. Do not skip. Do not batch — check each item explicitly.

### Resume bullets — for each bullet in each role:
- Verb uniqueness check: list every lead verb across all bullets. If any verb appears more than once, rewrite until all are unique before proceeding.
- No "treating X with the same Y as Z"
- No "responsible for", "helped", "assisted", "leveraged", "various", "multiple", "several"
- No passive voice where active is possible
- No two consecutive bullets in the same role describing the same project, the same framework, or sharing 5+ consecutive words — blend or cut
- No "reducing X to days" / "quarters to days" / time-compression phrases — replace with the actual metric or remove
- No "deliberately blurred" / "naturally blurred" applied to role boundaries
- No bullet that could appear verbatim on a different candidate's resume

### Cover letter — for each sentence:
- Para 1 (salutation): Is it just "Hello," on its own line? If not — fix it. Para 2 must open with "My name is {{YOUR_NAME}} and I'm reaching out about the [role] at [Company]." followed by a grounding sentence about the candidate's relevant experience. Not a domain observation, not an insight — a specific fact about what they have done.
- No pithy one-liner paragraph closers at the end of any paragraph
- No mechanical expertise-proof triplets (I know X, Y, and Z)
- No "a bias toward X over Y" as a standalone sentence
- No em dash as clause separator in body text
- No "exactly where I want to operate" / "exactly what X needs"
- No "moves faster or gets out of the way" type performative observations about the company
- No "I'd be glad to" / "I'd be happy to" — use "I can" or "Happy to"
- No "The comp range works" / "The pay range works" — robotic logistics phrasing no human writes
- No "The scope here is compelling" / "The X here is [adjective]:" opener constructions — cut and start with substance
- No sentence that could appear unedited in a letter for a different company
- Para 3 (close): two sentences max, no flourish ending

Only after the full Editor Pass passes cleanly — write to disk.

## Output files

All six files use today's date as YYYY-MM-DD and the company name lowercased/hyphenated as the slug:

- `output/resume-tailored-{company-slug}-{date}.md`
- `output/resume-tailored-{company-slug}-{date}.html`
- `output/resume-tailored-{company-slug}-{date}.pdf`
- `output/cover-letter-{company-slug}-{date}.md`
- `output/cover-letter-{company-slug}-{date}.html`
- `output/cover-letter-{company-slug}-{date}.pdf`

HTML and PDF specs are defined in Step 8 above. PDF generation runs last — never leave an HTML and its PDF out of sync.
