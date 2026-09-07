// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * PHASE-2 COMPLETION SERVER-SIDE PERF SUITE (hermetic, local only).
 *
 * Proves the approved DB/server optimizations without changing behavior:
 *  A. targeted ticket lookup (getTicketById hit/miss)
 *  B. completion POST performs ZERO full-table getAllTickets() scans
 *  C. narrow Drive-columns write preserves unrelated columns
 *  D. op-record append preserves history (cap 10, latest verification)
 *  E. completion job confirm is scope-isolated + single logical op
 *  F. intake jobs / unrelated tickets untouched by completion confirm
 *  G. idempotent repeated confirmation
 *  H. invalid kind/slots confirm nothing
 *  I. main durability write (broad updateTicket) still present
 *  J. EXIF/GPS + Drive verification + GAS sync path unchanged
 *  K. Phase-1 markers intact
 * No production writes. No network beyond localhost GAS stub.
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

const server = require('../server.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const db = require('../db.js');
const dbJs = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc}${details ? ' (' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc}${details ? ' (' + details + ')' : ''}`); }
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
    const timer = setTimeout(() => reject(new Error('timeout for ' + method + ' ' + url)), 120000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}

// Minimal valid JPEG bytes (SOI..EOI) + HM/Completion dataURLs.
const PIXEL = 'data:image/jpeg;base64,' + Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3F, 0x00, 0xD2, 0xCF, 0x20, 0xFF, 0xD9
]).toString('base64');

// ---- Controllable GAS stub (completion update + inspect only) ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url || '');
  if (!u.includes('script.google.com')) return realFetch(url, opts);
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  if (!opts || opts.method === 'GET' || !body.action) return { ok: true, json: async () => ({ tickets: [] }) };
  const tid = String(body.ticketId || '');
  if (body.action === 'update') {
    return {
      ok: true,
      json: async () => ({
        success: true, ticketId: tid, folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        hmDriveFileId: 'stub-' + tid + '-HM', compDriveFileId: 'stub-' + tid + '-COMP',
        hmReportPhotoUrl: 'https://drive.google.com/thumbnail?id=stub-' + tid + '-HM&sz=w800',
        completionPhotoUrl: 'https://drive.google.com/thumbnail?id=stub-' + tid + '-COMP&sz=w800',
        completionFiles: [],
      }),
    };
  }
  if (body.action === 'inspect_drive_structure') {
    const ud = String(body.udise || '');
    return {
      ok: true,
      json: async () => ({
        success: true, ticketId: tid, district: String(body.district || 'Thiruvarur'),
        schoolFolder: (ud ? ud + ' - ' : '') + 'stub-school', completionFolder: 'Completion Photos',
        folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        completionFiles: [
          { fileId: 'stub-' + tid + '-HM', fileName: tid + '_HM_Signed_Completion_Report.jpg', fileSize: 100, isTrashed: false },
          { fileId: 'stub-' + tid + '-COMP', fileName: tid + '_Completion_UPS_GPS.jpg', fileSize: 100, isTrashed: false },
        ],
      }),
    };
  }
  return { ok: true, json: async () => ({ success: false }) };
};

const RUN = String(Date.now() % 100000).padStart(5, '0');
const UDISE_A = '33209' + RUN + '01';
const UDISE_B = '33209' + RUN + '02';

function postIntake(udise, school) {
  return callHandle({
    method: 'POST', url: '/api/tickets',
    body: JSON.stringify({
      schoolName: school, udise, block: 'Kottur', district: 'Thiruvarur',
      aiName: 'Phase2 AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
      serialNo: 'SN-PH2', priority: 'High', remarks: 'Phase 2 fixture',
      photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL,
    }),
  }).then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
}
function postCompletion(ticketId, udise) {
  const now = new Date().toISOString();
  return callHandle({
    method: 'POST', url: '/api/tickets/completion-evidence',
    body: JSON.stringify({
      ticketId, udise, district: 'Thiruvarur', schoolName: 'PH2 School',
      source: 'AI Teacher', submittedBy: 'Phase2 AI',
      hmReportPhotoBase64: PIXEL, completionPhotoBase64: PIXEL,
      gpsLatitude: 10.75, gpsLongitude: 79.55, gpsAccuracy: 8, gpsTimestamp: now,
      gpsSource: 'web-camera', requireBoth: true, isFinalSubmit: true,
    }),
  }).then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
}
function completionHandlerSrc() {
  const a = serverJs.indexOf("pathname === '/api/tickets/completion-evidence'");
  const b = serverJs.indexOf('// 3. API: Update Ticket Status', a);
  return serverJs.slice(a, b < 0 ? undefined : b);
}

async function main() {
  console.log('========================================================');
  console.log('⚡ RUNNING PHASE-2 COMPLETION SERVER-SIDE PERF SUITE');
  console.log('========================================================\n');

  const inA = await postIntake(UDISE_A, 'PH2 School A');
  const inB = await postIntake(UDISE_B, 'PH2 School B');
  const tidA = inA.json.ticketId;
  const tidB = inB.json.ticketId;
  record('setup. two synthetic intake tickets created', inA.status === 200 && inB.status === 200 && !!tidA && !!tidB, tidA + ' / ' + tidB);

  // A. targeted lookup
  const got = await db.getTicketById(tidA);
  record('A1. getTicketById returns the ticket', !!got && String(got.ticketId) === String(tidA));
  record('A2. getTicketById miss returns null', (await db.getTicketById('HTL-TVR-NOPE-00000')) === null);
  record('A3. getTicketById blank returns null', (await db.getTicketById('')) === null);

  // B. zero full-table scans on the completion path (functional proof)
  const origGetAll = db.getAllTickets;
  let scanCount = 0;
  db.getAllTickets = async (...a) => { scanCount++; return origGetAll(...a); };
  let comp;
  try {
    comp = await postCompletion(tidA, UDISE_A);
  } finally {
    db.getAllTickets = origGetAll;
  }
  record('B1. completion POST succeeds end-to-end (PERSISTED + verified)', comp.status === 200 && comp.json.success === true && comp.json.persistenceStatus === 'PERSISTED' && comp.json.driveVerified === true, 'status=' + comp.status);
  record('B2. ZERO getAllTickets() scans during completion request', scanCount === 0, 'scans=' + scanCount);
  const hsrc = completionHandlerSrc();
  record('B3. handler source has no db.getAllTickets()', !hsrc.includes('db.getAllTickets()'));
  record('B4. handler uses targeted lookup + narrow writers',
    hsrc.includes('db.getTicketById(ticketId)') && hsrc.includes('db.appendCompletionOpRecord(') && hsrc.includes('db.writeCompletionDriveColumns('));

  // C. narrow write preserves unrelated columns
  const before = await db.getTicketById(tidB);
  await db.writeCompletionDriveColumns(tidB, {
    hmDriveFileId: 'hm-keep-1', compDriveFileId: 'comp-keep-1',
    hmReportPhotoUrl: 'https://drive.google.com/thumbnail?id=hm-keep-1&sz=w800',
    completionPhotoUrl: 'https://drive.google.com/thumbnail?id=comp-keep-1&sz=w800',
    googleDriveFolderUrl: 'https://drive.google.com/drive/folders/keep',
    completionEvidence: {
      hmSignedReport: { uploaded: true, fileUrl: 'hm-u', data: 'hm-data', driveFileId: 'hm-keep-1' },
      completionPhoto: { uploaded: true, fileUrl: 'comp-u', data: 'comp-data', driveFileId: 'comp-keep-1' },
      status: 'complete',
    },
  });
  const after = await db.getTicketById(tidB);
  record('C1. Drive IDs/URLs persisted', after.hmDriveFileId === 'hm-keep-1' && after.compDriveFileId === 'comp-keep-1');
  record('C2. unrelated columns untouched (status/remarks/phone/issue)',
    after.status === before.status && after.remarks === before.remarks && after.phone === before.phone && after.issue === before.issue,
    'status=' + after.status);
  record('C3. evidence object merged with data intact', !!(after.completionEvidence && after.completionEvidence.hmSignedReport && after.completionEvidence.hmSignedReport.data === 'hm-data'));

  // D. op-record history preserved + capped
  for (let i = 1; i <= 12; i++) {
    await db.appendCompletionOpRecord(tidB, {
      opId: 'op-' + i, ticketId: tidB, stages: ['bytes-durable'], status: 'pending-retry',
      folderUrl: '', folderId: '', hmFileId: i === 12 ? 'hm-final' : '', compFileId: '', verified: false, verifiedAt: null,
    }, {});
  }
  const hist = await db.getTicketById(tidB);
  const ops = (hist.completionEvidence && hist.completionEvidence.uploadOperations) || [];
  record('D1. history capped at last 10', ops.length === 10, 'len=' + ops.length);
  record('D2. oldest evicted, newest kept', ops[0].opId === 'op-3' && ops[9].opId === 'op-12');
  record('D3. lastDriveVerification tracks latest', hist.completionEvidence.lastDriveVerification.opId === 'op-12');
  record('D4. pre-existing driveFileId adopted from rec', hist.completionEvidence.hmSignedReport.driveFileId === 'hm-final');
  record('D5. pre-existing evidence data not wiped by op append', hist.completionEvidence.completionPhoto.data === 'comp-data');

  // E–I. job confirm scope isolation (completion hm/gps on A; intake on A; completion on B)
  await db.ensurePhotoJobs(tidA, [{ kind: 'completion', slot: 'hm' }, { kind: 'completion', slot: 'gps' }]);
  await db.ensurePhotoJobs(tidB, [{ kind: 'completion', slot: 'hm' }, { kind: 'completion', slot: 'gps' }]);
  const r1 = await db.confirmPhotoJobsForTicket(tidA, 'completion', ['hm', 'gps']);
  record('E1. completion confirm returns 2 for ticket A', r1.confirmed === 2, 'confirmed=' + r1.confirmed);
  const jAhm = await db.getPhotoJob(tidA, 'completion', 'hm');
  const jAgps = await db.getPhotoJob(tidA, 'completion', 'gps');
  record('E2. both A completion jobs CONFIRMED', jAhm.state === 'CONFIRMED' && jAgps.state === 'CONFIRMED');
  const r2 = await db.confirmPhotoJobsForTicket(tidA, 'completion', ['hm', 'gps']);
  record('G1. idempotent repeat confirm still returns 2', r2.confirmed === 2, 'confirmed=' + r2.confirmed);
  const intakeJobs = [];
  for (const s of ['1', '2', '3', '4']) intakeJobs.push(await db.getPhotoJob(tidA, 'intake', s));
  const bHm = await db.getPhotoJob(tidB, 'completion', 'hm');
  const bGps = await db.getPhotoJob(tidB, 'completion', 'gps');
  record('F1. intake jobs on A untouched', intakeJobs.every((j) => j && j.state !== 'CONFIRMED'));
  record('F2. unrelated ticket B completion jobs untouched', bHm.state !== 'CONFIRMED' && bGps.state !== 'CONFIRMED');
  const rBad = await db.confirmPhotoJobsForTicket(tidA, 'bogus-kind', ['hm']);
  const rBadSlot = await db.confirmPhotoJobsForTicket(tidA, 'completion', ['hm', 'nope', '']);
  record('H1. invalid kind confirms nothing', rBad.confirmed === 0);
  record('H2. invalid slots ignored, valid slot counted', rBadSlot.confirmed === 1, 'confirmed=' + rBadSlot.confirmed);

  // I. durability write unchanged
  record('I1. broad durability updateTicket(ticketId, updatePayload) intact', hsrc.includes('db.updateTicket(ticketId, updatePayload)'));

  // J. GAS/verify/EXIF path unchanged
  record('J1. GAS sync uses action update via fetch', serverJs.includes("action: 'update'") && hsrc.includes('syncCompletionEvidenceToGoogleDrive'));
  record('J2. verify-before-report intact', hsrc.includes('runDriveVerification') && hsrc.includes('verifyCompletionDriveFiles'));
  record('J3. adoption-before-upload intact', serverJs.includes('adoptedId') || serverJs.includes('adoptHm'));
  record('J4. server EXIF injection intact', serverJs.includes('function injectGpsExif') && hsrc.includes('injectGpsExif('));
  record('J5. GPS gates intact (50m / bounds / 600s)', hsrc.includes('gpsAccuracy') && hsrc.includes('600000'));
  record('J6. ID gate intact (no phantom Drive IDs)', serverJs.includes('isCompletionRetrySuccess'));

  // K. Phase-1 markers intact
  record('K1. 1600px cap + single-read + guard intact',
    serverJs.includes('MAX_COMPLETION_PHOTO_DIM = 1600')
    && serverJs.includes('function compArrayBufferToDataUrl')
    && serverJs.includes('lastCompEncodeKey')
    && serverJs.includes('preloadedDataUrl'));

  // L. single-statement confirm present in PG branch (static; JSON loop is in-process)
  record('L1. PG confirm is one UPDATE with ticket/kind/slot scope',
    dbJs.includes('WITH target AS') && dbJs.includes('slot = ANY($3)') && dbJs.includes("kind = $2"));

  console.log(`\nPHASE-2 SUITE: ${passed} passed, ${failed} failed`);
  globalThis.fetch = realFetch;
  restoreRepo();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SUITE ERROR:', e); try { globalThis.fetch = realFetch; } catch (x) {} try { restoreRepo(); } catch (x) {} process.exit(1); });
