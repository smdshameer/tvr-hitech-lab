// PHASE 3 — REAL POSTGRESQL INTEGRATION (disposable LOCAL database only).
//
// Safety: aborts (exit 2, BLOCKED) unless the target URL is loopback AND the
// database name is test/disposable. NEVER points at production/Neon/Vercel.
// Mock boundary: ONLY the external GAS/Drive HTTP endpoint is stubbed. Every
// database operation below is a real PostgreSQL operation through db.js or SQL.
// Data isolation: VERCEL=1 routes all file fallbacks to os.tmpdir(); the six
// repo data files are snapshotted and byte-restored at the end.
const { URL } = require('url');

const PG_URL = process.env.PHOTOQ_PG_URL || 'postgresql://photoq_test@127.0.0.1:5432/photoq_disposable_test';
function pgGuardFail(msg) {
  console.error('BLOCKED — LOCAL POSTGRESQL UNAVAILABLE: ' + msg);
  process.exit(2);
}
let pgParts = null;
try { pgParts = new URL(PG_URL); } catch (e) { pgGuardFail('PHOTOQ_PG_URL is not a parseable URL'); }
if (!/^postgres(ql)?:$/.test(pgParts.protocol)) pgGuardFail('not a postgresql:// URL');
const pgHost = String(pgParts.hostname || '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(pgHost)) pgGuardFail('host is not loopback (' + pgHost + ')');
const pgDb = String(pgParts.pathname || '').replace(/^\//, '');
if (!/test|disposable|photoq/i.test(pgDb)) pgGuardFail('database name does not look disposable (' + pgDb + ')');

process.env.VERCEL = '1';
process.env.DATABASE_URL = PG_URL;

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Pool } = require('pg');
// TRANSPORT NOTE (test-only, documented): production db.js forces TLS
// (ssl:{rejectUnauthorized:false}) for Neon/Vercel. This disposable local
// server runs with TLS off and the shell is non-admin, so server-side TLS
// cannot be enabled. The test process therefore substitutes a plaintext
// LOOPBACK transport for Pool instances created by db.js. Every SQL/DDL
// statement, transaction, constraint and db.js code path remains 100% real;
// only socket encryption differs, which is irrelevant to every property
// verified below. Production code is NOT modified.
const pgMod = require('pg');
const RealPool = pgMod.Pool;
class LocalPlainPool extends RealPool {
  constructor(cfg) {
    super(Object.assign({}, cfg, { ssl: false }));
    LocalPlainPool.instances.push(this);
  }
}
LocalPlainPool.instances = [];
pgMod.Pool = LocalPlainPool;

const TMP_DATA = path.join(os.tmpdir(), 'tvr_data');
const TMP_UP = path.join(os.tmpdir(), 'tvr_uploads');
const REPO = 'D:/Ai Ticket App - UPS';
const REPO_SNAP = {};
for (const f of ['data/htl_itsm_tickets.json', 'data/master_schools_182.json', 'Hi-Tech_Lab_Warriors_Thiruvarur_Directory.json', 'data/audit_log.json', 'data/htl_deleted_ids.json', 'data/htl_tombstones.json']) {
  try { REPO_SNAP[f] = fs.readFileSync(path.join(REPO, f)); } catch (e) { REPO_SNAP[f] = null; }
}
function restoreRepo() {
  for (const f of Object.keys(REPO_SNAP)) {
    try {
      const p = path.join(REPO, f);
      if (REPO_SNAP[f] === null) { try { fs.rmSync(p, { force: true }); } catch (e) {} }
      else fs.writeFileSync(p, REPO_SNAP[f]);
    } catch (e) {}
  }
}

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

// ---- controllable GAS stub (external boundary ONLY) ----
const driveFiles = new Map();
const createCalls = [];
const createCount = new Map();
const stubModes = { failCreate: new Set(), throwFor: new Set() };
const U = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url || '');
  if (!u.includes('script.google.com')) throw new Error('unexpected outbound ' + u.slice(0, 60));
  await new Promise((r) => setTimeout(r, 2));
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  if (!opts || opts.method === 'GET' || !body.action) return { ok: true, json: async () => ({ tickets: [] }) };
  const tid = String(body.ticketId || '');
  if (body.action === 'inspect_drive_structure') {
    const files = [...driveFiles.entries()]
      .filter(([n]) => tid && n.startsWith(tid + '_'))
      .map(([n, f]) => ({ fileId: f.id, fileName: n, fileSize: f.size, isTrashed: false, folder: f.folder }));
    return {
      ok: true, json: async () => ({
        success: true, ticketId: tid, district: body.district || 'Thiruvarur',
        schoolFolder: body.udise ? (body.udise + ' - stub') : 'school', evidenceFolder: 'Evidence',
        completionFolder: 'Completion Photos',
        schoolFolderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        evidenceFiles: files.filter((f) => f.folder === 'Evidence').map(({ folder, ...r }) => r),
        completionFiles: files.filter((f) => f.folder === 'Completion').map(({ folder, ...r }) => r),
        evidenceTotal: files.length, completionTotal: files.length,
        ticketEvidenceCount: [1, 2, 3, 4].filter((i) => files.some((f) => f.fileName === `${tid}_Evidence_${i}.jpg`)).length,
        hasHmSignedReport: files.some((f) => f.fileName === `${tid}_HM_Signed_Completion_Report.jpg`),
        hmDriveFileId: (files.find((f) => f.fileName === `${tid}_HM_Signed_Completion_Report.jpg`) || {}).fileId || '',
        hasGpsCompletion: files.some((f) => f.fileName === `${tid}_Completion_UPS_GPS.jpg`),
        compDriveFileId: (files.find((f) => f.fileName === `${tid}_Completion_UPS_GPS.jpg`) || {}).fileId || '',
      }),
    };
  }
  const put = (name, b64, folder) => {
    if (!b64) return '';
    createCount.set(name, (createCount.get(name) || 0) + 1);
    if (!driveFiles.has(name)) driveFiles.set(name, { id: `stub-${tid}-${name}`, size: String(b64).length, folder });
    return driveFiles.get(name).id;
  };
  if (body.action === 'create') {
    const slots = [1, 2, 3, 4].filter((i) => !!body[`photo${i}Base64`]);
    const slot = slots.length === 1 ? String(slots[0]) : '?multi?';
    createCalls.push({ tid, kind: 'intake', slot, singleSlot: slots.length === 1 });
    if (stubModes.throwFor.has(tid + '|intake|' + slot)) { const e = new Error('simulated GAS timeout'); e.name = 'AbortError'; throw e; }
    if (stubModes.failCreate.has(tid + '|intake|' + slot)) {
      return { ok: true, json: async () => ({ success: false, error: 'simulated GAS failure' }) };
    }
    const pIds = [1, 2, 3, 4].map((i) => put(`${tid}_Evidence_${i}.jpg`, body[`photo${i}Base64`], 'Evidence'));
    const urlFor = (id) => (id ? U(id) : '');
    return {
      ok: true, json: async () => ({
        success: true, ticketId: tid, folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        p1DriveFileId: pIds[0], p2DriveFileId: pIds[1], p3DriveFileId: pIds[2], p4DriveFileId: pIds[3],
        p1Url: urlFor(pIds[0]), p2Url: urlFor(pIds[1]), p3Url: urlFor(pIds[2]), p4Url: urlFor(pIds[3]),
      }),
    };
  }
  const isHm = !!body.hmReportPhotoBase64 && !body.completionPhotoBase64;
  const isGps = !!body.completionPhotoBase64 && !body.hmReportPhotoBase64;
  const cslot = isHm ? 'hm' : (isGps ? 'gps' : '?multi?');
  createCalls.push({ tid, kind: 'completion', slot: cslot, singleSlot: (isHm !== isGps) });
  if (stubModes.throwFor.has(tid + '|completion|' + cslot)) { const e = new Error('simulated GAS timeout'); e.name = 'AbortError'; throw e; }
  if (stubModes.failCreate.has(tid + '|completion|' + cslot)) {
    return { ok: true, json: async () => ({ success: false, error: 'simulated GAS failure' }) };
  }
  const hmId = isHm ? put(`${tid}_HM_Signed_Completion_Report.jpg`, body.hmReportPhotoBase64, 'Completion') : '';
  const cpId = isGps ? put(`${tid}_Completion_UPS_GPS.jpg`, body.completionPhotoBase64, 'Completion') : '';
  return {
    ok: true, json: async () => ({
      success: true, ticketId: tid, folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
      hmDriveFileId: hmId, compDriveFileId: cpId,
      hmDriveUrl: hmId ? U(hmId) : '', compDriveUrl: cpId ? U(cpId) : '',
      hmReportPhotoUrl: hmId ? U(hmId) : '', completionPhotoUrl: cpId ? U(cpId) : '',
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
const WMMARK = 'data:image/jpeg;base64,/9j/PG-WATERMARKED-GPS-BYTES-EXACT-';
// Phase-4 reference: must match OPEN_TICKET_STATUSES in db.js exactly.
const OPEN_STATUSES_REF = ['New / Under Review', 'Open / Triage', 'In Progress (Remote)', 'Field Visit Scheduled'];

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

let server = null;
let db = null;
let probe = null;
function callHandle({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new FakeReq({ method, url, headers, body });
    const res = new FakeRes();
    const timer = setTimeout(() => reject(new Error('timeout for ' + method + ' ' + url)), 180000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}
async function postIntake(udise, school, block, extra) {
  const r = await callHandle({
    method: 'POST', url: '/api/tickets',
    body: JSON.stringify(Object.assign({
      schoolName: school, udise, block: block || 'Kottur', district: 'Thiruvarur',
      aiName: 'PG AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
      serialNo: 'SN-1', priority: 'High', remarks: 'PG integration fixture',
      photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL,
    }, extra || {})),
  });
  return { status: r.statusCode, json: JSON.parse(r.body) };
}
const q = (text, params) => probe.query(text, params).then((r) => r.rows);
async function ticketRow(tid) {
  const rows = await q('SELECT * FROM tickets WHERE ticket_id = $1', [tid]);
  return rows[0] || null;
}

async function main() {
  console.log('========================================================');
  console.log('🐘 REAL POSTGRESQL INTEGRATION (disposable local only)');
  console.log('========================================================\n');

  // Fresh disposable slate (repeatable): drop + recreate via local superuser
  // (setup only; every test operation below runs as photoq_test).
  await setupFreshDb();
  for (const d of [TMP_DATA, TMP_UP]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  }
  db = require('../db.js');
  server = require('../server.js');

  // §2 identity gate (live): print + verify local/test before any write.
  const ident = await probe.query('SELECT version() AS v, current_database() AS db, current_user AS usr, inet_server_addr() AS addr, inet_server_port() AS port');
  const id = ident.rows[0];
  console.log(`[PG-IDENT] db=${id.db} user=${id.usr} addr=${id.addr} port=${id.port}`);
  console.log(`[PG-IDENT] server=${String(id.v).split(' ').slice(0, 2).join(' ')}`);
  if (!/test|disposable|photoq/i.test(id.db)) pgGuardFail('connected database is not disposable (' + id.db + ')');
  if (!['127.0.0.1', '::1', null].includes(id.addr) && id.addr !== null) pgGuardFail('server is not loopback (' + id.addr + ')');
  record('PG0. connected to disposable LOCAL database only', true, `${id.db}@${id.addr || 'local-socket'}`);

  // §3 real migration (db.initDatabase) + schema verification.
  let migrated = false;
  for (let i = 0; i < 3 && !migrated; i++) {
    try { await db.initDatabase(); migrated = true; } catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
  }
  record('PG1. real initDatabase migration applied', migrated);
  const tables = (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('tickets','drive_photo_jobs')`)).map((r) => r.tablename);
  record('PG2. tickets + drive_photo_jobs tables exist', tables.includes('tickets') && tables.includes('drive_photo_jobs'), tables.join(','));
  const jobCols = await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='drive_photo_jobs'`);
  const colMap = Object.fromEntries(jobCols.map((c) => [c.column_name, c]));
  const byteLeak = jobCols.filter((c) => /byte|base64|photo\d?_?data/i.test(c.column_name));
  record('PG3. jobs table has NO photo byte/base64 columns', byteLeak.length === 0, `${jobCols.length} cols checked`);
  const uq = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='drive_photo_jobs'`);
  const hasJobUq = uq.some((r) => /UNIQUE/i.test(r.indexdef) && /ticket_id.*kind.*slot|kind.*slot/i.test(r.indexdef));
  const hasPartial = uq.some((r) => /WHERE.*PENDING.*CLAIMED|WHERE.*state/i.test(r.indexdef));
  const keyIdx = await q(`SELECT indexname FROM pg_indexes WHERE tablename='tickets' AND indexname='uq_tickets_client_request_id'`);
  record('PG4. UNIQUE(ticket_id,kind,slot) present', hasJobUq);
  record('PG5. partial eligible-job index present', hasPartial);
  record('PG6. uq_tickets_client_request_id present', keyIdx.length === 1);
  const nn = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='drive_photo_jobs' AND is_nullable='NO' AND column_name IN ('ticket_id','kind','slot','state','attempts','next_attempt_at')`);
  record('PG7. NOT NULL on job core columns', nn.length === 6, nn.map((r) => r.column_name).join(','));

  // Real master schools for intake (read-only; avoids discovery writes).
  // Production auto-seeds the embedded baseline on small tables at the first
  // getAllTickets: trigger it deliberately, snapshot it, and EXCLUDE seeded
  // UDISEs from every fixture pool (a seeded open ticket would make intake
  // converge instead of insert, breaking exact counts).
  await db.getAllTickets();
  const baseRows = await q('SELECT ticket_id, udise_code FROM tickets');
  const baseIds = new Set(baseRows.map((r) => String(r.ticket_id)));
  const baseUdises = new Set(baseRows.map((r) => String(r.udise_code || '')));
  record('PG7b. baseline embraced + excluded from fixtures', true, `seeded=${baseRows.length}`);
  const masters = JSON.parse(fs.readFileSync(path.join(REPO, 'data/master_schools_182.json'), 'utf8'))
    .filter((s) => /^\d{8,}$/.test(String(s.udise || '')));
  const pool2 = masters.filter((s) => !baseUdises.has(String(s.udise)));
  const M = (i) => ({ udise: String(pool2[i].udise), school: pool2[i].schoolName, block: pool2[i].block || 'Kottur' });
  record('PG7c. fixture pool has clean UDISEs', pool2.length > 210, `pool=${pool2.length}`);

  // PG60 (business rule): a -2/-3/-4 suffixed ticket is a NEW complaint from
  // the same school — multiple open tickets per UDISE are legitimate. The
  // migration must NOT contain any open-UDISE uniqueness, and the seeded
  // 04101 pair must coexist untouched.
  const pair04101 = await q(`SELECT ticket_id, status FROM tickets WHERE ticket_id IN ('HTL-TVR-04101','HTL-TVR-04101-2') ORDER BY ticket_id`);
  record('PG60a. 04101 pair coexists as two open complaints (untouched)',
    pair04101.length === 2 && pair04101.every((r) => OPEN_STATUSES_REF.includes(r.status)),
    pair04101.map((r) => r.ticket_id).join(','));
  const idxGone = await q(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='tickets' AND indexname='uq_tickets_open_udise'`);
  const dbJsSrc = fs.readFileSync(path.join(REPO, 'db.js'), 'utf8');
  record('PG60b. no open-UDISE uniqueness enforced (index absent)',
    idxGone.length === 0);
  record('PG60c. no open-UDISE DDL in migration source (cannot re-activate)',
    !dbJsSrc.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_open_udise')
    && !dbJsSrc.includes('OPEN-UDISE-CONFLICT'));
  record('PG60d. open-state list still single-sourced for the lookup rule',
    dbJsSrc.includes('OPEN_TICKET_STATUSES.includes(t.status)')
    && OPEN_STATUSES_REF.every((s) => dbJsSrc.includes(s)));

  // §4A/B/C: real ticket + 4 photos + 4 jobs.
  const mA = M(0);
  const rA = await postIntake(mA.udise, mA.school, mA.block);
  const tidA = rA.json.ticketId;
  const rowA = await ticketRow(tidA);
  record('PG8. real PG ticket created via handler', rA.json.success === true && !!rowA, `ticket=${tidA}`);
  record('PG9. 4 photo bytes durable in PG row',
    !!rowA && [1, 2, 3, 4].every((i) => String(rowA['photo' + i + '_data'] || '').startsWith('data:')));
  const jobsA = await db.listPhotoJobs({ ticketId: tidA });
  record('PG10. 4 real jobs created (unique per slot)',
    jobsA.length === 4 && new Set(jobsA.map((j) => j.kind + '/' + j.slot)).size === 4);
  const cDup = await db.createPhotoJob(tidA, 'intake', '1');
  record('PG11. duplicate job insert returns existing (ON CONFLICT)',
    cDup.created === false && !!cDup.job && (await db.listPhotoJobs({ ticketId: tidA })).length === 4);

  // §4D: same client_request_id retry — no dupe, no overwrite, no regress.
  const DKEY = 'pgkey-' + Date.now();
  const mD = M(1);
  const dTid = 'PGQ-' + Date.now().toString(36).toUpperCase() + 'D1';
  await db.createTicket({ ticketId: dTid, udise: mD.udise, district: 'Thiruvarur', schoolName: mD.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, clientRequestId: DKEY });
  await mustRow(dTid, 'PG-D0');
  await db.updateTicket(dTid, { status: 'In Progress (Remote)' });
  const dRetry = await db.createTicketIfNotExists({ ticketId: 'PGQ-ATTACKER-D', udise: mD.udise, district: 'Thiruvarur', schoolName: mD.school, priority: 'High', status: 'New / Under Review', photo1Url: 'data:image/jpeg;base64,ATTACKER', clientRequestId: DKEY });
  const dRow = await ticketRow(dTid);
  const dKeyCount = await q('SELECT count(*)::int AS c FROM tickets WHERE client_request_id = $1', [DKEY]);
  record('PG12. same-key retry converges (no duplicate ticket)',
    dRetry.created === false && dKeyCount[0].c === 1, `ticket=${dRetry.ticket && dRetry.ticket.ticketId}`);
  record('PG13. conflicting retry overwrites no bytes', String(dRow.photo1_data) === PIXEL);
  record('PG14. status never regressed by stale retry', dRow.status === 'In Progress (Remote)', dRow.status);

  // §4E: keyed idempotency under concurrency. Sequential first post stores
  // the key; 14 concurrent retries must ALL hit the keyed pre-check and
  // converge gracefully (deterministic: no inserts happen in the burst).
  const EKEY = 'pgkey-conc-' + Date.now();
  const mE = M(24);
  const eFirst = await postIntake(mE.udise, mE.school, mE.block, { clientRequestId: EKEY });
  const eWinner = eFirst.json.ticketId;
  const eBurst = await Promise.all(Array.from({ length: 14 }, () => postIntake(mE.udise, mE.school, mE.block, { clientRequestId: EKEY })));
  const eIds = eBurst.map((r) => r.json.ticketId);
  const eCount = await q('SELECT count(*)::int AS c FROM tickets WHERE client_request_id = $1', [EKEY]);
  record('PG15. 14 concurrent same-key retries converge gracefully (no inserts)',
    eFirst.json.success === true && eBurst.every((r) => r.json.success === true)
    && eIds.every((id) => id === eWinner) && eCount[0].c === 1, `winner=${eWinner}`);
  // Direct-db guardrail: same key + different ticketId resolves to the
  // keyed winner (same logical request converges — no duplicate, no
  // overwrite, no status regression) instead of erroring.
  const eDirect = await db.createTicketIfNotExists({
    ticketId: `PGQ-ELOSER-${Date.now().toString(36)}`, udise: mE.udise, district: 'Thiruvarur',
    schoolName: mE.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, clientRequestId: EKEY,
  });
  const eCount2 = await q('SELECT count(*)::int AS c FROM tickets WHERE client_request_id = $1', [EKEY]);
  const eWinRow = await ticketRow(eWinner);
  record('PG15b. same-key direct insert converges on keyed winner (1 row, intact)',
    eDirect.created === false && !eDirect.error && (eDirect.ticket && eDirect.ticket.ticketId) === eWinner
    && eCount2[0].c === 1 && eWinRow.status === 'New / Under Review'
    && String(eWinRow.photo1_data || '').startsWith('data:'));

  // §4F: open-ticket business rule under concurrency. Sequential first post
  // opens the ticket; the 15-way burst then hits the open-check every time
  // (deterministic: zero inserts in the burst, all return the winner).
  const mF = M(25);
  const fFirst = await postIntake(mF.udise, mF.school, mF.block);
  const fWinner = fFirst.json.ticketId;
  const fRes = await Promise.all(Array.from({ length: 15 }, () => postIntake(mF.udise, mF.school, mF.block)));
  const fIds = fRes.map((r) => r.json.ticketId);
  const fRows = await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [mF.udise, [...baseIds]]);
  record('PG16. 15 concurrent same-UDISE return the open winner (no inserts)',
    fFirst.json.success === true && fRes.every((r) => r.json.success === true)
    && fIds.every((id) => id === fWinner) && fRows.length === 1, `rows=${fRows.length}`);
  const fFollow = await postIntake(mF.udise, mF.school, mF.block);
  const fRows2 = await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [mF.udise, [...baseIds]]);
  record('PG17. follow-up sequential post converges, rows frozen',
    fFollow.json.ticketId === fWinner && fRows2.length === 1);
  // §4F2: virgin-burst on a FRESH udise (same hardened assertions: the
  // partial index makes virgin convergence deterministic, not racy).
  const f2 = await virginBurst(26, 15, 'PG16c. virgin 15-way burst: all success, real IDs, own bytes');

  // §4G: different key, same UDISE with open ticket -> existing (rule intact).
  const gRes = await postIntake(mF.udise, mF.school, mF.block, { clientRequestId: 'pgkey-other-' + Date.now() });
  const gRows = await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [mF.udise, [...baseIds]]);
  record('PG18. different key + open UDISE returns existing (no new ticket)',
    gRes.json.ticketId === fWinner && gRows.length === 1);

  // PG61-63 (Issue 1): virgin same-UDISE bursts must converge via the
  // partial unique index + 23505 resolution: exactly 1 open row, winner
  // Virgin bursts: each request is a NEW complaint (suffix allocation).
  // Business rule: a burst of virgin same-UDISE requests represents NEW
  // complaints from the same school (suffix -2/-3/-4...). Every response must
  // succeed with a REAL row ID (winner-reporting, never a phantom); every
  // created row keeps its own bytes/status; a follow-up converges via the
  // pre-existing open-check with rows frozen. Row COUNT is intentionally not
  // asserted (probe staggering legitimately yields 1..n rows).
  async function virginBurst(mi, n, label) {
    const mm = M(mi);
    const rs = await Promise.all(Array.from({ length: n }, () => postIntake(mm.udise, mm.school, mm.block)));
    const okFlags = rs.map((r) => r.json.success === true);
    const ids = rs.map((r) => r.json.ticketId);
    const rows = await q('SELECT ticket_id, status, photo1_data FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [mm.udise, [...baseIds]]);
    const idSet = new Set(rows.map((r) => r.ticket_id));
    const follow = await postIntake(mm.udise, mm.school, mm.block);
    const rows2 = await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [mm.udise, [...baseIds]]);
    const ok = okFlags.every(Boolean) && ids.every((id) => idSet.has(id))
      && rows.length >= 1 && rows.length <= n
      && rows.every((r) => OPEN_STATUSES_REF.includes(r.status) && String(r.photo1_data || '') === PIXEL)
      && idSet.has(follow.json.ticketId) && rows2.length === rows.length;
    record(label, ok, `n=${n} ok=${okFlags.filter(Boolean).length} distinctIds=${new Set(ids).size} rows=${rows.length}`);
    return { mm, ids: [...new Set(ids)] };
  }
  const v2 = await virginBurst(27, 2, 'PG61. 2-way virgin burst: all success, real IDs, own bytes');
  const v15 = await virginBurst(28, 15, 'PG62. 15-way virgin burst: all success, real IDs, own bytes');
  const v50 = await virginBurst(29, 50, 'PG63. 50-way virgin burst: all success, real IDs, own bytes');
  // PG64: closed history stays open for business — closing ALL open rows, then
  // a new virgin request must create a new row; later posts converge on it.
  for (const tid of v2.ids) await db.updateTicket(tid, { status: 'Closed / Verified' });
  const v2rows0 = (await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [v2.mm.udise, [...baseIds]])).length;
  const cNew = await postIntake(v2.mm.udise, v2.mm.school, v2.mm.block);
  const cRows = await q('SELECT ticket_id, status FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2)) ORDER BY ticket_id', [v2.mm.udise, [...baseIds]]);
  const cOpen = cRows.filter((r) => OPEN_STATUSES_REF.includes(r.status));
  record('PG64a. closed tickets + new request allows a legitimate new ticket',
    cNew.json.success === true && !v2.ids.includes(cNew.json.ticketId) && cRows.length === v2rows0 + 1 && cOpen.length === 1);
  const cFollow = await postIntake(v2.mm.udise, v2.mm.school, v2.mm.block);
  const cRows2 = await q('SELECT ticket_id FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [v2.mm.udise, [...baseIds]]);
  record('PG64b. follow-up converges on the new open ticket (rows frozen)',
    cFollow.json.ticketId === cNew.json.ticketId && cRows2.length === cRows.length);
  // PG66 (04101 business-rule regression): two OPEN complaints for one UDISE
  // coexist with independent photos/history/status, and same-request
  // idempotency still protects each ticket individually.
  const m66 = M(30);
  const t66a = 'PGQ-66A-' + Date.now().toString(36).toUpperCase();
  const t66b = 'PGQ-66B-' + Date.now().toString(36).toUpperCase();
  await db.createTicket({ ticketId: t66a, udise: m66.udise, district: 'Thiruvarur', schoolName: m66.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, remarks: 'first complaint' });
  await mustRow(t66a, 'PG66-0a');
  await db.createTicket({ ticketId: t66b, udise: m66.udise, district: 'Thiruvarur', schoolName: m66.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, remarks: 'second complaint' });
  await mustRow(t66b, 'PG66-0b');
  const r66a = await ticketRow(t66a);
  const r66b = await ticketRow(t66b);
  record('PG66a. two open complaints share one UDISE with independent rows',
    !!r66a && !!r66b && r66a.status === 'New / Under Review' && r66b.status === 'New / Under Review'
    && String(r66a.photo1_data || '').startsWith('data:') && String(r66b.photo1_data || '').startsWith('data:')
    && r66a.remarks === 'first complaint' && r66b.remarks === 'second complaint');
  await db.updateTicket(t66a, { status: 'In Progress (Remote)' });
  await db.updateTicket(t66b, { remarks: 'second complaint updated' });
  const r66a2 = await ticketRow(t66a);
  const r66b2 = await ticketRow(t66b);
  record('PG66b. histories evolve independently (no cross-talk)',
    r66a2.status === 'In Progress (Remote)' && r66a2.remarks === 'first complaint'
    && r66b2.status === 'New / Under Review' && r66b2.remarks === 'second complaint updated');
  const K66 = 'pgkey-66-' + Date.now();
  await q(`UPDATE tickets SET client_request_id = $1 WHERE ticket_id = $2`, [K66, t66a]);
  const k66 = await db.createTicketIfNotExists({ ticketId: 'PGQ-66C-' + Date.now().toString(36), udise: m66.udise, district: 'Thiruvarur', schoolName: m66.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, clientRequestId: K66 });
  const k66count = await q('SELECT count(*)::int AS c FROM tickets WHERE client_request_id = $1', [K66]);
  record('PG66c. same-request retry converges on its own ticket (2 rows preserved)',
    k66.created === false && k66.ticket && k66.ticket.ticketId === t66a && k66count[0].c === 1
    && (await q('SELECT count(*)::int AS c FROM tickets WHERE udise_code = $1 AND NOT (ticket_id = ANY($2))', [m66.udise, [...baseIds]]))[0].c === 2);
  // PG65 (Issue 2): forced PG failure must be EXPLICITLY reported; PG row
  // unchanged; JSON mirror must not substitute a phantom success.
  const mForce = M(31);
  const fTid = 'PGQ-FORCE-' + Date.now().toString(36).toUpperCase();
  await db.createTicket({ ticketId: fTid, udise: mForce.udise, district: 'Thiruvarur', schoolName: mForce.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL });
  await mustRow(fTid, 'PG-F0');
  await db.updateTicket(fTid, { p1DriveFileId: 'genuine-force-1' });
  const mirrorFiles = fs.readdirSync(TMP_DATA).filter((f) => f.endsWith('.json'));
  const mirrorBefore = mirrorFiles.map((f) => { try { return f + ':' + fs.readFileSync(path.join(TMP_DATA, f), 'utf8'); } catch (e) { return f + ':ERR'; } }).join('\n');
  let fRet = null, fThrew = false;
  try {
    const circular = { a: 1 }; circular.self = circular;
    fRet = await db.updateTicket(fTid, { p2DriveFileId: 'MUST-NOT-PERSIST', completionEvidence: circular });
  } catch (e) { fThrew = true; }
  const fRow = await ticketRow(fTid);
  const mirrorAfter = mirrorFiles.map((f) => { try { return f + ':' + fs.readFileSync(path.join(TMP_DATA, f), 'utf8'); } catch (e) { return f + ':ERR'; } }).join('\n');
  const mirrorAfterAll = fs.readdirSync(TMP_DATA).filter((f) => f.endsWith('.json'));
  record('PG65a. forced PG failure is explicitly reported (no false success)',
    (fThrew === true || (fRet && fRet.success === false)) && !(fRet && fRet.success === true));
  record('PG65b. PG row unchanged after forced failure',
    fRow.p2_drive_file_id !== 'MUST-NOT-PERSIST' && fRow.photo1_data === PIXEL && fRow.p1_drive_file_id === 'genuine-force-1');
  record('PG65c. JSON mirror not substituted for failed PG (byte-identical, no new files)',
    mirrorAfter === mirrorBefore && mirrorAfterAll.length === mirrorFiles.length
    && !mirrorAfter.includes('MUST-NOT-PERSIST'));
  const fOk = await db.updateTicket(fTid, { status: 'In Progress (Remote)' });
  record('PG65d. normal successful PG update still works',
    !!(fOk && fOk.success) && (await ticketRow(fTid)).status === 'In Progress (Remote)');

  // §5 real SKIP LOCKED: 20 jobs, 6 concurrent workers, disjoint sets.
  // Park every other PENDING job in the future so the race sees exactly 20.
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() + INTERVAL '1 hour' WHERE state='PENDING'`);
  const sTids = [];
  const sUdises = [];
  for (let i = 0; i < 5; i++) {
    const mm = M(10 + i);
    sUdises.push(mm.udise);
    const st = 'PGQ-S' + i + '-' + Date.now().toString(36).toUpperCase();
    await db.createTicket({ ticketId: st, udise: mm.udise, district: 'Thiruvarur', schoolName: mm.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL });
    await mustRow(st, 'PG-S0');
    await db.ensurePhotoJobs(st, [1, 2, 3, 4].map((n) => ({ kind: 'intake', slot: String(n) })));
    sTids.push(st);
  }
  const workerClaims = await Promise.all([0, 1, 2, 3, 4, 5].map(async (w) => {
    const mine = [];
    for (;;) {
      const c = await db.claimPhotoJob({ owner: 'pgw' + w, leaseMs: 600000 });
      if (!c.claimed) break;
      mine.push(c.job.jobId);
      await new Promise((r) => setTimeout(r, 5));
    }
    return mine;
  }));
  const allClaimed = workerClaims.flat();
  const sJobRows = await q(`SELECT job_id FROM drive_photo_jobs WHERE ticket_id = ANY($1)`, [sTids]);
  record('PG19. 6 workers claim 20 jobs with zero overlap (real SKIP LOCKED)',
    allClaimed.length === 20 && new Set(allClaimed).size === 20,
    workerClaims.map((m, w) => `w${w}:${m.length}`).join(' '));
  record('PG20. every job accounted for (union == seeded set)',
    sJobRows.length === 20 && sJobRows.every((r) => allClaimed.includes(Number(r.job_id))));
  for (const jid of allClaimed) await db.confirmPhotoJob(jid);
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() WHERE state='PENDING'`);

  // §6 real lease recovery: expired reclaimable, active NOT stealable.
  const mL = M(20);
  const lTid = 'PGQ-L-' + Date.now().toString(36).toUpperCase();
  await db.createTicket({ ticketId: lTid, udise: mL.udise, district: 'Thiruvarur', schoolName: mL.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL });
  await mustRow(lTid, 'PG-L0');
  await db.createPhotoJob(lTid, 'intake', '1');
  const lC1 = await db.claimPhotoJob({ owner: 'pgL1', leaseMs: 60000 });
  await q(`UPDATE drive_photo_jobs SET lease_expires_at = NOW() - INTERVAL '5 minutes', next_attempt_at = NOW() - INTERVAL '1 hour' WHERE job_id = $1`, [lC1.job.jobId]);
  const lC2 = await db.claimPhotoJob({ owner: 'pgL2', leaseMs: 60000 });
  record('PG21. expired lease reclaimed by another worker (attempts+1)',
    lC2.claimed === true && lC2.job.jobId === lC1.job.jobId && lC2.job.attempts === lC1.job.attempts + 1);
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() + INTERVAL '1 hour' WHERE state='PENDING' AND job_id <> $1`, [lC2.job.jobId]);
  const lC3 = await db.claimPhotoJob({ owner: 'pgL3', leaseMs: 600000 });
  record('PG22. active non-expired lease is NOT stolen',
    lC3.claimed === false || lC3.job.jobId !== lC2.job.jobId, `claimed=${lC3.claimed}`);
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() WHERE state='PENDING'`);
  await db.failPhotoJob(lC2.job.jobId, new Error('pg lease test release'));

  // §7 real rollback: (a) db.js failure persists nothing; (b) raw txn rollback.
  const mR = M(21);
  const rTid = 'PGQ-R-' + Date.now().toString(36).toUpperCase();
  await db.createTicket({ ticketId: rTid, udise: mR.udise, district: 'Thiruvarur', schoolName: mR.school, priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, photo2Url: PIXEL });
  await mustRow(rTid, 'PG-R0');
  await db.updateTicket(rTid, { p1DriveFileId: 'genuine-pg-1' });
  const beforeR = await ticketRow(rTid);
  let threw = false, retR = null;
  try {
    const circular = { a: 1 }; circular.self = circular;
    retR = await db.updateTicket(rTid, { p2DriveFileId: 'SHOULD-NOT-PERSIST', completionEvidence: circular });
  } catch (e) { threw = true; }
  const afterR = await ticketRow(rTid);
  record('PG23. failed updateTicket persists nothing (no half-write)',
    (threw === true || (retR && retR.success === false))
    && afterR.p2_drive_file_id !== 'SHOULD-NOT-PERSIST'
    && afterR.photo1_data === beforeR.photo1_data && afterR.photo2_data === beforeR.photo2_data
    && afterR.p1_drive_file_id === 'genuine-pg-1');
  const txClient = await probe.connect();
  try {
    await txClient.query('BEGIN');
    await txClient.query(`UPDATE tickets SET p2_drive_file_id='tx-partial', photo2_data=NULL WHERE ticket_id=$1`, [rTid]);
    await txClient.query(`UPDATE drive_photo_jobs SET state='CONFIRMED' WHERE ticket_id=$1 AND kind='intake' AND slot='2'`);
    throw new Error('injected failure before COMMIT');
  } catch (e) { try { await txClient.query('ROLLBACK'); } catch (rb) {} }
  txClient.release();
  const afterTx = await ticketRow(rTid);
  record('PG24. rolled-back transaction leaves zero partial state',
    afterTx.p2_drive_file_id !== 'tx-partial' && String(afterTx.photo2_data || '').startsWith('data:'));
  const rJobs = await db.listPhotoJobs({ ticketId: rTid });
  record('PG25. job state consistent after rollback (no phantom confirm)', rJobs.every((j) => j.state !== 'CONFIRMED'));

  // §8 real atomic confirm + byte cleanup via the worker (stub GAS success).
  const mC = M(22);
  const cT = await postIntake(mC.udise, mC.school, mC.block);
  const cTidy = cT.json.ticketId;
  await server.drainPhotoJobs({ owner: 'pgC', maxJobs: 500, maxMs: 240000 });
  const cRow = await ticketRow(cTidy);
  const cJobs = await db.listPhotoJobs({ ticketId: cTidy });
  record('PG26. VERIFIED slot: ID + URL persisted, bytes cleared, job CONFIRMED',
    !!cRow.p1_drive_file_id && String(cRow.photo1_data || '').startsWith('https://')
    && !String(cRow.photo1_data || '').startsWith('data:')
    && cJobs.every((j) => j.state === 'CONFIRMED'), `p1=${cRow.p1_drive_file_id}`);
  const mC2 = M(23);
  const c2 = await postIntake(mC2.udise, mC2.school, mC2.block);
  const c2id = c2.json.ticketId;
  let threw2 = false, ret2 = null;
  try {
    const circular = { a: 1 }; circular.self = circular;
    ret2 = await db.updateTicket(c2id, { p1DriveFileId: 'HALF-STATE-ID', photo1Url: 'https://drive.google.com/thumbnail?id=x', completionEvidence: circular });
  } catch (e) { threw2 = true; }
  const c2row = await ticketRow(c2id);
  record('PG27. failed confirm persists no half-state (ID and bytes both intact)',
    (threw2 === true || (ret2 && ret2.success === false))
    && c2row.p1_drive_file_id !== 'HALF-STATE-ID'
    && String(c2row.photo1_data || '').startsWith('data:'));

  // §9 real 200-concurrent: production mints IDs from the UDISE last-5, so
  // same-suffix schools share a base ID (base-2 probing). Deterministic plan:
  // wave 1 posts one school per distinct (district-prefix+suffix) combo in
  // parallel; wave 2 posts 38 same-suffix/different-UDISE schools, which take
  // base-2 deterministically. 200 tickets x 4 photos = 800 jobs, all real.
  const comboKey = (s) => ((String(s.district || '').toLowerCase().includes('nagapattinam') ? 'NGP' : 'TVR') + '|' + String(s.udise).slice(-5));
  // Exclude every UDISE touched by earlier stages: a scale post on a used
  // UDISE would hit the open-ticket rule and converge instead of inserting.
  const usedBeforeScale = new Set([mA.udise, mD.udise, mE.udise, mF.udise, f2.mm.udise, v2.mm.udise, v15.mm.udise, v50.mm.udise, m66.udise, mForce.udise, mL.udise, mR.udise, mC.udise, mC2.udise, ...sUdises]);
  const scalePool = pool2.filter((s) => !usedBeforeScale.has(String(s.udise)));
  const groups = new Map();
  for (const s of scalePool) {
    const k = comboKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const postScale = (s, ix) => postIntake(String(s.udise), s.schoolName, s.block || 'Kottur', {
    district: s.district || 'Thiruvarur', clientRequestId: 'pgscale-' + Date.now() + '-' + ix, remarks: 'PG scale fixture ' + ix,
  });
  // Waves: wave 0 posts every primary in parallel; later waves post spares
  // round-robin (v[1], then v[2], ...) with distinct suffixes per wave, so
  // each post deterministically extends its own chain (base, base-2, ...).
  const waves = [[...groups.values()].map((v) => v[0])];
  const maxRounds = Math.max(...[...groups.values()].map((v) => v.length));
  let planned = waves[0].length;
  for (let r = 1; r < maxRounds && planned < 200; r++) {
    const wave = [];
    for (const v of groups.values()) {
      if (planned >= 200) break;
      if (v[r]) { wave.push(v[r]); planned++; }
    }
    if (wave.length > 0) waves.push(wave);
  }
  record('PG28a. scale plan covers exactly 200 distinct tickets',
    planned === 200 && waves.reduce((a, w) => a + w.length, 0) === 200,
    `waves=${waves.length} planned=${planned}`);
  const t0count = (await q('SELECT count(*)::int AS c FROM tickets'))[0].c;
  const scaleOk = [];
  for (let wi = 0; wi < waves.length; wi++) {
    const res = await Promise.all(waves[wi].map((s, ix) => postScale(s, wi * 1000 + ix)));
    const ok = res.filter((r) => r.json.success === true);
    scaleOk.push(...ok);
    record(`PG28w${wi}. wave ${wi} all succeed`, ok.length === waves[wi].length, `ok=${ok.length}/${waves[wi].length}`);
  }
  const scaleIds = scaleOk.map((r) => r.json.ticketId);
  const t1count = (await q('SELECT count(*)::int AS c FROM tickets'))[0].c;
  record('PG29. exactly 200 new PG ticket rows (no dupes)',
    t1count - t0count === 200 && new Set(scaleIds).size === 200, `new=${t1count - t0count}`);
  const jCount = (await q(`SELECT count(*)::int AS c FROM drive_photo_jobs WHERE ticket_id = ANY($1)`, [scaleIds]))[0].c;
  const jDupes = await q(`SELECT ticket_id, kind, slot, count(*) AS c FROM drive_photo_jobs WHERE ticket_id = ANY($1) GROUP BY 1,2,3 HAVING count(*) > 1`, [scaleIds]);
  record('PG30. exactly 800 jobs, zero duplicate (ticket,kind,slot)', jCount === 800 && jDupes.length === 0, `jobs=${jCount}`);
  const byteRows = await q(`SELECT count(*)::int AS c FROM tickets WHERE ticket_id = ANY($1) AND photo1_data LIKE 'data:%' AND photo2_data LIKE 'data:%' AND photo3_data LIKE 'data:%' AND photo4_data LIKE 'data:%'`, [scaleIds]);
  record('PG31. all 800 photo bytes retained pre-confirm', byteRows[0].c === 200);
  // One forced retry-state ticket inside the scale set.
  const retryTid = scaleIds[0];
  stubModes.failCreate.add(retryTid + '|intake|2');
  // Drain to quiescence: repeat 6-worker rounds until a round claims nothing
  // (cap 8). Per-round summaries are logged for diagnosis.
  let claimedTotal = 0, confirmedTotal = 0, rounds = 0;
  for (let qi = 0; qi < 8; qi++) {
    rounds++;
    const ds = await Promise.all([0, 1, 2, 3, 4, 5].map((w) =>
      server.drainPhotoJobs({ owner: `pg9-r${qi}w` + w, maxJobs: 500, maxMs: 240000 })));
    const rc = ds.reduce((a, d) => a + (d.claimed || 0), 0);
    const rf = ds.reduce((a, d) => a + (d.confirmed || 0), 0);
    claimedTotal += rc; confirmedTotal += rf;
    console.log(`[PG-DRAIN] round ${qi}: claimed=${rc} confirmed=${rf} perWorker=[${ds.map((d) => d.claimed).join(',')}]`);
    if (rc === 0) break;
  }
  const claimedLeft = (await q(`SELECT count(*)::int AS c FROM drive_photo_jobs WHERE state='CLAIMED'`))[0].c;
  const retryJob = await db.getPhotoJob(retryTid, 'intake', '2');
  const retryRow = await ticketRow(retryTid);
  record('PG32. 6 parallel workers drain the full 800-job set',
    claimedTotal >= 800 && claimedLeft === 0, `claimed=${claimedTotal} confirmed=${confirmedTotal} rounds=${rounds}`);
  record('PG33. no double-upload across 800 files (each created exactly once)',
    (() => {
      let bad = 0;
      for (const tid of scaleIds) for (let i = 1; i <= 4; i++) {
        // The known retry slot (recovered in PG35) has 0 creates at this point.
        if (tid === retryTid && i === 2) continue;
        if ((createCount.get(`${tid}_Evidence_${i}.jpg`) || 0) !== 1) bad++;
      }
      return bad === 0;
    })());
  record('PG34. forced-failure slot stays PENDING with bytes + error (retry state)',
    retryJob.state === 'PENDING' && String(retryRow.photo2_data || '').startsWith('data:')
    && !retryRow.p2_drive_file_id && !!retryJob.lastError);
  stubModes.failCreate.delete(retryTid + '|intake|2');
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() WHERE ticket_id = $1 AND kind='intake' AND slot='2'`, [retryTid]);
  await server.drainPhotoJobs({ owner: 'pg9-retry', maxJobs: 500, maxMs: 240000 });
  const retryDone = await db.getPhotoJob(retryTid, 'intake', '2');
  record('PG35. retry recovers the failed slot (no storm)',
    retryDone.state === 'CONFIRMED' && (createCount.get(`${retryTid}_Evidence_2.jpg`) || 0) === 1);
  const postDrain = await q(`SELECT count(*)::int AS c FROM drive_photo_jobs WHERE ticket_id = ANY($1) AND state='CONFIRMED'`, [scaleIds]);
  record('PG36. all 800 scale jobs CONFIRMED end-state', postDrain[0].c === 800, `confirmed=${postDrain[0].c}`);

  // §10 completion HM + GPS jobs on PG (independent, exact bytes, slot-scoped clear).
  // Dynamic fresh picks: direct inserts must land on UDISEs with no open
  // ticket (the new invariant rejects them loudly via raw SQL, silently via
  // createTicket dual-write — both verified below with mustRow).
  async function mustRow(tid, label) {
    const r = await ticketRow(tid);
    if (!r) { record(label, false, `PG row missing for ${tid}`); throw new Error('missing PG row for ' + tid); }
    return r;
  }
  const postScaleUdises = new Set((await q(`SELECT DISTINCT udise_code AS u FROM tickets WHERE ticket_id = ANY($1)`, [scaleIds])).map((r) => String(r.u)));
  const usedAll = new Set([...usedBeforeScale, ...postScaleUdises]);
  function pickFresh() {
    const s = pool2.find((x) => !usedAll.has(String(x.udise)));
    if (!s) throw new Error('fresh UDISE pool exhausted');
    usedAll.add(String(s.udise));
    return { udise: String(s.udise), school: s.schoolName, block: s.block || 'Kottur' };
  }
  const mH = pickFresh();
  const hTid = 'PGQ-H-' + Date.now().toString(36).toUpperCase();
  await db.createTicket({ ticketId: hTid, udise: mH.udise, district: 'Thiruvarur', schoolName: mH.school, priority: 'High', status: 'New / Under Review' });
  await mustRow(hTid, 'PG-H0. completion fixture really in PG (not mirror-only)');
  await db.updateTicket(hTid, {
    hmReportPhotoBase64: PIXEL, completionPhotoBase64: WMMARK,
    completionEvidence: {
      hmSignedReport: { uploaded: true, data: PIXEL, fileUrl: '', driveFileId: '' },
      completionPhoto: { uploaded: true, data: WMMARK, fileUrl: '', driveFileId: '' },
    },
  });
  await db.ensurePhotoJobs(hTid, [{ kind: 'completion', slot: 'hm' }, { kind: 'completion', slot: 'gps' }]);
  stubModes.failCreate.add(hTid + '|completion|gps');
  await server.drainPhotoJobs({ owner: 'pgH', maxJobs: 500, maxMs: 240000 });
  const hRow = await ticketRow(hTid);
  let seenGps = null;
  const capFetch = globalThis.fetch;
  globalThis.fetch = async (url2, opts2) => {
    try {
      const b = JSON.parse((opts2 && opts2.body) || '{}');
      if (b.action === 'update' && String(b.ticketId) === hTid && b.completionPhotoBase64) seenGps = b.completionPhotoBase64;
    } catch (e) {}
    return capFetch(url2, opts2);
  };
  stubModes.failCreate.delete(hTid + '|completion|gps');
  await q(`UPDATE drive_photo_jobs SET next_attempt_at = NOW() WHERE ticket_id = $1`, [hTid]);
  await server.drainPhotoJobs({ owner: 'pgH2', maxJobs: 500, maxMs: 240000 });
  globalThis.fetch = capFetch;
  const hRow2 = await ticketRow(hTid);
  const ev2 = hRow2.completion_evidence || {};
  record('PG37. HM confirmed atomically (top + nested bytes cleared, ID set)',
    (await db.getPhotoJob(hTid, 'completion', 'hm')).state === 'CONFIRMED'
    && !!hRow.hm_drive_file_id && (hRow.hm_report_photo_base64 || '') === ''
    && ((ev2.hmSignedReport || {}).data === ''));
  record('PG38. GPS failure kept its bytes independently',
    (await db.getPhotoJob(hTid, 'completion', 'gps')) && !!hRow.completion_photo_base64
    && String(hRow.completion_photo_base64).startsWith('data:'));
  record('PG39. GPS recovered with exact stored watermarked bytes; only its slot cleared',
    (await db.getPhotoJob(hTid, 'completion', 'gps')).state === 'CONFIRMED'
    && seenGps === WMMARK && !!hRow2.comp_drive_file_id
    && (hRow2.completion_photo_base64 || '') === '' && ((ev2.completionPhoto || {}).data === '')
    && !!hRow2.hm_drive_file_id, `bytesMatch=${seenGps === WMMARK}`);

  // §11 legacy compatibility: 4 shapes inserted as raw pre-existing rows.
  // Each shape gets its OWN fresh UDISE: the open-ticket invariant forbids
  // two open rows on one UDISE even for legacy fixtures (raw SQL raises).
  const legTs = Date.now().toString(36).toUpperCase();
  const legA = 'PGQ-LA-' + legTs; // confirmed + bytes cleared (must stay untouched)
  const legB = 'PGQ-LB-' + legTs; // bytes-only (must gain jobs + confirm)
  const legD = 'PGQ-LD-' + legTs; // partial evidence (slots 1+3 only)
  const mLxA = pickFresh();
  const mLxB = pickFresh();
  const mLxD = pickFresh();
  await q(`INSERT INTO tickets (ticket_id, priority, status, district, school_name, udise_code, photo1_data, photo2_data, photo3_data, photo4_data, p1_drive_file_id, p2_drive_file_id, p3_drive_file_id, p4_drive_file_id)
           VALUES ($1,'High','New / Under Review','Thiruvarur',$2,$3, NULL, NULL, NULL, NULL, 'leg-a-1','leg-a-2','leg-a-3','leg-a-4')`,
    [legA, mLxA.school, mLxA.udise]);
  await q(`INSERT INTO tickets (ticket_id, priority, status, district, school_name, udise_code, photo1_data, photo2_data, photo3_data, photo4_data)
           VALUES ($1,'High','New / Under Review','Thiruvarur',$2,$3, $4, $4, $4, $4)`,
    [legB, mLxB.school, mLxB.udise, 'data:image/jpeg;base64,LEGACY-BYTES']);
  await q(`INSERT INTO tickets (ticket_id, priority, status, district, school_name, udise_code, photo1_data, photo3_data)
           VALUES ($1,'High','New / Under Review','Thiruvarur',$2,$3, $4, $4)`,
    [legD, mLxD.school, mLxD.udise, 'data:image/jpeg;base64,LEGACY-PARTIAL']);
  const legABefore = JSON.stringify(await ticketRow(legA));
  const legDisc = await server.runPhotoJobDiscovery(200);
  const legBJobs = await db.listPhotoJobs({ ticketId: legB });
  const legDJobs = await db.listPhotoJobs({ ticketId: legD });
  const legAJobs = await db.listPhotoJobs({ ticketId: legA });
  record('PG40. discovery: bytes-only -> 4 jobs, partial -> 2 jobs, confirmed -> 0',
    legBJobs.length === 4 && legDJobs.length === 2 && legAJobs.length === 0,
    `discovered=${legDisc.discovered}`);
  await server.drainPhotoJobs({ owner: 'pgLeg', maxJobs: 500, maxMs: 240000 });
  const legAAfter = JSON.stringify(await ticketRow(legA));
  const legBRow = await ticketRow(legB);
  record('PG41. confirmed legacy row byte-identical after discovery+drain (untouched)',
    legABefore === legAAfter);
  record('PG42. legacy bytes-only drains to IDs with bytes cleared',
    (await db.listPhotoJobs({ ticketId: legB })).every((j) => j.state === 'CONFIRMED')
    && !!legBRow.p1_drive_file_id && !String(legBRow.photo1_data || '').startsWith('data:'));
  const leaked = await q(`SELECT count(*)::int AS c FROM drive_photo_jobs WHERE state='CLAIMED'`);
  record('PG43. zero CLAIMED leases leak (every claim resolved)', leaked[0].c === 0, `leaked=${leaked[0].c}`);

  // §12 track-pump (serverless immediate worker): intake leaves jobs PENDING
  // (no inline worker); an unauthenticated track GET for the ticket processes
  // ONLY that ticket's jobs inside the read request; unknown queries drain
  // nothing and respond normally. Fresh picks avoid scale/open UDISEs.
  const mT1 = pickFresh();
  const mT2 = pickFresh();
  const tSub = await postIntake(mT1.udise, mT1.school, mT1.block);
  const tTid = tSub.json.ticketId;
  const tOther = await postIntake(mT2.udise, mT2.school, mT2.block);
  const tOtherId = tOther.json.ticketId;
  const tJobs0 = await db.listPhotoJobs({ ticketId: tTid });
  record('PG70. intake leaves 4 PENDING jobs (fast submit, no inline worker)',
    tJobs0.length === 4 && tJobs0.every((j) => j.state === 'PENDING'));
  const tRow0 = await ticketRow(tTid);
  record('PG71. bytes retained pre-track', String(tRow0.photo1_data || '').startsWith('data:') && !tRow0.p1_drive_file_id);
  const tRes = await callHandle({ method: 'GET', url: '/api/data?track=' + encodeURIComponent(tTid) });
  const tJson = JSON.parse(tRes.body);
  const tHit = (tJson.tickets || []).find((t) => String(t.ticketId) === tTid) || {};
  record('PG72. unauthenticated track GET succeeds', tRes.statusCode === 200 && Array.isArray(tJson.tickets));
  record('PG73. track-pump confirmed the ticket inside the read (IDs in response)',
    !!tHit.p1DriveFileId && !!tHit.p4DriveFileId);
  const tJobs1 = await db.listPhotoJobs({ ticketId: tTid });
  const tRow1 = await ticketRow(tTid);
  record('PG74. all 4 jobs CONFIRMED with bytes cleared post-track',
    tJobs1.every((j) => j.state === 'CONFIRMED') && !String(tRow1.photo1_data || '').startsWith('data:'));
  const oJobs = await db.listPhotoJobs({ ticketId: tOtherId });
  record('PG75. other tickets untouched by scoped pump (still PENDING)',
    oJobs.length === 4 && oJobs.every((j) => j.state === 'PENDING'));
  const tRes2 = await callHandle({ method: 'GET', url: '/api/data?track=' + encodeURIComponent(tTid) });
  record('PG76. second track is a clean no-op (nothing due)', tRes2.statusCode === 200);
  const tMiss = await callHandle({ method: 'GET', url: '/api/data?track=NO-SUCH-TICKET-XYZ' });
  const tMissJson = JSON.parse(tMiss.body);
  record('PG77. unknown track query drains nothing, responds normally',
    tMiss.statusCode === 200 && Array.isArray(tMissJson.tickets) && tMissJson.tickets.length === 0);
  // Scoped claim unit behavior on the untouched ticket.
  const sc1 = await db.claimPhotoJob({ owner: 'pgScope1', leaseMs: 60000, ticketIds: [tOtherId] });
  const sc2 = await db.claimPhotoJob({ owner: 'pgScope2', leaseMs: 60000, ticketIds: [tOtherId] });
  const sc3 = await db.claimPhotoJob({ owner: 'pgScope3', leaseMs: 60000, ticketIds: [tTid] });
  record('PG78. scoped claims take only the scoped ticket (disjoint, no cross-take)',
    sc1.claimed === true && sc1.job.ticketId === tOtherId
    && sc2.claimed === true && sc2.job.ticketId === tOtherId && sc2.job.jobId !== sc1.job.jobId
    && sc3.claimed === false);
  await db.failPhotoJob(sc1.job.jobId, new Error('scope test release'));
  await db.failPhotoJob(sc2.job.jobId, new Error('scope test release'));

  const ver = (await probe.query('SELECT version()')).rows[0].version;
  console.log('\n========================================================');
  console.log(`📦 PG-QUEUE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log(`[PG-IDENT] ${String(ver).split(' ').slice(0, 2).join(' ')} db=${pgDb} host=${pgHost}`);
  console.log('========================================================');
}

async function setupFreshDb() {
  const admin = new Pool({ connectionString: `postgresql://postgres@${pgHost}:5432/postgres` });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', ['photoq_test']);
    if (exists.rows.length === 0) await admin.query('CREATE ROLE photoq_test LOGIN');
    await admin.query(`DROP DATABASE IF EXISTS ${pgDb}`);
    await admin.query(`CREATE DATABASE ${pgDb} OWNER photoq_test`);
  } finally {
    await admin.end();
  }
  probe = new Pool({ connectionString: PG_URL, max: 8 });
}

async function teardown() {
  globalThis.fetch = realFetch;
  // Gracefully end db.js pools FIRST so terminating backends below cannot
  // surface as unhandled 'error' events on idle clients (test-harness only).
  for (const p of LocalPlainPool.instances.splice(0)) {
    try { await Promise.race([p.end(), new Promise((r) => setTimeout(r, 10000))]); } catch (e) {}
  }
  try { if (probe) await probe.end(); } catch (e) {}
    try {
      const admin = new Pool({ connectionString: `postgresql://postgres@${pgHost}:5432/postgres` });
      try {
        // db.js pools hold idle connections; terminate them first so the
        // disposable database can be dropped with zero residue.
        await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [pgDb]);
        await admin.query(`DROP DATABASE IF EXISTS ${pgDb}`);
        console.log('[PG-CLEANUP] disposable database dropped: ' + pgDb);
      } finally { await admin.end(); }
    } catch (e) { console.error('[PG-CLEANUP] drop skipped: ' + e.message); }
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  restoreRepo();
}

main().then(async () => {
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
}).catch(async (e) => {
  console.error('Fatal Suite Error:', e);
  await teardown();
  process.exit(1);
});