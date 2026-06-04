#!/usr/bin/env node

/**
 * normalize-statuses.mjs — Fix common status typos and variants in the tracker.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PATHS } from './lib/config.mjs';
import { CANONICAL_STATUSES } from './lib/tracker.mjs';

const STATUS_MAP = new Map([
  ['evaluated', 'Evaluated'], ['eval', 'Evaluated'], ['pending', 'Evaluated'],
  ['review', 'Evaluated'], ['reviewed', 'Evaluated'],
  ['applied', 'Applied'], ['sent', 'Applied'], ['submitted', 'Applied'],
  ['responded', 'Responded'], ['response', 'Responded'], ['replied', 'Responded'],
  ['interview', 'Interview'], ['interviewing', 'Interview'],
  ['phone screen', 'Interview'], ['screen', 'Interview'], ['onsite', 'Interview'],
  ['offer', 'Offer'], ['offered', 'Offer'],
  ['rejected', 'Rejected'], ['rejected by company', 'Rejected'],
  ['declined', 'Rejected'], ['passed', 'Rejected'], ['no', 'Rejected'],
  ['discarded', 'Discarded'], ['closed', 'Discarded'],
  ['expired', 'Discarded'], ['withdrawn', 'Discarded'],
  ['skip', 'SKIP'], ['skipped', 'SKIP'], ['ignore', 'SKIP'],
  ['ignored', 'SKIP'], ['n/a', 'SKIP'],
]);

function normalize(status) {
  const trimmed = status.trim();
  if (CANONICAL_STATUSES.includes(trimmed)) return trimmed;
  return STATUS_MAP.get(trimmed.toLowerCase()) || trimmed;
}

function run() {
  console.log('\n  Normalize Statuses\n');

  if (!existsSync(PATHS.tracker)) {
    console.log('  ✔ No tracker file found — nothing to normalize.\n');
    process.exit(0);
  }

  const lines = readFileSync(PATHS.tracker, 'utf-8').split('\n');
  let fixed = 0;
  let headerTableRows = 0;
  let headerDone = false;

  const outputLines = lines.map((line) => {
    if (!line.trim().startsWith('|')) return line;
    if (!headerDone) {
      headerTableRows++;
      if (headerTableRows >= 2) headerDone = true;
      return line;
    }
    const cells = line.split('|').slice(1, -1);
    if (cells.length < 6) return line;
    const rawStatus = cells[5].trim();
    const normalized = normalize(rawStatus);
    if (normalized !== rawStatus) {
      console.log(`    ✘ "${rawStatus}" → "${normalized}"`);
      cells[5] = cells[5].replace(rawStatus, normalized);
      fixed++;
      return '|' + cells.join('|') + '|';
    }
    return line;
  });

  if (fixed === 0) {
    console.log('  ✔ All statuses are already canonical.\n');
    process.exit(0);
  }

  writeFileSync(PATHS.tracker, outputLines.join('\n'), 'utf-8');
  console.log(`\n  ✔ Fixed ${fixed} status${fixed === 1 ? '' : 'es'}. Tracker updated.\n`);
}

run();
