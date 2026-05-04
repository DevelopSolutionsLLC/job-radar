#!/usr/bin/env node

/**
 * normalize-statuses.mjs — Fix common status typos and variants in the tracker.
 *
 * Maps common variants to canonical statuses and writes the result
 * back to data/tracker.md.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
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

// Map of lowercased variants to canonical form
const STATUS_MAP = new Map([
  // Evaluated
  ["evaluated", "Evaluated"],
  ["eval", "Evaluated"],
  ["pending", "Evaluated"],
  ["review", "Evaluated"],
  ["reviewed", "Evaluated"],
  // Applied
  ["applied", "Applied"],
  ["sent", "Applied"],
  ["submitted", "Applied"],
  // Responded
  ["responded", "Responded"],
  ["response", "Responded"],
  ["replied", "Responded"],
  // Interview
  ["interview", "Interview"],
  ["interviewing", "Interview"],
  ["phone screen", "Interview"],
  ["screen", "Interview"],
  ["onsite", "Interview"],
  // Offer
  ["offer", "Offer"],
  ["offered", "Offer"],
  // Rejected
  ["rejected", "Rejected"],
  ["rejected by company", "Rejected"],
  ["declined", "Rejected"],
  ["passed", "Rejected"],
  ["no", "Rejected"],
  // Discarded
  ["discarded", "Discarded"],
  ["closed", "Discarded"],
  ["expired", "Discarded"],
  ["withdrawn", "Discarded"],
  // SKIP
  ["skip", "SKIP"],
  ["skipped", "SKIP"],
  ["ignore", "SKIP"],
  ["ignored", "SKIP"],
  ["n/a", "SKIP"],
]);

function normalize(status) {
  const trimmed = status.trim();
  // Already canonical
  if (VALID_STATUSES.includes(trimmed)) return trimmed;
  // Try lookup
  const mapped = STATUS_MAP.get(trimmed.toLowerCase());
  return mapped || trimmed; // Return as-is if no mapping found
}

function run() {
  console.log("\n  Normalize Statuses\n");

  if (!existsSync(TRACKER)) {
    console.log("  ✔ No tracker file found — nothing to normalize.\n");
    process.exit(0);
  }

  const content = readFileSync(TRACKER, "utf-8");
  const lines = content.split("\n");

  let fixed = 0;
  let headerLineCount = 0;
  let headerDone = false;

  const outputLines = lines.map((line) => {
    if (!line.trim().startsWith("|")) return line;

    if (!headerDone) {
      headerLineCount++;
      if (headerLineCount >= 2) headerDone = true;
      return line;
    }

    const cells = line.split("|").slice(1, -1);
    if (cells.length < 6) return line;

    const rawStatus = cells[5].trim(); // Status is column index 5
    const normalized = normalize(rawStatus);

    if (normalized !== rawStatus) {
      console.log(`    ✘ "${rawStatus}" → "${normalized}"`);
      // Preserve padding style: replace status in its cell
      cells[5] = cells[5].replace(rawStatus, normalized);
      fixed++;
      return "|" + cells.join("|") + "|";
    }

    return line;
  });

  if (fixed === 0) {
    console.log("  ✔ All statuses are already canonical.\n");
    process.exit(0);
  }

  writeFileSync(TRACKER, outputLines.join("\n"), "utf-8");
  console.log(
    `\n  ✔ Fixed ${fixed} status${fixed === 1 ? "" : "es"}. Tracker updated.\n`
  );
}

run();
