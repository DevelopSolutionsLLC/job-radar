#!/usr/bin/env node

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

mkdirSync(resolve(root, 'output'), { recursive: true });

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node generate-pdf.mjs <input.html> <output.pdf>');
  process.exit(1);
}

const html = await readFile(resolve(inputPath), 'utf-8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: resolve(outputPath),
  format: 'Letter',
  printBackground: true,
});
await browser.close();
console.log(`PDF generated: ${outputPath}`);
