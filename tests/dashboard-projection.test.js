// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * DASHBOARD PROJECTION SUITE (metadata-first /api/data).
 * Mixed fixture through the REAL /api/data handler:
 *  1. legacy ticket with photo bytes (no IDs) ........... bytes KEPT
 *  2. unconfirmed ticket with photo bytes ............... bytes KEPT
 *  3. confirmed Drive-backed ticket (bytes + IDs) ....... bytes STRIPPED, IDs/URLs kept
 *  4. completion-confirmed ticket ....................... bytes gone, IDs/URLs kept
 *  5. legacy completion record (nested .data only) ...... nested bytes KEPT
 * Plus: explicit session-gated bytes path, shared-object safety (serving a
 * response never strips the store), UI field presence, payload-size reduction.
 * Hermetic + tmpdir isolation. Zero production writes. Nothing deleted from storage.
 */
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
const db = require('../db.js');

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

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url || '');
  if (!u.includes('script.google.com')) throw new Error('unexpected outbound ' + u.slice(0, 60));
  return { ok: true, json: async () => ({ tickets: [] }) };
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
const DURL = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
const RUN5 = String(Date.now() % 100000).padStart(5, '0');
const TID = (s) => `HTL-TVR-61${RUN5.slice(-2)}${s}`;
const UD = (s) => `33261${RUN5.slice(-2)}${s}`;
const base = (tid, udise) => ({
  ticketId: tid, udise, district: 'Thiruvarur', schoolName: 'GHSS PROJ', block: 'Kottur',
  aiName: 'Scale AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
  serialNo: 'SN-1', priority: 'High', remarks: 'Projection fixture', status: 'New / Under Review',
});

async function main() {
  console.log('========================================================');
  console.log('📊 RUNNING DASHBOARD PROJECTION SUITE (hermetic)');
  console.log('========================================================\n');

  // 1. legacy bytes-only ticket. 2. unconfirmed 4-photo ticket.
  const T1 = TID('01'), T2 = TID('02');
  await db.createTicket({ ...base(T1, UD('101')), photo1Url: PIXEL });
  await db.createTicket({ ...base(T2, UD('102')), photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL });
  // 3. confirmed Drive-backed (bytes still present + IDs + URLs). photo1Url
  // carries a LARGE synthetic payload so size reduction is measurable.
  const T3 = TID('03');
  const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(200000);
  await db.createTicket({
    ...base(T3, UD('103')), photo1Url: BIG, photo2Url: DURL('c3p2'), photo3Url: PIXEL, photo4Url: DURL('c3p4'),
    p1DriveFileId: 'c3p1', p2DriveFileId: 'c3p2', p3DriveFileId: 'c3p3', p4DriveFileId: 'c3p4',
    p1DriveUrl: DURL('c3p1'), p2DriveUrl: DURL('c3p2'), p3DriveUrl: DURL('c3p3'), p4DriveUrl: DURL('c3p4'),
    googleDriveFolderUrl: 'https://drive.google.com/drive/folders/c3folder',
  });
  // 4. completion-confirmed (intake photo already Drive-backed; completion
  // bytes cleared, IDs/URLs intact).
  const T4 = TID('04');
  await db.createTicket({
    ...base(T4, UD('104')), photo1Url: DURL('c4p1'), p1DriveFileId: 'c4p1',
    hmReportPhotoBase64: '', completionPhotoBase64: '',
    hmReportPhotoUrl: DURL('c4hm'), completionPhotoUrl: DURL('c4cp'),
    hmDriveFileId: 'c4hm', compDriveFileId: 'c4cp',
    completionEvidence: {
      hmSignedReport: { uploaded: true, data: '', fileUrl: DURL('c4hm'), driveFileId: 'c4hm' },
      completionPhoto: { uploaded: true, data: '', fileUrl: DURL('c4cp'), driveFileId: 'c4cp' },
    },
  });
  // 5. legacy completion record: nested .data is the ONLY copy.
  const T5 = TID('05');
  await db.createTicket({
    ...base(T5, UD('105')),
    completionEvidence: {
      hmSignedReport: { uploaded: true, data: PIXEL, fileUrl: '', driveFileId: '' },
      completionPhoto: { uploaded: false, data: '', fileUrl: '', driveFileId: '' },
    },
  });

  const loginRes = await callHandle({ method: 'POST', url: '/api/login', body: JSON.stringify({ username: 'shameer', pin: '1234', role: 'engineer' }) });
  const sc = loginRes.headers['set-cookie'] || '';
  const cookie = (Array.isArray(sc) ? sc[0] : String(sc)).split(';')[0];
  record('D0. engineer login works', loginRes.statusCode === 200 && !!cookie, `http=${loginRes.statusCode}`);

  const dataRes = await callHandle({ method: 'GET', url: '/api/data', headers: { Cookie: cookie } });
  const dataJson = JSON.parse(dataRes.body);
  const byId = {};
  for (const t of (dataJson.tickets || [])) byId[String(t.ticketId)] = t;
  const hasBytes = (t) => JSON.stringify(t).includes('data:image');
  const rawRows = await db.getAllTickets();
  const rawOf = (tid) => rawRows.find((t) => String(t.ticketId) === tid);

  record('D1. legacy bytes-only record passes through byte-identical',
    !!byId[T1] && byId[T1].photo1Url === PIXEL, 'photo1Url intact');
  record('D2. unconfirmed 4-photo record stays recoverable',
    !!byId[T2] && [1, 2, 3, 4].every((i) => byId[T2]['photo' + i + 'Url'] === PIXEL), '4/4 bytes intact');

  const c3 = byId[T3] || {};
  record('D3a. confirmed record carries no bulk bytes', !!byId[T3] && !hasBytes(c3));
  record('D3b. confirmed Drive IDs + URLs retained',
    c3.p1DriveFileId === 'c3p1' && c3.p4DriveFileId === 'c3p4' && c3.p1DriveUrl === DURL('c3p1')
    && c3.googleDriveFolderUrl === 'https://drive.google.com/drive/folders/c3folder');
  record('D3c. projection removes no keys (UI-required fields still present)',
    !!byId[T3] && ['ticketId', 'schoolName', 'udise', 'district', 'status', 'photo1Url', 'photo4Url'].every((k) => k in c3)
    && Object.keys(rawOf(T3) || {}).every((k) => k in c3) && c3.bytesStripped === true);

  const c4 = byId[T4] || {};
  record('D4. completion-confirmed: IDs/URLs intact, no bytes',
    c4.hmDriveFileId === 'c4hm' && c4.compDriveFileId === 'c4cp' && !hasBytes(c4));

  const c5 = byId[T5] || {};
  record('D5. legacy nested-only completion bytes preserved',
    !!byId[T5] && ((c5.completionEvidence || {}).hmSignedReport || {}).data === PIXEL, 'nested .data intact');

  // D6: explicit bytes path (session-gated).
  const fullRes = await callHandle({ method: 'GET', url: `/api/data?ticketId=${T2}&includeBytes=1`, headers: { Cookie: cookie } });
  const fullJson = JSON.parse(fullRes.body);
  record('D6a. explicit bytes path returns full record (session)',
    fullRes.statusCode === 200 && fullJson.bytesIncluded === true && (fullJson.ticket || {}).photo4Url === PIXEL);
  const anonRes = await callHandle({ method: 'GET', url: `/api/data?ticketId=${T2}&includeBytes=1` });
  record('D6b. explicit bytes path refuses anonymous', anonRes.statusCode === 401, `http=${anonRes.statusCode}`);

  // D7: payload-size reduction + store untouched.
  const rawLen = [T1, T2, T3, T4, T5].map((tid) => JSON.stringify(rawOf(tid) || {}).length).reduce((a, b) => a + b, 0);
  const projLen = [T1, T2, T3, T4, T5].map((tid) => JSON.stringify(byId[tid] || {}).length).reduce((a, b) => a + b, 0);
  const ratio = projLen / Math.max(1, rawLen);
  record('D7a. projected payload substantially smaller', ratio < 0.5, `${projLen}/${rawLen} = ${Math.round(ratio * 100)}%`);
  record('D7b. store still holds bytes (nothing deleted from storage)',
    [1, 2, 3, 4].every((i) => rawOf(T2)['photo' + i + 'Url'] === PIXEL)
    && rawOf(T3).photo1Url === BIG
    && ((rawOf(T5).completionEvidence || {}).hmSignedReport || {}).data === PIXEL);

  // D8: serving responses never strips shared in-memory objects (second read identical).
  const dataRes2 = await callHandle({ method: 'GET', url: '/api/data', headers: { Cookie: cookie } });
  const byId2 = {};
  for (const t of (JSON.parse(dataRes2.body).tickets || [])) byId2[String(t.ticketId)] = t;
  record('D8. repeated reads stable (no cache pollution)',
    (byId2[T2] || {}).photo1Url === PIXEL && !hasBytes(byId2[T3] || {}));

  console.log('\n========================================================');
  console.log(`📊 PROJECTION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  globalThis.fetch = realFetch;
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  restoreRepo();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); globalThis.fetch = realFetch; try { restoreRepo(); } catch (err) {} process.exit(1); });
