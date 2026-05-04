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

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKER = resolve(ROOT, "data/tracker.md");

const VALID_STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

const SCORE_RE = /^\d\.\d\/5$|^N\/A$/;
const REPORT_LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

function parseRows(content) {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  // Need at least header + separator = 2 lines; data rows start at index 2
  if (lines.length < 3) return [];

  return lines.slice(2).map((line, idx) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    return { lineNum: idx + 1, cells };
  });
}

function run() {
  console.log("\n  Pipeline Health Check\n");

  if (!existsSync(TRACKER)) {
    console.log("  ✔ No tracker file found — nothing to verify.\n");
    process.exit(0);
  }

  const content = readFileSync(TRACKER, "utf-8");
  const rows = parseRows(content);

  if (rows.length === 0) {
    console.log("  ✔ Tracker is empty — nothing to verify.\n");
    process.exit(0);
  }

  let issues = 0;

  // Check 1: Canonical statuses
  console.log("  Statuses");
  let statusOk = true;
  for (const row of rows) {
    const status = row.cells[5]; // Status is column index 5
    if (status && !VALID_STATUSES.includes(status)) {
      console.log(`    ✘ Row ${row.lineNum}: invalid status "${status}"`);
      issues++;
      statusOk = false;
    }
  }
  if (statusOk) console.log("    ✔ All statuses are canonical");

  // Check 2: No duplicate company+role
  console.log("  Duplicates");
  const seen = new Map();
  let dupOk = true;
  for (const row of rows) {
    const company = (row.cells[2] || "").toLowerCase().trim();
    const role = (row.cells[3] || "").toLowerCase().trim();
    if (!company && !role) continue;
    const key = `${company}|||${role}`;
    if (seen.has(key)) {
      console.log(
        `    ✘ Duplicate: "${row.cells[2]}" + "${row.cells[3]}" (rows ${seen.get(key)}, ${row.lineNum})`
      );
      issues++;
      dupOk = false;
    } else {
      seen.set(key, row.lineNum);
    }
  }
  if (dupOk) console.log("    ✔ No duplicate company+role entries");

  // Check 3: Report links resolve to existing files
  console.log("  Report links");
  let linkOk = true;
  for (const row of rows) {
    const reportCell = (row.cells[7] || "").trim(); // Report is column index 7
    if (!reportCell) continue;
    const match = reportCell.match(REPORT_LINK_RE);
    if (match) {
      const relPath = match[2];
      const absPath = resolve(ROOT, relPath);
      if (!existsSync(absPath)) {
        console.log(`    ✘ Row ${row.lineNum}: report file not found — ${relPath}`);
        issues++;
        linkOk = false;
      }
    }
  }
  if (linkOk) console.log("    ✔ All report links resolve to existing files");

  // Check 4: Score format
  console.log("  Scores");
  let scoreOk = true;
  for (const row of rows) {
    const score = (row.cells[4] || "").trim(); // Score is column index 4
    if (!score) continue;
    if (!SCORE_RE.test(score)) {
      console.log(`    ✘ Row ${row.lineNum}: invalid score format "${score}"`);
      issues++;
      scoreOk = false;
    }
  }
  if (scoreOk) console.log("    ✔ All scores match X.X/5 or N/A format");

  // Summary
  console.log();
  if (issues > 0) {
    console.log(`  ✘ ${issues} issue${issues === 1 ? "" : "s"} found\n`);
    process.exit(1);
  } else {
    console.log("  ✔ All checks passed\n");
    process.exit(0);
  }
}

run();
