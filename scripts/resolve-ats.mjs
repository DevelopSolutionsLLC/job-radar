#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

const FETCH_TIMEOUT = 8_000;
const PORTALS_PATH = 'config/portals.yml';

const urlPatterns = [
  { re: /boards\.greenhouse\.io\/(\w+)/i, type: 'greenhouse', key: 'board' },
  { re: /jobs\.ashbyhq\.com\/([^/?#]+)/i, type: 'ashby', key: 'board' },
  { re: /jobs\.lever\.co\/([^/?#]+)/i, type: 'lever', key: 'board' },
  { re: /(\w+)\.bamboohr\.com\/careers/i, type: 'bamboohr', key: 'slug' },
  { re: /(\w+)\.teamtailor\.com/i, type: 'teamtailor', key: 'slug' },
  { re: /(\w+)\.\w+\.myworkdayjobs\.com/i, type: 'workday', key: 'slug' },
];

const apiProbes = [
  {
    type: 'greenhouse',
    key: 'board',
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    validate: (json) => Array.isArray(json.jobs),
  },
  {
    type: 'ashby',
    key: 'board',
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    validate: (json) => Array.isArray(json.jobs),
  },
  {
    type: 'lever',
    key: 'board',
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    validate: (json) => Array.isArray(json),
  },
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function slugVariants(name) {
  const base = slugify(name);
  const noDash = base.replace(/-/g, '');
  const variants = [base];
  if (noDash !== base) variants.push(noDash);
  const parts = base.split('-');
  if (parts.length > 1) variants.push(parts[0]);
  return [...new Set(variants)];
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function alreadyTracked(type, slug) {
  if (!existsSync(PORTALS_PATH)) return false;
  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const entries = config[type] || [];
  const key = type === 'bamboohr' || type === 'teamtailor' || type === 'workday' ? 'slug' : 'board';
  return entries.some(e => e[key] === slug);
}

export async function resolveAts(input) {
  const trimmed = input.trim();

  // URL detection
  if (trimmed.startsWith('http')) {
    for (const pat of urlPatterns) {
      const m = trimmed.match(pat.re);
      if (m) {
        const slug = m[1].toLowerCase();
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { name, type: pat.type, [pat.key]: slug, tracked: alreadyTracked(pat.type, slug) };
      }
    }
    return null;
  }

  // Name-based API probing
  const variants = slugVariants(trimmed);

  for (const probe of apiProbes) {
    for (const slug of variants) {
      const json = await fetchJson(probe.url(slug));
      if (json && probe.validate(json)) {
        return {
          name: trimmed,
          type: probe.type,
          [probe.key]: slug,
          tracked: alreadyTracked(probe.type, slug),
        };
      }
    }
  }

  return null;
}

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/resolve-ats.mjs "<company name or URL>"');
    process.exit(1);
  }

  console.error(`Resolving ATS for: ${input}`);
  const result = await resolveAts(input);

  if (result) {
    console.log(JSON.stringify(result));
    console.error(`Found: ${result.type} (${result.board || result.slug})${result.tracked ? ' [already tracked]' : ''}`);
  } else {
    console.log('null');
    console.error('No ATS detected — try providing the careers page URL directly.');
    process.exit(1);
  }
}
