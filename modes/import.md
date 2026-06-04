# Import Resume

When the user runs `/job-radar resume import`, follow this flow.

## Step 1 — Get the resume

Check if a file path was provided as an argument. If so, read that file directly.

If no path was provided, ask the user ONE question:

> "How would you like to import your resume?
>
> 1. **Paste it** — paste your resume text in the next message
> 2. **From a file** — give me the path to a file (PDF, Word, TXT, HTML, or Markdown)
> 3. **From LinkedIn** — paste your LinkedIn profile URL (public profiles only)"

Then wait for their response.

## Step 2 — Read the content

Based on the input:
- **Pasted text**: use it directly
- **File path**: use the Read tool to read the file (works with PDF, TXT, MD, HTML). For DOCX files, try reading — if it's garbled binary, tell the user to save as PDF or paste the text instead.
- **LinkedIn URL**: use WebFetch to read the public profile page. Extract name, headline, experience, education, skills. If the profile isn't public, tell the user and ask them to paste instead.

## Step 3 — Convert to resume.md format

Restructure the content into this exact format (see `resume.example.md` for reference):

```markdown
# Full Name

**Email:** email | **Location:** city | **LinkedIn:** url | **GitHub:** url

## Summary

2-3 sentences. Professional identity, years of experience, what they're known for, what they want next.

## Experience

### Job Title — Company Name
**Dates** | Location

- Accomplishments with impact and numbers
- Technologies used
- Scale indicators (team size, users, revenue)

(repeat for each role, reverse chronological)

## Projects

### Project Name
**Tech stack** | Link

- What it does, impact, their role

## Education

### Degree — School
**Year** | Honors if applicable

## Skills

**Languages:** ...
**Frameworks:** ...
**Infrastructure:** ...
**Other:** ...
```

Rules for conversion:
- Preserve ALL factual content — never drop experience, skills, projects, or education
- Standardize formatting but keep the user's own words for descriptions
- Add a Summary section if one doesn't exist — synthesize from their experience
- Normalize dates to a consistent format (e.g., "2020-2024" or "Jan 2020 — Present")
- Separate skills into categories (Languages, Frameworks, Infrastructure, Other)
- If contact info is missing, leave those fields blank — don't make anything up
- Strip formatting artifacts from PDF extraction (page numbers, headers/footers, weird spacing)

## Step 4 — Write and confirm

1. Write the converted resume to `resume.md`
2. Show the user a summary of what was imported:
   - Name
   - Number of positions found
   - Number of skills extracted
   - Anything that looked unclear or was dropped
3. Ask: "Does this look right? You can edit `resume.md` directly or tell me what to change."

## Step 5 — Set up profile (if not already done)

If `config/profile.yml` doesn't exist yet, do the following **without asking permission**:

### 5a — Auto-fill from resume (silent fields)

Extract these fields directly from the imported resume content **without asking**:

- `name` — from the resume header
- `email` — from the resume header
- `location` — from the resume header (verbatim)
- `resume_builder.role_type` — infer from current title: Manager/Lead → `manager`, IC/Staff/Principal → `ic`, Director/VP/Head → `director`, clearly mixed → `hybrid`
- `resume_builder.seniority` — infer from current title: Senior/Principal/Staff → `senior`, Director/VP/Head → `executive`, otherwise `senior`

### 5b — Interactive role selection

From the candidate's current/most recent job title, build a three-tier role ladder using standard engineering and management progressions:

**Management ladder:** Team Lead → Engineering Manager → Senior Manager, Engineering → Director of Engineering → Senior Director of Engineering → VP of Engineering → SVP of Engineering → CTO

**IC ladder:** Junior/Associate SWE → Software Engineer → Senior Software Engineer → Staff Engineer → Principal Engineer → Distinguished Engineer → Fellow

For each tier, generate **all plausible title variants** that a recruiter or ATS might use for that level and domain. The goal is maximum job match coverage — err toward more titles, not fewer. 

Rules for generating variants:
- Include all common phrasings for the role level: e.g. "Engineering Manager", "Software Engineering Manager", "Software Development Manager", "Technical Manager" are all step-down variants from Senior Manager
- If the candidate's current title includes a domain noun (Software, Cybersecurity, Platform, Data, Product, Security, Infrastructure), include both domain-specific and domain-neutral variants at each tier
- For management titles, cover the common structural variations: "Manager, X Engineering", "X Engineering Manager", "Manager of X Engineering", "Head of X"
- For IC titles, cover "Staff X Engineer", "Principal X Engineer", "Senior X Engineer" with the candidate's primary domain noun
- Aim for 3–5 variants per tier for management tracks, 2–4 for IC tracks

Display this menu to the user:

```
Based on your current title ([TITLE]), here are suggested target roles:

  Default — all three tiers:
    Step down:  [−1 title(s)]
    Lateral:    [current title(s)]
    Promotion:  [+1 title(s)]

  1. Use default (step-down + lateral + promotion)  ← recommended
  2. Promotion titles only (+1 level)
  3. Lateral only (same level)
  4. Step-down only (−1 level)
  5. Enter titles manually
```

Wait for the user's choice:
- **1** → use all three tiers combined
- **2** → use only the promotion tier titles
- **3** → use only the lateral tier titles
- **4** → use only the step-down tier titles
- **5** → ask: "Enter your target titles (comma-separated):" and use whatever they type

Store the result as `targets.roles`.

### 5c — Ask wizard questions for fields that can't be inferred

Run through these questions from `modes/configure.md` in order. Show current/default values where applicable:

1. **Work arrangement** — remote / hybrid / onsite / any
2. **Max commute miles** — only ask if answer to (1) was hybrid or onsite
3. **Willing to relocate** — yes/no; if yes, ask for relocation cities
4. **Minimum score** — show default 3.5, accept any float 1.0–5.0
5. **Compensation** — min and target (accept shorthand like "150k")

Skip the "Target roles" and "Resume builder role type" questions — those were already handled in Steps 5a and 5b.

### 5d — Write profile.yml

Read `config/profile.example.yml`, fill in all collected values, and write the result to `config/profile.yml`.

### 5e — Combined confirmation

Show a single summary block and ask one confirmation question covering both resume and profile:

```
Resume       {Name} · {N} roles · {N} skills
Profile      {location} · {work preference} · ${min}k–${target}k · min score {score}
             Target roles: {role1}, {role2}, {role3}
```

> "Does this look right? You can edit `resume.md` or `config/profile.yml` directly, or tell me what to fix."
