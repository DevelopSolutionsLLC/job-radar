# Configure Wizard

Run this wizard when the user explicitly calls `/job-radar configure` or `/job-radar config`, or when the profile completeness check detects missing required fields before `scan` or `discover`.

Read `config/profile.yml` first (or `config/profile.example.yml` if profile.yml doesn't exist yet) so you can show current values as defaults.

If `resume.md` exists, extract the user's location from it to pre-fill the location question.

Walk through each question in order. Show the current value (if set) so the user can press Enter to keep it. Save after the final question.

---

## Q1 — Location

> "Where are you located? (city, state or country)
> Current: {current value or "not set"}"

Accept free-form text. Store as `location` in profile.yml. Examples: "Austin, TX", "London, UK", "Remote".

---

## Q2 — Work arrangement

> "What's your work arrangement preference?
>   1. Remote only
>   2. Hybrid (some days in office)
>   3. Onsite only
>   4. Any / no preference
> Current: {current value or "not set"}"

Map to profile.yml values:
- 1 → `remote`
- 2 → `hybrid`
- 3 → `onsite`
- 4 → `any`

Store as `work_arrangement.preference`.

---

## Q3 — Max commute distance *(only ask if Q2 answer was hybrid or onsite)*

> "What's the farthest you'd commute one-way (in miles)?
> Current: {current value or 30}"

Accept a number. Default to 30 if blank. Store as `work_arrangement.max_commute_miles`.

Skip this question entirely if preference is `remote` or `any`.

---

## Q4 — Relocation

> "Are you willing to relocate for the right role? (yes/no)
> Current: {current value or "no"}"

If yes:

> "Which cities would you consider? (comma-separated, e.g., Austin TX, New York NY)
> Current: {current value or "none"}"

Store as `work_arrangement.willing_to_relocate` (true/false) and `work_arrangement.relocation_cities` (list).

---

## Q5 — Target roles

If `resume.md` exists, read the candidate's most recent job title and build a three-tier role ladder using standard progressions:

**Management:** Team Lead → Engineering Manager → Senior Manager, Engineering → Director of Engineering → Senior Director of Engineering → VP of Engineering → SVP of Engineering → CTO  
**IC:** Junior/Associate SWE → Software Engineer → Senior Software Engineer → Staff Engineer → Principal Engineer → Distinguished Engineer → Fellow

Generate 1–2 domain variants per tier based on the candidate's background (infer from resume — security, platform, product, etc.).

Display this menu:

```
Based on your current title ([TITLE]), here are suggested target roles:

  Default — all three tiers:
    Step down:  [−1 title(s)]
    Lateral:    [current title(s)]
    Promotion:  [+1 title(s)]

  Current list: {comma-joined list or "not set"}

  1. Use default (step-down + lateral + promotion)  ← recommended
  2. Promotion titles only (+1 level)
  3. Lateral only (same level)
  4. Step-down only (−1 level)
  5. Keep current list
  6. Enter titles manually
```

Wait for the user's choice:
- **1–4** → populate from the corresponding tier(s) as described above
- **5** → keep the existing `targets.roles` list unchanged
- **6** → ask: "Enter your target titles (comma-separated):" and use whatever they type

If `resume.md` does not exist, fall back to the original free-text prompt:

> "What job titles are you targeting? (comma-separated, or press Enter to keep current)
> Current: {comma-joined list or "not set"}"

Store result as `targets.roles` list.

---

## Q6 — Minimum score

> "What's the minimum evaluation score to consider applying? (1.0–5.0)
> Current: {current value or 3.5}"

Accept a float. Default 3.5. Store as `targets.min_score`.

---

## Q7 — Compensation

> "What's your compensation range?
>   Minimum (won't apply below this): {current min or "not set"}
>   Target (what you're aiming for):  {current target or "not set"}
>   Currency: {current currency or "USD"}
>
> Enter as: min / target   (e.g., 150000 / 200000)
> Press Enter to skip."

Accept input in any of these forms:
- Single target: `150000 / 200000` → min=150000, target=200000
- Target range: `150000 / 200000 - 225000` → min=150000, target=200000, target_max=225000
- Shorthand: `150k / 200k-225k` → same as above
- With currency: `150000 / 200000 GBP` → currency=GBP

Normalize shorthand: `150k` → `150000`, `1.5M` → `1500000`. Currency defaults to USD.

When the user gives a range for target (e.g., "245000–285000"), store the low end as `target` and the high end as `target_max`.

Store as:
```yaml
compensation:
  currency: USD
  min: 225000
  target: 245000
  target_max: 285000  # omit if user gave a single target number
```

If skipped, leave the `compensation` block out of profile.yml — don't write empty values. The evaluate step will still score compensation if the JD lists a range; it just won't penalize for being below a threshold.

---

## Q8 — Resume builder role type

> "What type of roles are you targeting?
>   1. Engineering Manager / Team Lead
>   2. Individual Contributor (IC) / Staff / Principal
>   3. Director / VP / Executive
>   4. Hybrid (IC at manager level — player/coach)
> Current: {current value or "not set"}"

Map to `resume_builder.role_type`:
- 1 → `manager`
- 2 → `ic`
- 3 → `director`
- 4 → `hybrid`

Store as `resume_builder.role_type`. This shapes how resume bullets are framed during tailoring — manager leads with team/org impact, ic leads with technical achievement, director leads with business/program impact, hybrid balances both.

---

## Save and confirm

1. Write all collected values to `config/profile.yml`, preserving any fields that weren't touched.
2. Show a summary:

   ```
   Profile saved to config/profile.yml:

     Location:        Austin, TX
     Work preference: remote
     Willing to relocate: no

     Target roles:    Senior Manager, Director of Engineering, Staff Engineer
     Min score:       3.5

     Compensation:    $150,000 min / $200,000 target (USD)
     Role type:       manager
   ```

   Omit the Compensation line if the user skipped Q8. Omit Role type if the user skipped Q10.

3. If this wizard was triggered automatically (by the completeness check before scan/discover), say: "All set — starting the scan now." and proceed to the original command.
4. If the user ran `/job-radar configure` directly, say: "Done! Run `/job-radar scan` whenever you're ready."
