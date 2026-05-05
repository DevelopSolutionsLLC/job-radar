#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { resolveAts } from './resolve-ats.mjs';

const PORTALS_PATH = 'config/portals.yml';
const COMPANIES_PATH = 'data/companies.md';
const TRACKER_PATH = 'data/tracker.md';
const FETCH_TIMEOUT = 10_000;

const args = process.argv.slice(2);
const topN = args.includes('--top') ? parseInt(args[args.indexOf('--top') + 1], 10) || 5 : null;
const sortMode = args.includes('--fresh') ? 'fresh' : args.includes('--urgent') ? 'urgent' : 'score';
const addTier = args.includes('--add') ? args[args.indexOf('--add') + 1] : null;
const dryRun = args.includes('--dry-run');

mkdirSync('data', { recursive: true });

if (!existsSync(PORTALS_PATH)) {
  console.error('No portals.yml found. Copy from config/portals.example.yml first.');
  process.exit(1);
}

const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
const positiveFilters = (config.title_filter?.positive || []).map(f => f.toLowerCase());
const negativeFilters = (config.title_filter?.negative || []).map(f => f.toLowerCase());

function matchesFilter(title) {
  const lower = title.toLowerCase();
  if (negativeFilters.some(f => lower.includes(f))) return false;
  if (positiveFilters.length === 0) return true;
  return positiveFilters.some(f => lower.includes(f));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItemsWithDate(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(item => {
    const title = (
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      || ''
    ).trim();
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
    const postedAt = pubDate ? new Date(pubDate) : null;
    const rawCompany = item.match(/<company>([\s\S]*?)<\/company>/)?.[1]?.trim() || null;
    return { title, url, postedAt, rawCompany, rawItem: item };
  }).filter(i => i.url);
}

// --- Company extractors per feed ---

const companyExtractors = {
  weworkremotely: (item) => {
    const m = item.title.match(/^(.+?):\s/);
    return m ? m[1].trim() : null;
  },
  hnrss: (item) => {
    const m = item.title.match(/^(.+?)\s*\(.*?\)\s*Is Hiring/i)
           || item.title.match(/^(.+?)\s+Is Hiring/i);
    return m ? m[1].trim() : null;
  },
  remoteok: (item) => item.rawCompany,
  default: (item) => item.rawCompany,
};

function extractorKey(feedName) {
  const lower = feedName.toLowerCase();
  if (lower.includes('weworkremotely') || lower.includes('wwr')) return 'weworkremotely';
  if (lower.includes('hn') || lower.includes('hacker')) return 'hnrss';
  if (lower.includes('remoteok')) return 'remoteok';
  return 'default';
}

// --- Load existing state ---

function loadTrackedCompanies() {
  const tracked = new Set();
  for (const type of ['greenhouse', 'ashby', 'lever', 'bamboohr', 'teamtailor', 'workday']) {
    for (const entry of config[type] || []) {
      tracked.add((entry.name || '').toLowerCase());
    }
  }
  return tracked;
}

function loadAppliedCompanies() {
  const applied = new Set();
  if (existsSync(TRACKER_PATH)) {
    const lines = readFileSync(TRACKER_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/\|\s*(.+?)\s*\|/);
      if (m) applied.add(m[1].toLowerCase());
    }
  }
  return applied;
}

function loadCompaniesFile() {
  const companies = new Map();
  if (existsSync(COMPANIES_PATH)) {
    const lines = readFileSync(COMPANIES_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\w+)\s*\|/);
      if (m && m[1] !== 'Company') {
        companies.set(m[1].toLowerCase(), { name: m[1], tier: parseInt(m[2]), status: m[3] });
      }
    }
  }
  return companies;
}

// --- Main ---

const trackedCompanies = loadTrackedCompanies();
const appliedCompanies = loadAppliedCompanies();
const existingCompanies = loadCompaniesFile();

const feeds = config.rss || [];
if (feeds.length === 0) {
  console.error('No RSS feeds configured in portals.yml.');
  process.exit(1);
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const discoveries = new Map();
let totalMatching = 0;

console.log(`\n${'━'.repeat(45)}`);
console.log(`Discovery — ${today}${dryRun ? ' (dry run)' : ''}`);
console.log(`${'━'.repeat(45)}`);

for (const feed of feeds) {
  try {
    const res = await fetchWithTimeout(feed.url);
    if (!res.ok) {
      console.error(`  ✗ ${feed.name}: HTTP ${res.status}`);
      continue;
    }

    const xml = await res.text();
    const items = parseRssItemsWithDate(xml);
    const extractor = companyExtractors[extractorKey(feed.name)];

    for (const item of items) {
      if (!matchesFilter(item.title)) continue;
      totalMatching++;

      const companyName = extractor(item);
      if (!companyName) continue;

      const key = companyName.toLowerCase();
      if (trackedCompanies.has(key)) continue;
      if (appliedCompanies.has(key)) continue;
      if (existingCompanies.get(key)?.status === 'skipped') continue;

      if (!discoveries.has(key)) {
        discoveries.set(key, {
          name: companyName,
          roles: [],
          newest: null,
          oldest: null,
          source: feed.name,
        });
      }

      const d = discoveries.get(key);
      d.roles.push(item.title);

      if (item.postedAt) {
        if (!d.newest || item.postedAt > d.newest) d.newest = item.postedAt;
        if (!d.oldest || item.postedAt < d.oldest) d.oldest = item.postedAt;
      }
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Timeout' : e.message;
    console.error(`  ✗ ${feed.name}: ${msg}`);
  }
}

// --- Scoring ---

function scoreCompany(d) {
  let score = 0;
  const uniqueRoles = [...new Set(d.roles.map(r => r.toLowerCase()))];
  if (uniqueRoles.length >= 3) score += 3;
  else if (uniqueRoles.length >= 2) score += 2;
  else score += 1;

  const matchCount = positiveFilters.reduce((n, f) =>
    n + (uniqueRoles.some(r => r.includes(f)) ? 1 : 0), 0);
  if (matchCount > 1) score += matchCount - 1;

  if (d.newest) {
    const hoursAgo = (now - d.newest) / 3_600_000;
    if (hoursAgo < 24) score += 2;
    else if (hoursAgo < 168) score += 1;
  }

  if (d.oldest) {
    const daysOpen = (now - d.oldest) / 86_400_000;
    if (daysOpen > 30) score += 1;
  }

  return score;
}

const scored = [...discoveries.values()].map(d => ({
  ...d,
  score: scoreCompany(d),
  tier: 0,
  uniqueRoles: [...new Set(d.roles.map(r => r.toLowerCase()))].length,
}));

for (const d of scored) {
  d.tier = d.score >= 5 ? 1 : d.score >= 3 ? 2 : 3;
}

// --- Sort ---

if (sortMode === 'fresh') {
  scored.sort((a, b) => (b.newest || 0) - (a.newest || 0));
} else if (sortMode === 'urgent') {
  scored.sort((a, b) => (a.oldest || Infinity) - (b.oldest || Infinity));
} else {
  scored.sort((a, b) => b.score - a.score || b.uniqueRoles - a.uniqueRoles);
}

// --- Output ---

function timeAgo(date) {
  if (!date) return 'unknown';
  const hours = Math.floor((now - date) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

console.log(`Feeds scanned:         ${feeds.length}`);
console.log(`Matching jobs found:   ${totalMatching}`);
console.log(`Companies extracted:   ${discoveries.size}`);
console.log(`Already tracked:       ${trackedCompanies.size}`);
console.log(`New discoveries:       ${scored.length}`);

const tiers = { 1: [], 2: [], 3: [] };
for (const d of scored) tiers[d.tier].push(d);

const tierLabels = { 1: 'Tier 1 (strong signal)', 2: 'Tier 2 (good match)', 3: 'Tier 3 (worth a look)' };
const tierIcons = { 1: '★', 2: '◆', 3: '○' };

for (const t of [1, 2, 3]) {
  const items = topN ? tiers[t].slice(0, topN) : tiers[t];
  if (items.length === 0) continue;
  console.log(`\n${tierLabels[t]}:`);
  for (const d of items) {
    console.log(`  ${tierIcons[t]} ${d.name} — ${d.uniqueRoles} role${d.uniqueRoles !== 1 ? 's' : ''}, newest ${timeAgo(d.newest)}`);
  }
}

// --- Add companies ---

const resolved = new Map();

if (addTier && !dryRun) {
  const toAdd = scored.filter(d => {
    if (addTier === 'all') return true;
    return d.tier <= parseInt(addTier.replace('tier', ''), 10);
  });

  if (toAdd.length === 0) {
    console.log('\nNo companies to add.');
  } else {
    console.log(`\nResolving ATS for ${toAdd.length} companies...`);
    let addedCount = 0;

    for (const d of toAdd) {
      const result = await resolveAts(d.name);
      if (result && !result.tracked) {
        const section = result.type;
        if (!config[section]) config[section] = [];

        const entry = { name: d.name };
        if (result.board) entry.board = result.board;
        if (result.slug) entry.slug = result.slug;
        config[section].push(entry);
        addedCount++;
        resolved.set(d.name.toLowerCase(), { ats: result.type, status: 'added' });
        console.log(`  + ${d.name} → ${result.type} (${result.board || result.slug})`);
      } else if (result?.tracked) {
        resolved.set(d.name.toLowerCase(), { ats: result.type, status: 'added' });
        console.log(`  = ${d.name} already in portals.yml`);
      } else {
        console.log(`  ? ${d.name} — no ATS detected`);
      }
    }

    if (addedCount > 0) {
      writeFileSync(PORTALS_PATH, yaml.dump(config, { lineWidth: -1 }));
      console.log(`\nUpdated portals.yml with ${addedCount} new companies.`);
    }
  }
}

// --- Update companies.md ---

if (!dryRun && scored.length > 0) {
  const header = '# Discovered Companies\n\n| Company | Tier | Status | Source | Roles | Newest | First Seen | ATS |\n|---------|------|--------|--------|-------|--------|------------|-----|\n';
  const rows = [];

  for (const [key, existing] of existingCompanies) {
    if (!discoveries.has(key)) {
      rows.push(`| ${existing.name} | ${existing.tier} | ${existing.status} | - | - | - | - | - |`);
    }
  }

  for (const d of scored) {
    const key = d.name.toLowerCase();
    const existing = existingCompanies.get(key);
    const res = resolved.get(key);
    const status = res?.status || existing?.status || 'suggested';
    const ats = res?.ats || '-';
    rows.push(`| ${d.name} | ${d.tier} | ${status} | ${d.source} | ${d.uniqueRoles} | ${timeAgo(d.newest)} | ${today} | ${ats} |`);
  }

  writeFileSync(COMPANIES_PATH, header + rows.join('\n') + '\n');
}

console.log();
