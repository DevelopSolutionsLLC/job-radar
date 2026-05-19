#!/usr/bin/env node

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'config/portals.yml';
const PROFILE_PATH = 'config/profile.yml';
const RESUME_PATH = 'resume.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const CACHE_PATH = 'data/scan-cache.json';
const GEOCODE_CACHE_PATH = 'data/geocode-cache.json';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const CONCURRENCY = 10;
const FETCH_TIMEOUT = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceRefresh = args.includes('--force');
const cacheOnly = args.includes('--cached');
const sourceFilter = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;

mkdirSync('data', { recursive: true });

if (!existsSync(PORTALS_PATH)) {
  console.error('No portals.yml found. Copy from config/portals.example.yml first.');
  process.exit(1);
}

const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));

const positiveFilters = (config.title_filter?.positive || []).map(f => f.toLowerCase());
const negativeFilters = (config.title_filter?.negative || []).map(f => f.toLowerCase());

// --- Dedup loader ---

function loadDedup() {
  const urls = new Set();
  const roles = new Set();

  if (existsSync(HISTORY_PATH)) {
    const lines = readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('url\t')) continue;
      const cols = line.split('\t');
      urls.add(cols[0]);
      if (cols.length >= 5 && cols[3] && cols[4]) {
        roles.add(`${cols[4]}||${cols[3]}`.toLowerCase());
      }
    }
  }

  return { urls, roles };
}

// --- Helpers ---

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function matchesFilter(title) {
  const lower = title.toLowerCase();
  if (negativeFilters.some(f => lower.includes(f))) return false;
  if (positiveFilters.length === 0) return true;
  return positiveFilters.some(f => lower.includes(f));
}

function rssExtractorKey(feedName) {
  const lower = feedName.toLowerCase();
  if (lower.includes('weworkremotely') || lower.includes('wwr')) return 'weworkremotely';
  if (lower.includes('hn') || lower.includes('hacker')) return 'hnrss';
  if (lower.includes('remoteok')) return 'remoteok';
  if (lower.includes('remotive')) return 'remotive';
  return 'default';
}

function parseRssItems(xml, sourceName) {
  const key = rssExtractorKey(sourceName);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(item => {
    const rawTitle = (
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      || ''
    ).trim();
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';

    let company = sourceName;
    let title = rawTitle;

    if (key === 'weworkremotely') {
      const m = rawTitle.match(/^(.+?):\s+(.+)$/);
      if (m) { company = m[1].trim(); title = m[2].trim(); }
    } else if (key === 'hnrss') {
      const m = rawTitle.match(/^(.+?)\s*\(.*?\)\s*[Ii]s [Hh]iring/i)
             || rawTitle.match(/^(.+?)\s+[Ii]s [Hh]iring/i);
      if (m) company = m[1].trim();
    } else if (key === 'remoteok' || key === 'remotive') {
      const author = (
        item.match(/<author><!\[CDATA\[([\s\S]*?)\]\]><\/author>/)?.[1]
        || item.match(/<author>([\s\S]*?)<\/author>/)?.[1]
        || ''
      ).trim();
      if (author) company = author;
    }

    // Remote-only boards: default location to "Remote" since every listing is remote
    const location = (key === 'weworkremotely' || key === 'remoteok' || key === 'remotive')
      ? 'Remote'
      : 'Unknown';

    return { title, url, company, location };
  }).filter(i => i.url);
}

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Relevance scoring ---

function loadResumeKeywords() {
  const keywords = new Set();
  if (existsSync(RESUME_PATH)) {
    const text = readFileSync(RESUME_PATH, 'utf-8').toLowerCase();
    const skillsMatch = text.match(/## skills[\s\S]*$/i);
    if (skillsMatch) {
      const words = skillsMatch[0].match(/[a-z][\w/.+-]+/g) || [];
      for (const w of words) {
        if (w.length > 2) keywords.add(w);
      }
    }
  }
  return keywords;
}

function loadTargetRoles() {
  if (!existsSync(PROFILE_PATH)) return [];
  try {
    const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf-8'));
    return (profile?.targets?.roles || []).map(r => r.toLowerCase());
  } catch { return []; }
}

function loadWorkArrangement() {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf-8'));
    return profile?.work_arrangement || null;
  } catch { return null; }
}

function loadHomeConfig() {
  if (!existsSync(PROFILE_PATH)) return { zip: null, radiusMiles: 100, localSearchTerms: [] };
  try {
    const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf-8'));
    const wa = profile?.work_arrangement || {};
    return {
      zip: wa.home_zip || null,
      radiusMiles: wa.local_radius_miles ?? 100,
      localSearchTerms: wa.local_search_terms || [],
    };
  } catch { return { zip: null, radiusMiles: 100, localSearchTerms: [] }; }
}

function loadGeocodeCache() {
  try {
    if (existsSync(GEOCODE_CACHE_PATH))
      return JSON.parse(readFileSync(GEOCODE_CACHE_PATH, 'utf-8'));
  } catch {}
  return {};
}

function saveGeocodeCache(cache) {
  writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeQuery(query, cache) {
  const key = query.toLowerCase().trim();
  if (key in cache) return cache[key];
  await new Promise(r => setTimeout(r, 1100));
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'job-radar/1.0 (personal job search tool)' } }
    );
    const data = await resp.json();
    const result = data.length > 0 ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    cache[key] = result;
    return result;
  } catch {
    cache[key] = null;
    return null;
  }
}

const US_PATTERNS = [
  /\bunited states\b/i,
  /\busa\b/i,
  /\bu\.s\.(a\.)?\b/i,
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(\b|,|$)/,
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
];

function isUSLocation(location) {
  return US_PATTERNS.some(p => p.test(location));
}

function isLocationCompatible(location, arrangement, distanceMiles = null) {
  if (!arrangement || !location) return true;
  const isRemote = /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(location);
  if (isRemote) return true;
  if (!arrangement.willing_to_relocate && !isUSLocation(location)) return false;
  if (distanceMiles !== null) return true; // within local radius = always compatible
  if (arrangement.preference === 'remote') return false;
  return true;
}

function scoreLocation(location, arrangement, distanceMiles = null) {
  if (!arrangement || !location) return 0;
  const isRemote = /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(location);
  if (distanceMiles !== null) return 2;
  const pref = arrangement.preference;
  if (pref === 'remote') return isRemote ? 1 : 0;
  if (pref === 'hybrid') return isRemote ? 0.5 : 0;
  if (pref === 'onsite') return isRemote ? -0.5 : 0;
  return 0;
}

function scoreRelevance(title, location, resumeKeywords, targetRoles, workArrangement, distanceMiles = null) {
  const lower = title.toLowerCase();
  let score = 0;

  for (const role of targetRoles) {
    if (lower.includes(role.toLowerCase())) { score += 3; break; }
    const words = role.toLowerCase().split(/\s+/);
    const matches = words.filter(w => w.length > 3 && lower.includes(w)).length;
    if (matches >= 2) { score += 2; break; }
    if (matches >= 1) score += 1;
  }

  const titleWords = lower.match(/[a-z][\w/.+-]+/g) || [];
  for (const w of titleWords) {
    if (resumeKeywords.has(w)) score += 0.5;
  }

  if (/\b(senior|staff|principal|lead)\b/i.test(title)) score += 0.5;
  if (/\b(manager|director|vp|head)\b/i.test(title)) score += 1;

  score += scoreLocation(location, workArrangement, distanceMiles);

  return Math.round(score * 10) / 10;
}

// --- Adapter registry ---

const adapters = {
  greenhouse: {
    url: (e) => `https://boards-api.greenhouse.io/v1/boards/${e.board}/jobs`,
    parse: (json, e) => (json.jobs || []).map(j => ({
      title: j.title,
      url: j.absolute_url,
      company: e.name,
      location: j.location?.name || null,
    })),
  },

  ashby: {
    url: (e) => `https://api.ashbyhq.com/posting-api/job-board/${e.board}`,
    parse: (json, e) => (json.jobs || []).map(j => ({
      title: j.title,
      url: `https://jobs.ashbyhq.com/${e.board}/${j.id}`,
      company: e.name,
      location: j.location || j.locationName || null,
    })),
  },

  lever: {
    url: (e) => `https://api.lever.co/v0/postings/${e.board}?mode=json`,
    parse: (json, e) => (Array.isArray(json) ? json : []).map(j => ({
      title: j.text,
      url: j.hostedUrl,
      company: e.name,
      location: j.categories?.location || j.workplaceType || null,
    })),
  },

  bamboohr: {
    url: (e) => `https://${e.slug}.bamboohr.com/careers/list`,
    parse: (json, e) => (json.result || []).map(j => ({
      title: j.jobOpeningName,
      url: j.jobOpeningShareUrl || `https://${e.slug}.bamboohr.com/careers/${j.id}/detail`,
      company: e.name,
      location: j.location?.city ? `${j.location.city}, ${j.location.state || ''}`.trim().replace(/,$/, '') : null,
    })),
  },

  teamtailor: {
    url: (e) => `https://${e.slug}.teamtailor.com/jobs.rss`,
    fetch: 'rss',
  },

  workday: {
    url: (e) => `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com/wday/cxs/${e.slug}/${e.site || 'External'}/jobs`,
    method: 'POST',
    paginate: true,
    pageSize: 20,
    maxResults: 100,
    headers: { 'Content-Type': 'application/json' },
    body: (offset, pageSize, entry) => JSON.stringify({ appliedFacets: {}, limit: pageSize, offset, searchText: entry.searchText || '' }),
    parse: (json, e) => (json.jobPostings || []).map(j => ({
      title: j.title,
      url: `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com${j.externalPath}`,
      company: e.name,
      location: j.locationsText || null,
    })),
    total: (json) => json.total ?? 0,
  },

  rss: {
    fetch: 'rss',
  },
};

// --- Core scan function ---

async function scanSource(type, entry) {
  const adapter = adapters[type];
  if (!adapter) return { error: `Unknown adapter: ${type}`, source: entry.name };

  const url = adapter.url?.(entry) || entry.url;
  if (!url) return { error: 'No URL resolved', source: entry.name };

  try {
    // Paginated adapters (e.g. Workday): loop until all results fetched or cap hit
    if (adapter.paginate) {
      const pageSize = adapter.pageSize ?? 50;
      const maxResults = adapter.maxResults ?? 500;
      const allJobs = [];
      let offset = 0;
      let total = null;

      while (offset < maxResults) {
        const fetchOpts = {
          method: adapter.method,
          headers: adapter.headers,
          body: adapter.body(offset, pageSize, entry),
        };
        const res = await fetchWithTimeout(url, fetchOpts);
        if (!res.ok) {
          if (offset === 0) return { error: `HTTP ${res.status}`, source: entry.name };
          break;
        }
        const json = await res.json();
        if (total === null) total = adapter.total?.(json) ?? 0;
        const page = adapter.parse(json, entry);
        if (page.length === 0) break;
        allJobs.push(...page);
        offset += pageSize;
        if (offset >= total) break;
      }

      return { jobs: allJobs, source: entry.name };
    }

    const fetchOpts = {};
    if (adapter.method) fetchOpts.method = adapter.method;
    if (adapter.headers) fetchOpts.headers = adapter.headers;
    if (adapter.body) fetchOpts.body = adapter.body();

    const res = await fetchWithTimeout(url, fetchOpts);
    if (!res.ok) return { error: `HTTP ${res.status}`, source: entry.name };

    if (adapter.fetch === 'rss') {
      const xml = await res.text();
      return { jobs: parseRssItems(xml, entry.name), source: entry.name };
    }

    const json = await res.json();
    const jobs = adapter.parse(json, entry);
    return { jobs, source: entry.name };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Timeout (10s)' : e.message;
    return { error: msg, source: entry.name };
  }
}

// --- Cache ---

function loadCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    const age = Date.now() - new Date(cache.timestamp).getTime();
    cache._age = age;
    cache._fresh = age < CACHE_TTL;
    return cache;
  } catch { return null; }
}

function saveCache(data) {
  writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
}

// --- Main ---

// --cached: return cached results without scanning
if (cacheOnly) {
  const cache = loadCache();
  if (cache) {
    console.log(JSON.stringify(cache));
  } else {
    console.log(JSON.stringify({ cached: false, message: 'No cache found. Run a scan first.' }));
  }
  process.exit(0);
}

// Check cache freshness (skip if --force or --source filter)
if (!forceRefresh && !sourceFilter) {
  const cache = loadCache();
  if (cache && cache._fresh) {
    const ageMin = Math.round(cache._age / 60_000);
    const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
    console.log(`\n${'━'.repeat(45)}`);
    console.log(`Portal Scan — cached (${ageStr})`);
    console.log(`${'━'.repeat(45)}`);
    console.log(`Sources scanned:       ${cache.sources_scanned}`);
    console.log(`Total jobs found:      ${cache.total_found}`);
    console.log(`Filtered by title:     ${cache.filtered} removed`);
    console.log(`Duplicates:            ${cache.duplicates} skipped`);
    console.log(`New postings added:    ${cache.new_count}`);
    if (cache.new_postings?.length > 0) {
      console.log(`\nNew postings:`);
      for (const p of cache.new_postings) {
        console.log(`  + ${p.company} | ${p.title} | ${p.type}`);
      }
    }
    console.log(`\nUsing cached results. Run with --force to refresh.\n`);
    // Output JSON for Claude to parse
    console.log(JSON.stringify(cache));
    process.exit(0);
  }
}

const { urls: seenUrls, roles: seenRoles } = loadDedup();
const resumeKeywords = loadResumeKeywords();
const targetRoles = loadTargetRoles();
const workArrangement = loadWorkArrangement();
const homeConfig = loadHomeConfig();
const today = new Date().toISOString().slice(0, 10);

// Ensure history file has header
if (!existsSync(HISTORY_PATH) || readFileSync(HISTORY_PATH, 'utf-8').trim() === '') {
  if (!dryRun) writeFileSync(HISTORY_PATH, 'url\tfirst_seen\tsource\ttitle\tcompany\tstatus\n');
}

const tasks = [];
const atsTypes = Object.keys(adapters);

for (const type of atsTypes) {
  if (sourceFilter && type !== sourceFilter) continue;
  const entries = config[type] || [];
  for (const entry of entries) {
    tasks.push(() => scanSource(type, entry).then(r => ({ ...r, type })));
    // Supplementary city-targeted searches for Workday (limit=20 cap prevents general pagination from finding buried local jobs)
    if (type === 'workday' && homeConfig.localSearchTerms.length > 0) {
      for (const term of homeConfig.localSearchTerms) {
        tasks.push(() => scanSource(type, { ...entry, searchText: term }).then(r => ({ ...r, type })));
      }
    }
  }
}

console.log(`\n${'━'.repeat(45)}`);
console.log(`Portal Scan — ${today}${dryRun ? ' (dry run)' : ''}`);
console.log(`${'━'.repeat(45)}`);

const results = await parallelFetch(tasks, CONCURRENCY);

// --- Proximity geocoding ---
const geocodeCache = loadGeocodeCache();
let homeCoords = null;
const distanceMap = new Map();

if (homeConfig.zip && !dryRun) {
  homeCoords = await geocodeQuery(`${homeConfig.zip} USA`, geocodeCache);
}

if (homeCoords) {
  const uniqueLocs = new Set();
  for (const r of results) {
    if (r.error) continue;
    for (const job of r.jobs) {
      if (job.location && !/\b(remote|anywhere|distributed|wfh)\b/i.test(job.location)) {
        uniqueLocs.add(job.location);
      }
    }
  }
  for (const loc of uniqueLocs) {
    const segments = loc.split(';')
      .map(s => s.split(',')[0].trim())
      .filter(s => s.length > 2 && !/^(remote|usa|us|united states|canada|uk|global|anywhere)$/i.test(s) && !/^[A-Z]{2}$/.test(s));
    let minDist = null;
    for (const city of segments.slice(0, 5)) {
      const coords = await geocodeQuery(`${city} USA`, geocodeCache);
      if (coords) {
        const d = haversine(homeCoords.lat, homeCoords.lon, coords.lat, coords.lon);
        if (minDist === null || d < minDist) minDist = d;
      }
    }
    distanceMap.set(loc, minDist !== null && minDist <= homeConfig.radiusMiles ? Math.round(minDist) : null);
  }
  saveGeocodeCache(geocodeCache);
}
// --- End proximity geocoding ---

let totalFound = 0;
let filtered = 0;
let duplicates = 0;
let added = 0;
const errors = [];
const newPostings = [];
const allPostings = [];

for (const result of results) {
  if (result.error) {
    errors.push(result);
    continue;
  }

  for (const job of result.jobs) {
    totalFound++;

    if (!matchesFilter(job.title)) {
      filtered++;
      continue;
    }

    const isNewUrl = !seenUrls.has(job.url);
    const roleKey = `${job.company}||${job.title}`.toLowerCase();
    const isNewRole = !seenRoles.has(roleKey);

    if (!isNewUrl) {
      duplicates++;
    } else if (!isNewRole) {
      duplicates++;
    } else {
      seenUrls.add(job.url);
      seenRoles.add(roleKey);

      if (!dryRun) {
        appendFileSync(HISTORY_PATH, `${job.url}\t${today}\t${result.type}\t${job.title}\t${job.company}\tadded\n`);
      }
      added++;
    }

    const distanceMiles = distanceMap.get(job.location) ?? null;
    const relevance = scoreRelevance(job.title, job.location, resumeKeywords, targetRoles, workArrangement, distanceMiles);
    const compatible = isLocationCompatible(job.location, workArrangement, distanceMiles);
    const posting = { company: job.company, title: job.title, url: job.url, type: result.type, relevance, location: job.location || null, compatible, distanceMiles };

    if (isNewUrl && isNewRole) newPostings.push(posting);
    if (compatible !== false && relevance >= 2) allPostings.push(posting);
  }
}

console.log(`Sources scanned:       ${tasks.length}`);
console.log(`Total jobs found:      ${totalFound}`);
console.log(`Filtered by title:     ${filtered} removed`);
console.log(`Duplicates:            ${duplicates} skipped`);
console.log(`New postings added:    ${added}`);

if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) {
    console.log(`  ✗ ${e.source}: ${e.error}`);
  }
}

if (newPostings.length > 0) {
  console.log(`\nNew postings:`);
  for (const p of newPostings) {
    console.log(`  + ${p.company} | ${p.title} | ${p.type}`);
  }
}

// --- Company aggregation for auto-add suggestions ---
const companyStats = new Map();
for (const p of newPostings) {
  const key = p.company.toLowerCase();
  if (!companyStats.has(key)) {
    companyStats.set(key, { name: p.company, count: 0, totalRelevance: 0, source: p.type });
  }
  const s = companyStats.get(key);
  s.count++;
  s.totalRelevance += p.relevance;
}

// Companies with 3+ matching roles that aren't in portals.yml named sections
const trackedNames = new Set();
for (const type of ['greenhouse', 'ashby', 'lever', 'bamboohr', 'teamtailor', 'workday']) {
  for (const entry of config[type] || []) {
    trackedNames.add((entry.name || '').toLowerCase());
  }
}

const suggestAdd = [...companyStats.values()]
  .filter(s => s.count >= 3 && !trackedNames.has(s.name.toLowerCase()))
  .sort((a, b) => b.totalRelevance - a.totalRelevance || b.count - a.count);

if (suggestAdd.length > 0) {
  console.log(`\nCompanies worth adding (3+ matching roles, not in portals.yml):`);
  for (const s of suggestAdd.slice(0, 10)) {
    console.log(`  → ${s.name} — ${s.count} roles, avg relevance ${(s.totalRelevance / s.count).toFixed(1)}`);
  }
}

// Save cache (unless dry-run or source-filtered)
if (!dryRun && !sourceFilter) {
  const cacheData = {
    timestamp: new Date().toISOString(),
    sources_scanned: tasks.length,
    total_found: totalFound,
    filtered,
    duplicates,
    new_count: added,
    errors: errors.map(e => ({ source: e.source, error: e.error })),
    new_postings: newPostings,
    all_postings: allPostings.sort((a, b) => b.relevance - a.relevance),
    suggest_add: suggestAdd.slice(0, 10).map(s => ({ name: s.name, count: s.count, avg_relevance: +(s.totalRelevance / s.count).toFixed(1) })),
  };
  saveCache(cacheData);
}

// Output JSON for Claude to parse
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  sources_scanned: tasks.length,
  total_found: totalFound,
  filtered,
  duplicates,
  new_count: added,
  new_postings: newPostings,
  suggest_add: suggestAdd.slice(0, 10).map(s => ({ name: s.name, count: s.count, avg_relevance: +(s.totalRelevance / s.count).toFixed(1) })),
}));

console.log();
