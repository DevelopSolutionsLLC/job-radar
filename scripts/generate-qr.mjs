#!/usr/bin/env node

// Render the text QR code as a PNG image with tight line-height.
// Uses the same half-block QR from donate.mjs.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const qrLines = [
  ' ▄▄▄▄▄▄▄ ▄ ▄▄▄▄▄ ▄ ▄▄▄▄▄▄▄ ',
  ' █ ▄▄▄ █ ▀▀█ ▄▄█ ▀ █ ▄▄▄ █ ',
  ' █ ███ █ ▄▄█ ▀█▀▀▄ █ ███ █ ',
  ' █▄▄▄▄▄█ █ ▄ █▀█ ▄ █▄▄▄▄▄█ ',
  ' ▄▄▄  ▄▄ █▄█▄█  ▄ ▄▄▄▄  ▄▄ ',
  ' █ ▀ ██▄▀▄▀▀█▀▄▀██▄█▀ █▄▀█ ',
  ' ▄   ▄ ▄▀▄█  ▄  ▄ ▀▄▄ ▀  ▄ ',
  ' ▄█▄▀▄▄▄▄▄▄ ██ ▄█▀██▀ ▄▄▀█ ',
  ' ▄▄█▄▄ ▄▀  █ █ ▀▄▄████▀ ▄  ',
  ' ▄▄▄▄▄▄▄ ▀█ █▀█▄ █ ▄ █   █ ',
  ' █ ▄▄▄ █ ▀█▀▄▄  ██▄▄▄█  ▀  ',
  ' █ ███ █ ▄▀▄██▄  ▀█ ▄█▄▀█▄ ',
  ' █▄▄▄▄▄█ ████▀ ▀▄█▄█▀▀▄  ▄ ',
];

const qrText = qrLines.join('\n');

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; background: #fff; }
  pre {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.0;
    letter-spacing: 0;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 12px;
    display: inline-block;
  }
</style>
</head>
<body>
<pre id="qr">${qrText}</pre>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.waitForTimeout(200);

const el = page.locator('#qr');
await el.screenshot({ path: join(root, 'assets', 'qr-cashapp.png') });
await browser.close();

console.log('Generated assets/qr-cashapp.png');
