/**
 * REGRESSION SUITE: durable completion storage + scheduled drain (A-Z matrix).
 *
 * Covers: PG byte persistence contracts, cold-start reconstruction, sync-first
 * submit, cron auth/bounds/idempotency, slot isolation, delete non-resurrection.
 * Live suites (delete-persistence, routing, sync, npm) run separately.
 *
 * Server-handler tests invoke the REAL handleRequest() with faithful request
 * shapes (same harness style as tests/vercel-routing.test.js). No network GAS
 * dependency for cron tests (empty queue drains instantly).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');

class FakeReq extends EventEmitter {
  constructor({ method = 'GET', url = '/', headers = {}, body = null }) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: '127.0.0.1', ...headers };
    this.socket = { remoteAddress: '127.0.0.1' };
    this._body = body;
  }
  start() {
    if (this._body !== null && (this.method === 'POST' || this.method === 'PUT')) {
      const buf = Buffer.from(this._body);
      setImmediate(() => this.emit('data', buf));
      setImmediate(() => this.emit('end'));
    }
  }
}
class FakeRes {
  constructor() {
    this.headers = {};
    this.statusCode = null;
    this.body = '';
    this.ended = false;
  }
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }
  getHeader(k) { return this.headers[String(k).toLowerCase()]; }
  writeHead(code, h) {
    this.statusCode = code;
    if (h) for (const k of Object.keys(h)) this.setHeader(k, h[k]);
  }
  end(chunk) {
    if (chunk) this.body += chunk.toString();
    if (this.statusCode === null) this.statusCode = 200;
    this.ended = true;
    if (this._done) this._done();
  }
}

const server = require('../server.js');
function callHandle({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new FakeReq({ method, url, headers, body });
    const res = new FakeRes();
    const timer = setTimeout(() => reject(new Error('timeout for ' + method + ' ' + url)), 90000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(
        () => { console.log(`✅ [PASS] ${name}`); passed++; },
        (e) => { console.error(`❌ [FAIL] ${name}`); console.error(`   Error: ${(e && e.message) || e}`); failed++; }
      ));
    } else { console.log(`✅ [PASS] ${name}`); passed++; }
  } catch (e) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${e.message}`);
    failed++;
  }
}

(async () => {
  // A-C. PG completion byte persistence contracts (columns exist; writes wired; slot-independent).
  test('A. PG update persists HM base64 (empty-means-preserve)', () => {
    assert(dbSrc.includes('hm_report_photo_base64 = $37'), 'UPDATE must write hm_report_photo_base64');
    assert(dbSrc.includes('let newHmB64'), 'must compute preserved HM bytes');
  });
  test('B. PG update persists GPS base64', () => {
    assert(dbSrc.includes('completion_photo_base64 = $38'), 'UPDATE must write completion_photo_base64');
  });
  test('C. Slots persisted independently (no cross overwrite)', () => {
    assert(dbSrc.includes('nestedHmData') && dbSrc.includes('nestedCompData'), 'nested .data fallback per slot');
    const i = dbSrc.indexOf('let newHmB64');
    assert(i !== -1 && dbSrc.slice(i, i + 900).includes('newCompB64'), 'both computed side by side');
  });

  // D. Cold-start reconstruction reads durable columns (code path present).
  test('D. Retry plan reads durable ticket columns (top-level + nested .data)', () => {
    assert(serverSrc.includes('dataUrlOrEmpty(t.hmReportPhotoBase64 || hm.data)'), 'HM bytes from durable record');
    assert(serverSrc.includes('dataUrlOrEmpty(t.completionPhotoBase64 || comp.data)'), 'GPS bytes from durable record');
  });

  // E-G. Sync-first submit contracts.
  test('E-F. Serverless submit attempts inline sync within budget', () => {
    assert(serverSrc.includes('syncCompletionEvidenceToGoogleDrive(targetTicket, {'), 'inline attempt present');
    assert(serverSrc.includes('}, 45000)'), 'inline attempt bounded to 45s budget');
    assert(serverSrc.includes('isCompletionRetrySuccess(inline,'), 'inline result ID-gated');
  });
  test('G. Inline failure queues durable retry + honest pending', () => {
    const i = serverSrc.indexOf('Serverless sync-first');
    assert(i !== -1, 'sync-first block present');
    const block = serverSrc.slice(i, i + 1400);
    assert(block.includes('enqueueDriveRetry(ticketId,'), 'failure path enqueues');
  });

  // Cron endpoint: auth matrix (no secret in repo, no network GAS needed for empty queue).
  test('Cron auth: anonymous GET -> 401', async () => {
    const res = await callHandle({ url: '/api/admin/drive-drain' });
    assert.strictEqual(res.statusCode, 401, 'expected 401, got ' + res.statusCode);
  });
  test('Cron auth: wrong secret -> 401', async () => {
    const res = await callHandle({ url: '/api/admin/drive-drain?secret=nope-wrong' });
    assert.strictEqual(res.statusCode, 401, 'expected 401, got ' + res.statusCode);
  });
  test('Cron auth: Vercel-Cron UA drains bounded (idempotent, empty queue)', async () => {
    const res = await callHandle({ url: '/api/admin/drive-drain', headers: { 'user-agent': 'vercel-cron/1.0' } });
    assert.strictEqual(res.statusCode, 200, 'expected 200, got ' + res.statusCode + ' ' + res.body.slice(0, 120));
    const d = JSON.parse(res.body);
    assert.strictEqual(d.success, true);
    assert.strictEqual(d.bounded, true);
  });
  test('Cron bounds: immediate second UA call -> 429 (interval enforced)', async () => {
    const res = await callHandle({ url: '/api/admin/drive-drain', headers: { 'user-agent': 'vercel-cron/1.0' } });
    assert.strictEqual(res.statusCode, 429, 'expected 429, got ' + res.statusCode);
  });
  test('Cron auth: Bearer secret works when CRON_SECRET set', async () => {
    process.env.CRON_SECRET = 'test-secret-123';
    try {
      const res = await callHandle({ url: '/api/admin/drive-drain', headers: { authorization: 'Bearer test-secret-123' } });
      assert.strictEqual(res.statusCode, 200, 'expected 200, got ' + res.statusCode);
      const d = JSON.parse(res.body);
      assert.strictEqual(d.via, 'secret');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
  test('Cron bounds wired: maxEntries/maxMs + no secret leakage', () => {
    assert(serverSrc.includes('maxEntries: 5, maxMs: 50000'), 'bounded drain params');
    assert(serverSrc.includes('processDriveRetryQueue(true, { maxEntries'), 'drain reuses retry logic');
    // responses carry counts only — never echo the secret or its comparison variables
    const i = serverSrc.indexOf('/api/admin/drive-drain');
    const block = serverSrc.slice(i, i + 2800);
    const ends = [...block.matchAll(/res\.end\(JSON\.stringify\(([\s\S]*?)\)\);/g)].map(m => m[1]);
    assert(ends.length >= 3, 'expected drain responses present');
    ends.forEach((payload, k) => {
      // Ternary on the local `expected` flag is fine (boolean logic, value never
      // serialized). Forbid echoing the supplied secret, env reads, or buffers.
      const codeOnly = payload.replace(/'[^']*'/g, '');
      assert(!/provided|CRON_SECRET|process\.env|Buffer\.from/i.test(codeOnly),
        'drain response ' + k + ' must not echo secret material: ' + payload.slice(0, 100));
    });
  });

  // vercel.json cron present, routing fix intact.
  test('Vercel cron scheduled every 5 min; rewrite fix intact', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    const cron = (cfg.crons || []).find(c => c.path === '/api/admin/drive-drain');
    assert(cron, 'cron entry missing');
    assert.strictEqual(cron.schedule, '*/5 * * * *');
    const rw = (cfg.rewrites || []).find(r => r.source === '/(.*)');
    assert(rw && rw.destination.includes('__orig=/$1'), 'routing rewrite must stay intact');
  });

  // U-W: delete path clears PG bytes (no retry resurrection) — contract level.
  test('U-W. Delete clears PG base64 columns (retry cannot resurrect)', () => {
    assert(dbSrc.includes('hm_report_photo_base64 = \'\''), 'Slot 1 delete must clear HM bytes');
    assert(dbSrc.includes('completion_photo_base64 = \'\''), 'Slot 2 delete must clear GPS bytes');
  });
  test('Empty-means-preserve intact for normal updates', () => {
    assert(dbSrc.includes('existing.hm_report_photo_base64'), 'preserve existing HM bytes');
    assert(dbSrc.includes('existing.completion_photo_base64'), 'preserve existing GPS bytes');
  });

  // L-Q: slot isolation + folders/names untouched (contracts).
  test('L-Q. Slot isolation, folders, canonical names unchanged', () => {
    const gas = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');
    assert(gas.includes("HM_Signed_Completion_Report.jpg") && gas.includes("Completion_UPS_GPS.jpg"), 'canonical names');
    assert(gas.includes('STRICT SLOT ISOLATION') || gas.includes('Strict slot'), 'slot isolation markers');
    assert(serverSrc.includes('deleteCompletionEvidenceFromGoogleDrive(targetTicket, slot, driveFileId)'), 'delete path unchanged');
    assert(serverSrc.includes('gasBody.hmDriveFileId = driveFileId'), 'slot-specific delete payload unchanged');
  });

  await Promise.all(pending);
  console.log('\n======================================================================');
  console.log(`📊 DURABLE-DRAIN RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR: ' + (e && e.message)); process.exit(2); });
