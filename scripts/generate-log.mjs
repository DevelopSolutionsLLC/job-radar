#!/usr/bin/env node
// generate-log.mjs — TWC Work Search Activity Log generator (BN900E faithful layout)
// Usage: node scripts/generate-log.mjs [--date YYYY-MM-DD]
//
// Replicates BN900E (10-12-23) exactly: 5 entries per page, full header repeated
// on each page, per-page sidebar, light-blue field shading, CSS checkboxes.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { PATHS, loadProfile, loadPortals } from './lib/config.mjs';
import { readJsonCache } from './lib/cache.mjs';

// Load HTML shell from custom template if present, otherwise use default
const templatePath = existsSync(resolve(PATHS.root, 'templates/log-custom.html'))
  ? resolve(PATHS.root, 'templates/log-custom.html')
  : resolve(PATHS.root, 'templates/log-default.html');
const HTML_TEMPLATE = readFileSync(templatePath, 'utf8');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dateArgIdx = args.indexOf('--date');
const today = dateArgIdx !== -1 ? args[dateArgIdx + 1] : new Date().toISOString().slice(0, 10);

const profile     = loadProfile() || {};
const portals     = loadPortals() || {};
const companyInfo = readJsonCache(PATHS.companyInfo) || {};

const candidateName = profile.name || '';
if (!candidateName) process.stderr.write('[warn] profile.name not set — run /job-radar config to add your name.\n');

// ── Career URL map from portals.yml ──────────────────────────────────────────
const careerUrls = {};
for (const e of (portals.greenhouse  || [])) careerUrls[e.name] = `https://boards.greenhouse.io/${e.board}`;
for (const e of (portals.ashby       || [])) careerUrls[e.name] = `https://jobs.ashbyhq.com/${e.board}`;
for (const e of (portals.lever       || [])) careerUrls[e.name] = `https://jobs.lever.co/${e.board}`;
for (const e of (portals.bamboohr    || [])) careerUrls[e.name] = `https://${e.slug}.bamboohr.com/careers`;
for (const e of (portals.teamtailor  || [])) careerUrls[e.name] = `https://${e.slug}.teamtailor.com/jobs`;
for (const e of (portals.icims       || [])) {
  careerUrls[e.name] = e.careers_host
    ? `https://${e.careers_host}`
    : `https://${e.slug}.icims.com/jobs/search`;
}
for (const e of (portals.workday || [])) {
  careerUrls[e.name] = `https://${e.slug}.${e.shard || 'wd5'}.myworkdayjobs.com/${e.site}`;
}
// employer-urls.json loaded last so manual entries override auto-derived portal URLs
Object.assign(careerUrls, readJsonCache(PATHS.employerUrls) || {});

// ── Parse tracker.md ──────────────────────────────────────────────────────────
const trackerPath = PATHS.tracker;
if (!existsSync(trackerPath)) { console.error('tracker.md not found'); process.exit(1); }

const rows = [];
for (const line of readFileSync(trackerPath, 'utf8').split('\n')) {
  if (!line.startsWith('|')) continue;
  const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0 && i < 10);
  if (cols.length < 8) continue;
  if (cols[0] === '#' || cols[0].startsWith('-')) continue;
  const [, date, company, role, score, status, , , notes] = cols;
  if (!company || !date || date === 'Date') continue;
  if (status === 'SKIP' || status === 'Discarded') continue;
  rows.push({ date, company, role, score: score || 'N/A', status, notes: notes || '' });
}
rows.sort((a, b) => b.date.localeCompare(a.date));

const activeStatuses = new Set(['Applied', 'Evaluated', 'Responded', 'Interview', 'Offer']);
const total         = rows.length;
const active        = rows.filter(r => activeStatuses.has(r.status)).length;
const notHiringCt   = rows.filter(r => !activeStatuses.has(r.status)).length;

// ── Note sanitization ─────────────────────────────────────────────────────────
function sanitizeNotes(notes) {
  return notes
    .replace(/\$[\d,]+K?(?:\s*[–—-]\s*\$[\d,]+K?)?(?:\s+(?:base|base \+ equity|\+ equity|\+ RSUs|\+ bonus|\+ variable|\+ ISO equity|\(10yr window\)))?[;,]?\s*/gi, '')
    .replace(/\b(remote|hybrid|WFH|work from home|work-from-home|on-?site only)\b[;,]?\s*/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/;\s*;/g, ';')
    .replace(/^\s*[;,]\s*/, '')
    .trim();
}

// ── HTML helpers ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cb(checked) {
  return `<span class="cb${checked ? ' ck' : ''}"></span>`;
}

// ── Week helpers ──────────────────────────────────────────────────────────────
function getWeekMonday(dateStr) {
  // Noon avoids timezone-induced off-by-one when DST shifts midnight across a date boundary
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}
function fmtFilename(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}-${d}-${y.slice(2)}`;
}

// ── Single entry row (one <tr>) ───────────────────────────────────────────────
function entryRow(r) {
  const info     = companyInfo[r.company];
  const url      = careerUrls[r.company] || info?.website || '';
  const activity = 'Applied for job';

  const hasStreet     = info?.address && info.address !== 'PLACEHOLDER';
  const empName       = esc(r.company);
  const empAddr       = hasStreet ? esc(info.address) : (url ? esc(url) : '&nbsp;');
  const empCity       = hasStreet && info?.city ? esc(`${info.city}, ${info.state} ${info.zip}`) : '&nbsp;';
  const empPhone      = info?.phone && info.phone !== 'N/A' ? esc(info.phone) : '&nbsp;';
  const personContact = url ? esc(url) : 'Online application';

  const hired    = r.status === 'Offer';
  const notHire  = r.status === 'Rejected';
  const appFiled = activeStatuses.has(r.status) && !hired;
  const other    = !hired && !notHire && !appFiled;

  return `      <tr>
        <td class="col-desc">
          <div class="fr"><span class="fl">Date of Activity</span><span class="fv">${esc(r.date)}</span></div>
          <div class="fr"><span class="fl">Work&nbsp;Search&nbsp;Activity</span><span class="fv">${esc(activity)}</span></div>
          <div class="fr"><span class="fl">Type of Job</span><span class="fv">${esc(r.role)}</span></div>
        </td>
        <td class="col-employer">
          <div class="fr"><span class="fl">Name</span><span class="fv">${empName}</span></div>
          <div class="fr"><span class="fl">Address</span><span class="fv">${empAddr}</span></div>
          <div class="fr"><span class="fl">City, State, Zip Code</span><span class="fv">${empCity}</span></div>
          <div class="fr phone-row">
            <span class="fl">Area Code + Phone&nbsp;#</span>
            <span class="fv ph-l">${empPhone}</span>
            <span class="fv ph-r">&nbsp;</span>
          </div>
        </td>
        <td class="col-contact">
          <div class="fr"><span class="fl">Person Contacted</span><span class="fv">${personContact}</span></div>
          <div class="cr">${cb(false)}<span class="cl">By Mail (Enter Address at left)</span></div>
          <div class="cr">${cb(true)}<span class="cl">Email</span></div>
          <div class="cr">${cb(false)}<span class="cl">Fax&nbsp;#</span></div>
        </td>
        <td class="col-result">
          <div class="result-top">${cb(hired)}<span class="cl">Hired</span>&nbsp;&nbsp;&nbsp;${cb(notHire)}<span class="cl">Not hiring</span></div>
          <div class="fr"><span class="fl">Start date</span><span class="fv">&nbsp;</span></div>
          <div class="cr">${cb(appFiled)}<span class="cl">Application filed</span></div>
          <div class="cr">${cb(other)}<span class="cl">Other</span></div>
        </td>
      </tr>`;
}

// ── Sidebar (one per page) ────────────────────────────────────────────────────
const SIDEBAR = `    <div class="twc-sidebar">
      <div class="twc-hdr">TWC<br>use<br>only</div>
      <div class="twc-field twc-lg"><span>Verifier ID:</span></div>
      <div class="twc-field twc-lg"><span>V-Date:</span></div>
      <div class="twc-field twc-lg"><span>Outcome:</span></div>
      <div class="twc-field twc-sm"><span>A</span></div>
      <div class="twc-field twc-sm"><span>U#</span></div>
      <div class="twc-field twc-sm"><span>UO</span></div>
      <div class="twc-field twc-sm"><span>RD:</span></div>
      <div class="twc-field twc-lg"><span>WSV BWE:</span></div>
    </div>`;

// ── Page HTML (header + table + footer + sidebar) ─────────────────────────────
function pageHtml(pageRows, weekMon, weekSun, entryCount, isLast) {
  return `  <div class="page${isLast ? ' last-page' : ''}">
    <div class="page-main">
      <h1 class="form-title">The Texas Workforce Commission Work Search Activity Log</h1>

      <div class="meta-header">
        <div class="meta-row">
          <div class="meta-cell"><strong>Name:</strong> <span class="pre-filled">${esc(candidateName)}</span></div>
          <div class="meta-cell"><strong>Week of:</strong>&nbsp;<span class="pre-filled">${esc(fmtDisplay(weekMon))}</span>&nbsp;to&nbsp;<span class="pre-filled">${esc(fmtDisplay(weekSun))}</span></div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><strong>Social Security #:</strong>&nbsp;<span class="bf" style="min-width:28px"></span>&nbsp;&ndash;&nbsp;<span class="bf" style="min-width:20px"></span>&nbsp;&ndash;&nbsp;<span class="bf" style="min-width:35px"></span></div>
          <div class="meta-cell"><strong>Number of Required Searches:</strong>&nbsp;<span class="pre-filled">${entryCount}</span></div>
        </div>
      </div>

      <p class="instruction">If you are still unemployed after eight weeks of benefits, you should reduce your salary requirement and look at more job openings. Make as many copies of this as you need, or print copies at <u>www.twc.texas.gov/worksearchlog</u>.</p>

      <table>
        <thead>
          <tr>
            <th class="col-desc">Date, Description of Work Search<br><span class="th-sub">(Ex: Applied for job, submitted resume, attended job fair,<br>interviewed, used Workforce Center, searched online)</span></th>
            <th class="col-employer">Name, Location and Telephone Number of<br><strong>Employer/Service/Agency</strong><br><span class="th-sub">(For address, use street or Internet address)</span></th>
            <th class="col-contact"><strong>Contact Information</strong><br><span class="th-sub">Complete all that apply.</span></th>
            <th class="col-result"><strong>Results</strong></th>
          </tr>
        </thead>
        <tbody>
${pageRows.map(entryRow).join('\n')}
        </tbody>
      </table>

      <div class="form-footer">
        <p>An individual may receive and review information that TWC collects regarding that individual by emailing <u>open.records@twc.texas.gov</u> or writing to TWC Open Records Unit, 101 E. 15th St. Room 266, Austin TX&nbsp; 78778-0001. For more information, see <u>https://twc.texas.gov/services/open-records</u>.</p>
        <p><strong>Keep this form for your records. Submit a copy to TWC only if requested</strong> using our online UI Submission Portal at <u>https://twc.texas.gov/uidocs</u> or the address or fax number we gave you.</p>
        <p class="form-num">BN900E (10-12-23)</p>
      </div>
    </div>
${SIDEBAR}
  </div>`;
}

// ── Group rows by ISO week (Mon–Sun), newest week first ───────────────────────
const weekMap = new Map();
for (const row of rows) {
  const mon = getWeekMonday(row.date);
  if (!weekMap.has(mon)) weekMap.set(mon, []);
  weekMap.get(mon).push(row);
}
const sortedWeekKeys = [...weekMap.keys()].sort().reverse();

// Build page structs: one per 5-entry chunk within each week (sheet counter resets per week)
const ENTRIES_PER_PAGE = 5;
const pageStructs = [];
for (const weekMon of sortedWeekKeys) {
  const weekSun   = addDays(weekMon, 6);
  const weekRows  = weekMap.get(weekMon);
  const weekCount = weekRows.length;
  let sheetNum = 1;
  for (let i = 0; i < weekRows.length; i += ENTRIES_PER_PAGE) {
    pageStructs.push({
      weekMon,
      weekSun,
      weekCount,
      sheetNum: sheetNum++,
      pageRows: weekRows.slice(i, i + ENTRIES_PER_PAGE),
    });
  }
}

function wrapDoc(title, bodyContent) {
  return HTML_TEMPLATE
    .replace('{{TITLE}}', title)
    .replace('{{BODY}}', bodyContent);
}


// ── Write combined HTML (all weeks, for browser review) ───────────────────────
const combinedPages = pageStructs
  .map((s, i) => pageHtml(s.pageRows, s.weekMon, s.weekSun, s.weekCount, i === pageStructs.length - 1))
  .join('\n');
const combinedHtml = wrapDoc(`TWC Work Search Activity Log — ${esc(candidateName)}`, combinedPages);
const htmlOut = resolve(PATHS.root, `output/application-log-${today}.html`);
writeFileSync(htmlOut, combinedHtml, 'utf8');
console.log(`HTML: ${htmlOut}`);

// ── Generate per-week PDFs ────────────────────────────────────────────────────
const weeklyFiles = [];
pageStructs.forEach((s) => {
  const baseName  = `twc-wsal-week-${fmtFilename(s.weekMon)}-${s.sheetNum}`;
  const weekHtmlPath = resolve(PATHS.root, `output/${baseName}.html`);
  const weekPdfPath  = resolve(PATHS.root, `output/${baseName}.pdf`);

  const weekPage = pageHtml(s.pageRows, s.weekMon, s.weekSun, s.weekCount, true);
  const weekDoc  = wrapDoc(`TWC WSAL ${fmtDisplay(s.weekMon)} — ${esc(candidateName)}`, weekPage);
  writeFileSync(weekHtmlPath, weekDoc, 'utf8');

  try {
    execSync(`node "${resolve(PATHS.root, 'scripts/generate-pdf.mjs')}" "${weekHtmlPath}" "${weekPdfPath}"`, { stdio: 'inherit' });
    console.log(`PDF:  ${weekPdfPath}`);
    weeklyFiles.push(weekPdfPath);
  } catch {
    console.error(`PDF generation failed for ${baseName}`);
  }
});

console.log(`\n${total} entries across ${pageStructs.length} week(s) — ${active} active, ${notHiringCt} not hiring/closed.`);
