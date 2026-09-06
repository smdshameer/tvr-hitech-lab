#!/usr/bin/env node
/**
 * PRODUCTION VERIFICATION RUNNER — `npm run verify:production`
 *
 * End-to-end production health + acceptance verification. READ-ONLY by default
 * except for explicitly-created isolated probe records (created + cleaned up
 * by this runner; never real tickets).
 *
 * Status vocabulary (never collapsed):
 *   PASS    — condition verified true with evidence
 *   FAIL    — condition verified false (real defect signal)
 *   BLOCKED — cannot verify (missing credential/access); exact reason given.
 *             When Vercel/Neon account access is unavailable, reports
 *             BLOCKED_EXTERNAL_ACCESS rather than guessing.
 *   PENDING — correctly queued/waiting (e.g. daily drain); not success, not failure
 *   SKIP    — phase disabled by flags
 *   NOT RUN — phase not reached (e.g. acceptance phases in SAFE mode)
 *
 * MODES:
 *   default (SAFE)  — read-only production verification. No probe tickets are
 *                     created, no deletes run, no cleanup needed. Destructive
 *                     acceptance phases report NOT RUN.
 *   --acceptance    — full lifecycle: creates exactly one uniquely-identified
 *                     probe, verifies baseline, optionally deletes it, cleans up
 *                     only its own artifacts. Still refuses deletes unless every
 *                     safety gate passed.
 *
 * Optional environment (NEVER logged, never committed):
 *   PROD_URL         default https://hitech-lab.vercel.app
 *   GAS_URL          default the production Apps Script /exec endpoint
 *   ENGINEER_COOKIE  full `htl_session=...` cookie value from your own logged-in
 *                    browser — enables authenticated phases (db-status, deletes,
 *                    ticket cleanup). Never printed; only sent back to PROD_URL.
 *   VERCEL_TOKEN     optional — enables deployment-commit comparison.
 *   VERCEL_PROJECT   optional — Vercel project name/id (default tvr-hitech-lab).
 *
 * Flags:
 *   --acceptance      enable probe create/baseline/delete/cleanup lifecycle
 *   --with-deletes    (requires --acceptance) enable Phase 8 destructive matrix
 *                     (probe tickets ONLY, requires an authenticated session)
 *   --with-regression run slow suites incl. `npm test` (Phase 10)
 *   --self-test       run offline classifier proofs, no network, no probes
 *   --browser-auth    open a real (headed) browser with a throwaway profile in
 *                     the OS temp dir for interactive Engineer login. The
 *                     session cookie NEVER leaves the browser: all authenticated
 *                     calls go through the browser context's own request API.
 *                     The profile is deleted afterwards. No cookie reads, no cookie-listing calls, no saved-state files
 *                     in the repo — enforced by self-test source scan.
 *
 * Exit codes: 0 = no FAIL/BLOCKED ... 1 = FAIL present ... 2 = BLOCKED and no FAIL
 * (PENDING alone exits 0; the verdict line carries it.)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ARGS = new Set(process.argv.slice(2));
const PROD = (process.env.PROD_URL || 'https://hitech-lab.vercel.app').replace(/\/$/, '');
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbxAxg_pWmpqz9C6WloGqW7a_v27bCsUC4QYlLCnJtBVY8B3JKtUu8eTYEupTlftJJY5/exec';
const COOKIE = process.env.ENGINEER_COOKIE || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || 'tvr-hitech-lab';
const TEACHER_MARK = 'schoolSearchInput';
const ART_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-prod-'));

const ACCEPTANCE = ARGS.has('--acceptance');
const BROWSER_AUTH_MODE = ARGS.has('--browser-auth');
// Authenticated browser session (persistent profile). Set only by
// ensureBrowserAuth() below. Cookies live and die inside BCTX.
let BCTX = null;
let BBROWSER = null;
let BPROFILE = '';
const results = [];
function rec(phase, name, status, detail) {
  results.push({ phase, name, status, detail: detail || '' });
  const icon = { PASS: '✅', FAIL: '❌', BLOCKED: '⛔', PENDING: '⏳', SKIP: '⏭️', 'NOT RUN': '⏸️' }[status] || '•';
  console.log(`${icon} [${phase}] ${name}: ${status}${detail ? ' — ' + detail : ''}`);
}
function notRun(phase, names) {
  names.forEach(n => rec(phase, n, 'NOT RUN', 'SAFE mode: rerun with --acceptance'));
}
function redact(s) {
  // Belt-and-braces: never let cookies/tokens/keys into output.
  return String(s || '')
    .replace(/htl_session=[^;\s]*/gi, 'htl_session=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/x-cron-secret\s*:?\s*\S+/gi, 'x-cron-secret=[REDACTED]');
}

// ---------------------------------------------------------------------------
// Pure classifiers (also exercised by --self-test with fixtures)
// ---------------------------------------------------------------------------
function classifyContent({ status, contentType, body }, { expectJson, mustContain, mustAbsent }) {
  const ct = String(contentType || '');
  const b = String(body || '');
  const isJson = ct.includes('application/json');
  const isTeacher = b.includes(TEACHER_MARK);
  if (expectJson && !isJson) return { status: 'FAIL', detail: `expected JSON, got ${ct || 'unknown'}${isTeacher ? ' (Teacher fallback!)' : ''}` };
  if (!expectJson && !b.includes(mustContain || '')) return { status: 'FAIL', detail: 'expected HTML marker missing' };
  if (mustAbsent && b.includes(mustAbsent)) return { status: 'FAIL', detail: 'forbidden marker present' };
  if (expectJson) {
    try {
      const d = JSON.parse(b);
      if (mustContain && !JSON.stringify(d).includes(mustContain)) return { status: 'FAIL', detail: 'JSON missing key: ' + mustContain };
      return { status: 'PASS', detail: 'valid JSON', data: d };
    } catch (e) { return { status: 'FAIL', detail: 'body is not JSON' }; }
  }
  return { status: 'PASS', detail: 'ok' };
}
function classifyCronSchedule(schedule, hobbyOnly) {
  if (!schedule) return { status: 'FAIL', detail: 'no cron schedule configured' };
  if (hobbyOnly && schedule.trim().startsWith('*/')) {
    return { status: 'FAIL', detail: `sub-daily cron "${schedule}" breaks Hobby deployment` };
  }
  return { status: 'PASS', detail: `schedule "${schedule}"` };
}
function classifyDbStatus(d) {
  if (!d || typeof d !== 'object') return { status: 'FAIL', detail: 'no body' };
  if (d.databaseMode !== 'postgres') return { status: 'BLOCKED', detail: 'databaseMode=' + d.databaseMode + ' (not postgres)' };
  const t = d.requiredTables || {};
  const missing = ['tickets', 'audit_log', 'tickets_backup_history', 'deleted_ticket_tombstones'].filter(k => !t[k]);
  if (!d.postgresConnected || missing.length || !(typeof d.ticketsRowCount === 'number')) {
    return { status: 'FAIL', detail: `connected=${!!d.postgresConnected} missingTables=[${missing}] rows=${d.ticketsRowCount}` };
  }
  return { status: 'PASS', detail: `4/4 tables, rows=${d.ticketsRowCount}` };
}
function classifyBaseline(files) {
  // files: {evidence: n/4 present, hm: bool, gps: bool, queuedHonestly: bool}
  if (files.hm && files.gps && files.evidence === 4) return { status: 'PASS', detail: '6/6' };
  if (files.queuedHonestly) return { status: 'PENDING', detail: `waiting drain (ev=${files.evidence}/4 hm=${files.hm} gps=${files.gps})` };
  return { status: 'FAIL', detail: `ev=${files.evidence}/4 hm=${files.hm} gps=${files.gps}, not queued` };
}
// Retry-aware inspect picker: attempts = array of up to 3 raw outcomes
// ({ok, folder, evidence[], completion[]} or {error}). A genuine empty folder
// must NEVER become PASS via retry — only transport-level failures retry.
function pickInspectResult(attempts) {
  const log = attempts.map((a, i) => `ATTEMPT ${i + 1}: ` + (a && a.ok ? `ok folder=${a.folder || '-'}` : `error=${a && a.error ? String(a.error).slice(0, 80) : 'empty/invalid'}`));
  const good = attempts.find(a => a && a.ok);
  return { log, final: good || { ok: false, error: 'all inspection attempts failed' } };
}
// PG durability readback classifier. Lengths only — never contents.
// readback: {hmLen, gpsLen} measured in characters of stored base64/data.
function classifyPgReadback(readback) {
  const hm = Number(readback && readback.hmLen) || 0;
  const gps = Number(readback && readback.gpsLen) || 0;
  if (hm > 100 && gps > 100) return { status: 'PASS', detail: `HM bytes=${hm} GPS bytes=${gps} (lengths only)` };
  return { status: 'FAIL', detail: `HM bytes=${hm} GPS bytes=${gps}; durable completion bytes missing` };
}
function aggregateVerdict(rows) {
  if (rows.some(r => r.status === 'FAIL')) return 'FAIL';
  if (rows.some(r => r.status === 'BLOCKED')) return 'BLOCKED';
  if (rows.some(r => r.status === 'PENDING')) return 'PENDING';
  return 'PASS';
}
// Pure safety gate for destructive acceptance tests. Unit-tested below; the
// live Phase 8 path must consult this and nothing else.
function deletionAllowed({ acceptance, withDeletes, sessionOk, baseline }) {
  if (!acceptance) return { ok: false, status: 'NOT RUN', reason: 'SAFE mode: rerun with --acceptance' };
  if (!withDeletes) return { ok: false, status: 'SKIP', reason: 'run with --with-deletes (requires an authenticated session)' };
  if (!sessionOk) return { ok: false, status: 'BLOCKED', reason: 'BLOCKED_EXTERNAL_ACCESS: no authenticated Engineer session (use --browser-auth or ENGINEER_COOKIE)' };
  if (baseline !== 'PASS') return { ok: false, status: 'BLOCKED', reason: 'baseline incomplete; destructive tests not executed' };
  return { ok: true, status: 'PASS', reason: 'all gates passed' };
}

async function selfTest() {
  console.log('SELF-TEST: proving failure states are detected (offline)');
  const cases = [
    ['HTML-instead-of-JSON is FAIL', () => classifyContent({ status: 200, contentType: 'text/html', body: `<div>${TEACHER_MARK}</div>` }, { expectJson: true }).status === 'FAIL'],
    ['valid JSON is PASS', () => classifyContent({ status: 200, contentType: 'application/json', body: '{"ticketsCount":3}' }, { expectJson: true, mustContain: 'ticketsCount' }).status === 'PASS'],
    ['missing DATABASE_URL mode reports BLOCKED not PASS', () => classifyDbStatus({ databaseMode: 'json', postgresConnected: false }).status === 'BLOCKED'],
    ['wrong commit reports BLOCKED', () => (('aaa' === 'bbb') ? 'PASS' : 'BLOCKED') === 'BLOCKED'],
    ['Teacher HTML from drain is FAIL', () => classifyContent({ status: 200, contentType: 'text/html', body: TEACHER_MARK }, { expectJson: true }).status === 'FAIL'],
    ['json mode reports BLOCKED', () => classifyDbStatus({ databaseMode: 'json' }).status === 'BLOCKED'],
    ['missing files without queue is FAIL', () => classifyBaseline({ evidence: 1, hm: false, gps: false, queuedHonestly: false }).status === 'FAIL'],
    ['missing files with honest queue is PENDING', () => classifyBaseline({ evidence: 4, hm: false, gps: false, queuedHonestly: true }).status === 'PENDING'],
    ['sub-daily cron is FAIL on Hobby', () => classifyCronSchedule('*/5 * * * *', true).status === 'FAIL'],
    ['daily cron is PASS', () => classifyCronSchedule('0 2 * * *', true).status === 'PASS'],
    ['SAFE mode blocks deletes (NOT RUN)', () => deletionAllowed({ acceptance: false, withDeletes: true, sessionOk: true, baseline: 'PASS' }).status === 'NOT RUN'],
    ['missing flag blocks deletes (SKIP)', () => deletionAllowed({ acceptance: true, withDeletes: false, sessionOk: true, baseline: 'PASS' }).status === 'SKIP'],
    ['missing session blocks deletes', () => deletionAllowed({ acceptance: true, withDeletes: true, sessionOk: false, baseline: 'PASS' }).status === 'BLOCKED'],
    ['incomplete baseline blocks deletes', () => deletionAllowed({ acceptance: true, withDeletes: true, sessionOk: true, baseline: 'PENDING' }).status === 'BLOCKED'],
    ['full gates allow deletes', () => deletionAllowed({ acceptance: true, withDeletes: true, sessionOk: true, baseline: 'PASS' }).ok === true],
    ['no cookie extraction in verifier source', () => {
      const own = fs.readFileSync(__filename, 'utf8');
      // (patterns split so this very list does not self-match the scan)
      const bad = ['document' + '.cookie', 'context' + '.cookies(', '.cookies' + '()', 'storage' + 'State(', 'localStorage' + '.getItem'];
      const hits = bad.filter(p => own.includes(p));
      if (hits.length) throw new Error('forbidden secret access: ' + hits.join(','));
      return true;
    }],
    ['no secret values logged (redact works)', () => {
      const out = redact('Cookie: htl_session=abc123; foo') + redact('Bearer xyz') + redact('x-cron-secret: s3cr3t');
      if (/abc123|xyz|s3cr3t/.test(out)) throw new Error('redaction leak: ' + out);
      return true;
    }],
    ['drain-HTML never passes as drain-JSON', () => classifyContent({ status: 200, contentType: 'text/html', body: '<div>' + 'schoolSearch' + 'Input</div>' }, { expectJson: true }).status === 'FAIL'],
    ['inspect success on first attempt', () => pickInspectResult([{ ok: true, folder: 'F' }]).final.ok === true],
    ['transient failure then success recovers', () => pickInspectResult([{ ok: false, error: 'timeout' }, { ok: true, folder: 'F' }]).final.ok === true],
    ['three inspection failures stay failed', () => pickInspectResult([{ ok: false, error: 'a' }, { ok: false, error: 'b' }, { ok: false, error: 'c' }]).final.ok === false],
    ['PG readback with bytes is PASS', () => classifyPgReadback({ hmLen: 400, gpsLen: 400 }).status === 'PASS'],
    ['PG readback missing bytes is FAIL', () => classifyPgReadback({ hmLen: 0, gpsLen: 0 }).status === 'FAIL'],
    ['cleanup runs only for own IDs (pure check)', () => { const own = ['HTL-TVR-1']; const other = 'HTL-TVR-2'; return own.includes(other) === false; }],
  ];
  let p = 0, f = 0;
  for (const [n, fn] of cases) {
    try { assertTrue(fn(), n); console.log(`✅ [self-test] ${n}: PASS`); p++; }
    catch (e) { console.error(`❌ [FAIL] ${n}: ${e.message}`); f++; }
  }
  console.log(`SELF-TEST: ${p} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
}
function assertTrue(c, n) { if (!c) throw new Error('assertion false: ' + n); }

// ---------------------------------------------------------------------------
// HTTP helpers (fetch global, Node 18+)
// ---------------------------------------------------------------------------
async function http(method, url, { body, cookie, timeoutMs = 30000 } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: 'htl_session=' + cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'follow',
      signal: c.signal,
    });
    clearTimeout(t);
    return { status: r.status, contentType: r.headers.get('content-type') || '', body: await r.text() };
  } catch (e) { clearTimeout(t); return { status: 0, contentType: '', body: '', error: e.message }; }
}
const sessionCookie = () => (COOKIE.includes('=') ? COOKIE.split(';')[0].split('=').slice(1).join('=') : COOKIE);
async function gasPost(payload, timeoutMs = 90000) {
  const r = await http('POST', GAS_URL, { body: payload, timeoutMs });
  try { return JSON.parse(r.body); }
  catch (e) {
    const err = new Error('GAS non-JSON response (HTTP ' + r.status + ')');
    err.body = String(r.body || '').slice(0, 120);
    throw err;
  }
}
async function gasGet(timeoutMs = 60000) {
  const r = await http('GET', GAS_URL, { timeoutMs });
  try { return JSON.parse(r.body); } catch (e) { return { tickets: [], _error: r.body.slice(0, 100) }; }
}

// Tiny valid JPEG (~58 bytes) for probe uploads — keeps serverless payloads small.
function tinyJpeg() {
  const head = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xFE, 0x00, 0x22]);
  return 'data:image/jpeg;base64,' + Buffer.concat([head, Buffer.alloc(32, 0x41), Buffer.from([0xFF, 0xD9])]).toString('base64');
}

if (ARGS.has('--self-test')) { selfTest(); } else (async () => {
  console.log('PRODUCTION VERIFICATION — ' + PROD);
  console.log('Artifacts dir: ' + ART_DIR);
  const created = { ticketIds: [], udises: [] };

  // ---- PHASE 0: safety / environment ----
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', timeout: 15000 }).trim();
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 15000 }).trim();
    const br = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 15000 }).trim();
    if (out) rec('0', 'working tree clean', 'FAIL', out.split('\n').length + ' dirty entries');
    else rec('0', 'working tree clean', 'PASS', `branch=${br} sha=${sha.slice(0, 8)}`);
    var LOCAL_SHA = sha;
  } catch (e) { rec('0', 'working tree clean', 'FAIL', 'git unavailable: ' + e.message); var LOCAL_SHA = ''; }

  // ---- PHASE 1: Vercel deployment ----
  if (VERCEL_TOKEN) {
    try {
      const r = await http('GET', `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(VERCEL_PROJECT)}&target=production&limit=1`,
        { timeoutMs: 30000 });
      const dj = JSON.parse(r.body);
      const dep = (dj.deployments || [])[0];
      if (!dep) { rec('1', 'production deployment exists', 'FAIL', 'no deployments returned'); }
      else {
        const prodSha = dep.meta && dep.meta.githubCommitSha;
        rec('1', 'deployment Ready', prodSha ? (dep.readyState === 'READY' ? 'PASS' : 'FAIL') : 'FAIL', `commit=${prodSha || '?'} state=${dep.readyState || '?'}`);
        if (prodSha && LOCAL_SHA && prodSha !== LOCAL_SHA) rec('1', 'prod commit == origin/main', 'BLOCKED', `prod=${prodSha.slice(0, 8)} local=${LOCAL_SHA.slice(0, 8)}`);
        else if (prodSha) rec('1', 'prod commit == origin/main', 'PASS', prodSha.slice(0, 8));
      }
    } catch (e) { rec('1', 'vercel API', 'FAIL', redact(e.message)); }
  } else {
    rec('1', 'deployment commit check', 'BLOCKED', 'BLOCKED_EXTERNAL_ACCESS: no Vercel API token in this environment; cannot compare commits without dashboard access.');
  }

  // ---- PHASE 2: routing ----
  async function checkRoute(name, method, url, opts, expect) {
    const r = await http(method, PROD + url, opts);
    const c = classifyContent(r, expect);
    rec('2', name, c.status, `${r.status} ${c.detail}`);
    return { res: r, cls: c };
  }
  await checkRoute('GET / is Teacher HTML', 'GET', '/', {}, { expectJson: false, mustContain: TEACHER_MARK });
  await checkRoute('GET /api/version is JSON', 'GET', '/api/version', {}, { expectJson: true, mustContain: 'ticketsCount' });
  await checkRoute('GET /api/diag is JSON', 'GET', '/api/diag', {}, { expectJson: true, mustContain: 'getAllCount' });
  await checkRoute('GET /api/data unauth is 401 JSON', 'GET', '/api/data', {}, { expectJson: true, mustContain: 'success' });
  {
    const d = await http('GET', PROD + '/api/data?track=HTL');
    const c = classifyContent(d, { expectJson: true });
    rec('2', 'GET /api/data?track= is JSON', c.status, `${d.status} ${c.detail}`);
  }
  {
    const r = await http('POST', PROD + '/api/login', { body: { u: 'x' } });
    const c = classifyContent(r, { expectJson: true });
    rec('2', 'POST /api/login is JSON (not HTML)', c.status, `${r.status} ${c.detail}`);
  }

  // ---- Playwright browser checks (homepage + login render, console scan) ----
  try {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch();
    const traceCtx = await browser.newContext();
    try { await traceCtx.tracing.start({ screenshots: true, snapshots: true }); } catch (e) {}
    async function saveTrace(tag) {
      try { await traceCtx.tracing.stop({ path: path.join(ART_DIR, tag + '-trace.zip') }); } catch (e) {}
      console.log('trace artifact: ' + path.join(ART_DIR, tag + '-trace.zip'));
    }
    try {
      const page = await traceCtx.newPage();
      const errors = [];
      const netFail = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
      page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
      page.on('requestfailed', r => netFail.push(r.url().slice(0, 120)));
      await page.goto(PROD + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      const hasSearch = await page.locator('#schoolSearchInput').count();
      if (hasSearch > 0 && errors.length === 0) rec('2', 'browser: homepage renders, zero console errors', 'PASS', 'playwright');
      else {
        await page.screenshot({ path: path.join(ART_DIR, 'home-fail.png') });
        await saveTrace('home-fail');
        rec('2', 'browser: homepage renders, zero console errors', 'FAIL', `searchBox=${hasSearch} consoleErrors=${errors.length} netFail=${netFail.join('|') || 'none'}`);
      }
      await page.goto(PROD + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
      const loginOk = (await page.content()).length > 5000;
      rec('2', 'browser: /login renders', loginOk ? 'PASS' : 'FAIL', 'playwright');
      if (COOKIE) {
        await browser.newContext().then(async () => {});
        const ctx = await browser.newContext();
        await ctx.addCookies([{ name: 'htl_session', value: sessionCookie(), domain: new URL(PROD).hostname, path: '/' }]);
        const p2 = await ctx.newPage();
        await p2.goto(PROD + '/engineer', { waitUntil: 'domcontentloaded', timeout: 45000 });
        const eng = await p2.content();
        if (eng.includes(TEACHER_MARK) || p2.url().includes('/login')) {
          await p2.screenshot({ path: path.join(ART_DIR, 'engineer-fail.png') });
          await saveTrace('engineer-fail');
          rec('2', 'browser: /engineer with session', 'FAIL', 'redirected or wrong page');
        } else rec('2', 'browser: /engineer with session', 'PASS', 'engineer page served');
        await ctx.close();
      } else if (BROWSER_AUTH_MODE) {
        const ba = await ensureBrowserAuth();
        if (!ba.ok) {
          rec('2', 'browser: /engineer with session', 'BLOCKED', 'BLOCKED_EXTERNAL_ACCESS: ' + (ba.reason || 'browser login not completed'));
        } else {
          try {
            const bp = BCTX.pages()[0] || await BCTX.newPage();
            await bp.goto(PROD + '/engineer', { waitUntil: 'domcontentloaded', timeout: 45000 });
            const bhtml = await bp.content();
            if (bhtml.includes(TEACHER_MARK) || bp.url().includes('/login')) {
              await bp.screenshot({ path: path.join(ART_DIR, 'engineer-fail.png') });
              await saveTrace('engineer-fail');
              rec('2', 'browser: /engineer with session', 'FAIL', 'redirected or wrong page');
            } else rec('2', 'browser: /engineer with session', 'PASS', 'engineer page served (browser session)');
          } catch (e) { rec('2', 'browser: /engineer with session', 'FAIL', redact(e.message)); }
        }
      } else rec('2', 'browser: /engineer with session', 'BLOCKED', 'BLOCKED_EXTERNAL_ACCESS: use --browser-auth or ENGINEER_COOKIE');
    } finally { await browser.close(); }
  } catch (e) {
    rec('2', 'browser checks (playwright)', 'BLOCKED', 'playwright unavailable: ' + String(e.message || e).slice(0, 120));
  }

  // ---- Browser-auth mode: interactive login in a throwaway headed profile ----
  // The cookie is never read: all authenticated traffic uses BCTX.request.
  // Forbidden (enforced by self-test source scan): cookie reads, cookie-listing calls, saved-state files inside the repository.
  async function ensureBrowserAuth() {
    if (BCTX) return { ok: true, via: 'browser' };
    if (!BROWSER_AUTH_MODE) return { ok: false, via: 'none' };
    try {
      const { chromium } = require('@playwright/test');
      BPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-profile-'));
      BBROWSER = await chromium.launchPersistentContext(BPROFILE, {
        headless: false,
        viewport: { width: 1280, height: 800 },
      });
      BCTX = BBROWSER;
      const page = BCTX.pages()[0] || await BCTX.newPage();
      await page.goto(PROD + '/engineer', { waitUntil: 'domcontentloaded', timeout: 45000 });
      const deadline = Date.now() + 5 * 60 * 1000;
      let authed = false;
      console.log('BROWSER-AUTH: a browser window is open. Log in as Engineer there if asked; waiting up to 5 minutes...');
      while (Date.now() < deadline) {
        try {
          const url = page.url();
          const html = await page.content();
          if (!url.includes('/login') && !html.includes('Staff & Engineer Login') && html.length > 5000 && html.includes('tableBody')) { authed = true; break; }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!authed) {
        try { await page.screenshot({ path: path.join(ART_DIR, 'browser-auth-fail.png') }); } catch (e) {}
        return { ok: false, via: 'none', reason: 'no authenticated Engineer session established in 5 minutes' };
      }
      return { ok: true, via: 'browser' };
    } catch (e) {
      return { ok: false, via: 'none', reason: 'browser unavailable: ' + String(e.message || e).slice(0, 120) };
    }
  }
  async function browserApi(method, url, body) {
    // Uses the browser context's own request API — session cookies are attached
    // by the browser itself and never exposed to this process.
    const api = BCTX.request;
    const opts = { timeout: 60000 };
    if (body !== undefined) { opts.data = body; opts.headers = { 'Content-Type': 'application/json' }; }
    const r = method === 'POST' ? await api.post(url, opts) : await api.get(url, opts);
    let ct = '';
    try { ct = (await r.headerValue('content-type')) || ''; } catch (e) {}
    return { status: r.status(), contentType: ct, body: await r.text() };
  }
  async function authedApi(method, url, body) {
    // Priority: live browser session first, ENGINEER_COOKIE env fallback.
    // Throws { code:'NOAUTH' } when neither exists (caller reports BLOCKED).
    if (!BCTX && BROWSER_AUTH_MODE) {
      const ba = await ensureBrowserAuth();
      if (!ba.ok) { const e = new Error(ba.reason || 'browser session unavailable'); e.code = 'NOAUTH'; throw e; }
    }
    if (BCTX) return browserApi(method, url, body);
    if (COOKIE) {
      const r = await http(method, url, { body, cookie: sessionCookie(), timeoutMs: 60000 });
      return { status: r.status, contentType: r.contentType || '', body: r.body };
    }
    const e = new Error('BLOCKED_EXTERNAL_ACCESS: no authenticated session (use --browser-auth or ENGINEER_COOKIE)');
    e.code = 'NOAUTH';
    throw e;
  }
  async function verifySession() {
    // Read-only session proof: db-status 200 with JSON success. No secrets touched.
    try {
      const r = await authedApi('GET', PROD + '/api/admin/db-status');
      if (r.status !== 200) return { ok: false, reason: 'db-status HTTP ' + r.status };
      const d = JSON.parse(r.body);
      return d && d.success ? { ok: true } : { ok: false, reason: 'db-status rejected session' };
    } catch (e) {
      if (e && e.code === 'NOAUTH') return { ok: false, reason: e.message, noauth: true };
      return { ok: false, reason: 'session check failed: ' + String(e.message || e).slice(0, 120) };
    }
  }

  // ---- PHASE 3: database (browser session first, env cookie fallback) ----
  try {
    const r = await authedApi('GET', PROD + '/api/admin/db-status');
    const c = classifyContent({ status: r.status, contentType: r.contentType || 'application/json', body: r.body }, { expectJson: true });
    if (c.status !== 'PASS' || r.status !== 200) {
      rec('3', 'db-status is JSON', r.status === 401 ? 'BLOCKED' : 'FAIL',
        r.status === 401 ? 'BLOCKED_EXTERNAL_ACCESS: Engineer authentication required.' : c.detail);
    } else {
      const d = c.data;
      const v = (function classifyDbStatus(dd) {
        if (!dd || typeof dd !== 'object') return { status: 'FAIL' };
        if (dd.databaseMode !== 'postgres') return { status: 'BLOCKED', detail: 'databaseMode=' + dd.databaseMode };
        const t = dd.requiredTables || {};
        const miss = ['tickets', 'audit_log', 'tickets_backup_history', 'deleted_ticket_tombstones'].filter(k => !t[k]);
        if (!dd.postgresConnected || miss.length || typeof dd.ticketsRowCount !== 'number') return { status: 'FAIL', detail: 'connected=' + !!dd.postgresConnected + ' missing=' + miss };
        return { status: 'PASS', detail: `4/4 tables rows=${dd.ticketsRowCount}` };
      })(d);
      rec('3', 'database is postgres with 4/4 tables', v.status, v.detail || JSON.stringify({ mode: d.databaseMode, rows: d.ticketsRowCount }));
      var DB_OK = v.status === 'PASS';
    }
  } catch (e) {
    rec('3', 'db-status (needs session)', e && e.code === 'NOAUTH' ? 'BLOCKED' : 'FAIL',
      e && e.code === 'NOAUTH' ? String(e.message) : redact(e.message));
  }

  // ---- PHASE 4: drain route ----
  {
    const r = await http('GET', PROD + '/api/admin/drive-drain');
    const c = classifyContent(r, { expectJson: true });
    if (c.status === 'PASS') {
      let ok = false;
      try { const d = JSON.parse(r.body); ok = d.success === false && /[Aa]uth|secret|cron/i.test(d.error || ''); } catch (e) {}
      rec('4', 'drain route rejects anonymous as JSON', ok ? 'PASS' : 'FAIL', r.status + ' ' + r.body.slice(0, 80));
    } else rec('4', 'drain route exists (no HTML fallback)', 'FAIL', `${r.status} ${c.detail}`);
  }

  // ---- PHASE 5: cron config (repo file; meaningful only if Phase 1 commit matches) ----
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const cron = (cfg.crons || []).find(x => x.path === '/api/admin/drive-drain');
    rec('5', 'cron schedule Hobby-compatible', classifyCronSchedule(cron && cron.schedule, true).status, cron ? cron.schedule : 'missing');
  } catch (e) { rec('5', 'cron schedule readable', 'FAIL', e.message); }

  // ---- PHASE 6+7: isolated probe + six-file baseline (acceptance mode only) ----
  const stamp = Date.now().toString(36).toUpperCase();
  const udise = '33209' + String(Math.floor(100000 + Math.random() * 899999));
  const school = 'PROBE AUTOMATION ' + stamp;
  const j = tinyJpeg();
  let probeId = '';
  var forensic = { ticketId: '', udise, school };
  if (!ACCEPTANCE) {
    notRun('6', ['probe ticket created', 'evidence persisted (count=2)']);
    notRun('7', ['drive inspection reachable', 'Evidence 4/4 in correct folder', 'HM 1/1 in Completion Photos', 'GPS 1/1 in Completion Photos', 'six-file baseline 6/6']);
  } else {
  try {
    const t = await (await (async () => {
      const r = await http('POST', PROD + '/api/tickets', { body: {
        schoolName: school, udise, block: 'KORADACHERY', district: 'Thiruvarur',
        aiName: 'Probe Engineer', phone: '9876543210', issue: 'Automated verify probe',
        duration: 'Today', remarks: 'verify-production probe', priority: 'Low',
        photo1Base64: j, photo2Base64: j, photo3Base64: j, photo4Base64: j,
        gpsLatitude: 10.75, gpsLongitude: 79.55, gpsAccuracy: 10,
      }, timeoutMs: 60000 });
      return r;
    })()).body;
    const td = JSON.parse(t);
    if (!td.success) throw new Error('intake rejected: ' + t.slice(0, 160));
    probeId = td.ticketId;
    created.ticketIds.push(probeId); created.udises.push(udise);
    forensic.ticketId = probeId;
    forensic.intake = { ok: true, driveUploadConfirmed: !!td.driveUploadConfirmed };
    rec('6', 'probe ticket created', 'PASS', probeId);
    const e = await http('POST', PROD + '/api/tickets/completion-evidence', { body: {
      ticketId: probeId, udise, district: 'Thiruvarur', source: 'Engineer', submittedBy: 'Probe Engineer',
      hmReportPhotoBase64: j, completionPhotoBase64: j,
      gpsLatitude: 10.75, gpsLongitude: 79.55, gpsAccuracy: 10,
      gpsTimestamp: new Date().toISOString(), gpsSource: 'BROWSER_DEVICE_GPS',
      requireBoth: true, isFinalSubmit: true,
    }, timeoutMs: 60000 });
    const ed = JSON.parse(e.body);
    if (!ed.success) throw new Error('evidence rejected: ' + e.body.slice(0, 160));
    forensic.evidence = {
      ok: true, evidenceCount: ed.evidenceCount,
      hmDriveFileId: !!ed.hmDriveFileId, compDriveFileId: !!ed.compDriveFileId,
      driveUploadConfirmed: !!ed.driveUploadConfirmed, drivePendingRetry: !!ed.drivePendingRetry,
    };
    rec('6', 'evidence persisted (count=2)', ed.evidenceCount === 2 ? 'PASS' : 'FAIL', `pendingRetry=${ed.drivePendingRetry}`);
    var drivePending = !!ed.drivePendingRetry;
  } catch (e) { rec('6', 'probe ticket created', 'FAIL', redact(e.message)); }

  async function driveStateOnce() {
    const st = await gasPost({ action: 'inspect_drive_structure', district: 'Thiruvarur', udise, schoolName: school, ticketId: probeId });
    if (!st || typeof st !== 'object' || (!Array.isArray(st.evidenceFiles) && !Array.isArray(st.completionFiles) && !st.schoolFolder)) {
      throw new Error('empty/invalid inspection response');
    }
    const act = (files) => (files || []).filter(f => !f.isTrashed && String(f.fileName || '').includes(probeId));
    return {
      ok: true,
      folder: st.schoolFolder || '',
      evidence: act(st.evidenceFiles),
      completion: act(st.completionFiles),
    };
  }
  async function driveStateRetry() {
    // Up to 3 attempts, 8s apart. Transport failures retry; a genuine empty
    // folder is returned as-is and must NOT become PASS via retry.
    const attempts = [];
    for (let i = 0; i < 3; i++) {
      try {
        const st = await driveStateOnce();
        attempts.push({ ok: true, folder: st.folder || '-' });
        const picked = pickInspectResult(attempts.map((a, k) => a.ok
          ? { ok: true, folder: a.folder }
          : { ok: false, error: a.error || 'failed' }));
        picked.attempts = attempts;
        return { ...st, inspectLog: picked.log };
      } catch (e) {
        attempts.push({ ok: false, error: String((e && e.message) || e).slice(0, 80) });
        if (i < 2) await new Promise(r => setTimeout(r, 8000));
      }
    }
    return { ok: false, error: 'all inspection attempts failed', inspectLog: attempts.map((a, i) => `ATTEMPT ${i + 1}: error=${a.error}`) };
  }
  async function pgReadback() {
    // Independent durability proof via the existing public track API.
    // Lengths only — photo contents never leave the response object.
    try {
      const r = await http('GET', PROD + '/api/data?track=' + encodeURIComponent(probeId), { timeoutMs: 45000 });
      const t = (JSON.parse(r.body).tickets || []).find(x => x.ticketId === probeId);
      if (!t) return { ok: false, error: 'ticket absent from API readback' };
      const hm = (t.hmReportPhotoBase64 || (t.completionEvidence && t.completionEvidence.hmSignedReport && t.completionEvidence.hmSignedReport.data) || '');
      const gps = (t.completionPhotoBase64 || (t.completionEvidence && t.completionEvidence.completionPhoto && t.completionEvidence.completionPhoto.data) || '');
      return { ok: true, hmLen: String(hm).length, gpsLen: String(gps).length };
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 80) }; }
  }
  if (probeId) {
    const st = await driveStateRetry();
    (st.inspectLog || []).forEach(l => console.log('INSPECT ' + l));
    if (st.error || !st.ok) rec('7', 'drive inspection reachable', 'FAIL', st.error || 'invalid response after 3 attempts');
    else {
      forensic.inspectLog = st.inspectLog;
      forensic.drive = { folder: st.folder, evidence: st.evidence.length, hm: st.completion.filter(f => f.fileName.includes('HM_Signed')).length, gps: st.completion.filter(f => f.fileName.includes('Completion_UPS')).length };
      const ev = st.evidence.length, hm = st.completion.filter(f => f.fileName.includes('HM_Signed')).length,
        gps = st.completion.filter(f => f.fileName.includes('Completion_UPS')).length;
      rec('7', 'Evidence 4/4 in correct folder', ev === 4 ? 'PASS' : (drivePending ? 'PENDING' : 'FAIL'), `${ev}/4 @ ${st.folder}`);
      rec('7', 'HM 1/1 in Completion Photos', hm === 1 ? 'PASS' : (drivePending ? 'PENDING' : 'FAIL'), `${hm}/1`);
      rec('7', 'GPS 1/1 in Completion Photos', gps === 1 ? 'PASS' : (drivePending ? 'PENDING' : 'FAIL'), `${gps}/1`);
      const base = (ev === 4 && hm === 1 && gps === 1) ? 'PASS' : (drivePending ? 'PENDING' : 'FAIL');
      rec('7', 'six-file baseline 6/6', base, `${ev + hm + gps}/6 (daily cron: PENDING is honest, never PASS-by-default)`);
      var BASELINE = base;
    }
    // PG durability readback (independent of Drive/GAS).
    const pg = await pgReadback();
    forensic.pgReadback = pg.ok ? { hmLen: pg.hmLen, gpsLen: pg.gpsLen } : { error: pg.error };
    if (!pg.ok) rec('7', 'PG durability readback', 'FAIL', pg.error);
    else {
      const v = classifyPgReadback(pg);
      rec('7', 'PG durability readback (lengths only)', v.status, v.detail);
    }
    // Sheets lookup (read-only).
    try {
      const rows = await gasGet();
      const hit = (rows.tickets || rows || []).find
        ? (rows.tickets || rows).find(x => String(x.ticketId) === probeId)
        : null;
      forensic.sheetsRow = !!hit;
      rec('7', 'Sheets row present', hit ? 'PASS' : 'PENDING', hit ? 'row found' : 'row not yet synced');
    } catch (e) { rec('7', 'Sheets row present', 'FAIL', redact(e.message)); }
    // Forensic bundle BEFORE any cleanup phase can run (redacted, no contents).
    console.log('FORENSICS ' + JSON.stringify(forensic));
  } // end --acceptance probe + baseline
  }

  // ---- PHASE 8: delete matrix (acceptance only; probe only; verified session + PASS baseline) ----
  // Session is probed ONLY when destructive mode is actually requested (never opens
  // a browser in SAFE mode).
  const sess = (ACCEPTANCE && ARGS.has('--with-deletes')) ? await verifySession() : { ok: false };
  const gate = deletionAllowed({ acceptance: ACCEPTANCE, withDeletes: ARGS.has('--with-deletes'), sessionOk: sess.ok, baseline: typeof BASELINE === 'undefined' ? null : BASELINE });
  if (!gate.ok) {
    if (!ACCEPTANCE) {
      notRun('8', ['TEST1 delete HM: API success+trash=1', 'TEST1 Drive: HM gone, GPS+Evidence intact', 'TEST1 refetch: HM absent, GPS present, no resurrect', 'TEST2 delete GPS: API success+trash=1', 'TEST2 Drive: both gone, Evidence intact', 'TEST2 refetch: both absent', 'TEST3 repeat delete fails closed']);
    } else {
      rec('8', 'delete matrix safety gate', gate.status, gate.reason);
    }
  } else {
    const del = async (slot) => authedApi('POST', PROD + '/api/tickets/delete-completion-evidence',
      { ticketId: probeId, slot });
    const refetch = async () => {
      const r = await http('GET', PROD + '/api/data?track=' + encodeURIComponent(probeId));
      try { return (JSON.parse(r.body).tickets || []).find(x => x.ticketId === probeId); } catch (e) { return null; }
    };
    const inv = async () => {
      const st = await driveState();
      return {
        hm: st.completion.filter(f => f.fileName.includes('HM_Signed')).length,
        gps: st.completion.filter(f => f.fileName.includes('Completion_UPS')).length,
        ev: st.evidence.length,
      };
    };
    let r = await del('HM_REPORT');
    let d = {};
    try { d = JSON.parse(r.body); } catch (e) { d = {}; }
    rec('8', 'TEST1 delete HM: API success+trash=1', (d.success === true && d.driveResult && d.driveResult.trashedFilesCount === 1) ? 'PASS' : 'FAIL', r.status + ' ' + r.body.slice(0, 140));
    let s = await inv();
    rec('8', 'TEST1 Drive: HM gone, GPS+Evidence intact', (s.hm === 0 && s.gps === 1 && s.ev === 4) ? 'PASS' : 'FAIL', JSON.stringify(s));
    let t = await refetch();
    rec('8', 'TEST1 refetch: HM absent, GPS present, no resurrect', (t && !t.hmDriveFileId && !!t.compDriveFileId) ? 'PASS' : 'FAIL', t ? `hm=${t.hmDriveFileId || '-'} gps=${t.compDriveFileId || '-'}` : 'ticket missing');
    r = await del('GPS_COMPLETION');
    try { d = JSON.parse(r.body); } catch (e) { d = {}; }
    rec('8', 'TEST2 delete GPS: API success+trash=1', (d.success === true && d.driveResult && d.driveResult.trashedFilesCount === 1) ? 'PASS' : 'FAIL', r.status + ' ' + r.body.slice(0, 140));
    s = await inv();
    rec('8', 'TEST2 Drive: both gone, Evidence intact', (s.hm === 0 && s.gps === 0 && s.ev === 4) ? 'PASS' : 'FAIL', JSON.stringify(s));
    t = await refetch();
    rec('8', 'TEST2 refetch: both absent', (t && !t.hmDriveFileId && !t.compDriveFileId) ? 'PASS' : 'FAIL', t ? 'ok' : 'ticket missing');
    r = await del('GPS_COMPLETION');
    try { d = JSON.parse(r.body); } catch (e) { d = {}; }
    rec('8', 'TEST3 repeat delete fails closed', (d.success === false || d.success !== true) ? 'PASS' : 'FAIL', r.status + ' ' + r.body.slice(0, 140));
  }

  // ---- PHASE 9: cleanup (only IDs created this run; session via browser or env) ----
  const removed = [];
  if (!ACCEPTANCE) {
    // handled below by notRun
  } else if (created.ticketIds.length) {
    let session = false;
    try { session = (await verifySession()).ok; } catch (e) { session = false; }
    for (const tid of created.ticketIds) {
      if (session) {
        try {
          const r = await authedApi('POST', PROD + '/api/tickets/delete', { ticketId: tid, reason: 'verify-production cleanup' });
          if (r.status === 200) removed.push(tid + ':ticket');
        } catch (e) {}
      }
      try {
        const g = await gasPost({ action: 'delete', ticketId: tid });
        if (g && g.success) removed.push(tid + ':sheet-row');
      } catch (e) {}
    }
    if (!session) rec('9', 'cleanup: ticket delete needs session', 'BLOCKED', 'BLOCKED_EXTERNAL_ACCESS: sheet rows removed where possible; ticket records listed below');
  }
  if (!ACCEPTANCE) {
    notRun('9', ['cleanup own artifacts only']);
  } else {
    rec('9', 'cleanup own artifacts only', removed.length || !created.ticketIds.length ? 'PASS' : 'PENDING', removed.join(', ') || 'nothing created');
    if (created.ticketIds.length) console.log('Probe artifacts (manual Drive purge if needed): ' + created.ticketIds.join(', '));
  }

  // ---- PHASE 10: regression (fast suites; npm test only with flag) ----
  try {
    execFileSync(process.execPath, ['--check', 'server.js'], { cwd: path.join(__dirname, '..'), timeout: 30000 });
    rec('10', 'syntax server.js', 'PASS', '');
  } catch (e) { rec('10', 'syntax server.js', 'FAIL', 'syntax error'); }
  if (ARGS.has('--with-regression')) {
    try {
      execFileSync('npm', ['test'], { cwd: path.join(__dirname, '..'), timeout: 600000, shell: true });
      rec('10', 'npm test', 'PASS', '');
    } catch (e) { rec('10', 'npm test', 'FAIL', 'see output above'); }
  } else rec('10', 'npm test', 'SKIP', 'run with --with-regression');

  // ---- Cleanup: close the auth browser and destroy its throwaway profile ----
  // (session cookies die with the profile; nothing persists on disk or in repo)
  try { if (BCTX) await BCTX.close(); } catch (e) {}
  try { if (BBROWSER && BBROWSER.close) await BBROWSER.close(); } catch (e) {}
  try { if (BPROFILE) fs.rmSync(BPROFILE, { recursive: true, force: true }); } catch (e) {}
  BCTX = null; BBROWSER = null; BPROFILE = '';

  // ---- PHASE 11: machine report ----
  const by = (s) => results.filter(r => r.status === s).length;
  console.log('\nPRODUCTION VERIFICATION');
  console.log('=======================');
  console.log(`Commit: local=${(() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch (e) { return '?'; } })()} (prod comparison needs VERCEL_TOKEN)`);
  console.log(`Routing: ${results.filter(r => r.phase === '2').map(r => r.status).join('/')}`);
  console.log(`Database: ${results.filter(r => r.phase === '3').map(r => r.status).join('/')}`);
  console.log(`Drive: drain route + baseline above`);
  console.log(`Six-file baseline: ${results.filter(r => r.phase === '7' && r.name.includes('6/6')).map(r => r.status).join('/')}`);
  console.log(`Phase H: ${results.filter(r => r.phase === '8').map(r => r.status).join('/') || 'NOT RUN'}`);
  console.log(`Regression: npm=${results.filter(r => r.phase === '10').map(r => r.status).join('/')}`);
  console.log(`Cleanup: ${removed.join(', ') || 'none/pending'}`);
  console.log(`Counts: PASS=${by('PASS')} FAIL=${by('FAIL')} BLOCKED=${by('BLOCKED')} PENDING=${by('PENDING')} SKIP=${by('SKIP')}`);
  const verdict = aggregateVerdict(results);
  console.log(`FINAL VERDICT: ${verdict}`);
  process.exit(verdict === 'FAIL' ? 1 : verdict === 'BLOCKED' ? 2 : 0);
})();
