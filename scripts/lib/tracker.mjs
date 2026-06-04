import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PATHS } from './config.mjs';

export const CANONICAL_STATUSES = [
  'Evaluated', 'Applied', 'Responded', 'Interview',
  'Offer', 'Rejected', 'Discarded', 'SKIP',
];

/**
 * Parse a score string like "3.5/5" → number, or "N/A"/missing → -1.
 * @param {string} [scoreStr]
 * @returns {number}
 */
export function parseScore(scoreStr) {
  const s = (scoreStr || '').trim();
  if (!s || s === 'N/A') return -1;
  const m = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  return m ? parseFloat(m[1]) : -1;
}

/**
 * Parse tracker.md into header lines and data rows.
 * @returns {{ headerLines: string[], rows: TrackerRow[] }}
 */
export function parseTracker() {
  if (!existsSync(PATHS.tracker)) return { headerLines: [], rows: [] };
  const lines = readFileSync(PATHS.tracker, 'utf-8').split('\n');
  const headerLines = [];
  const rows = [];
  let headerDone = false;
  let headerTableRows = 0;

  for (const line of lines) {
    if (!headerDone) {
      headerLines.push(line);
      if (line.trim().startsWith('|')) {
        headerTableRows++;
        if (headerTableRows >= 2) headerDone = true;
      }
    } else {
      if (line.trim().startsWith('|')) {
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        rows.push({ line, cells });
      } else {
        rows.push({ line, cells: null });
      }
    }
  }
  return { headerLines, rows };
}

/**
 * Rebuild tracker.md content from parsed header + rows.
 * @param {string[]} headerLines
 * @param {Array<{line:string,cells:string[]|null}>} rows
 * @returns {string}
 */
export function serializeTracker(headerLines, rows) {
  return [...headerLines, ...rows.map(r => r.line)].join('\n');
}

/**
 * Write serialized tracker content to disk.
 * @param {string} content
 */
export function writeTracker(content) {
  writeFileSync(PATHS.tracker, content, 'utf-8');
}
