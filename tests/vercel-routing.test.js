/**
 * REGRESSION SUITE: Vercel API pathname routing.
 *
 * Root cause (prod): vercel.json rewrites EVERYTHING to /api/index.js and the
 * serverless function receives the rewritten destination path, so
 * handleRequest() resolved "/" and served Teacher HTML for ALL routes
 * (including /engineer, /login and every /api/* endpoint).
 *
 * Fix: the rewrite embeds the original path (?__orig=/$1); handleRequest()
 * recovers it ONLY when the request arrived via the rewrite destination.
 * Local/direct behavior is unchanged.
 *
 * This suite invokes the REAL handleRequest() with faithful request shapes:
 *  - masked  = what Vercel sends (/api/index.js?__orig=<original>)
 *  - direct  = local server shape (original req.url)
 * For every /api/* case it asserts JSON content-type + structure and
 * explicitly fails on Teacher Portal HTML fallback.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

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
      setImmediate(() => { this.emit('data', buf.slice(0, Math.ceil(buf.length / 2))); });
      setImmediate(() => { this.emit('data', buf.slice(Math.ceil(buf.length / 2))); });
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
const TEACHER_MARK = 'schoolSearchInput';

function callHandle({ method = 'GET', url = '/', body = null }) {
  return new Promise((resolve, reject) => {
    const req = new FakeReq({ method, url, body });
    const res = new FakeRes();
    const timer = setTimeout(() => reject(new Error('handleRequest timeout for ' + method + ' ' + url)), 60000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}
function isJson(res) {
  return String(res.headers['content-type'] || '').includes('application/json');
}
function notTeacher(res, what) {
  assert(!res.body.includes(TEACHER_MARK), what + ': got Teacher Portal HTML fallback');
}
function isTeacher(res, what) {
  assert(res.body.includes(TEACHER_MARK), what + ': expected Teacher Portal HTML');
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
  // 0. Config contract: catch-all rewrite must embed the original path.
  test('0. vercel.json embeds original path (?__orig=/$1)', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    const rw = (cfg.rewrites || []).find(r => r.source === '/(.*)');
    assert(rw, 'catch-all rewrite missing');
    assert(rw.destination.includes('__orig=/$1'), 'destination must embed ?__orig=/$1, got: ' + rw.destination);
  });

  // 1. Masked /api/version -> JSON (would be Teacher HTML on the bug).
  test('1. masked GET /api/version returns JSON, not Teacher HTML', async () => {
    const res = await callHandle({ url: '/api/index.js?__orig=/api/version' });
    assert(isJson(res), 'content-type must be JSON, got: ' + res.headers['content-type']);
    notTeacher(res, '/api/version');
    const d = JSON.parse(res.body);
    assert(typeof d.ticketsCount === 'number', 'expected ticketsCount in ' + Object.keys(d).join(','));
  });

  // 2. Masked /api/diag -> JSON with counts.
  test('2. masked GET /api/diag returns JSON counts', async () => {
    const res = await callHandle({ url: '/api/index.js?__orig=/api/diag' });
    assert(isJson(res), 'content-type must be JSON');
    notTeacher(res, '/api/diag');
    const d = JSON.parse(res.body);
    assert(typeof d.getAllCount === 'number' && Array.isArray(d.getAllIds), 'expected getAllCount/getAllIds');
  });

  // 3. Masked / -> Teacher HTML (pages still work).
  test('3. masked GET / returns Teacher Portal HTML', async () => {
    const res = await callHandle({ url: '/api/index.js?__orig=/' });
    assert.strictEqual(res.statusCode, 200);
    isTeacher(res, 'GET /');
  });

  // 4. Masked /engineer without session -> 302 login (page distinction, NOT teacher fallback).
  test('4. masked GET /engineer without session redirects to /login', async () => {
    const res = await callHandle({ url: '/api/index.js?__orig=/engineer' });
    assert.strictEqual(res.statusCode, 302, 'expected 302, got ' + res.statusCode);
    assert(String(res.headers.location || '').includes('/login'), 'must redirect to /login');
    notTeacher(res, '/engineer');
  });

  // 5. Masked /api/data without session -> 401 JSON (not HTML).
  test('5. masked GET /api/data without session returns 401 JSON', async () => {
    const res = await callHandle({ url: '/api/index.js?__orig=/api/data' });
    assert.strictEqual(res.statusCode, 401, 'expected 401, got ' + res.statusCode);
    assert(isJson(res), 'must be JSON');
    notTeacher(res, '/api/data');
  });

  // 6. Masked /api/data?track=<real ticket> -> JSON containing the ticket.
  test('6. masked GET /api/data?track=<ticket> returns ticket JSON', async () => {
    const all = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/htl_itsm_tickets.json'), 'utf8'));
    const t = all.find(x => x && x.ticketId && !/test|audit|tmp|mock/i.test(x.ticketId));
    assert(t, 'need a real ticket in local data');
    for (const url of [
      '/api/index.js?__orig=/api/data&track=' + encodeURIComponent(t.ticketId),
      '/api/index.js?track=' + encodeURIComponent(t.ticketId) + '&__orig=/api/data'
    ]) {
      const res = await callHandle({ url });
      assert.strictEqual(res.statusCode, 200, 'expected 200 for ' + url + ', got ' + res.statusCode);
      assert(isJson(res), 'must be JSON for ' + url);
      notTeacher(res, url);
      const d = JSON.parse(res.body);
      const ids = (d.tickets || []).map(x => x.ticketId);
      assert(ids.includes(t.ticketId), 'response must contain ' + t.ticketId + ' via ' + url);
    }
  });

  // 7. Masked POST /api/login -> JSON session response (not HTML).
  test('7. masked POST /api/login returns JSON (not Teacher HTML)', async () => {
    const res = await callHandle({
      method: 'POST',
      url: '/api/index.js?__orig=/api/login',
      body: JSON.stringify({ username: 'engineer', pin: '1234', role: 'engineer' })
    });
    assert(isJson(res), 'must be JSON, got: ' + res.headers['content-type']);
    notTeacher(res, 'POST /api/login');
    const d = JSON.parse(res.body);
    assert.strictEqual(d.success, true, 'login failed: ' + res.body.slice(0, 160));
    assert.strictEqual(d.role, 'Field Engineer');
  });

  // 8. Direct (local) shapes unchanged.
  test('8. direct GET /api/diag returns JSON (local behavior intact)', async () => {
    const res = await callHandle({ url: '/api/diag' });
    assert(isJson(res), 'must be JSON');
    notTeacher(res, 'direct /api/diag');
  });
  test('9. direct GET / returns Teacher HTML', async () => {
    const res = await callHandle({ url: '/' });
    isTeacher(res, 'direct /');
  });
  test('10. unknown paths still fall back to Teacher (not API)', async () => {
    for (const url of ['/nope-missing-xyz', '/api/index.js?__orig=/nope-missing-xyz']) {
      const res = await callHandle({ url });
      isTeacher(res, url);
    }
  });

  await Promise.all(pending);
  console.log('\n======================================================================');
  console.log(`📊 VERCEL-ROUTING RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR: ' + (e && e.message)); process.exit(2); });
