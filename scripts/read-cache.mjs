#!/usr/bin/env node
// Reads scan-cache.json and outputs a summary + top N postings in one call.
// Usage: node scripts/read-cache.mjs [--top N] [--find <query>]
//   --top N     Return top N postings by relevance (default 150)
//   --find str  Return up to 5 postings matching company or title (case-insensitive)
//   stdout: JSON with { fresh, ageHours, total, excluded, excludedTracked, excludedDismissed, postings[] }

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

const CACHE_PATH = resolve('data/scan-cache.json');
const TRACKER_PATH = resolve('data/tracker.md');
const DISMISSED_PATH = resolve('data/dismissed.json');
const PROFILE_PATH = resolve('config/profile.yml');
const CACHE_TTL_HOURS = 12;
const DEFAULT_TOP = 150;

function loadLocalRadius() {
  try {
    if (existsSync(PROFILE_PATH)) {
      const p = yaml.load(readFileSync(PROFILE_PATH, 'utf8'));
      return p?.work_arrangement?.local_radius_miles ?? 100;
    }
  } catch {}
  return 100;
}
const LOCAL_RADIUS_MILES = loadLocalRadius();
const DISCARD_SUPPRESS_MS = 60 * 24 * 3600 * 1000; // 60 days

const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const topN = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : DEFAULT_TOP;
const findIdx = args.indexOf('--find');
const findQuery = findIdx >= 0 ? args[findIdx + 1]?.toLowerCase() : null;

if (!existsSync(CACHE_PATH)) {
  console.log(JSON.stringify({ fresh: false, ageHours: null, total: 0, excluded: 0, postings: [] }));
  process.exit(0);
}

// Build a set of tracked company+role pairs to suppress from pick list.
// Dedup key: lowercase(company) + '|' + lowercase(role), stripping punctuation.
// Discarded entries are suppressed for 60 days then reappear. All others suppressed forever.
const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const trackedKeys = new Set();
const now = Date.now();
if (existsSync(TRACKER_PATH)) {
  const lines = readFileSync(TRACKER_PATH, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cols = line.split('|').map(c => c.trim());
    // cols[0]='', cols[1]=#, cols[2]=Date, cols[3]=Company, cols[4]=Role, cols[5]=Score, cols[6]=Status
    if (cols.length < 5 || cols[3] === 'Company' || cols[3] === '---') continue;
    const company = cols[3];
    const role = cols[4];
    const status = cols[6] ?? '';
    if (!company || !role) continue;
    if (status === 'Discarded') {
      const discardedAt = cols[2] ? new Date(cols[2]).getTime() : 0;
      if (now - discardedAt < DISCARD_SUPPRESS_MS) {
        trackedKeys.add(`${normalize(company)}|${normalize(role)}`);
      }
      // Older than 60 days: omit from suppression so it can reappear
    } else {
      trackedKeys.add(`${normalize(company)}|${normalize(role)}`);
    }
  }
}

const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
const ts = cache.timestamp ? new Date(cache.timestamp) : null;
const ageHours = ts ? (Date.now() - ts.getTime()) / 3600000 : null;
const fresh = ageHours !== null && ageHours < CACHE_TTL_HOURS;

const pool = cache.all_postings ?? cache.new_postings ?? [];
const excludedIncompat = pool.filter(p => p.compatible === false);
const compatible = pool.filter(p => p.compatible !== false);

// Filter out postings already in the tracker.
const alreadyTracked = compatible.filter(p =>
  trackedKeys.has(`${normalize(p.company ?? '')}|${normalize(p.title ?? '')}`)
);
const afterTracker = compatible.filter(p =>
  !trackedKeys.has(`${normalize(p.company ?? '')}|${normalize(p.title ?? '')}`)
);

// Filter out snoozed postings (dismissed.json). Clean up expired entries while here.
let dismissedEntries = [];
if (existsSync(DISMISSED_PATH)) {
  try { dismissedEntries = JSON.parse(readFileSync(DISMISSED_PATH, 'utf8')); } catch {}
}
const activeDismissed = dismissedEntries.filter(e => new Date(e.hide_until).getTime() > now);
if (activeDismissed.length < dismissedEntries.length) {
  writeFileSync(DISMISSED_PATH, JSON.stringify(activeDismissed, null, 2));
}
const dismissedUrls = new Set(activeDismissed.map(e => e.url));
const alreadyDismissed = afterTracker.filter(p => dismissedUrls.has(p.url));
const pickable = afterTracker.filter(p => !dismissedUrls.has(p.url));

const matched = findQuery
  ? pickable.filter(p =>
      p.company?.toLowerCase().includes(findQuery) ||
      p.title?.toLowerCase().includes(findQuery)
    ).slice(0, 5)
  : (() => {
      // Always include local postings (distanceMiles within radius) — they'd otherwise be buried by higher-relevance remote jobs
      const localPool = pickable.filter(p => p.distanceMiles != null && p.distanceMiles <= LOCAL_RADIUS_MILES);
      const localUrls = new Set(localPool.map(p => p.url));
      const remotePool = pickable.filter(p => !localUrls.has(p.url));

      const rssReserve = Math.min(Math.round(topN * 0.1), 10);
      const nonRssSlots = topN - rssReserve;
      const nonRss = remotePool
        .filter(p => p.type !== 'rss')
        .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
      const rss = remotePool
        .filter(p => p.type === 'rss')
        .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
      const nonRssPicked = nonRss.slice(0, nonRssSlots + Math.max(0, rssReserve - rss.length));
      const rssPicked = rss.slice(0, rssReserve + Math.max(0, nonRssSlots - nonRss.length));
      return [...nonRssPicked, ...rssPicked, ...localPool];
    })();

const top = matched.map(p => ({
    title: p.title,
    company: p.company,
    location: p.location ?? null,
    distanceMiles: p.distanceMiles ?? null,
    type: p.type,
    relevance: p.relevance,
    url: p.url,
  }));

console.log(JSON.stringify({
  fresh,
  ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
  scanTimestamp: cache.timestamp ?? null,
  total: pool.length,
  excluded: excludedIncompat.length + alreadyTracked.length + alreadyDismissed.length,
  excludedTracked: alreadyTracked.length,
  excludedDismissed: alreadyDismissed.length,
  postings: top,
}));
