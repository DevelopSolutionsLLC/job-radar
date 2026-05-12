#!/usr/bin/env node

// First-run setup for job-radar.
// Detects environment, installs what it can, reports what it can't.
// Exit codes: 0 = ready, 1 = needs user action (node missing)

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const log = (icon, msg) => console.log(`  ${icon} ${msg}`);
const ok = (msg) => log('✓', msg);
const skip = (msg) => log('–', msg);
const action = (msg) => log('→', msg);
const warn = (msg) => log('!', msg);

let needsAction = false;

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch { return null; }
}

function detectOS() {
  const os = platform();
  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';
  return 'linux';
}

function detectPackageManager(os) {
  if (os === 'macos') {
    if (run('which brew')) return { name: 'brew', install: 'brew install node' };
    return { name: null, install: null };
  }
  if (os === 'windows') {
    if (run('where winget 2>nul')) return { name: 'winget', install: 'winget install OpenJS.NodeJS.LTS' };
    if (run('where choco 2>nul')) return { name: 'choco', install: 'choco install nodejs-lts' };
    if (run('where scoop 2>nul')) return { name: 'scoop', install: 'scoop install nodejs-lts' };
    return { name: null, install: null };
  }
  // linux
  if (run('which apt')) return { name: 'apt', install: 'sudo apt update && sudo apt install -y nodejs npm' };
  if (run('which dnf')) return { name: 'dnf', install: 'sudo dnf install -y nodejs' };
  if (run('which pacman')) return { name: 'pacman', install: 'sudo pacman -S --noconfirm nodejs npm' };
  if (run('which nix-env')) return { name: 'nix', install: 'nix-env -iA nixpkgs.nodejs' };
  return { name: null, install: null };
}

console.log('\njob-radar setup\n');

// 1. Check Node.js
const nodeVersion = run('node --version');
if (!nodeVersion) {
  const os = detectOS();
  const pm = detectPackageManager(os);
  warn(`Node.js is not installed (${os})`);
  if (pm.install) {
    console.log(`\n  Run this to install it:\n\n    ${pm.install}\n`);
  } else {
    console.log(`\n  Download Node.js from: https://nodejs.org\n`);
  }
  console.log(JSON.stringify({ ready: false, missing: 'node', os, pm: pm.name, installCmd: pm.install }));
  process.exit(1);
} else {
  const major = parseInt(nodeVersion.replace('v', ''));
  if (major < 18) {
    warn(`Node.js ${nodeVersion} is too old (need >= 18)`);
    needsAction = true;
  } else {
    ok(`Node.js ${nodeVersion}`);
  }
}

// 2. Check/run npm install
const modulesExist = existsSync(join(root, 'node_modules'));
if (!modulesExist) {
  action('Installing dependencies...');
  const result = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit' });
  if (result.status === 0) {
    ok('Dependencies installed');
  } else {
    warn('npm install failed — check errors above');
    needsAction = true;
  }
} else {
  ok('Dependencies installed');
}

// 3. Check/install Playwright chromium
const pwResult = run('npx playwright install --dry-run chromium 2>&1', { cwd: root });
const pwInstalled = pwResult && !pwResult.includes('browser needs to be installed');
if (!pwInstalled) {
  action('Installing Playwright browser...');
  const result = spawnSync('npx', ['playwright', 'install', 'chromium'], { cwd: root, stdio: 'inherit' });
  if (result.status === 0) {
    ok('Playwright chromium installed');
  } else {
    warn('Playwright install failed — PDF generation won\'t work until fixed');
  }
} else {
  ok('Playwright chromium ready');
}

// 4. Config files
const configs = [
  { src: 'config/portals.example.yml', dest: 'config/portals.yml', label: 'portals.yml' },
  { src: 'config/profile.example.yml', dest: 'config/profile.yml', label: 'profile.yml' },
];

for (const { src, dest, label } of configs) {
  const destPath = join(root, dest);
  const srcPath = join(root, src);
  if (!existsSync(destPath)) {
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      ok(`Created ${label} from example`);
    } else {
      warn(`${src} not found — can't create ${label}`);
    }
  } else {
    ok(`${label} exists`);
  }
}

// 5. Data files (gitignored — create empty stubs for new users)
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const dataFiles = [
  {
    path: 'data/tracker.md',
    content: '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n',
    label: 'tracker.md',
  },
  {
    path: 'data/pipeline.md',
    content: '',
    label: 'pipeline.md',
  },
];

for (const { path: filePath, content, label } of dataFiles) {
  const dest = join(root, filePath);
  if (!existsSync(dest)) {
    writeFileSync(dest, content);
    ok(`Created ${label}`);
  }
}

// 6. Check for resume
const hasResume = existsSync(join(root, 'resume.md'));
if (!hasResume) {
  skip('No resume.md yet — run /job-radar import resume to get started');
}

// 7. Summary
console.log('');
if (needsAction) {
  console.log('  Some items need attention — see warnings above.\n');
} else {
  console.log('  Ready to go.\n');
}

console.log(JSON.stringify({
  ready: !needsAction,
  node: nodeVersion,
  modules: true,
  resume: hasResume,
}));
