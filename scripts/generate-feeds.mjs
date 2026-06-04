#!/usr/bin/env node
// Generates local job feed files from Indeed and LinkedIn using Playwright.
// Output: data/feeds/{source}.json — consumed by the localfeed adapter in scan.mjs.
//
// Usage:
//   node scripts/generate-feeds.mjs                  # all sources, skip if <24h old
//   node scripts/generate-feeds.mjs --force          # regenerate regardless of age
//   node scripts/generate-feeds.mjs --source indeed  # one source only
//   node scripts/generate-feeds.mjs --auth linkedin  # interactive login (saves session)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

const FEEDS_DIR = 'data/feeds';
const AUTH_DIR = 'data/feeds/.auth';
const PROFILE_PATH = 'config/profile.yml';
const FEED_TTL_HOURS = 24;
const PAGES_PER_ROLE = 2;        // Indeed only — 50 results per page
const LINKEDIN_BATCH = 25;       // LinkedIn guest API: 25 results per request
const PAGE_DELAY_MS = 2500;      // throttle between page loads

const args = process.argv.slice(2);
const forceFlag = args.includes('--force');
const sourceFilter = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const authSource = args.includes('--auth') ? args[args.indexOf('--auth') + 1] : null;

mkdirSync(FEEDS_DIR, { recursive: true });
mkdirSync(AUTH_DIR, { recursive: true });

// --- Profile ---

function loadProfile() {
  if (!existsSync(PROFILE_PATH)) {
    console.error('config/profile.yml not found. Copy from config/profile.example.yml first.');
    process.exit(1);
  }
  const p = yaml.load(readFileSync(PROFILE_PATH, 'utf-8'));
  const location = p.location || '';
  return {
    roles: (p.targets?.roles || []),
    location,
  };
}

// --- Feed TTL check ---

function isFeedFresh(source) {
  const path = `${FEEDS_DIR}/${source}.json`;
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    const ageHours = (Date.now() - new Date(data.generated).getTime()) / 3600000;
    return ageHours < FEED_TTL_HOURS;
  } catch { return false; }
}

function writeFeed(source, jobs) {
  const seen = new Set();
  const deduped = jobs.filter(j => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
  writeFileSync(
    `${FEEDS_DIR}/${source}.json`,
    JSON.stringify({ generated: new Date().toISOString(), source, jobs: deduped }, null, 2)
  );
  return deduped.length;
}

// --- Indeed scraper ---

async function scrapeIndeed(page, roles, location) {
  const jobs = [];

  for (const role of roles) {
    const base = `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&radius=50&sort=date&fromage=30&limit=50`;

    for (let pageNum = 0; pageNum < PAGES_PER_ROLE; pageNum++) {
      const url = pageNum === 0 ? base : `${base}&start=${pageNum * 50}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(PAGE_DELAY_MS);

        // Check for hard block (CAPTCHA page, error page)
        const title = await page.title();
        if (/captcha|robot|blocked|verify/i.test(title)) {
          console.error(`  ⚠  Indeed blocked at "${role}" page ${pageNum + 1} — stopping this role`);
          break;
        }

        const pageJobs = await page.evaluate(() => {
          // Primary: window.mosaic job data (embedded JS object, most reliable)
          try {
            const data = window.mosaic?.providerData?.['mosaic-provider-jobcards'];
            const results = data?.metaData?.mosaicProviderJobCardsModel?.results;
            if (Array.isArray(results) && results.length > 0) {
              return results.map(r => ({
                title: r.displayTitle || r.normTitle || r.title || '',
                company: r.company || '',
                location: r.formattedLocation || r.jobLocationCity || '',
                url: r.jobkey ? `https://www.indeed.com/viewjob?jk=${r.jobkey}` : '',
              })).filter(j => j.title && j.url);
            }
          } catch {}

          // Fallback: DOM selectors
          const out = [];
          const cards = document.querySelectorAll(
            '[data-testid="jobsearch-ResultsList"] > li, .jobsearch-ResultsList > li'
          );
          for (const card of cards) {
            const linkEl = card.querySelector('h2.jobTitle a, [id^="jobTitle"] a');
            const titleEl = linkEl?.querySelector('span') || linkEl;
            const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
            const locEl = card.querySelector('[data-testid="text-location"], .companyLocation');
            if (!titleEl || !linkEl) continue;
            const href = linkEl.getAttribute('href') || '';
            out.push({
              title: titleEl.textContent.trim(),
              company: companyEl?.textContent.trim() || '',
              location: locEl?.textContent.trim() || '',
              url: href.startsWith('http') ? href : `https://www.indeed.com${href}`,
            });
          }
          return out;
        });

        if (pageJobs.length === 0) break;
        jobs.push(...pageJobs);

      } catch (err) {
        console.error(`  ✗ Indeed: "${role}" page ${pageNum + 1}: ${err.message}`);
        break;
      }
    }
  }

  return jobs;
}

// --- LinkedIn scraper (guest API — no auth required, ~25 results per role) ---
// With saved auth context: full results, no login wall.

async function scrapeLinkedIn(browser, roles, location, authStatePath) {
  const jobs = [];
  const hasAuth = existsSync(authStatePath);
  const context = await browser.newContext(hasAuth ? { storageState: authStatePath } : {});
  const page = await context.newPage();

  for (const role of roles) {
    // LinkedIn's public jobs-guest API — returns HTML job card fragments
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&f_WT=2&sortBy=DD&start=0&count=${LINKEDIN_BATCH}`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(PAGE_DELAY_MS);

      // If redirected to login, we have partial results — log and continue to next role
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
        if (!hasAuth) {
          console.error(`  LinkedIn: login wall hit — run "node scripts/generate-feeds.mjs --auth linkedin" to save a session`);
        }
        break;
      }

      const pageJobs = await page.evaluate(() => {
        const out = [];
        const cards = document.querySelectorAll('li');
        for (const card of cards) {
          const linkEl = card.querySelector('a.base-card__full-link, a.result-card__full-card-link');
          const titleEl = card.querySelector('h3.base-search-card__title, .job-search-card__title');
          const companyEl = card.querySelector('h4.base-search-card__subtitle, .job-search-card__company-name');
          const locEl = card.querySelector('.job-search-card__location, .base-search-card__metadata span');
          if (!titleEl || !linkEl) continue;
          // Strip tracking params so dedup matches on canonical job IDs, not session-specific query strings
          const href = (linkEl.getAttribute('href') || '').split('?')[0];
          out.push({
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || '',
            location: locEl?.textContent.trim() || '',
            url: href,
          });
        }
        return out;
      });

      jobs.push(...pageJobs);

    } catch (err) {
      console.error(`  ✗ LinkedIn: "${role}": ${err.message}`);
    }
  }

  await context.close();
  return jobs;
}

// --- LinkedIn interactive auth ---

async function runLinkedInAuth(authStatePath) {
  console.log('\nOpening LinkedIn in a browser window.');
  console.log('Log in, then close the window (or press Ctrl+C here) when done.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/login');

  // Wait until the user navigates away from the login URL
  try {
    await page.waitForURL(url => !url.includes('/login') && !url.includes('/checkpoint'), { timeout: 180000 });
  } catch {
    // timeout ok — save whatever we have
  }

  await context.storageState({ path: authStatePath });
  await browser.close();
  console.log(`Session saved to ${authStatePath}\n`);
  console.log('Run "node scripts/generate-feeds.mjs --source linkedin --force" to scrape with your session.');
}

// --- Main ---

async function main() {
  const linkedInAuthPath = resolve(`${AUTH_DIR}/linkedin-state.json`);

  if (authSource === 'linkedin') {
    await runLinkedInAuth(linkedInAuthPath);
    return;
  }

  const { roles, location } = loadProfile();

  if (roles.length === 0) {
    console.error('No target roles in config/profile.yml targets.roles. Add some roles first.');
    process.exit(1);
  }

  const allSources = ['indeed', 'linkedin'];
  const sources = sourceFilter ? allSources.filter(s => s === sourceFilter) : allSources;
  const toRun = forceFlag ? sources : sources.filter(s => !isFeedFresh(s));

  if (toRun.length === 0) {
    console.log(`All feeds are fresh (<${FEED_TTL_HOURS}h). Use --force to regenerate.`);
    return;
  }

  const hasLinkedInAuth = existsSync(linkedInAuthPath);
  console.log(`Generating: ${toRun.join(', ')}`);
  console.log(`Roles (${roles.length}): ${roles.join(', ')}`);
  console.log(`Location: ${location}`);
  if (toRun.includes('linkedin') && !hasLinkedInAuth) {
    console.log(`LinkedIn: no saved session — will capture public results only (~25/role). Run --auth linkedin for full access.`);
  }
  console.log('');

  const browser = await chromium.launch({ headless: true });

  try {
    if (toRun.includes('indeed')) {
      process.stdout.write('  Indeed  ');
      const indeedPage = await browser.newPage();
      // Set a realistic User-Agent
      // Indeed CAPTCHA rate is higher without Accept-Language; this header alone reduces blocks significantly
      await indeedPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      const jobs = await scrapeIndeed(indeedPage, roles, location);
      await indeedPage.close();
      const count = writeFeed('indeed', jobs);
      console.log(`→ ${count} jobs`);
    }

    if (toRun.includes('linkedin')) {
      process.stdout.write('  LinkedIn ');
      const jobs = await scrapeLinkedIn(browser, roles, location, linkedInAuthPath);
      const count = writeFeed('linkedin', jobs);
      console.log(`→ ${count} jobs`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nFeeds written to ${FEEDS_DIR}/`);
  console.log('Run "node scripts/scan.mjs --force" to include them in your next scan.');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
