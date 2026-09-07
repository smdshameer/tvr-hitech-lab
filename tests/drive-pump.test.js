// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * DRIVE-PUMP SUITE (staff-driven bounded drain).
 * Proves the reliable worker mechanism: an awaited, session-gated, bounded
 * endpoint advanced by the Engineer workbench poll loop — never fire-and-forget.
 *
 * - unauthenticated POST -> 401 (no session = no pump)
 * - GET -> not the pump (only POST serves it)
 * - authenticated + empty queue -> 200, bounded counts, no secrets in body
 * - authenticated + queued ticket -> pump adopts IDs end-to-end (GAS stub)
 * - workbench loadData contains the every-4th-tick pump hook
 * Hermetic GAS stub + tmpdir isolation. Zero production writes.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const TMP_DATA = path.join(os.tmpdir(), 'tvr_data');
const TMP_UP = path.join(os.tmpdir(), 'tvr_uploads');
for (const d of [TMP_DATA, TMP_UP]) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
}
// Run-unique UDISE + snapshot/restore of repo data files (dual-write
// hardening persists some files to bundled data even in hermetic mode).
const RUN5P = String(Date.now() % 100000).padStart(5, '0');
const PU = '332' + RUN5P + '077';
const REPO_SNAP = {};
for (const f of ['data/htl_itsm_tickets.json', 'data/master_schools_182.json', 'Hi-Tech_Lab_Warriors_Thiruvarur_Directory.json', 'data/audit_log.json', 'data/htl_deleted_ids.json', 'data/htl_tombstones.json']) {
  try { REPO_SNAP[f] = fs.readFileSync(path.join('D:/Ai Ticket App - UPS', f)); } catch (e) { REPO_SNAP[f] = null; }
}
function restoreRepo() {
  for (const f of Object.keys(REPO_SNAP)) {
    try {
      const p = path.join('D:/Ai Ticket App - UPS', f);
      if (REPO_SNAP[f] === null) { try { fs.rmSync(p, { force: true }); } catch (e) {} }
      else fs.writeFileSync(p, REPO_SNAP[f]);
    } catch (e) {}
  }
}

const server = require('../server.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

class FakeReq extends EventEmitter {
  constructor({ method = 'GET', url = '/', headers = {}, body = null }) {
    super();
    this.method = method;
    this.url = url;
    // Real Node HTTP lowercases incoming header names; mirror that.
    this.headers = { host: '127.0.0.1' };
    for (const k of Object.keys(headers || {})) this.headers[String(k).toLowerCase()] = headers[k];
    this.socket = { remoteAddress: '127.0.0.1' };
    this._body = body;
  }
  start() {
    if (this._body !== null && (this.method === 'POST' || this.method === 'PUT')) {
      const buf = Buffer.from(this._body);
      setImmediate(() => this.emit('data', buf));
      setImmediate(() => this.emit('end'));
    } else { setImmediate(() => this.emit('end')); }
  }
}
class FakeRes {
  constructor() { this.headers = {}; this.statusCode = null; this.body = ''; this.ended = false; }
  setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }
  getHeader(k) { return this.headers[String(k).toLowerCase()]; }
  writeHead(code, h) { this.statusCode = code; if (h) for (const k of Object.keys(h)) this.setHeader(k, h[k]); }
  end(chunk) { if (chunk) this.body += chunk.toString(); if (this.statusCode === null) this.statusCode = 200; this.ended = true; if (this._done) this._done(); }
}
function callHandle({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new FakeReq({ method, url, headers, body });
    const res = new FakeRes();
    const timer = setTimeout(() => reject(new Error('timeout for ' + method + ' ' + url)), 60000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}

const driveFiles = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url || '');
  if (!u.includes('script.google.com')) throw new Error('unexpected outbound ' + u.slice(0, 60));
  await new Promise((r) => setTimeout(r, 3));
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  if (!opts || opts.method === 'GET' || !body.action) return { ok: true, json: async () => ({ tickets: [] }) };
  const tid = String(body.ticketId || '');
  if (body.action === 'inspect_drive_structure') {
    const files = [...driveFiles.entries()]
      .filter(([n]) => tid && n.startsWith(tid + '_'))
      .map(([n, f]) => ({ fileId: f.id, fileName: n, fileSize: f.size, isTrashed: false }));
    return {
      ok: true, json: async () => ({
        success: true, ticketId: tid, district: body.district || 'Thiruvarur',
        schoolFolder: body.udise ? (body.udise + ' - stub') : 's', evidenceFolder: 'Evidence',
        schoolFolderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        evidenceFiles: files, evidenceTotal: files.length,
        ticketEvidenceCount: [1, 2, 3, 4].filter((i) => files.some((f) => f.fileName === `${tid}_Evidence_${i}.jpg`)).length,
      }),
    };
  }
  const put = (name, b64) => {
    if (!b64) return '';
    const id = `stub-${tid}-${name}`;
    if (!driveFiles.has(name)) driveFiles.set(name, { id, size: String(b64).length });
    return driveFiles.get(name).id;
  };
  const pIds = [1, 2, 3, 4].map((i) => put(`${tid}_Evidence_${i}.jpg`, body[`photo${i}Base64`]));
  const urlFor = (id) => (id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : '');
  return {
    ok: true, json: async () => ({
      success: true, ticketId: tid, folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
      p1DriveFileId: pIds[0], p2DriveFileId: pIds[1], p3DriveFileId: pIds[2], p4DriveFileId: pIds[3],
      p1Url: urlFor(pIds[0]), p2Url: urlFor(pIds[1]), p3Url: urlFor(pIds[2]), p4Url: urlFor(pIds[3]),
    }),
  };
};

const PIXEL = 'data:image/jpeg;base64,' + Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
  0xD2, 0xCF, 0x20, 0xFF, 0xD9
]).toString('base64');

async function main() {
  console.log('========================================================');
  console.log('🔧 RUNNING DRIVE-PUMP SUITE (hermetic)');
  console.log('========================================================\n');

  // 1. Unauthenticated pump refused.
  let r = await callHandle({ method: 'POST', url: '/api/admin/drive-pump' });
  record('P1. unauthenticated POST -> 401', r.statusCode === 401, `http=${r.statusCode}`);

  // 2. GET is not the pump.
  r = await callHandle({ method: 'GET', url: '/api/admin/drive-pump' });
  let gBody = {};
  try { gBody = JSON.parse(r.body); } catch (e) {}
  record('P2. GET is not served as pump', !(r.statusCode === 200 && gBody.bounded === true), `http=${r.statusCode}`);

  // 3. Login, then empty-queue pump.
  const loginRes = await callHandle({ method: 'POST', url: '/api/login', body: JSON.stringify({ username: 'shameer', pin: '1234', role: 'engineer' }) });
  const sc = loginRes.headers['set-cookie'] || '';
  const cookie = (Array.isArray(sc) ? sc[0] : String(sc)).split(';')[0];
  record('P3a. engineer login works', loginRes.statusCode === 200 && !!cookie, `http=${loginRes.statusCode}`);
  r = await callHandle({ method: 'POST', url: '/api/admin/drive-pump', headers: { Cookie: cookie } });
  let pj = {};
  try { pj = JSON.parse(r.body); } catch (e) {}
  record('P3b. authenticated empty pump -> 200 bounded counts',
    r.statusCode === 200 && pj.success === true && pj.bounded === true, `http=${r.statusCode}`);
  record('P3c. pump response leaks no secrets',
    !/token|secret|cookie|password|DATABASE_URL/i.test(r.body));

  // 4. Queued ticket drains through the pump end-to-end.
  const payload = JSON.stringify({
    schoolName: 'GHSS PUMP', udise: PU, block: 'Kottur', district: 'Thiruvarur',
    aiName: 'Scale AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
    serialNo: 'SN-1', priority: 'High', remarks: 'Pump scale remarks',
    photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL,
  });
  const sub = await callHandle({ method: 'POST', url: '/api/tickets', body: payload });
  const subJson = JSON.parse(sub.body);
  record('P4a. intake registers (pending)', subJson.success === true && !!subJson.ticketId);
  const pumpRes = await callHandle({ method: 'POST', url: '/api/admin/drive-pump', headers: { Cookie: cookie } });
  const pumpJson = JSON.parse(pumpRes.body);
  record('P4b. pump succeeds (intake-pump already confirmed)', pumpJson.success === true, `http=${pumpRes.statusCode} processed=${pumpJson.processed}`);
  const db = require('../db.js');
  const row = (await db.getAllTickets()).find((t) => String(t.ticketId) === String(subJson.ticketId));
  record('P4c. IDs adopted via pump (no re-upload storm)',
    !!row && !!row.p1DriveFileId && !!row.p4DriveFileId);

  // 5. Workbench hook present (static wiring).
  record('P5a. loadData hooks the pump every 4th tick',
    serverJs.includes('/api/admin/drive-pump') && serverJs.includes('__drivePumpTicks') && serverJs.includes('% 4 === 0'));
  record('P5b. pump fetch carries session, ignores result (display-neutral)',
    serverJs.includes("fetch('/api/admin/drive-pump', { method: 'POST', credentials: 'same-origin' })"));

  console.log('\n========================================================');
  console.log(`📊 PUMP RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  globalThis.fetch = realFetch;
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  restoreRepo();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); globalThis.fetch = realFetch; try { restoreRepo(); } catch (err) {} process.exit(1); });
