#!/usr/bin/env node
// Reads scan-cache.json and outputs a summary + top N postings in one call.
// Usage: node scripts/read-cache.mjs [--top N] [--find <query>]
//   --top N     Return top N postings by relevance (default 150)
//   --find str  Return up to 5 postings matching company or title (case-insensitive)
//   stdout: JSON with { fresh, ageHours, total, excluded, excludedTracked, excludedDismissed, postings[] }

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PATHS, loadProfile } from './lib/config.mjs';
import { isCacheFresh, SCAN_CACHE_TTL_MS } from './lib/cache.mjs';

const profile = loadProfile() || {};
const LOCAL_RADIUS_MILES = profile?.work_arrangement?.local_radius_miles ?? 100;
const DISCARD_SUPPRESS_MS = 60 * 24 * 3600 * 1000; // 60 days

const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const topN = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : 150;
const findIdx = args.indexOf('--find');
const findQuery = findIdx >= 0 ? args[findIdx + 1]?.toLowerCase() : null;

if (!existsSync(PATHS.scanCache)) {
  console.log(JSON.stringify({ fresh: false, ageHours: null, total: 0, excluded: 0, postings: [] }));
  process.exit(0);
}

// Build suppression set from tracker. Discarded entries re-surface after 60 days.
const normalizeKey = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const trackedKeys = new Set();
const now = Date.now();
if (existsSync(PATHS.tracker)) {
  for (const line of readFileSync(PATHS.tracker, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cols = line.split('|').map(c => c.trim());
    if (cols.length < 5 || cols[3] === 'Company' || cols[3] === '---') continue;
    const company = cols[3], role = cols[4], status = cols[6] ?? '';
    if (!company || !role) continue;
    if (status === 'Discarded') {
      const discardedAt = cols[2] ? new Date(cols[2]).getTime() : 0;
      if (now - discardedAt < DISCARD_SUPPRESS_MS)
        trackedKeys.add(`${normalizeKey(company)}|${normalizeKey(role)}`);
    } else {
      trackedKeys.add(`${normalizeKey(company)}|${normalizeKey(role)}`);
    }
  }
}

const cache = JSON.parse(readFileSync(PATHS.scanCache, 'utf8'));
const ageHours = cache.timestamp
  ? (now - new Date(cache.timestamp).getTime()) / 3600000
  : null;
const fresh = isCacheFresh(cache, SCAN_CACHE_TTL_MS);

const pool = cache.all_postings ?? cache.new_postings ?? [];
const excludedIncompat = pool.filter(p => p.compatible === false);
const compatible = pool.filter(p => p.compatible !== false);

// Cache title keys may have location suffixes; match when tracker key is a prefix.
const isTracked = (p) => {
  const cacheKey = `${normalizeKey(p.company ?? '')}|${normalizeKey(p.title ?? '')}`;
  for (const k of trackedKeys) {
    if (cacheKey === k || cacheKey.startsWith(k + ' ')) return true;
  }
  return false;
};
const alreadyTracked = compatible.filter(p => isTracked(p));
const afterTracker = compatible.filter(p => !isTracked(p));

const DISMISSED_PATH = resolve(PATHS.root, 'data/dismissed.json');
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
      const localPool = pickable.filter(p => p.distanceMiles != null && p.distanceMiles <= LOCAL_RADIUS_MILES);
      const localUrls = new Set(localPool.map(p => p.url));
      const remotePool = pickable.filter(p => !localUrls.has(p.url));
      const rssReserve = Math.min(Math.round(topN * 0.1), 10);
      const nonRssSlots = topN - rssReserve;
      const nonRss = remotePool.filter(p => p.type !== 'rss').sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
      const rss = remotePool.filter(p => p.type === 'rss').sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
      const nonRssPicked = nonRss.slice(0, nonRssSlots + Math.max(0, rssReserve - rss.length));
      const rssPicked = rss.slice(0, rssReserve + Math.max(0, nonRssSlots - nonRss.length));
      return [...nonRssPicked, ...rssPicked, ...localPool];
    })();

const top = matched.map(p => ({
  title: p.title, company: p.company, location: p.location ?? null,
  distanceMiles: p.distanceMiles ?? null, type: p.type,
  relevance: p.relevance, url: p.url,
}));

console.log(JSON.stringify({
  fresh, ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
  scanTimestamp: cache.timestamp ?? null,
  total: pool.length,
  excluded: excludedIncompat.length + alreadyTracked.length + alreadyDismissed.length,
  excludedTracked: alreadyTracked.length,
  excludedDismissed: alreadyDismissed.length,
  postings: top,
}));
