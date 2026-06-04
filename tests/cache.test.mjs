import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCacheFresh, SCAN_CACHE_TTL_MS } from '../scripts/lib/cache.mjs';

test('isCacheFresh: fresh cache returns true', () => {
  const cache = { timestamp: new Date().toISOString() };
  assert.equal(isCacheFresh(cache), true);
});

test('isCacheFresh: expired cache returns false', () => {
  const old = new Date(Date.now() - SCAN_CACHE_TTL_MS - 1000).toISOString();
  const cache = { timestamp: old };
  assert.equal(isCacheFresh(cache), false);
});

test('isCacheFresh: missing timestamp returns false', () => {
  assert.equal(isCacheFresh({}), false);
  assert.equal(isCacheFresh(null), false);
  assert.equal(isCacheFresh(undefined), false);
});

test('isCacheFresh: custom TTL respected', () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(isCacheFresh({ timestamp: fiveMinAgo }, 10 * 60 * 1000), true);
  assert.equal(isCacheFresh({ timestamp: fiveMinAgo }, 4 * 60 * 1000), false);
});
