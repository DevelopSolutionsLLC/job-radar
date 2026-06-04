import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, serializeTracker } from '../scripts/lib/tracker.mjs';

test('parseScore: valid score', () => {
  assert.equal(parseScore('3.5/5'), 3.5);
  assert.equal(parseScore('5/5'), 5);
  assert.equal(parseScore('1/5'), 1);
});

test('parseScore: N/A returns -1', () => {
  assert.equal(parseScore('N/A'), -1);
  assert.equal(parseScore(''), -1);
  assert.equal(parseScore(undefined), -1);
});

test('parseScore: malformed returns -1', () => {
  assert.equal(parseScore('3.5'), -1);
  assert.equal(parseScore('3.5/10'), -1);
  assert.equal(parseScore('abc'), -1);
});

test('serializeTracker: round-trips header + rows', () => {
  const header = ['# Tracker', '| # | Date |', '|---|------|'];
  const rows = [
    { line: '| 1 | 2026-01-01 |', cells: ['1', '2026-01-01'] },
    { line: '', cells: null },
  ];
  const result = serializeTracker(header, rows);
  assert.equal(result, '# Tracker\n| # | Date |\n|---|------|\n| 1 | 2026-01-01 |\n');
});
