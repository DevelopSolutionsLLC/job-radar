#!/usr/bin/env node

/**
 * dedup-tracker.mjs — Remove duplicate rows from the applications tracker.
 *
 * Duplicates are identified by company+role (case-insensitive).
 * When duplicates exist, the row with the higher score is kept.
 */

import { PATHS } from './lib/config.mjs';
import { parseScore, parseTracker, serializeTracker, writeTracker } from './lib/tracker.mjs';
import { existsSync } from 'fs';

function run() {
  console.log('\n  Dedup Tracker\n');

  if (!existsSync(PATHS.tracker)) {
    console.log('  ✔ No tracker file found — nothing to dedup.\n');
    process.exit(0);
  }

  const { headerLines, rows } = parseTracker();

  const dataRows = rows.filter(r => r.cells !== null);
  if (dataRows.length === 0) {
    console.log('  ✔ Tracker is empty — nothing to dedup.\n');
    process.exit(0);
  }

  const best = new Map();
  let removed = 0;

  for (const row of rows) {
    if (!row.cells) continue;
    const company = (row.cells[2] || '').toLowerCase().trim();
    const role = (row.cells[3] || '').toLowerCase().trim();
    const key = `${company}|||${role}`;
    const score = parseScore(row.cells[4]);

    if (best.has(key)) {
      const existing = best.get(key);
      if (score > existing.score) {
        console.log(`    ✘ Duplicate removed: "${existing.cells[2]}" + "${existing.cells[3]}" (score ${existing.cells[4] || 'N/A'} < ${row.cells[4] || 'N/A'})`);
        best.set(key, { ...row, score });
      } else {
        console.log(`    ✘ Duplicate removed: "${row.cells[2]}" + "${row.cells[3]}" (score ${row.cells[4] || 'N/A'} <= ${existing.cells[4] || 'N/A'})`);
      }
      removed++;
    } else {
      best.set(key, { ...row, score });
    }
  }

  if (removed === 0) {
    console.log('  ✔ No duplicates found.\n');
    process.exit(0);
  }

  // Rebuild in original order, keeping best row for each key
  const seenKeys = new Set();
  const keptRows = [];
  for (const row of rows) {
    if (!row.cells) { keptRows.push(row); continue; }
    const company = (row.cells[2] || '').toLowerCase().trim();
    const role = (row.cells[3] || '').toLowerCase().trim();
    const key = `${company}|||${role}`;
    if (seenKeys.has(key)) continue;
    const bestRow = best.get(key);
    if (bestRow) { keptRows.push(bestRow); seenKeys.add(key); }
  }

  writeTracker(serializeTracker(headerLines, keptRows));
  console.log(`\n  ✔ Removed ${removed} duplicate${removed === 1 ? '' : 's'}. Tracker updated.\n`);
}

run();
