import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const ROOT = process.env.JOB_RADAR_ROOT
  ? resolve(process.env.JOB_RADAR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PATHS = {
  root:          ROOT,
  profile:       resolve(ROOT, 'config/profile.yml'),
  portals:       resolve(ROOT, 'config/portals.yml'),
  resume:        resolve(ROOT, 'resume.md'),
  history:       resolve(ROOT, 'data/scan-history.tsv'),
  scanCache:     resolve(ROOT, 'data/scan-cache.json'),
  geocodeCache:  resolve(ROOT, 'data/geocode-cache.json'),
  tracker:       resolve(ROOT, 'data/tracker.md'),
  companies:     resolve(ROOT, 'data/companies.md'),
  companyInfo:   resolve(ROOT, 'data/company-info.json'),
  employerUrls:  resolve(ROOT, 'data/employer-urls.json'),
  skills:        resolve(ROOT, 'training/skills.md'),
};

/** @returns {object|null} Parsed profile.yml, or null if missing/unreadable. */
export function loadProfile() {
  if (!existsSync(PATHS.profile)) return null;
  try {
    return yaml.load(readFileSync(PATHS.profile, 'utf-8')) || {};
  } catch { return null; }
}

/** @returns {object|null} Parsed portals.yml, or null if missing/unreadable. */
export function loadPortals() {
  if (!existsSync(PATHS.portals)) return null;
  try {
    return yaml.load(readFileSync(PATHS.portals, 'utf-8')) || {};
  } catch { return null; }
}
