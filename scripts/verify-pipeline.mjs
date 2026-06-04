#!/usr/bin/env node

/**
 * verify-pipeline.mjs — Health check for the applications tracker.
 *
 * Checks:
 *   1. All statuses are canonical values
 *   2. No duplicate company+role entries
 *   3. All report links point to existing files
 *   4. Scores match format X.X/5 or N/A
 *
 * Exit code 1 if any issues found, 0 otherwise.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PATHS } from './lib/config.mjs';
import { CANONICAL_STATUSES } from './lib/tracker.mjs';

const SCORE_RE = /^\d\.\d\/5$|^N\/A$/;
const REPORT_LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

function parseRows(content) {
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  return lines.slice(2).map((line, idx) => ({
    lineNum: idx + 1,
    cells: line.split('|').slice(1, -1).map(c => c.trim()),
  }));
}

function run() {
  console.log('\n  Pipeline Health Check\n');

  if (!existsSync(PATHS.tracker)) {
    console.log('  ✔ No tracker file found — nothing to verify.\n');
    process.exit(0);
  }

  const rows = parseRows(readFileSync(PATHS.tracker, 'utf-8'));
  if (rows.length === 0) {
    console.log('  ✔ Tracker is empty — nothing to verify.\n');
    process.exit(0);
  }

  let issues = 0;

  console.log('  Statuses');
  let statusOk = true;
  for (const row of rows) {
    const status = row.cells[5];
    if (status && !CANONICAL_STATUSES.includes(status)) {
      console.log(`    ✘ Row ${row.lineNum}: invalid status "${status}"`);
      issues++; statusOk = false;
    }
  }
  if (statusOk) console.log('    ✔ All statuses are canonical');

  console.log('  Duplicates');
  const seen = new Map();
  let dupOk = true;
  for (const row of rows) {
    const company = (row.cells[2] || '').toLowerCase().trim();
    const role = (row.cells[3] || '').toLowerCase().trim();
    if (!company && !role) continue;
    const key = `${company}|||${role}`;
    if (seen.has(key)) {
      console.log(`    ✘ Duplicate: "${row.cells[2]}" + "${row.cells[3]}" (rows ${seen.get(key)}, ${row.lineNum})`);
      issues++; dupOk = false;
    } else {
      seen.set(key, row.lineNum);
    }
  }
  if (dupOk) console.log('    ✔ No duplicate company+role entries');

  console.log('  Report links');
  let linkOk = true;
  for (const row of rows) {
    const reportCell = (row.cells[7] || '').trim();
    if (!reportCell) continue;
    const match = reportCell.match(REPORT_LINK_RE);
    if (match) {
      const absPath = resolve(PATHS.root, match[2]);
      if (!existsSync(absPath)) {
        console.log(`    ✘ Row ${row.lineNum}: report file not found — ${match[2]}`);
        issues++; linkOk = false;
      }
    }
  }
  if (linkOk) console.log('    ✔ All report links resolve to existing files');

  console.log('  Scores');
  let scoreOk = true;
  for (const row of rows) {
    const score = (row.cells[4] || '').trim();
    if (!score) continue;
    if (!SCORE_RE.test(score)) {
      console.log(`    ✘ Row ${row.lineNum}: invalid score format "${score}"`);
      issues++; scoreOk = false;
    }
  }
  if (scoreOk) console.log('    ✔ All scores match X.X/5 or N/A format');

  console.log();
  if (issues > 0) {
    console.log(`  ✘ ${issues} issue${issues === 1 ? '' : 's'} found\n`);
    process.exit(1);
  } else {
    console.log('  ✔ All checks passed\n');
    process.exit(0);
  }
}

run();
