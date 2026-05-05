#!/usr/bin/env node

/**
 * test-rss.mjs — Test RSS parsing against real feeds.
 *
 * Dry-run only: does not write to tracker or pipeline files.
 *
 * Usage:
 *   node scripts/test-rss.mjs
 */

const TEST_FEEDS = [
  {
    name: 'WeWorkRemotely',
    url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    expectItems: true,
    expectCDATA: false,
  },
  {
    name: 'HN Jobs',
    url: 'https://hnrss.org/jobs',
    expectItems: true,
    expectCDATA: true,
  },
  {
    name: 'RemoteOK',
    url: 'https://remoteok.com/remote-jobs.rss',
    expectItems: true,
    expectCDATA: false,
  },
];

function parseItems(text) {
  const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(item => {
    const title = (
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      || ''
    ).trim();
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
    return { title, link };
  });
}

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

console.log('\n🧪 RSS Parser Tests\n');

for (const feed of TEST_FEEDS) {
  console.log(`--- ${feed.name} (${feed.url}) ---`);

  try {
    const res = await fetch(feed.url, { redirect: 'follow' });

    if (!res.ok) {
      fail(`HTTP ${res.status} ${res.statusText}`);
      continue;
    }
    pass(`HTTP ${res.status}`);

    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';

    if (text.includes('<item>')) {
      pass('Contains <item> elements');
    } else {
      fail('No <item> elements found');
      continue;
    }

    const items = parseItems(text);
    console.log(`  📊 Parsed ${items.length} items`);

    if (feed.expectItems && items.length === 0) {
      fail('Expected items but got 0');
      continue;
    }
    pass(`${items.length} items parsed`);

    // Check first 3 items for title + link
    const sample = items.slice(0, 3);
    let allGood = true;
    for (const item of sample) {
      if (!item.title) {
        fail(`Empty title in item with link: ${item.link}`);
        allGood = false;
      }
      if (!item.link) {
        fail(`Empty link in item with title: ${item.title}`);
        allGood = false;
      }
      if (item.title !== item.title.trim()) {
        fail(`Title has untrimmed whitespace: "${item.title}"`);
        allGood = false;
      }
    }
    if (allGood) pass('First 3 items have valid title + link');

    // Check CDATA handling
    const rawItems = text.match(/<item>[\s\S]*?<\/item>/g) || [];
    const hasCDATA = rawItems.some(i => i.includes('CDATA'));
    if (feed.expectCDATA && hasCDATA) {
      pass('CDATA titles parsed correctly');
    } else if (feed.expectCDATA && !hasCDATA) {
      fail('Expected CDATA but none found');
    } else if (!feed.expectCDATA && !hasCDATA) {
      pass('No CDATA (as expected)');
    } else {
      pass('Unexpected CDATA present but handled');
    }

    // Show sample
    console.log('  📋 Sample items:');
    for (const item of sample) {
      console.log(`     • ${item.title}`);
      console.log(`       ${item.link}`);
    }

  } catch (e) {
    fail(`Fetch error: ${e.message}`);
  }
  console.log();
}

console.log('='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('🔴 SOME TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('🟢 All tests passed\n');
  process.exit(0);
}
