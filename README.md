# job-radar

Job search pipeline: scan portals, evaluate offers, generate tailored CVs, track applications.

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

1. Add your CV to `cv.md`
2. Configure your profile in `config/profile.yml`
3. Set up portals in `config/portals.yml`
4. Paste a job URL to evaluate, or run the scanner

## Structure

```
config/         # profile, portals, preferences
modes/          # evaluation rubrics and prompts
templates/      # CV template (HTML)
scripts/        # automation (scanner, PDF gen)
data/           # tracker, pipeline inbox, scan history
reports/        # evaluation reports
output/         # generated PDFs (gitignored)
```
