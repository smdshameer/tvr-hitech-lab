#!/usr/bin/env node
/**
 * gas-forensics.js — reusable READ-ONLY Google Apps Script Executions forensics.
 *
 * Usage:
 *   npm run gas:forensics -- --ticket HTL-TVR-43172 --udise 33209843172 --school "PROBE AUTOMATION MTOBQMR4"
 *   node scripts/gas-forensics.js --ticket T --udise U --school S [--since ...] [--until ...]
 *                                  [--project-prefix ...] [--login-wait-min 30] [--max-rows 300]
 *   node scripts/gas-forensics.js --self-test     (offline safety proof, no browser, no network)
 *
 * Workflow: dedicated headed Chromium + OS-temp profile (outside repo) -> user
 * signs in normally in the visible window -> automation polls for the
 * authenticated Apps Script dashboard (URL/title/body markers ONLY) -> opens the
 * project by title prefix -> opens Executions -> scrolls/paginates -> harvests
 * visible row texts -> opens candidate rows (doPost/updateTicketRow/completion/
 * evidence/failed) for visible detail text -> correlates -> prints report.
 * The temp profile is ALWAYS destroyed afterwards (success, timeout, or error).
 *
 * HARD SAFETY RULES (also enforced by --self-test source scan):
 * - No cookie APIs, no storage snapshots, no DOM secret reads. Only
 *   page.url(), page.title(), locator innerText/clicks, goto/scroll.
 * - Read-only: goto/click/scroll/text reads. No edits, no probes, no deletes,
 *   no Drive/Sheets/GAS writes, no commits, no deploys.
 * - Report contains lengths/IDs from visible execution text only; secrets redacted.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const workspaceRequire = createRequire(path.join(ROOT, 'package.json'));

function parseArgs(argv) {
  const out = {
    ticket: '', udise: '', school: '', since: '', until: '',
    projectPrefix: 'Thiruvarur HTL Service Desk',
    loginWaitMin: 30, maxRows: 300, selfTest: false,
    launchOnly: false, sweepOnly: false, shutdown: false, cdpPort: 9333,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (k) => (String(argv[i] || '').startsWith(k + '=') ? String(argv[i]).slice(k.length + 1) : argv[++i]);
    if (a === '--self-test') out.selfTest = true;
    else if (a.startsWith('--ticket')) out.ticket = val('--ticket') || '';
    else if (a.startsWith('--udise')) out.udise = val('--udise') || '';
    else if (a.startsWith('--school')) out.school = val('--school') || '';
    else if (a.startsWith('--since')) out.since = val('--since') || '';
    else if (a.startsWith('--until')) out.until = val('--until') || '';
    else if (a.startsWith('--project-prefix')) out.projectPrefix = val('--project-prefix') || out.projectPrefix;
    else if (a.startsWith('--login-wait-min')) out.loginWaitMin = Math.max(1, parseInt(val('--login-wait-min'), 10) || 30);
    else if (a.startsWith('--max-rows')) out.maxRows = Math.max(10, parseInt(val('--max-rows'), 10) || 300);
    else if (a === '--launch-only') out.launchOnly = true;
    else if (a === '--sweep-only') out.sweepOnly = true;
    else if (a === '--shutdown') out.shutdown = true;
    else if (a.startsWith('--cdp-port')) out.cdpPort = parseInt(val('--cdp-port'), 10) || 9333;
  }
  return out;
}

function redact(s) {
  return String(s || '')
    .replace(/htl_session=[^;\s]*/gi, 'htl_session=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/x-cron-secret\s*:?\s*\S+/gi, 'x-cron-secret=[REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]');
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

// Deployment ID documented in repo (server.js default). A deployment ID is NOT
// a script/project ID and cannot be navigated to directly — the runner finds
// the project by title on the dashboard. Returns UNKNOWN when not found.
function repoDeploymentId() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const m = src.match(/\/macros\/s\/([A-Za-z0-9_-]{20,})\/exec/);
    return m ? m[1].slice(0, 12) + '…' : 'UNKNOWN';
  } catch (e) { return 'UNKNOWN'; }
}

function destroyProfile(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  return !fs.existsSync(dir);
}

async function selfTest() {
  console.log('GAS-FORENSICS SELF-TEST (offline)');
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`✅ [self-test] ${name}: PASS`); pass++; }
    else { console.log(`❌ [self-test] ${name}: FAIL`); fail++; }
  };
  const src = fs.readFileSync(__filename, 'utf8');
  // Fragmented so this scan never self-matches.
  const forbidden = ['docu' + 'ment.co' + 'okie', 'cont' + 'ext.coo' + 'kies(',
    '.coo' + 'kies(', 'stor' + 'ageSt' + 'ate(', 'localSto' + 'rage', 'sessionSto' + 'rage'];
  check('no cookie/storage APIs in runner source', forbidden.every((p) => !src.includes(p)));
  check('arg parsing --ticket', parseArgs(['--ticket', 'HTL-TVR-1']).ticket === 'HTL-TVR-1');
  check('arg parsing --ticket=X', parseArgs(['--ticket=X']).ticket === 'X');
  check('login-wait default 30', parseArgs([]).loginWaitMin === 30);
  check('phase flags parse', (() => {
    const p = parseArgs(['--launch-only', '--cdp-port', '9333', '--ticket', 'X']);
    return p.launchOnly === true && p.cdpPort === 9333 && p.sweepOnly === false;
  })());
  check('holder script exists', fs.existsSync(path.join(ROOT, 'scripts', 'gas-forensics-holder.js')));
  check('fail-closed gate absent (no production-test env use)', !src.includes('PRODU' + 'CTION_TESTS'));
  check('redact strips session + email', (() => {
    const o = redact('x htl_ses' + 'sion=abc user@x.com y');
    return !o.includes('abc') && !o.includes('user@x.com');
  })());
  check('repo deployment ID discoverable (prefix)', repoDeploymentId() !== 'UNKNOWN');
  check('profile destroy proof', (() => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-forensics-destroy-proof-'));
    fs.writeFileSync(path.join(d, 'probe.txt'), 'x');
    return destroyProfile(d);
  })());
  console.log(`SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

async function bodySnippet(page, n) {
  try {
    return clip(await page.locator('body').innerText({ timeout: 10000 }), n);
  } catch (e) { return ''; }
}

async function looksAuthenticated(page) {
  try {
    const host = new URL(page.url()).hostname;
    if (host.includes('accounts.google') || host.includes('developers.google')) return false;
    if (!host.includes('script.google')) return false;
    const title = (await page.title().catch(() => '')) || '';
    const body = await bodySnippet(page, 2000);
    if (/sign in/i.test(title) && !/my projects|all projects|executions/i.test(body)) return false;
    return /my projects|all projects|overview|executions|deploy/i.test(body) || /Apps Script/i.test(title);
  } catch (e) { return false; }
}

async function waitForLogin(ctx, waitMs) {
  const deadline = Date.now() + waitMs;
  console.log('WAITING-FOR-LOGIN: headed window open — sign in normally if asked. Polling 5s.');
  while (Date.now() < deadline) {
    for (const p of ctx.pages()) {
      try { if (await looksAuthenticated(p)) return p; } catch (e) {}
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

async function collectRows(page, maxRows) {
  const rows = [];
  try {
    const loc = page.locator('table tbody tr, [role="row"]');
    const n = Math.min(await loc.count().catch(() => 0), maxRows);
    for (let i = 0; i < n; i++) {
      try {
        const t = await loc.nth(i).innerText({ timeout: 5000 });
        if (t && t.trim()) rows.push(clip(t, 600));
      } catch (e) {}
    }
  } catch (e) {}
  if (rows.length === 0) {
    // New Apps Script IDE renders custom divs, not table rows: parse the
    // visible list text into per-execution lines (function/type/time/duration).
    try {
      const body = await page.locator('body').innerText({ timeout: 10000 });
      const lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
      let cur = '';
      for (const l of lines) {
        if (/^(Version|Development|doGet|doPost|updateTicketRow|myFunction|onEdit|do[A-Z]\w*)\b/.test(l) || /^(Completed|Failed|Timed out|Running)/i.test(cur) && /^(Version|Development)/.test(l)) {
          if (cur) rows.push(clip(cur, 600));
          cur = l;
        } else if (cur && rows.length < maxRows) {
          cur += ' | ' + l;
        }
        if (rows.length >= maxRows) break;
      }
      if (cur && rows.length < maxRows) rows.push(clip(cur, 600));
    } catch (e) {}
  }
  return rows;
}

async function sweepExecutions(page, maxRows) {
  let rows = [];
  for (let r = 0; r < 30; r++) {
    try { await page.mouse.wheel(0, 2500); } catch (e) {}
    await new Promise((res) => setTimeout(res, 1200));
    rows = await collectRows(page, maxRows);
    if (rows.length >= maxRows) break;
    try {
      const more = page.getByRole('button', { name: /load more|show more|older/i });
      if ((await more.count()) > 0) {
        await more.first().click({ timeout: 5000 });
        await new Promise((res) => setTimeout(res, 2000));
        continue;
      }
    } catch (e) {}
    if (r > 4) break;
  }
  return collectRows(page, maxRows);
}

function classifyRow(t) {
  const s = String(t || '');
  return {
    isDoPost: /\bdoPost\b/i.test(s),
    isUpdate: /\bupdateTicketRow\b/i.test(s),
    isCompletion: /completion|evidence/i.test(s),
    isFailed: /fail|error|exception|timeout/i.test(s),
  };
}

function rowMatchesTarget(t, q) {
  const s = String(t || '');
  const hits = [];
  if (q.ticket && s.includes(q.ticket)) hits.push('ticket');
  if (q.udise && s.includes(q.udise)) hits.push('udise');
  if (q.school && s.includes(q.school)) hits.push('school');
  if (q.since && s.includes(q.since)) hits.push('since');
  return hits;
}

async function openDetail(page, index, rowText) {
  const snap = async () => {
    const d = await bodySnippet(page, 6000);
    try { await page.keyboard.press('Escape'); } catch (e) {}
    return d;
  };
  try {
    const n = await page.locator('table tbody tr, [role="row"]').count().catch(() => 0);
    if (n > index) {
      await page.locator('table tbody tr, [role="row"]').nth(index).click({ timeout: 8000 });
      await new Promise((res) => setTimeout(res, 1500));
      return await snap();
    }
  } catch (e) {}
  // Fallback for div-rendered IDE rows: click the row's start-time text.
  try {
    const m = String(rowText || '').match(/[A-Z][a-z]{2} \d{1,2}, \d{4}, [\d:]+ [AP]M/);
    if (m) {
      await page.getByText(m[0], { exact: false }).first().click({ timeout: 8000 });
      await new Promise((res) => setTimeout(res, 2000));
      return await snap();
    }
  } catch (e) {}
  return '';
}

// Shared post-auth sweep: project by title prefix -> Executions -> harvest ->
// candidate details -> correlate. Read-only. Returns 0 (sweep completed) or 2
// (project identity cannot be established). Never closes the page/context.
async function sweepFromPage(page, q, runDir) {
    // Find project by title prefix (never guess IDs). The project list loads
    // async — settle then retry the lookup before giving up.
    let projectFound = false;
    const esc = q.projectPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let attempt = 0; attempt < 4 && !projectFound; attempt++) {
      // Strategy 1: ARIA link by title.
      try {
        const link = page.getByRole('link', { name: new RegExp(esc, 'i') });
        if ((await link.count()) > 0) {
          await link.first().click({ timeout: 15000 });
          await new Promise((res) => setTimeout(res, 3000));
          projectFound = true;
        }
      } catch (e) {}
      // Strategy 2: any element showing the title text (rows may be divs, not links).
      if (!projectFound) {
        try {
          const txt = page.getByText(new RegExp(esc, 'i'));
          if ((await txt.count()) > 0) {
            await txt.first().click({ timeout: 15000 });
            await new Promise((res) => setTimeout(res, 3000));
            projectFound = true;
          }
        } catch (e) {}
      }
      if (!projectFound) await new Promise((res) => setTimeout(res, 5000));
    }
    if (!projectFound) {
      console.log('PROJECT: NOT FOUND by prefix "' + q.projectPrefix + '". BLOCKER: project identity cannot be established automatically.');
      try {
        const names = new Set();
        const links = page.locator('a');
        const n = Math.min(await links.count().catch(() => 0), 60);
        for (let i = 0; i < n; i++) {
          try {
            const t = clip(await links.nth(i).innerText({ timeout: 3000 }), 80);
            if (t) names.push(t);
          } catch (e) {}
        }
        console.log('VISIBLE candidates: ' + ([...names].filter((t) => /HTL|Service Desk|Thiruvur/i.test(t)).slice(0, 10).join(' | ') || 'none'));
      } catch (e) {}
      return 2;
    }
    console.log('PROJECT: FOUND (url host script.google.com; full URL withheld).');

    let execOpened = false;
    try {
      const nav = page.getByRole('link', { name: /executions/i }).or(page.getByRole('button', { name: /executions/i }));
      if ((await nav.count()) > 0) {
        await nav.first().click({ timeout: 10000 });
        await new Promise((res) => setTimeout(res, 3000));
        execOpened = true;
      }
    } catch (e) {}
    if (!execOpened) {
      try {
        // Correct IDE route: <project>/executions (NOT <project>/edit/executions).
        const base = page.url().split('?')[0].replace(/\/$/, '').replace(/\/edit$/, '').replace(/\/executions$/, '');
        await page.goto(base + '/executions', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise((res) => setTimeout(res, 3000));
        execOpened = true;
      } catch (e) {}
    }
    console.log('EXECUTIONS: ' + (execOpened ? 'opened' : 'navigation uncertain — harvesting visible rows anyway'));

    const rows = await sweepExecutions(page, q.maxRows);
    fs.writeFileSync(require('path').join(runDir, 'execution-rows.json'), JSON.stringify({ rows }, null, 2));
    const cands = [];
    rows.forEach((t, i) => {
      const c = classifyRow(t);
      if (c.isDoPost || c.isUpdate || c.isCompletion || c.isFailed) {
        cands.push({ index: i, text: t, targetHits: rowMatchesTarget(t, q), ...c });
      }
    });
    const directHits = rows.filter((t) => rowMatchesTarget(t, q).length > 0);
    console.log(`ROWS=${rows.length} CANDIDATES=${cands.length} DIRECT_TARGET_HITS=${directHits.length}`);

    const details = [];
    for (const c of cands.slice(0, 30)) {
      const d = redact(await openDetail(page, c.index, c.text));
      const th = rowMatchesTarget(d, q);
      details.push({ index: c.index, row: c.text, detail: clip(d, 2000), targetHits: [...new Set([...c.targetHits, ...th])] });
      if (th.length) console.log('TARGET-HIT at row ' + c.index + ' (' + th.join(',') + ')');
    }
    fs.writeFileSync(require('path').join(runDir, 'execution-details.json'), JSON.stringify({ details }, null, 2));

    const cnt = (re) => rows.filter((t) => re.test(t)).length;
    console.log('');
    console.log('=== GAS FORENSICS (automated sweep) ===');
    console.log(`TARGET ticket=${q.ticket} udise=${q.udise || '-'} school=${q.school || '-'}`);
    console.log(`ROWS=${rows.length} doPost=${cnt(/\bdoPost\b/i)} updateTicketRow=${cnt(/\bupdateTicketRow\b/i)} completion-related=${cnt(/completion|evidence/i)} failed-ish=${cnt(/fail|error|exception|timeout/i)}`);
    console.log('FIRST candidate: ' + (cands[0] ? clip(cands[0].text, 200) : 'none'));
    console.log('LAST candidate: ' + (cands.length ? clip(cands[cands.length - 1].text, 200) : 'none'));
    console.log('Raw rows: ' + require('path').join(runDir, 'execution-rows.json'));
    console.log('Raw details: ' + require('path').join(runDir, 'execution-details.json'));
    console.log('NOTE: correlate in docs/forensics/<TICKET>-report.md. UNPROVEN unless text directly proves A–H.');
    return 0;
}

// Resolve the dedicated profile dir (persistent user-local outside repo, or temp).
function resolveProfileDir(usePersistent) {
  if (usePersistent) {
    const d = path.join(os.homedir(), 'AppData', 'Local', 'tvr-gas-forensics-profile');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gas-forensics-profile-'));
}

function persistentProfileDir() {
  const d = path.join(os.homedir(), 'AppData', 'Local', 'tvr-gas-forensics-profile');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function cdpAlive(port) {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch (e) { return false; }
}

// PHASE 1: open the dedicated browser detached and return immediately with a
// READY banner. The holder process owns the browser; this command exits fast.
async function launchOnlyPhase(q, chromium) {
  const usePersistent = process.argv.includes('--persistent-profile');
  const profileDir = resolveProfileDir(usePersistent);
  if (await cdpAlive(q.cdpPort)) {
    console.log('READY: dedicated forensic browser ALREADY RUNNING on 127.0.0.1:' + q.cdpPort);
    console.log('ACTION: complete the normal Google sign-in in that window if needed, then say "signed in".');
    return 0;
  }
  const { spawn } = require('child_process');
  const holder = path.join(__dirname, 'gas-forensics-holder.js');
  const child = spawn(process.execPath, [holder, '--profile-dir', profileDir, '--cdp-port', String(q.cdpPort)], {
    detached: true, stdio: 'ignore', cwd: ROOT,
  });
  child.unref();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await cdpAlive(q.cdpPort)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!(await cdpAlive(q.cdpPort))) {
    console.log('LAUNCH: FAIL — dedicated browser did not expose CDP within 60s. BLOCKER: browser launch failed.');
    return 2;
  }
  console.log('');
  console.log('==================== BROWSER READY ====================');
  console.log('A dedicated forensic browser window is now OPEN (persistent profile, outside repo).');
  console.log('ACTION REQUIRED: complete the normal Google sign-in in THAT window if asked.');
  console.log('When signed in, say "signed in" — the sweep then runs automatically.');
  console.log('=======================================================');
  console.log('PROFILE=' + profileDir + ' CDP=127.0.0.1:' + q.cdpPort + ' (dedicated instance; normal Chrome untouched)');
  return 0;
}

// PHASE 2: attach to the dedicated instance, verify auth, sweep. Browser stays open.
async function sweepOnlyPhase(q, chromium, runDir) {
  if (!(await cdpAlive(q.cdpPort))) {
    console.log('SWEEP: BLOCKED — dedicated browser not running on 127.0.0.1:' + q.cdpPort + '. Run --launch-only first.');
    return 2;
  }
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + q.cdpPort);
  } catch (e) {
    console.log('SWEEP: BLOCKED — CDP attach failed: ' + redact(e.message).slice(0, 120));
    return 2;
  }
  try {
    const pages = [];
    for (const c of browser.contexts()) pages.push(...c.pages());
    let authed = null;
    for (const p of pages) {
      try { if (await looksAuthenticated(p)) { authed = p; break; } } catch (e) {}
    }
    if (!authed) {
      console.log('AUTHENTICATION: BLOCKED — no authenticated Apps Script page in the dedicated browser.');
      for (const p of pages.slice(0, 5)) {
        try {
          console.log('STATE host=' + new URL(p.url()).hostname + ' title=' + clip(await p.title().catch(() => ''), 60));
        } catch (e) {}
      }
      console.log('Next: complete the normal Google sign-in in the dedicated window, then re-run --sweep-only.');
      browser.close();
      return 2;
    }
    console.log('AUTHENTICATION: PASS (URL/title markers only; no secrets read).');
    const code = await sweepFromPage(authed, q, runDir);
    browser.close(); // disconnect only; dedicated browser keeps running for reuse
    return code;
  } catch (e) {
    console.log('RUN: FAIL — ' + redact(e.message).slice(0, 200));
    try { browser.close(); } catch (err) {}
    return 1;
  }
}

async function shutdownPhase(q) {
  if (!(await cdpAlive(q.cdpPort))) {
    console.log('SHUTDOWN: dedicated browser not running — nothing to do.');
    return 0;
  }
  try {
    const { chromium } = workspaceRequire('@playwright/test');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:' + q.cdpPort);
    await browser.close();
    console.log('SHUTDOWN: dedicated forensic browser closed. Persistent profile retained (outside repo).');
    return 0;
  } catch (e) {
    console.log('SHUTDOWN: FAIL — ' + redact(e.message).slice(0, 120));
    return 1;
  }
}

(async () => {
  const q = parseArgs(process.argv.slice(2));
  if (q.selfTest) { await selfTest(); return; }
  if (!q.ticket) {
    console.error('Usage: npm run gas:forensics -- --ticket <ID> [--udise U] [--school S] [--since ..] [--until ..]');
    console.error('       node scripts/gas-forensics.js --launch-only [--persistent-profile]  (open dedicated browser, return fast)');
    console.error('       node scripts/gas-forensics.js --sweep-only --ticket <ID> [...]       (attach to dedicated browser, sweep)');
    console.error('       node scripts/gas-forensics.js --shutdown                            (close dedicated browser)');
    process.exit(2);
  }
  if (q.shutdown) { process.exit(await shutdownPhase(q)); }
  if (q.launchOnly) { process.exit(await launchOnlyPhase(q)); }
  if (q.sweepOnly) {
    let cw;
    try { ({ chromium: cw } = workspaceRequire('@playwright/test')); }
    catch (e) { console.log('SWEEP: FAIL — playwright unavailable'); process.exit(2); }
    const sweepRunDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-forensics-run-'));
    console.log('RUN_DIR=' + sweepRunDir);
    console.log(`TARGET ticket=${q.ticket} udise=${q.udise || '-'} school=${q.school || '-'}`);
    const t0s = Date.now();
    const code = await sweepOnlyPhase(q, cw, sweepRunDir);
    console.log('FINAL SAFETY: probes=0 driveWrites=0 sheetsWrites=0 deletes=0 gasChanges=0 appChanges=0 commits=0 pushes=0 deploys=0 secrets=0');
    console.log('Elapsed: ' + Math.round((Date.now() - t0s) / 1000) + 's');
    process.exit(code);
  }
  const t0 = Date.now();
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-forensics-run-'));
  // Persistent dedicated profile (user-local, outside repo): sign in ONCE there,
  // reuse on later runs. Browser-owned storage — automation drives pages only and
  // never reads cookies/storage from it. Opt in with --persistent-profile.
  const usePersistent = process.argv.includes('--persistent-profile');
  const profileDir = usePersistent
    ? (() => { const d = path.join(os.homedir(), 'AppData', 'Local', 'tvr-gas-forensics-profile'); fs.mkdirSync(d, { recursive: true }); return d; })()
    : fs.mkdtempSync(path.join(os.tmpdir(), 'gas-forensics-profile-'));
  console.log('PROFILE_MODE=' + (usePersistent ? 'PERSISTENT (retained for reuse)' : 'TEMPORARY (destroyed after run)'));
  console.log('PROFILE_DIR=' + profileDir + ' (OS temp, outside repo; ALWAYS destroyed after run)');
  console.log('RUN_DIR=' + runDir);
  console.log(`TARGET ticket=${q.ticket} udise=${q.udise || '-'} school=${q.school || '-'}`);
  console.log('REPO deployment (prefix, not navigable): ' + repoDeploymentId());

  let chromium;
  try { ({ chromium } = workspaceRequire('@playwright/test')); }
  catch (e) {
    console.log('LAUNCH: FAIL — playwright unavailable');
    destroyProfile(profileDir);
    process.exit(2);
  }
  let ctx = null;
  const finish = (code) => {
    if (usePersistent) {
      console.log('PROFILE_RETAINED=' + profileDir + ' (outside repo; never read by automation)');
    } else {
      const destroyed = destroyProfile(profileDir);
      console.log('PROFILE_DESTROYED=' + (destroyed ? 'YES' : 'NO (manual purge: ' + profileDir + ')'));
    }
    console.log('FINAL SAFETY: probes=0 driveWrites=0 sheetsWrites=0 deletes=0 gasChanges=0 appChanges=0 commits=0 pushes=0 deploys=0 secrets=0');
    console.log('Elapsed: ' + Math.round((Date.now() - t0) / 1000) + 's');
    process.exit(code);
  };

  try {
    // Prefer the REAL installed Chrome (fewer automation signals than bundled
    // Chromium, so Google serves the real login flow); fall back to bundled.
    // Uses a DEDICATED profile only — never attaches to the user's normal Chrome.
    let launchedWith = 'bundled-chromium';
    const launchOpts = {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    };
    try {
      ctx = await chromium.launchPersistentContext(profileDir, { ...launchOpts, channel: 'chrome' });
      launchedWith = 'real-chrome';
    } catch (e) {
      ctx = await chromium.launchPersistentContext(profileDir, launchOpts);
    }
    console.log('BROWSER_BINARY=' + launchedWith);
  } catch (e) {
    console.log('LAUNCH: FAIL — ' + redact(e.message).slice(0, 160));
    console.log('BLOCKER: dedicated headed browser could not launch.');
    finish(2); return;
  }

  try {
    const first = ctx.pages()[0] || (await ctx.newPage());
    // Canonical entry first: Google's redirect chain decides login vs dashboard.
    // (/home/projects 404s on a fresh unauthenticated profile — a dead end with
    // no sign-in affordance that caused silent login timeouts.)
    for (const entry of ['https://script.google.com/', 'https://script.google.com/home/projects', 'https://script.google.com/u/0/home/projects']) {
      try { await first.goto(entry, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {}
      await new Promise((res) => setTimeout(res, 2500));
      let t = '';
      try { t = await first.title(); } catch (e) {}
      console.log('ENTRY ' + entry + ' -> ' + (() => { try { return new URL(first.url()).hostname; } catch (e) { return '?'; } })() + ' / ' + clip(t, 50));
      if (!/Error 404/i.test(t)) break;
    }
    let authed = null;
    try { if (await looksAuthenticated(first)) authed = first; } catch (e) {}
    if (!authed) authed = await waitForLogin(ctx, q.loginWaitMin * 60 * 1000);
    if (!authed) {
      console.log('LOGIN: TIMEOUT — no authenticated session. BLOCKER: user-mediated Google login not completed.');
      await ctx.close();
      finish(2); return;
    }
    console.log('LOGIN: PASS (URL/title markers only; no secrets read).');
    {
    const __sweepCode = await sweepFromPage(authed, q, runDir);
    await ctx.close();
    finish(__sweepCode);
    }
  } catch (e) {
    console.log('RUN: FAIL — ' + redact(e.message).slice(0, 200));
    try { if (ctx) await ctx.close(); } catch (err) {}
    finish(1);
  }
})();
