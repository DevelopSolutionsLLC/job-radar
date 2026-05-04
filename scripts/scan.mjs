#!/usr/bin/env node

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'config/portals.yml';
const HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';

mkdirSync('data', { recursive: true });

if (!existsSync(PORTALS_PATH)) {
  console.error('No portals.yml found. Copy from config/portals.example.yml first.');
  process.exit(1);
}

const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
const history = new Set(
  existsSync(HISTORY_PATH)
    ? readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean).map(l => l.split('\t')[0])
    : []
);

const positiveFilters = (config.title_filter?.positive || []).map(f => f.toLowerCase());
const negativeFilters = (config.title_filter?.negative || []).map(f => f.toLowerCase());

function matchesFilter(title) {
  const lower = title.toLowerCase();
  if (negativeFilters.some(f => lower.includes(f))) return false;
  if (positiveFilters.length === 0) return true;
  return positiveFilters.some(f => lower.includes(f));
}

let found = 0;
const today = new Date().toISOString().slice(0, 10);

// Greenhouse scanner
for (const company of (config.greenhouse || [])) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company.board}/jobs`);
    const data = await res.json();
    for (const job of (data.jobs || [])) {
      const url = job.absolute_url;
      if (history.has(url)) continue;
      if (!matchesFilter(job.title)) continue;
      appendFileSync(HISTORY_PATH, `${url}\t${company.name}\t${job.title}\t${today}\n`);
      appendFileSync(PIPELINE_PATH, `- [ ] [${company.name} — ${job.title}](${url})\n`);
      found++;
    }
  } catch (e) {
    console.error(`Greenhouse error (${company.name}): ${e.message}`);
  }
}

// Ashby scanner
for (const company of (config.ashby || [])) {
  try {
    const res = await fetch('https://api.ashbyhq.com/posting-api/job-board/' + company.board);
    const data = await res.json();
    for (const job of (data.jobs || [])) {
      const url = `https://jobs.ashbyhq.com/${company.board}/${job.id}`;
      if (history.has(url)) continue;
      if (!matchesFilter(job.title)) continue;
      appendFileSync(HISTORY_PATH, `${url}\t${company.name}\t${job.title}\t${today}\n`);
      appendFileSync(PIPELINE_PATH, `- [ ] [${company.name} — ${job.title}](${url})\n`);
      found++;
    }
  } catch (e) {
    console.error(`Ashby error (${company.name}): ${e.message}`);
  }
}

// Lever scanner
for (const company of (config.lever || [])) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company.board}?mode=json`);
    const data = await res.json();
    for (const job of (data || [])) {
      const url = job.hostedUrl;
      if (history.has(url)) continue;
      if (!matchesFilter(job.text)) continue;
      appendFileSync(HISTORY_PATH, `${url}\t${company.name}\t${job.text}\t${today}\n`);
      appendFileSync(PIPELINE_PATH, `- [ ] [${company.name} — ${job.text}](${url})\n`);
      found++;
    }
  } catch (e) {
    console.error(`Lever error (${company.name}): ${e.message}`);
  }
}

// RSS feed scanner (LinkedIn alerts, Indeed, etc.)
for (const feed of (config.rss || [])) {
  try {
    const res = await fetch(feed.url);
    const text = await res.text();
    const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        || item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      if (!link || history.has(link)) continue;
      if (!matchesFilter(title)) continue;
      appendFileSync(HISTORY_PATH, `${link}\t${feed.name}\t${title}\t${today}\n`);
      appendFileSync(PIPELINE_PATH, `- [ ] [${feed.name} — ${title}](${link})\n`);
      found++;
    }
  } catch (e) {
    console.error(`RSS error (${feed.name}): ${e.message}`);
  }
}

console.log(`Scan complete: ${found} new posting(s) found.`);
