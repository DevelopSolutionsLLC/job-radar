#!/usr/bin/env node

/**
 * test-all.mjs — Test suite for job-radar
 *
 * Validates syntax, configs, required files, and graceful error handling.
 *
 * Usage:
 *   node scripts/test-all.mjs
 */

import { execFileSync, spawn } from 'child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPTS_DIR = __dirname;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }

function fileExists(relPath) { return existsSync(join(ROOT, relPath)); }

function nodeCheck(filePath) {
  try {
    execFileSync('node', ['--check', filePath], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function runScript(filePath, args = []) {
  try {
    execFileSync('node', [filePath, ...args], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status ?? 1, stderr: e.stderr || '' };
  }
}

function runScriptAsync(filePath, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [filePath, ...args], {
      cwd: opts.cwd || ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ exitCode: 124, stdout, stderr: `${stderr}\nTimed out` });
    }, opts.timeout || 15000);

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function parseLastJson(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Keep looking for the scanner's final machine-readable line.
    }
  }
  return null;
}

console.log('\n🧪 job-radar test suite\n');

// -- 1. SYNTAX CHECKS --------------------------------------------------------

console.log('1. Syntax checks (scripts/*.mjs)');

const mjsFiles = readdirSync(SCRIPTS_DIR).filter(
  f => f.endsWith('.mjs') && f !== 'test-all.mjs'
);

for (const f of mjsFiles) {
  const fullPath = join(SCRIPTS_DIR, f);
  if (nodeCheck(fullPath)) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// Also check test-all.mjs itself (if we got here it parsed, but be explicit)
pass('test-all.mjs syntax OK (running)');

// -- 2. EXAMPLE CONFIG VALIDATION (YAML) -------------------------------------

console.log('\n2. Example configs are valid YAML');

let yaml;
try {
  yaml = (await import('js-yaml')).default;
} catch {
  fail('js-yaml not installed — run "npm install" first');
  yaml = null;
}

const exampleConfigs = [
  'config/profile.example.yml',
  'config/portals.example.yml',
];

for (const configPath of exampleConfigs) {
  const fullPath = join(ROOT, configPath);
  if (!existsSync(fullPath)) {
    fail(`${configPath} does not exist`);
    continue;
  }
  if (!yaml) {
    fail(`${configPath} skipped (js-yaml unavailable)`);
    continue;
  }
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === 'object') {
      pass(`${configPath} is valid YAML`);
    } else {
      fail(`${configPath} parsed but is not an object`);
    }
  } catch (e) {
    fail(`${configPath} YAML parse error: ${e.message}`);
  }
}

// -- 3. PORTALS CONFIG VALIDATION --------------------------------------------

console.log('\n3. Portals config validation');

if (yaml) {
  const portalsContent = readFileSync(join(ROOT, 'config/portals.example.yml'), 'utf-8');
  const portals = yaml.load(portalsContent);

  const requiredSections = ['greenhouse', 'ashby', 'lever', 'bamboohr', 'teamtailor', 'workday', 'rss'];
  for (const section of requiredSections) {
    if (section in portals) {
      pass(`portals.example.yml has "${section}" section`);
    } else {
      fail(`portals.example.yml missing "${section}" section`);
    }
  }

  if (portals.title_filter?.positive?.length > 0) {
    pass('portals.example.yml has title_filter.positive');
  } else {
    fail('portals.example.yml missing title_filter.positive');
  }
}

// -- 4. REQUIRED MODE FILES ---------------------------------------------------

console.log('\n4. Required mode files');

const requiredModes = ['evaluate.md', 'generate-resume.md', 'scan.md', 'job-radar.md'];

for (const mode of requiredModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`modes/${mode} exists`);
  } else {
    fail(`modes/${mode} missing`);
  }
}

// -- 5. SCANNER GRACEFUL HANDLING (missing portals.yml) -----------------------

console.log('\n5. Scanner handles missing portals.yml');

// The scanner should exit with a non-zero code when portals.yml is missing,
// rather than crashing with an unhandled exception. We run it from a temp cwd
// (or rely on the fact that config/portals.yml doesn't exist in a clean repo)
// to trigger the missing-file path.

const portalsExists = fileExists('config/portals.yml');
if (portalsExists) {
  // portals.yml exists (user has configured it), so we can't test the
  // missing-file path without side effects. Just verify the script parses.
  if (nodeCheck(join(SCRIPTS_DIR, 'scan.mjs'))) {
    pass('scan.mjs syntax OK (portals.yml present, skipping missing-file test)');
  } else {
    fail('scan.mjs has syntax errors');
  }
} else {
  // portals.yml is absent — scanner should exit 1 with an error message
  const result = runScript(join(SCRIPTS_DIR, 'scan.mjs'));
  if (result.exitCode !== 0) {
    pass('scan.mjs exits with error when portals.yml is missing');
  } else {
    fail('scan.mjs should exit with error when portals.yml is missing, but exited 0');
  }
}

// -- 6. RESUME TEMPLATE -------------------------------------------------------

console.log('\n6. Resume template');

if (fileExists('templates/resume-template.html')) {
  const html = readFileSync(join(ROOT, 'templates/resume-template.html'), 'utf-8');
  if (html.includes('<!DOCTYPE html') || html.includes('<html')) {
    pass('templates/resume-template.html exists and contains valid HTML');
  } else {
    fail('templates/resume-template.html exists but does not look like HTML');
  }
} else {
  fail('templates/resume-template.html missing');
}

// -- 7. SCAN HISTORY DEDUP ----------------------------------------------------

console.log('\n7. Scan history dedup');

const fixtureDir = mkdtempSync(join(tmpdir(), 'job-radar-scan-test-'));
const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Platform Engineer</title>
      <link>http://example.test/jobs/new-platform-engineer</link>
    </item>
  </channel>
</rss>`;
const rssDataUrl = `data:application/rss+xml,${encodeURIComponent(rssXml)}`;

try {
  mkdirSync(join(fixtureDir, 'config'), { recursive: true });
  mkdirSync(join(fixtureDir, 'data'), { recursive: true });
  writeFileSync(join(fixtureDir, 'config/portals.yml'), `title_filter:
  positive:
    - engineer
  negative: []
rss:
  - name: ExampleCo
    url: "${rssDataUrl}"
`);
  writeFileSync(
    join(fixtureDir, 'data/scan-history.tsv'),
    'url\tfirst_seen\tsource\ttitle\tcompany\tstatus\n'
    + 'http://example.test/jobs/old-platform-engineer\t2026-05-01\trss\tPlatform Engineer\tExampleCo\tadded\n'
  );

  const result = await runScriptAsync(join(SCRIPTS_DIR, 'scan.mjs'), ['--source', 'rss'], {
    cwd: fixtureDir,
    timeout: 15000,
  });
  const scanJson = parseLastJson(result.stdout);

  if (result.exitCode === 0 && scanJson?.new_count === 0 && scanJson?.duplicates === 1) {
    pass('scan.mjs dedups existing company+role pairs when URLs differ');
  } else {
    fail(`scan.mjs company+role dedup regression failed (exit ${result.exitCode}, stdout: ${result.stdout.trim()}, stderr: ${result.stderr.trim()})`);
  }
} catch (e) {
  fail(`scan.mjs company+role dedup regression errored: ${e.message}`);
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

// -- SUMMARY ------------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('🟢 All tests passed\n');
  process.exit(0);
}
