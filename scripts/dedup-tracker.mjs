#!/usr/bin/env node

/**
 * dedup-tracker.mjs — Remove duplicate rows from the applications tracker.
 *
 * Duplicates are identified by company+role (case-insensitive).
 * When duplicates exist, the row with the higher score is kept.
 * Result is written back to data/tracker.md.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKER = resolve(ROOT, "data/tracker.md");

function parseScore(scoreStr) {
  const s = (scoreStr || "").trim();
  if (s === "N/A" || !s) return -1;
  const match = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  return match ? parseFloat(match[1]) : -1;
}

function run() {
  console.log("\n  Dedup Tracker\n");

  if (!existsSync(TRACKER)) {
    console.log("  ✔ No tracker file found — nothing to dedup.\n");
    process.exit(0);
  }

  const content = readFileSync(TRACKER, "utf-8");
  const lines = content.split("\n");

  // Separate header/preamble from data rows
  const allLines = [];
  const dataRows = [];
  let headerDone = false;
  let headerLineCount = 0;

  for (const line of lines) {
    if (!headerDone) {
      allLines.push(line);
      if (line.trim().startsWith("|")) {
        headerLineCount++;
        // After header row + separator row, data begins
        if (headerLineCount >= 2) {
          headerDone = true;
        }
      }
    } else {
      if (line.trim().startsWith("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        dataRows.push({ line, cells });
      } else {
        // Preserve non-table lines (blank lines, etc.)
        dataRows.push({ line, cells: null });
      }
    }
  }

  if (dataRows.length === 0) {
    console.log("  ✔ Tracker is empty — nothing to dedup.\n");
    process.exit(0);
  }

  // Group by company+role, keep highest score
  const best = new Map();
  let removed = 0;

  for (const row of dataRows) {
    if (!row.cells) continue; // non-table line
    const company = (row.cells[2] || "").toLowerCase().trim();
    const role = (row.cells[3] || "").toLowerCase().trim();
    const key = `${company}|||${role}`;
    const score = parseScore(row.cells[4]);

    if (best.has(key)) {
      const existing = best.get(key);
      if (score > existing.score) {
        console.log(
          `    ✘ Duplicate removed: "${existing.cells[2]}" + "${existing.cells[3]}" (score ${existing.cells[4] || "N/A"} < ${row.cells[4] || "N/A"})`
        );
        best.set(key, { ...row, score });
      } else {
        console.log(
          `    ✘ Duplicate removed: "${row.cells[2]}" + "${row.cells[3]}" (score ${row.cells[4] || "N/A"} <= ${existing.cells[4] || "N/A"})`
        );
      }
      removed++;
    } else {
      best.set(key, { ...row, score });
    }
  }

  if (removed === 0) {
    console.log("  ✔ No duplicates found.\n");
    process.exit(0);
  }

  // Rebuild: keep rows in original order, skip removed duplicates
  const keepSet = new Set([...best.values()].map((r) => r.line));
  const keptRows = [];
  const seenKeys = new Set();

  for (const row of dataRows) {
    if (!row.cells) {
      keptRows.push(row.line);
      continue;
    }
    const company = (row.cells[2] || "").toLowerCase().trim();
    const role = (row.cells[3] || "").toLowerCase().trim();
    const key = `${company}|||${role}`;

    if (seenKeys.has(key)) continue;

    const bestRow = best.get(key);
    if (bestRow) {
      keptRows.push(bestRow.line);
      seenKeys.add(key);
    }
  }

  const output = [...allLines, ...keptRows].join("\n");
  writeFileSync(TRACKER, output, "utf-8");

  console.log(
    `\n  ✔ Removed ${removed} duplicate${removed === 1 ? "" : "s"}. Tracker updated.\n`
  );
}

run();
