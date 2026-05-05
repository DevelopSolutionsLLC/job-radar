#!/usr/bin/env node

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'config/portals.yml';
const HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const CONCURRENCY = 10;
const FETCH_TIMEOUT = 10_000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
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
      if (cols.length >= 4) roles.add(`${cols[1]}||${cols[2]}`.toLowerCase());
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

function parseRssItems(xml, sourceName) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(item => {
    const title = (
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      || ''
    ).trim();
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
    return { title, url, company: sourceName };
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

// --- Adapter registry ---

const adapters = {
  greenhouse: {
    url: (e) => `https://boards-api.greenhouse.io/v1/boards/${e.board}/jobs`,
    parse: (json, e) => (json.jobs || []).map(j => ({
      title: j.title,
      url: j.absolute_url,
      company: e.name,
    })),
  },

  ashby: {
    url: (e) => `https://api.ashbyhq.com/posting-api/job-board/${e.board}`,
    parse: (json, e) => (json.jobs || []).map(j => ({
      title: j.title,
      url: `https://jobs.ashbyhq.com/${e.board}/${j.id}`,
      company: e.name,
    })),
  },

  lever: {
    url: (e) => `https://api.lever.co/v0/postings/${e.board}?mode=json`,
    parse: (json, e) => (Array.isArray(json) ? json : []).map(j => ({
      title: j.text,
      url: j.hostedUrl,
      company: e.name,
    })),
  },

  bamboohr: {
    url: (e) => `https://${e.slug}.bamboohr.com/careers/list`,
    parse: (json, e) => (json.result || []).map(j => ({
      title: j.jobOpeningName,
      url: j.jobOpeningShareUrl || `https://${e.slug}.bamboohr.com/careers/${j.id}/detail`,
      company: e.name,
    })),
  },

  teamtailor: {
    url: (e) => `https://${e.slug}.teamtailor.com/jobs.rss`,
    fetch: 'rss',
  },

  workday: {
    url: (e) => `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com/wday/cxs/${e.slug}/${e.site || 'External'}/jobs`,
    method: 'POST',
    body: () => JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
    headers: { 'Content-Type': 'application/json' },
    parse: (json, e) => (json.jobPostings || []).map(j => ({
      title: j.title,
      url: `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com${j.externalPath}`,
      company: e.name,
    })),
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

// --- Main ---

const { urls: seenUrls, roles: seenRoles } = loadDedup();
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
  }
}

console.log(`\n${'━'.repeat(45)}`);
console.log(`Portal Scan — ${today}${dryRun ? ' (dry run)' : ''}`);
console.log(`${'━'.repeat(45)}`);

const results = await parallelFetch(tasks, CONCURRENCY);

let totalFound = 0;
let filtered = 0;
let duplicates = 0;
let added = 0;
const errors = [];
const newPostings = [];

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

    if (seenUrls.has(job.url)) {
      duplicates++;
      continue;
    }

    const roleKey = `${job.company}||${job.title}`.toLowerCase();
    if (seenRoles.has(roleKey)) {
      duplicates++;
      continue;
    }

    seenUrls.add(job.url);
    seenRoles.add(roleKey);

    if (!dryRun) {
      appendFileSync(HISTORY_PATH, `${job.url}\t${today}\t${result.type}\t${job.title}\t${job.company}\tadded\n`);
      appendFileSync(PIPELINE_PATH, `- [ ] [${job.company} — ${job.title}](${job.url})\n`);
    }

    newPostings.push({ company: job.company, title: job.title, type: result.type });
    added++;
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

console.log();
