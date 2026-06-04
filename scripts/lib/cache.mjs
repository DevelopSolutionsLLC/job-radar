import { readFileSync, writeFileSync, existsSync } from 'fs';

export const SCAN_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Read a JSON file from disk. Returns null if missing or unparseable.
 * @param {string} filePath absolute path
 * @returns {object|null}
 */
export function readJsonCache(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

/**
 * Write an object to disk as formatted JSON.
 * @param {string} filePath absolute path
 * @param {object} data
 */
export function writeJsonCache(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check whether a timestamped cache object is still within its TTL.
 * Expects cache.timestamp to be an ISO string written by the scanner.
 * @param {object} cache
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function isCacheFresh(cache, ttlMs = SCAN_CACHE_TTL_MS) {
  if (!cache?.timestamp) return false;
  return Date.now() - new Date(cache.timestamp).getTime() < ttlMs;
}
