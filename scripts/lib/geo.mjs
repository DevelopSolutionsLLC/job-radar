import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PATHS } from './config.mjs';

// Nominatim rate limit: 1 req/sec. Sleep 1.1s between uncached lookups.
const NOMINATIM_DELAY_MS = 1100;

/**
 * Great-circle distance between two lat/lon points in miles.
 * @param {number} lat1 @param {number} lon1
 * @param {number} lat2 @param {number} lon2
 * @returns {number}
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Geocode a place query via Nominatim. Results are stored in the passed cache
 * object; callers are responsible for persisting it with saveGeocodeCache().
 * @param {string} query
 * @param {object} cache mutable key→{lat,lon}|null map
 * @returns {Promise<{lat:number,lon:number}|null>}
 */
export async function geocodeQuery(query, cache) {
  const key = query.toLowerCase().trim();
  if (key in cache) return cache[key];
  await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS));
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'job-radar/1.0 (personal job search tool)' } },
    );
    const data = await resp.json();
    const result = data.length > 0
      ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
      : null;
    cache[key] = result;
    return result;
  } catch {
    cache[key] = null;
    return null;
  }
}

/**
 * Load the persistent geocode cache from disk.
 * @returns {object} key→coords map (may be empty)
 */
export function loadGeocodeCache() {
  try {
    if (existsSync(PATHS.geocodeCache))
      return JSON.parse(readFileSync(PATHS.geocodeCache, 'utf-8'));
  } catch {}
  return {};
}

/**
 * Persist the geocode cache to disk.
 * @param {object} cache
 */
export function saveGeocodeCache(cache) {
  writeFileSync(PATHS.geocodeCache, JSON.stringify(cache, null, 2), 'utf-8');
}
