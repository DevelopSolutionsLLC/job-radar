#!/usr/bin/env node
// Reads scan-cache.json and outputs a summary + top N postings in one call.
// Usage: node scripts/read-cache.mjs [--top N] [--find <query>]
//   --top N     Return top N postings by relevance (default 150)
//   --find str  Return up to 5 postings matching company or title (case-insensitive)
//   stdout: JSON with { fresh, ageHours, total, excluded, postings[] }

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const CACHE_PATH = resolve('data/scan-cache.json');
const CACHE_TTL_HOURS = 12;
const DEFAULT_TOP = 150;

const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const topN = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : DEFAULT_TOP;
const findIdx = args.indexOf('--find');
const findQuery = findIdx >= 0 ? args[findIdx + 1]?.toLowerCase() : null;

if (!existsSync(CACHE_PATH)) {
  console.log(JSON.stringify({ fresh: false, ageHours: null, total: 0, excluded: 0, postings: [] }));
  process.exit(0);
}

const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
const ts = cache.timestamp ? new Date(cache.timestamp) : null;
const ageHours = ts ? (Date.now() - ts.getTime()) / 3600000 : null;
const fresh = ageHours !== null && ageHours < CACHE_TTL_HOURS;

const pool = cache.all_postings ?? cache.new_postings ?? [];
const excluded = pool.filter(p => p.compatible === false);
const compatible = pool.filter(p => p.compatible !== false);

const matched = findQuery
  ? compatible.filter(p =>
      p.company?.toLowerCase().includes(findQuery) ||
      p.title?.toLowerCase().includes(findQuery)
    ).slice(0, 5)
  : compatible.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0)).slice(0, topN);

const top = matched.map(p => ({
    title: p.title,
    company: p.company,
    location: p.location ?? null,
    type: p.type,
    relevance: p.relevance,
    url: p.url,
  }));

console.log(JSON.stringify({
  fresh,
  ageHours: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,
  total: pool.length,
  excluded: excluded.length,
  postings: top,
}));
