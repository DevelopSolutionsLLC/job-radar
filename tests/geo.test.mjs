import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine } from '../scripts/lib/geo.mjs';

test('haversine: same point is 0', () => {
  assert.equal(haversine(30, -97, 30, -97), 0);
});

test('haversine: Austin TX to Dallas TX ≈ 185 miles', () => {
  const d = haversine(30.2672, -97.7431, 32.7767, -96.7970);
  assert.ok(d > 175 && d < 195, `Expected ~185 miles, got ${d.toFixed(1)}`);
});

test('haversine: NYC to LA ≈ 2445 miles', () => {
  const d = haversine(40.7128, -74.0060, 34.0522, -118.2437);
  assert.ok(d > 2400 && d < 2500, `Expected ~2445 miles, got ${d.toFixed(1)}`);
});

test('haversine: symmetric', () => {
  const d1 = haversine(30, -97, 33, -96);
  const d2 = haversine(33, -96, 30, -97);
  assert.ok(Math.abs(d1 - d2) < 0.001);
});
