#!/usr/bin/env node
/**
 * gas-processes.js — READ-ONLY Apps Script execution-history query via the
 * official Apps Script API (processes.list / processes.listScriptProcesses).
 *
 * Usage:
 *   node scripts/gas-processes.js --describe
 *     Offline capability brief: method, scope, filters, fields, and what the
 *     API can and cannot prove. No network, no token.
 *   node scripts/gas-processes.js --self-test
 *     Offline safety proof (arg parsing, Sep-5 window math, redaction,
 *     fail-closed refusal without token). No network.
 *   node scripts/gas-processes.js --query --script-id <ID> [--date YYYY-MM-DD]
 *     Live read-only query. Requires GAS_OAUTH_TOKEN in the environment
 *     (Bearer token with scope https://www.googleapis.com/auth/script.processes).
 *     The token is NEVER printed, logged, or written anywhere. Without it the
 *     tool refuses (exit 2) and prints the authorization gate instructions.
 *
 * Capability limits (per official API reference — decisive for KI-001):
 * - Process resources carry projectName/functionName/processType/processStatus/
 *   userAccessLevel/startTime/duration ONLY.
 * - NO function arguments, NO ticket IDs, NO Drive folder/file IDs, NO logs.
 *   => The API can prove timing/count/overlap/status (mechanisms A/B/G/F-partial)
 *      but CANNOT prove folder/file-ID mechanisms (C/D/E) or ticket linkage.
 * - Logger output would need Cloud Logging API + a linked GCP project (unknown
 *   whether the production script has one) — a SECOND, separate gate.
 *
 * HARD RULES: GET only. No cookie/storage/secret reads. Token from env only.
 * Raw responses stay in OS temp, never the repo. Redact before printing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const API_BASE = 'https://script.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/script.processes';

function parseArgs(argv) {
  const out = { describe: false, selfTest: false, query: false, scriptId: '', date: '2026-09-05', functionName: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (k) => (String(argv[i]).startsWith(k + '=') ? String(argv[i]).slice(k.length + 1) : argv[++i]);
    if (a === '--describe') out.describe = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--query') out.query = true;
    else if (a.startsWith('--script-id')) out.scriptId = val('--script-id') || '';
    else if (a.startsWith('--date')) out.date = val('--date') || out.date;
    else if (a.startsWith('--function')) out.functionName = val('--function') || '';
  }
  return out;
}

function redact(s) {
  return String(s || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[\w-]+/g, '[TOKEN REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]');
}

// IST calendar date -> UTC window (IST = UTC+05:30). Pure, unit-tested.
function dayWindowUtc(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - (5 * 60 + 30) * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function resolveToken() {
  const t = process.env.GAS_OAUTH_TOKEN || '';
  return t.trim() ? t.trim() : null;
}

function gateInstructions() {
  return [
    'AUTHORIZATION GATE (unavoidable, human ceremony required):',
    '1. In Google Cloud Console (script owner account): create/select a project,',
    '   enable "Apps Script API", create OAuth client (Desktop), add scope:',
    '   ' + SCOPE,
    '2. Complete the OAuth consent flow for the script OWNER account and obtain',
    '   an access token (short-lived; never paste it into chat/logs/files).',
    '3. Run with the token in process env only: GAS_OAUTH_TOKEN=<token> npm run gas:processes -- --query ...',
    'This tool never stores, prints, or transmits the token except as the',
    'Authorization header back to script.googleapis.com over HTTPS.',
  ].join('\n');
}

function describe() {
  console.log([
    '=== GAS PROCESSES API — CAPABILITY BRIEF (offline, no token, no network) ===',
    'METHOD  GET ' + API_BASE + '/processes  (processes.list)  |  per-script: .../processes:listScriptProcesses',
    'SCOPE   ' + SCOPE,
    'FILTERS scriptId, deploymentId, projectName, functionName, startTime/endTime (RFC3339), types, statuses (page size 50)',
    'FIELDS  projectName, functionName, processType, processStatus, userAccessLevel, startTime, duration — NOTHING ELSE',
    'PROVES  timing, counts, overlap/concurrency, statuses, durations, deployment presence (KI-001 mechanisms A/B/G/F-partial)',
    'MISSING ticket IDs, Drive folder/file IDs, function arguments, Logger output (KI-001 mechanisms C/D/E need more)',
    'NOTE    Logger output needs Cloud Logging API + linked GCP project (linkage UNKNOWN) — second gate, not attempted here.',
  ].join('\n'));
}

async function selfTest() {
  console.log('GAS-PROCESSES SELF-TEST (offline)');
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`✅ [self-test] ${name}: PASS`); pass++; }
    else { console.log(`❌ [self-test] ${name}: FAIL`); fail++; }
  };
  const src = fs.readFileSync(__filename, 'utf8');
  const forbidden = ['docu' + 'ment.co' + 'okie', 'cont' + 'ext.coo' + 'kies(',
    '.coo' + 'kies(', 'stor' + 'ageSt' + 'ate(', 'localSto' + 'rage', 'sessionSto' + 'rage'];
  check('no cookie/storage APIs in source', forbidden.every((p) => !src.includes(p)));
  check('arg parsing --script-id', parseArgs(['--script-id', 'ABC']).scriptId === 'ABC');
  check('Sep-5 window math (IST->UTC)', (() => {
    const w = dayWindowUtc('2026-09-05');
    return w && w.startTime === '2026-09-04T18:30:00.000Z' && w.endTime === '2026-09-05T18:30:00.000Z';
  })());
  check('bad date rejected', dayWindowUtc('oops') === null);
  check('fail-closed without token', (() => {
    const saved = process.env.GAS_OAUTH_TOKEN;
    delete process.env.GAS_OAUTH_TOKEN;
    const r = resolveToken() === null;
    if (saved !== undefined) process.env.GAS_OAUTH_TOKEN = saved;
    return r;
  })());
  check('redact strips bearer + token', (() => {
    const o = redact('Authorization: Bearer ya29.abc123 x');
    return !o.includes('abc123') && o.includes('[REDACTED]');
  })());
  check('GET-only design (no POST/PUT/DELETE literals for API)', !/fetch\([^)]*,\s*\{[^}]*method:\s*['\"](POST|PUT|DELETE|PATCH)/.test(src));
  console.log(`SELF-TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

async function apiGet(urlPath, token) {
  const r = await fetch(API_BASE + urlPath, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(45000),
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error('Apps Script API HTTP ' + r.status);
    e.body = redact(text).slice(0, 300);
    throw e;
  }
  return JSON.parse(text);
}

function summarizeProcesses(processes, q) {
  const rows = Array.isArray(processes) ? processes : [];
  const by = (re) => rows.filter((p) => re.test(String((p && p.functionName) || '')));
  const doPosts = by(/^doPost$/i);
  const updates = by(/updateTicketRow/i);
  const failed = rows.filter((p) => !/^COMPLETED$/i.test(String((p && p.processStatus) || '')));
  // Overlap: any two executions whose [start, start+duration] intersect.
  const ts = (p) => Date.parse(String(p.startTime || ''));
  const durMs = (p) => {
    const m = /^([\d.]+)s$/.exec(String(p.duration || ''));
    return m ? Math.round(parseFloat(m[1]) * 1000) : 0;
  };
  const overlaps = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a0 = ts(rows[i]); const a1 = a0 + durMs(rows[i]);
      const b0 = ts(rows[j]); const b1 = b0 + durMs(rows[j]);
      if (Number.isFinite(a0) && Number.isFinite(b0) && a0 < b1 && b0 < a1) {
        overlaps.push({ i, j, a: rows[i].functionName + '@' + rows[i].startTime, b: rows[j].functionName + '@' + rows[j].startTime });
        if (overlaps.length >= 20) break;
      }
    }
    if (overlaps.length >= 20) break;
  }
  return { total: rows.length, doPosts, updates, failed, overlaps };
}

(async () => {
  const q = parseArgs(process.argv.slice(2));
  if (q.describe) { describe(); return; }
  if (q.selfTest) { await selfTest(); return; }
  if (!q.query) {
    console.error('Usage: npm run gas:processes -- --describe | --self-test | --query --script-id <ID> [--date YYYY-MM-DD]');
    process.exit(2);
  }
  const token = resolveToken();
  if (!token) {
    console.log('AUTH: BLOCKED — no GAS_OAUTH_TOKEN in environment. No network call made.');
    console.log(gateInstructions());
    process.exit(2);
  }
  const w = dayWindowUtc(q.date);
  if (!w) { console.error('Bad --date (expected YYYY-MM-DD)'); process.exit(2); }
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-processes-run-'));
  try {
    let url = '/processes?pageSize=50'
      + '&userProcessFilter.startTime=' + encodeURIComponent(w.startTime)
      + '&userProcessFilter.endTime=' + encodeURIComponent(w.endTime);
    if (q.scriptId) url += '&userProcessFilter.scriptId=' + encodeURIComponent(q.scriptId);
    if (q.functionName) url += '&userProcessFilter.functionName=' + encodeURIComponent(q.functionName);
    const all = [];
    let pageToken = '';
    for (let pages = 0; pages < 20; pages++) {
      const data = await apiGet(url + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), token);
      if (Array.isArray(data.processes)) all.push(...data.processes);
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    fs.writeFileSync(path.join(runDir, 'processes.json'), JSON.stringify({ query: { date: q.date, window: w }, count: all.length, processes: all }, null, 2));
    const s = summarizeProcesses(all, q);
    console.log('=== GAS PROCESSES (read-only API) ===');
    console.log(`WINDOW ${w.startTime} .. ${w.endTime}  TOTAL=${s.total}`);
    console.log(`doPost=${s.doPosts.length} updateTicketRow=${s.updates.length} nonCompleted=${s.failed.length} overlaps=${s.overlaps.length}`);
    s.failed.slice(0, 10).forEach((p) => console.log('NON-OK ' + p.functionName + ' ' + p.startTime + ' ' + p.processStatus + ' ' + (p.duration || '')));
    s.overlaps.slice(0, 10).forEach((o) => console.log('OVERLAP ' + o.a + '  ||  ' + o.b));
    console.log('Raw: ' + path.join(runDir, 'processes.json'));
    console.log('LIMIT: no ticket/file IDs in Process resources — C/D/E need logs (Cloud Logging gate).');
    console.log('FINAL SAFETY: probes=0 driveWrites=0 sheetsWrites=0 deletes=0 gasChanges=0 appChanges=0 commits=0 pushes=0 deploys=0 secrets=0');
  } catch (e) {
    console.log('QUERY: FAIL — ' + redact(e.message).slice(0, 160));
    if (e.body) console.log('DETAIL ' + e.body);
    process.exit(1);
  }
})();
