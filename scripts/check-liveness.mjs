#!/usr/bin/env node

/**
 * check-liveness.mjs — Job posting liveness checker
 *
 * Uses Playwright to navigate to a job posting URL and determine
 * whether the posting is still active, closed, or indeterminate.
 *
 * Usage:
 *   node scripts/check-liveness.mjs <url>
 *
 * Exit codes:
 *   0 = ACTIVE   — posting appears live
 *   1 = CLOSED   — expired/closed signals detected
 *   2 = UNKNOWN  — couldn't determine status
 */

import { chromium } from 'playwright';

const EXPIRED_PATTERNS = [
  /no longer accepting/i,
  /position has been filled/i,
  /this job is no longer available/i,
  /posting has been removed/i,
  /applications?\s+(?:(?:have|are|is)\s+)?closed/i,
  /role has been filled/i,
  /job has expired/i,
  /page not found/i,
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /this job has expired/i,
  /job posting has expired/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /closed on \d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /closed on (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
];

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,
];

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
];

const TIMEOUT_MS = 30000;
const MIN_CONTENT_CHARS = 300;

function firstMatch(patterns, text = '') {
  return patterns.find((pattern) => pattern.test(text));
}

/**
 * Check whether a job posting URL is still active.
 *
 * @param {string} url - The job posting URL to check
 * @returns {Promise<{status: 'ACTIVE'|'CLOSED'|'UNKNOWN', reason: string}>}
 */
export async function checkLiveness(url) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT_MS,
      });
    } catch (err) {
      return { status: 'UNKNOWN', reason: `navigation error: ${err.message.split('\n')[0]}` };
    }

    const httpStatus = response?.status() ?? 0;

    // HTTP 404/410 — definitively closed
    if (httpStatus === 404 || httpStatus === 410) {
      return { status: 'CLOSED', reason: `HTTP ${httpStatus}` };
    }

    // Give SPAs (Ashby, Lever, Workday) time to hydrate
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');

    // Check URL-based expired signals
    const expiredUrl = firstMatch(EXPIRED_URL_PATTERNS, finalUrl);
    if (expiredUrl) {
      return { status: 'CLOSED', reason: `redirect to error URL: ${finalUrl}` };
    }

    // Check body text for expired/closed signals — these win over active signals
    const expiredBody = firstMatch(EXPIRED_PATTERNS, bodyText);
    if (expiredBody) {
      return { status: 'CLOSED', reason: `expired signal: ${expiredBody.source}` };
    }

    // Check for a visible apply button/link (not in nav/header/footer)
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
      );

      return candidates
        .filter((el) => {
          if (el.closest('nav, header, footer')) return false;
          if (el.closest('[aria-hidden="true"]')) return false;

          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!el.getClientRects().length) return false;

          return Array.from(el.getClientRects()).some((r) => r.width > 0 && r.height > 0);
        })
        .map((el) => {
          const label = [
            el.innerText,
            el.value,
            el.getAttribute('aria-label'),
            el.getAttribute('title'),
          ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          return label;
        })
        .filter(Boolean);
    });

    const hasApply = applyControls.some((label) =>
      APPLY_PATTERNS.some((pattern) => pattern.test(label))
    );

    if (hasApply) {
      return { status: 'ACTIVE', reason: 'visible apply control detected' };
    }

    // Check if we landed on a jobs listing page instead of a single posting
    const listingPage = firstMatch(LISTING_PAGE_PATTERNS, bodyText);
    if (listingPage) {
      return { status: 'CLOSED', reason: `redirected to listing page: ${listingPage.source}` };
    }

    // Too little content — probably nav/footer only
    if (bodyText.trim().length < MIN_CONTENT_CHARS) {
      return { status: 'CLOSED', reason: 'insufficient content — likely nav/footer only' };
    }

    // Content present but no apply button found
    return { status: 'UNKNOWN', reason: 'content present but no visible apply control found' };

  } catch (err) {
    return { status: 'UNKNOWN', reason: `unexpected error: ${err.message.split('\n')[0]}` };
  } finally {
    if (browser) await browser.close();
  }
}

// CLI entry point
async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: node scripts/check-liveness.mjs <url>');
    process.exit(2);
  }

  try {
    new URL(url);
  } catch {
    console.error(`Invalid URL: ${url}`);
    process.exit(2);
  }

  const { status, reason } = await checkLiveness(url);

  const icons = { ACTIVE: '✅', CLOSED: '❌', UNKNOWN: '⚠️' };
  console.log(`${icons[status]} ${status} — ${reason}`);
  console.log(`   ${url}`);

  const exitCodes = { ACTIVE: 0, CLOSED: 1, UNKNOWN: 2 };
  process.exit(exitCodes[status]);
}

// Only run CLI when executed directly (not imported)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('check-liveness.mjs') ||
  process.argv[1].endsWith('scripts/check-liveness.mjs')
);

if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(2);
  });
}
