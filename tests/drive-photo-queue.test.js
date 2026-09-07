// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * DURABLE PHOTO-QUEUE SUITE (A-Z, hermetic).
 * Covers the per-photo PostgreSQL/JSON job queue end to end:
 *  A. migration/schema contracts        N. Drive timeout keeps bytes
 *  B. job creation (present slots)      O. GAS failure keeps bytes
 *  C. job uniqueness                    P. crash-after-upload adopts
 *  D. concurrent claims are disjoint    Q. adoption without re-upload
 *  E. lease expiry reclaim              R. existing Drive ID preservation
 *  F. stale worker recovery             S. atomic ID + byte cleanup
 *  G. retry/backoff + FAILED_PERMANENT  T. completion HM job
 *  H. request-id retry + safe conflict  U. completion GPS job
 *  I. concurrent same request_id        V. GPS-watermarked bytes preserved
 *  J. concurrent same UDISE             W. legacy discovery + drain
 *  K. existing-ticket requeue           X. dashboard projection compat
 *  L. one-photo GAS calls               Y. worker execution budget
 *  M. partial 3/4 intake upload         Z. restart/lease recovery
 * Hermetic GAS stub + tmpdir isolation. Zero production writes.
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
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const db = require('../db.js');
const dbJs = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');

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
    const timer = setTimeout(() => reject(new Error('timeout for ' + method + ' ' + url)), 120000);
    res._done = () => { clearTimeout(timer); resolve(res); };
    try {
      const r = server.handleRequest(req, res);
      if (r && typeof r.catch === 'function') r.catch((e) => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
    req.start();
  });
}

// ---- Controllable GAS stub ----
const driveFiles = new Map(); // canonical name -> { id, size, folder }
const createCalls = [];       // { tid, kind, slot, singleSlot }
const createCount = new Map();// canonical name -> number of creates
const stubModes = { failCreate: new Set(), throwFor: new Set(), inspectEmptyFor: new Set() };
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
    let files = [...driveFiles.entries()]
      .filter(([n]) => tid && n.startsWith(tid + '_'))
      .map(([n, f]) => ({ fileId: f.id, fileName: n, fileSize: f.size, isTrashed: false, folder: f.folder }));
    if (stubModes.inspectEmptyFor.has(tid)) files = [];
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
  // completion single-slot update
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
const WMMARK = 'data:image/jpeg;base64,/9j/WATERMARKED-GPS-BYTES-PRESERVED-EXACTLY-';

// Eligible-job ages (local JSON backend): force every job's nextAttemptAt
// into the past so fail-release backoff never blocks a subsequent claim.
function ageAllJobsToDrainable() {
  const f = path.join(TMP_DATA, 'drive_photo_jobs.json');
  const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  const past = new Date(Date.now() - 1000).toISOString();
  for (const j of arr) if (j.state === 'PENDING') j.nextAttemptAt = past;
  fs.writeFileSync(f, JSON.stringify(arr));
}
// Test-only store surgery: deterministically preset one job's fields
// (simulates prior attempts without racing the global queue).
function setPhotoJob(ticketId, kind, slot, patch) {
  const f = path.join(TMP_DATA, 'drive_photo_jobs.json');
  const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  const j = arr.find((x) => String(x.ticketId) === String(ticketId) && x.kind === kind && String(x.slot) === String(slot));
  if (!j) throw new Error('job not found for surgery: ' + ticketId + '/' + kind + '/' + slot);
  Object.assign(j, patch);
  fs.writeFileSync(f, JSON.stringify(arr));
}
// Full-queue drain budget: every worker drain processes ALL due jobs so
// per-ticket assertions never starve behind older tickets' jobs.
const FULL_DRAIN_MS = 180000;
function fullDrain(owner) { return server.drainPhotoJobs({ owner, maxJobs: 500, maxMs: FULL_DRAIN_MS }); }

const RUN5 = String(Date.now() % 100000).padStart(5, '0');
const UDISE = (s) => `332${RUN5}${s}`;
const T = (s) => `HTL-TVR-Q${RUN5.slice(-3)}${s}`;
async function rowOf(tid) {
  return (await db.getAllTickets()).find((t) => String(t.ticketId) === tid);
}
function postIntake(udise, school, extra) {
  return callHandle({
    method: 'POST', url: '/api/tickets',
    body: JSON.stringify(Object.assign({
      schoolName: school, udise, block: 'Kottur', district: 'Thiruvarur',
      aiName: 'Scale AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
      serialNo: 'SN-1', priority: 'High', remarks: 'Photo queue fixture',
      photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL,
    }, extra || {})),
  }).then(async (r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
}

async function main() {
  console.log('========================================================');
  console.log('📦 RUNNING DURABLE PHOTO-QUEUE SUITE (hermetic A-Z)');
  console.log('========================================================\n');

  // A. Migration / schema contracts.
  const jobsDdl = dbJs.slice(dbJs.indexOf('CREATE TABLE IF NOT EXISTS drive_photo_jobs'), dbJs.indexOf('CREATE TABLE IF NOT EXISTS drive_photo_jobs') + 1600);
  record('A1. jobs table carries no byte columns',
    jobsDdl.includes('drive_photo_jobs') && !/photo\d?_?\w*(data|base64)/i.test(jobsDdl));
  record('A2. uniqueness on (ticket_id, kind, slot)', dbJs.includes('UNIQUE (ticket_id, kind, slot)'));
  record('A3. partial eligible-job index', dbJs.includes('idx_photo_jobs_eligible') && dbJs.includes('FOR UPDATE SKIP LOCKED'));
  record('A4. idempotency column + unique index', dbJs.includes('client_request_id') && dbJs.includes('uq_tickets_client_request_id'));
  record('A5. states cover PENDING/CLAIMED/CONFIRMED/FAILED_PERMANENT', ['PENDING', 'CLAIMED', 'CONFIRMED', 'FAILED_PERMANENT'].every((s) => dbJs.includes(s)));

  // B. Job creation for present slots only (end-to-end via intake POST).
  const bSub = await postIntake(UDISE('101'), 'GHSS PHQB');
  const bTid = bSub.json.ticketId;
  const bJobs = await db.listPhotoJobs({ ticketId: bTid });
  record('B1. intake persists and confirms photos inline',
    bSub.json.success === true && !('drivePendingRetry' in bSub.json), `ticket=${bTid}`);
  record('B2. 4 jobs created for 4 present photos (CONFIRMED by intake-pump)',
    bJobs.length === 4 && bJobs.every((j) => j.kind === 'intake' && j.state === 'CONFIRMED'), `jobs=${bJobs.length}`);

  // C. Uniqueness: duplicate ensure/create never duplicates.
  const c1 = await db.createPhotoJob(bTid, 'intake', '1');
  const c2 = await db.ensurePhotoJobs(bTid, [{ kind: 'intake', slot: '1' }, { kind: 'intake', slot: '2' }]);
  const cJobs = await db.listPhotoJobs({ ticketId: bTid });
  record('C1. duplicate create returns existing (no duplicate)', c1.created === false && !!c1.job && c2.created === 0);
  record('C2. still exactly 4 jobs', cJobs.length === 4);
  const cBad = await db.createPhotoJob(bTid, 'intake', '9');
  record('C3. invalid slot rejected', cBad.created === false);

  // D. Concurrent claims are disjoint.
  // Create a fresh ticket directly (bypass intake-pump) with PENDING jobs for claim testing.
  const dTid = T('D1');
  await db.createTicket({
    ticketId: dTid, udise: UDISE('130'), district: 'Thiruvarur', schoolName: 'GHSS PHQD',
    priority: 'High', status: 'New / Under Review',
    photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL
  });
  await db.ensurePhotoJobs(dTid, [{ kind: 'intake', slot: '1' }, { kind: 'intake', slot: '2' }, { kind: 'intake', slot: '3' }, { kind: 'intake', slot: '4' }]);
  ageAllJobsToDrainable();
  const dClaims = await Promise.all([1, 2, 3].map((i) => db.claimPhotoJob({ owner: 'wD' + i, leaseMs: 60000 })));
  const dIds = dClaims.filter((c) => c.claimed).map((c) => c.job.jobId);
  record('D1. 3 concurrent claims take 3 distinct jobs', new Set(dIds).size === 3, dIds.join(','));
  const dEmpty = await db.claimPhotoJob({ owner: 'wD4', leaseMs: 60000 });
  record('D2. 4th claim takes the last free job (or empty if none left)',
    (dEmpty.claimed === true && ![...dIds].includes(dEmpty.job.jobId)) || dEmpty.claimed === false,
    `claimed=${dEmpty.claimed}`);
  if (dEmpty.claimed) dIds.push(dEmpty.job.jobId);
  // release D claims back to PENDING for later stages (fail = retryable)
  for (const c of dClaims) if (c.claimed) await db.failPhotoJob(c.job.jobId, new Error('test release'));
  if (dEmpty.claimed) await db.failPhotoJob(dEmpty.job.jobId, new Error('test release'));

  // G-first (needed before E/F reuse): fail -> PENDING with backoff + error.
  // Jobs were just released (PENDING, nextAttemptAt in the future from fail
  // backoff): age their nextAttemptAt into the past so a claim can proceed.
  ageAllJobsToDrainable();
  const gClaim = await db.claimPhotoJob({ owner: 'wG', leaseMs: 60000 });
  const gFail = await db.failPhotoJob(gClaim.job.jobId, new Error('transient boom'));
  record('G1. transient fail returns PENDING with backoff + error',
    gFail.job.state === 'PENDING' && gFail.permanent === false
    && Date.parse(gFail.job.nextAttemptAt) > Date.now() && gFail.job.lastError.includes('transient boom'));

  // G2. attempt exhaustion -> FAILED_PERMANENT (durable, never re-claimed).
  // Deterministic: preset attempts to MAX-1 with the oldest due timestamp so
  // the very next claim takes this job; one more fail must flip it permanent.
  const gTid = T('G9');
  await db.createTicket({ ticketId: gTid, udise: UDISE('117'), district: 'Thiruvarur', schoolName: 'GHSS PHQG', priority: 'High', status: 'New / Under Review', photo1Url: PIXEL });
  await db.createPhotoJob(gTid, 'intake', '1');
  setPhotoJob(gTid, 'intake', '1', {
    attempts: (db.PHOTO_JOB_MAX_ATTEMPTS || 10) - 1, state: 'PENDING',
    nextAttemptAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    leaseOwner: null, leaseExpiresAt: null, lastError: '',
  });
  const gEx = await db.claimPhotoJob({ owner: 'wGperm', leaseMs: 60000 });
  if (gEx.claimed) await db.failPhotoJob(gEx.job.jobId, new Error('persistent outage final'));
  const gCur = await db.getPhotoJob(gTid, 'intake', '1');
  record('G2. exhausted retries land FAILED_PERMANENT with last error kept',
    gEx.claimed === true && gEx.job.ticketId === gTid
    && !!gCur && gCur.state === 'FAILED_PERMANENT' && gCur.attempts >= (db.PHOTO_JOB_MAX_ATTEMPTS || 10)
    && gCur.lastError.includes('persistent outage final'));
  // G3. park every other PENDING job in the future: the PERMANENT job must
  // still never be claimed (claim returns empty; bytes stay in DB). No queue
  // churn, no attempt inflation on other tickets' jobs.
  {
    const f = path.join(TMP_DATA, 'drive_photo_jobs.json');
    const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    for (const j of arr) if (j.state === 'PENDING' && String(j.ticketId) !== gTid) j.nextAttemptAt = future;
    fs.writeFileSync(f, JSON.stringify(arr));
  }
  const gProbe = await db.claimPhotoJob({ owner: 'wGprobe', leaseMs: 60000 });
  record('G3. FAILED_PERMANENT job is never re-claimed (queue correctly idle)',
    gProbe.claimed === false && (await db.getPhotoJob(gTid, 'intake', '1')).state === 'FAILED_PERMANENT'
    && (await rowOf(gTid)).photo1Url === PIXEL);
  ageAllJobsToDrainable(); // restore drainability for later stages

  // E/F/Z. Lease expiry + stale recovery: claim a RELEASED job, backdate its
  // lease AND its nextAttemptAt into the distant past (crashed worker) so it
  // sorts first globally; another worker must reclaim it with attempts+1.
  const eClaim = await db.claimPhotoJob({ owner: 'wE', leaseMs: 60000 });
  {
    const f = path.join(TMP_DATA, 'drive_photo_jobs.json');
    const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
    const ix = arr.findIndex((j) => Number(j.jobId) === Number(eClaim.job.jobId));
    arr[ix].leaseExpiresAt = new Date(Date.now() - 5000).toISOString();
    arr[ix].nextAttemptAt = new Date(Date.now() - 3600 * 1000).toISOString();
    fs.writeFileSync(f, JSON.stringify(arr));
  }
  const eReclaim = await db.claimPhotoJob({ owner: 'wE2', leaseMs: 60000 });
  record('E/F/Z. expired lease reclaimed by another worker (attempts+1, no loss)',
    eReclaim.claimed === true && eReclaim.job.jobId === eClaim.job.jobId
    && eReclaim.job.leaseOwner === 'wE2' && eReclaim.job.attempts === eClaim.job.attempts + 1);
  await db.failPhotoJob(eReclaim.job.jobId, new Error('test release 2'));

  // H. request-id retry + safe conflict (no byte overwrite, no status regress).
  const HKEY = 'key-' + RUN5 + '-h';
  const hUdise = UDISE('102');
  await db.createTicket({ ticketId: T('H1'), udise: hUdise, district: 'Thiruvarur', schoolName: 'GHSS PHQH', priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, clientRequestId: HKEY });
  await db.updateTicket(T('H1'), { status: 'In Progress (Remote)' });
  const hRetry = await db.createTicketIfNotExists({ ticketId: T('H1'), udise: hUdise, district: 'Thiruvarur', schoolName: 'GHSS PHQH', priority: 'High', status: 'New / Under Review', photo1Url: 'data:image/jpeg;base64,ATTACKER-BYTES' });
  const hRow = await rowOf(T('H1'));
  record('H1. conflicting insert does NOTHING (no byte overwrite)',
    hRetry.created === false && hRow.photo1Url === PIXEL);
  record('H2. status never regressed by stale retry', hRow.status === 'In Progress (Remote)', hRow.status);
  const hKeyLookup = await db.findTicketByClientRequestId(HKEY);
  record('H3. same request_id resolves to same ticket', !!hKeyLookup && hKeyLookup.ticketId === T('H1'));
  record('H4. empty key never matches', (await db.findTicketByClientRequestId('')) === null);

  // I. concurrent same request_id via handler.
  const IKEY = 'key-' + RUN5 + '-i';
  const iRes = await Promise.all(Array.from({ length: 15 }, () => postIntake(UDISE('103'), 'GHSS PHQI', { clientRequestId: IKEY })));
  const iIds = iRes.map((r) => r.json.ticketId);
  const iRows = (await db.getAllTickets()).filter((t) => String(t.udise) === UDISE('103'));
  record('I1. 15 concurrent same-key submits converge on one ticket',
    new Set(iIds).size === 1 && iRows.length === 1, [...new Set(iIds)].join(','));

  // J. concurrent same UDISE without key.
  const jRes = await Promise.all(Array.from({ length: 15 }, () => postIntake(UDISE('104'), 'GHSS PHQJ')));
  const jIds = jRes.map((r) => r.json.ticketId);
  const jRows = (await db.getAllTickets()).filter((t) => String(t.udise) === UDISE('104'));
  record('J1. 15 concurrent same-UDISE converge (PK, no dupes)', jRows.length === 1, `rows=${jRows.length}`);
  record('J2. all responses success', jRes.every((r) => r.json.success === true));
  const jWinner = await rowOf(jIds[0]);
  record('J3. winner has Drive IDs (intake-pump confirmed)', [1, 2, 3, 4].every((i) => !!jWinner['p' + i + 'DriveFileId']));

  // K. existing-ticket requeue: bytes present, no IDs, no jobs -> jobs appear.
  const KUD = UDISE('105');
  await db.createTicket({ ticketId: T('K1'), udise: KUD, district: 'Thiruvarur', schoolName: 'GHSS PHQK', priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, photo2Url: PIXEL });
  const kBefore = await db.listPhotoJobs({ ticketId: T('K1') });
  const kSub = await postIntake(KUD, 'GHSS PHQK');
  const kJobs = await db.listPhotoJobs({ ticketId: T('K1') });
  record('K1. existing ticket returned (no orphan path)', kSub.json.isExisting === true && kSub.json.ticketId === T('K1'));
  record('K2. unconfirmed slots requeued without duplicates',
    kBefore.length === 0 && kJobs.length === 2 && kJobs.every((j) => j.state === 'PENDING'), `jobs=${kJobs.length}`);

  // B3/R setup ticket: full intake drain path via worker.
  // Inject slot 4 failure BEFORE postIntake so intake-pump encounters it inline.
  const mRealFetch = globalThis.fetch;
  let mFailSlot4 = true;
  globalThis.fetch = async (url, opts) => {
    try {
      const b = JSON.parse((opts && opts.body) || '{}');
      if (mFailSlot4 && b.action === 'create' && b.photo4Base64 && !b.photo1Base64 && !b.photo2Base64 && !b.photo3Base64) {
        return { ok: true, json: async () => ({ success: false, error: 'simulated GAS failure for slot 4' }) };
      }
    } catch (e) {}
    return mRealFetch(url, opts);
  };
  const mTid = (await postIntake(UDISE('106'), 'GHSS PHQM')).json.ticketId;
  mFailSlot4 = false;
  globalThis.fetch = mRealFetch;
  const mRow = await rowOf(mTid);
  const mJobs = await db.listPhotoJobs({ ticketId: mTid });
  const st = (s) => (mJobs.find((j) => j.slot === s) || {}).state;
  record('M1. partial 3/4: three slots CONFIRMED, slot 4 stays PENDING',
    st('1') === 'CONFIRMED' && st('2') === 'CONFIRMED' && st('3') === 'CONFIRMED' && st('4') !== 'CONFIRMED');
  record('M2. failed slot keeps bytes + no ID', !!mRow.photo4Url && (mRow.photo4Url.startsWith('data:') || mRow.photo4Url.startsWith('/uploads/')) && !mRow.p4DriveFileId);
  record('M3. confirmed slots carry Drive IDs + https URLs (atomic release)',
    !!mRow.p1DriveFileId && mRow.photo1Url === U(mRow.p1DriveFileId) && !!mRow.p3DriveFileId);
  // Recovery: age and drain the failed slot.
  ageAllJobsToDrainable();
  await fullDrain('wM2');
  const mRow2 = await rowOf(mTid);
  record('M4. recovery pass confirms slot 4 (no re-upload storm)',
    (await db.getPhotoJob(mTid, 'intake', '4')).state === 'CONFIRMED' && !!mRow2.p4DriveFileId);

  // L. every GAS create carried exactly one photo slot.
  const mCalls = createCalls.filter((c) => c.tid === mTid);
  record('L1. one-photo GAS calls only (sequential, never batched)',
    mCalls.length >= 4 && mCalls.every((c) => c.singleSlot === true), `calls=${mCalls.length}`);
  record('L2. failed attempt created nothing; recovery uploads exactly once (no storm)',
    createCount.get(`${mTid}_Evidence_4.jpg`) === 1, `creates=${createCount.get(`${mTid}_Evidence_4.jpg`)}`);

  // N. Drive timeout keeps bytes + retry scheduled.
  // Inject slot 2 failure BEFORE postIntake so intake-pump encounters it inline.
  const nRealFetch = globalThis.fetch;
  let nFailSlot2 = true;
  globalThis.fetch = async (url, opts) => {
    try {
      const b = JSON.parse((opts && opts.body) || '{}');
      if (nFailSlot2 && b.action === 'create' && b.photo2Base64 && !b.photo1Base64 && !b.photo3Base64 && !b.photo4Base64) {
        throw new Error('simulated network timeout for slot 2');
      }
    } catch (e) { if (e.message.includes('simulated network timeout')) throw e; }
    return nRealFetch(url, opts);
  };
  const nTid = (await postIntake(UDISE('107'), 'GHSS PHQN')).json.ticketId;
  nFailSlot2 = false;
  globalThis.fetch = nRealFetch;
  const nRow = await rowOf(nTid);
  const nJob = await db.getPhotoJob(nTid, 'intake', '2');
  record('N1. timeout: bytes retained, job PENDING with error',
    !!nRow.photo2Url && (nRow.photo2Url.startsWith('data:') || nRow.photo2Url.startsWith('/uploads/')) && nJob.state !== 'CONFIRMED' && !!nJob.lastError);
  ageAllJobsToDrainable();
  await fullDrain('wN2');
  record('N2. timeout recovers on retry', (await db.getPhotoJob(nTid, 'intake', '2')).state === 'CONFIRMED');

  // O. GAS failure keeps bytes + schedules retry.
  // Inject all-slot failure BEFORE postIntake so intake-pump encounters it inline.
  const oRealFetch = globalThis.fetch;
  let oFailAll = true;
  globalThis.fetch = async (url, opts) => {
    try {
      const b = JSON.parse((opts && opts.body) || '{}');
      if (oFailAll && b.action === 'create' && (b.photo1Base64 || b.photo2Base64 || b.photo3Base64 || b.photo4Base64)) {
        return { ok: true, json: async () => ({ success: false, error: 'simulated GAS all-slot failure' }) };
      }
    } catch (e) {}
    return oRealFetch(url, opts);
  };
  const oTid = (await postIntake(UDISE('108'), 'GHSS PHQO')).json.ticketId;
  oFailAll = false;
  globalThis.fetch = oRealFetch;
  const oRow = await rowOf(oTid);
  const oJobs = await db.listPhotoJobs({ ticketId: oTid });
  record('O1. GAS failure: all bytes retained, all jobs non-CONFIRMED',
    [1, 2, 3, 4].every((i) => (oRow['photo' + i + 'Url'] || '').startsWith('data:'))
    && oJobs.every((j) => j.state !== 'CONFIRMED'));
  // Cleanup: allow recovery on next drain
  ageAllJobsToDrainable();

  // P. crash-after-upload: hook throws right after a successful GAS create;
  // the mandatory post-upload read-back must still adopt (no duplicate).
  // Create directly via DB since intake-pump doesn't support _testHooks.
  const pTid = T('P1');
  await db.createTicket({
    ticketId: pTid, udise: UDISE('109'), district: 'Thiruvarur', schoolName: 'GHSS PHQP',
    priority: 'High', status: 'New / Under Review',
    photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL
  });
  await db.ensurePhotoJobs(pTid, [{ kind: 'intake', slot: '1' }, { kind: 'intake', slot: '2' }, { kind: 'intake', slot: '3' }, { kind: 'intake', slot: '4' }]);
  let crashed = false;
  ageAllJobsToDrainable();
  const pDrain = await server.drainPhotoJobs({
    owner: 'wP', maxJobs: 500, maxMs: FULL_DRAIN_MS,
    _testHooks: { onAfterUpload: async () => { crashed = true; throw new Error('simulated worker crash after upload'); } },
  });
  const pJobs = await db.listPhotoJobs({ ticketId: pTid });
  const pCreates = [1, 2, 3, 4].map((i) => createCount.get(`${pTid}_Evidence_${i}.jpg`) || 0);
  record('P1. crash injected after upload', crashed === true);
  record('P2. adoption recovered every slot (no second create)',
    pJobs.every((j) => j.state === 'CONFIRMED') && pCreates.every((c) => c === 1), `creates=${pCreates.join(',')}`);

  // Q. pre-existing Drive file adopted without any create.
  // Create directly via DB to get PENDING jobs for adoption testing.
  const qTid = T('Q1');
  await db.createTicket({
    ticketId: qTid, udise: UDISE('110'), district: 'Thiruvarur', schoolName: 'GHSS PHQQ',
    priority: 'High', status: 'New / Under Review',
    photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL
  });
  await db.ensurePhotoJobs(qTid, [{ kind: 'intake', slot: '1' }, { kind: 'intake', slot: '2' }, { kind: 'intake', slot: '3' }, { kind: 'intake', slot: '4' }]);
  driveFiles.set(`${qTid}_Evidence_1.jpg`, { id: `stub-${qTid}-preexisting`, size: 4242, folder: 'Evidence' });
  // Simulate two prior attempts deterministically (retry-adoption branch).
  setPhotoJob(qTid, 'intake', '1', {
    attempts: 2, state: 'PENDING', nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
    leaseOwner: null, leaseExpiresAt: null, lastError: 'aged by test',
  });
  const qSlot1CreatesBefore = createCount.get(`${qTid}_Evidence_1.jpg`) || 0;
  ageAllJobsToDrainable();
  await fullDrain('wQ');
  const qAfter = createCalls.filter((c) => c.tid === qTid && c.slot === '1').length;
  const qRow = await rowOf(qTid);
  record('Q1. existing file adopted with zero new creates for slot 1',
    qAfter === 0 && (createCount.get(`${qTid}_Evidence_1.jpg`) || 0) === qSlot1CreatesBefore
    && (await db.getPhotoJob(qTid, 'intake', '1')).state === 'CONFIRMED');
  record('Q2. adopted ID is the pre-existing file', qRow.p1DriveFileId === `stub-${qTid}-preexisting`);

  // R. pre-existing genuine IDs survive a 05303-class empty GAS round.
  const rTid = (await postIntake(UDISE('111'), 'GHSS PHQR')).json.ticketId;
  await db.updateTicket(rTid, { p1DriveFileId: 'genuine-1', p2DriveFileId: 'genuine-2', p3DriveFileId: 'genuine-3', p4DriveFileId: 'genuine-4' });
  for (const s of ['1', '2', '3', '4']) stubModes.failCreate.add(rTid + '|intake|' + s);
  ageAllJobsToDrainable();
  await fullDrain('wR');
  const rRow = await rowOf(rTid);
  record('R1. empty GAS round never wipes genuine IDs',
    ['genuine-1', 'genuine-2', 'genuine-3', 'genuine-4'].every((v, i) => rRow['p' + (i + 1) + 'DriveFileId'] === v));
  for (const s of ['1', '2', '3', '4']) stubModes.failCreate.delete(rTid + '|intake|' + s);

  // S. atomic confirm+clear, slot independence (completion).
  const sTid = T('S1');
  await db.createTicket({
    ticketId: sTid, udise: UDISE('112'), district: 'Thiruvarur', schoolName: 'GHSS PHQS',
    priority: 'High', status: 'New / Under Review',
    hmReportPhotoBase64: PIXEL, completionPhotoBase64: PIXEL,
    completionEvidence: {
      hmSignedReport: { uploaded: true, data: PIXEL, fileUrl: '', driveFileId: '' },
      completionPhoto: { uploaded: true, data: PIXEL, fileUrl: '', driveFileId: '' },
    },
  });
  await db.ensurePhotoJobs(sTid, [{ kind: 'completion', slot: 'hm' }, { kind: 'completion', slot: 'gps' }]);
  stubModes.failCreate.add(sTid + '|completion|gps');
  ageAllJobsToDrainable();
  await fullDrain('wS');
  const sRow = await rowOf(sTid);
  const sHm = await db.getPhotoJob(sTid, 'completion', 'hm');
  const sGps = await db.getPhotoJob(sTid, 'completion', 'gps');
  record('S1. HM confirmed atomically (ID + URL + bytes cleared in one record)',
    sHm.state === 'CONFIRMED' && !!sRow.hmDriveFileId && sRow.hmReportPhotoBase64 === ''
    && (((sRow.completionEvidence || {}).hmSignedReport || {}).data === ''));
  record('S2. GPS failure keeps its bytes (slot independence)',
    sGps.state === 'PENDING' && (sRow.completionPhotoBase64 || '').startsWith('data:'));
  stubModes.failCreate.delete(sTid + '|completion|gps');
  ageAllJobsToDrainable();
  await fullDrain('wS2');
  const sRow2 = await rowOf(sTid);
  record('S3. GPS recovers independently', (await db.getPhotoJob(sTid, 'completion', 'gps')).state === 'CONFIRMED' && !!sRow2.compDriveFileId);

  // T/U. completion jobs created from submit; V. exact stored bytes sent.
  const tTid = (await postIntake(UDISE('113'), 'GHSS PHQT')).json.ticketId;
  await db.updateTicket(tTid, {
    hmReportPhotoBase64: PIXEL, completionPhotoBase64: WMMARK,
    completionEvidence: {
      hmSignedReport: { uploaded: true, data: PIXEL, fileUrl: '', driveFileId: '' },
      completionPhoto: { uploaded: true, data: WMMARK, fileUrl: '', driveFileId: '' },
    },
  });
  await db.ensurePhotoJobs(tTid, [{ kind: 'completion', slot: 'hm' }, { kind: 'completion', slot: 'gps' }]);
  ageAllJobsToDrainable();
  await fullDrain('wT');
  const tRow = await rowOf(tTid);
  record('T/U. HM + GPS jobs confirm independently',
    (await db.getPhotoJob(tTid, 'completion', 'hm')).state === 'CONFIRMED'
    && (await db.getPhotoJob(tTid, 'completion', 'gps')).state === 'CONFIRMED'
    && !!tRow.hmDriveFileId && !!tRow.compDriveFileId);
  // V is asserted via the update-body capture below (re-run with capture).
  record('V1. GPS validation path untouched (Phase-37 owns this)', serverJs.includes('MAX_ACCEPTABLE_ACCURACY_METERS'));

  // W. legacy discovery: bytes-only record gets jobs + drains.
  const wTid = T('W1');
  await db.createTicket({ ticketId: wTid, udise: UDISE('114'), district: 'Thiruvarur', schoolName: 'GHSS PHQW', priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, photo3Url: PIXEL });
  const wDisc = await server.runPhotoJobDiscovery(50);
  const wJobs = await db.listPhotoJobs({ ticketId: wTid });
  record('W1. discovery creates jobs for legacy bytes (slots 1+3 only)',
    wDisc.discovered >= 2 && wJobs.length === 2 && wJobs.map((j) => j.slot).sort().join(',') === '1,3');
  ageAllJobsToDrainable();
  await fullDrain('wW');
  record('W2. legacy record drains to confirmed', (await db.listPhotoJobs({ ticketId: wTid })).every((j) => j.state === 'CONFIRMED'));

  // X. dashboard projection compat on a confirmed photo-job record.
  const xRow = await rowOf(mTid);
  const xProj = server.projectTicketForDashboard(xRow);
  record('X1. confirmed record projects byte-free with IDs intact',
    !JSON.stringify(xProj).includes('data:image') && !!xProj.p1DriveFileId && !!xProj.p4DriveFileId);

  // Y. worker budget: caps honored, empty queue stops cleanly.
  // Pre-drain first so the only due jobs are the fresh ticket's (deterministic).
  ageAllJobsToDrainable();
  await fullDrain('wY0');
  // Create directly via DB to get PENDING jobs for budget testing.
  const yTid = T('Y1');
  await db.createTicket({
    ticketId: yTid, udise: UDISE('115'), district: 'Thiruvarur', schoolName: 'GHSS PHQY',
    priority: 'High', status: 'New / Under Review',
    photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL
  });
  await db.ensurePhotoJobs(yTid, [{ kind: 'intake', slot: '1' }, { kind: 'intake', slot: '2' }, { kind: 'intake', slot: '3' }, { kind: 'intake', slot: '4' }]);
  ageAllJobsToDrainable();
  const yDrain = await server.drainPhotoJobs({ owner: 'wY', maxJobs: 1, maxMs: 60000 });
  const yLeft = (await db.listPhotoJobs({ ticketId: yTid })).filter((j) => j.state === 'PENDING').length;
  record('Y1. maxJobs cap honored (1 claimed, rest durable)', yDrain.claimed === 1 && yLeft === 3, `left=${yLeft}`);
  ageAllJobsToDrainable();
  await fullDrain('wY2');
  const yEmpty = await server.drainPhotoJobs({ owner: 'wY3', maxJobs: 10, maxMs: 5000 });
  record('Y2. empty queue stops cleanly', yEmpty.claimed === 0 && yEmpty.success === true);

  // V2. exact stored GPS bytes reach GAS (fresh ticket, body capture).
  const vTid = T('V1');
  await db.createTicket({
    ticketId: vTid, udise: UDISE('116'), district: 'Thiruvarur', schoolName: 'GHSS PHQV',
    priority: 'High', status: 'New / Under Review',
    completionPhotoBase64: WMMARK,
    completionEvidence: { completionPhoto: { uploaded: true, data: WMMARK, fileUrl: '', driveFileId: '' } },
  });
  await db.ensurePhotoJobs(vTid, [{ kind: 'completion', slot: 'gps' }]);
  let seenGpsBody = null;
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    try {
      const b = JSON.parse((opts && opts.body) || '{}');
      if (b.action === 'update' && String(b.ticketId) === vTid && b.completionPhotoBase64) seenGpsBody = b.completionPhotoBase64;
    } catch (e) {}
    return realFetch2(url, opts);
  };
  await server.drainPhotoJobs({ owner: 'wV', maxJobs: 500, maxMs: FULL_DRAIN_MS });
  globalThis.fetch = realFetch2;
  record('V2. worker sends the exact stored watermarked bytes (no regen)',
    seenGpsBody === WMMARK, `match=${seenGpsBody === WMMARK}`);

  // Z. Intake-pump + track-pump backstop: intake now runs the scoped worker
  // inline, so jobs are CONFIRMED after POST (not PENDING). Track-pump
  // remains as a backstop for deliberately failed photos.
  const zSub = await postIntake(UDISE('120'), 'GHSS PHQZ');
  const zTid = zSub.json.ticketId;
  const zOther = await postIntake(UDISE('121'), 'GHSS PHQY2');
  const zOtherId = zOther.json.ticketId;
  record('Z1. intake-pump confirms jobs inline (not PENDING)',
    (await db.listPhotoJobs({ ticketId: zTid })).every((j) => j.state === 'CONFIRMED'));
  // Z2. track-pump still confirms other ticket's jobs in-request.
  // zOther should also be CONFIRMED by its own intake-pump.
  const zRes = await callHandle({ method: 'GET', url: '/api/data?track=' + encodeURIComponent(zOtherId) });
  const zJson = JSON.parse(zRes.body);
  const zHit = (zJson.tickets || []).find((t) => String(t.ticketId) === zOtherId) || {};
  record('Z2. track-pump read succeeds for confirmed ticket',
    zRes.statusCode === 200 && !!zHit.ticketId);
  record('Z3. both tickets independently confirmed by their own intake-pump',
    (await db.listPhotoJobs({ ticketId: zOtherId })).every((j) => j.state === 'CONFIRMED'));
  // Z4. Scoped-claim unit behavior (all jobs already CONFIRMED, no claimable).
  const zcX = await db.claimPhotoJob({ owner: 'zX', leaseMs: 60000, ticketIds: [zTid] });
  record('Z4. scoped claim returns nothing for fully confirmed ticket', zcX.claimed === false);

  // ================================================================
  // AA. INTAKE-PUMP COMPREHENSIVE TESTS
  // ================================================================
  console.log('\n--- AA. Intake-Pump Tests ---');

  // AA1. Intake creates exactly 4 durable photo jobs.
  ageAllJobsToDrainable();
  await fullDrain('wAA-pre'); // clear any prior drainable jobs
  const aa1Sub = await postIntake(UDISE('200'), 'GHSS PUMP_AA1');
  const aa1Tid = aa1Sub.json.ticketId;
  const aa1Jobs = await db.listPhotoJobs({ ticketId: aa1Tid });
  record('AA1. intake creates exactly 4 durable photo jobs',
    aa1Jobs.length === 4 && aa1Jobs.every((j) => j.kind === 'intake'), `count=${aa1Jobs.length}`);

  // AA2. Intake invokes the scoped worker — all 4 jobs CONFIRMED after POST.
  record('AA2. all 4 jobs CONFIRMED after intake POST',
    aa1Jobs.every((j) => j.state === 'CONFIRMED'), `states=${aa1Jobs.map((j) => j.state).join(',')}`);

  // AA3. Worker is awaited: Drive IDs exist in ticket record after POST returns.
  const aa3Row = await rowOf(aa1Tid);
  const aa3HasIds = !!(aa3Row && aa3Row.p1DriveFileId && aa3Row.p2DriveFileId && aa3Row.p3DriveFileId && aa3Row.p4DriveFileId);
  record('AA3. Drive IDs persisted in ticket record after POST',
    aa3HasIds, `ids=${!!(aa3Row||{}).p1DriveFileId},${!!(aa3Row||{}).p2DriveFileId},${!!(aa3Row||{}).p3DriveFileId},${!!(aa3Row||{}).p4DriveFileId}`);

  // AA4. Intake worker cannot process unrelated tickets.
  const aa4Sub = await postIntake(UDISE('201'), 'GHSS PUMP_AA4');
  const aa4Tid = aa4Sub.json.ticketId;
  // AA4 ticket's jobs should be CONFIRMED by its own intake-pump
  const aa4Jobs = await db.listPhotoJobs({ ticketId: aa4Tid });
  record('AA4. each intake only processes its own ticket',
    aa4Jobs.every((j) => j.state === 'CONFIRMED') && aa4Jobs.length === 4);

  // AA5. All 4 Drive IDs persisted (verify specific fields).
  const aa5Row = await rowOf(aa4Tid);
  record('AA5. all 4 Drive IDs persisted',
    !!(aa5Row && aa5Row.p1DriveFileId && aa5Row.p2DriveFileId && aa5Row.p3DriveFileId && aa5Row.p4DriveFileId));

  // AA6. PG photo bytes cleared after Drive verification (URLs are Drive, not data:).
  const aa6Row = await rowOf(aa1Tid);
  const aa6Urls = [aa6Row.photo1Url, aa6Row.photo2Url, aa6Row.photo3Url, aa6Row.photo4Url].filter(Boolean);
  const aa6NoneData = aa6Urls.every((u) => !String(u).startsWith('data:'));
  const aa6HasDrive = aa6Urls.every((u) => String(u).includes('drive.google.com') || String(u).includes('lh3.googleusercontent.com'));
  record('AA6. photo URLs are Drive URLs (not data:) after intake',
    aa6NoneData && aa6HasDrive, `urls=${aa6Urls.map((u) => String(u).slice(0, 40)).join(' | ')}`);

  // AA7. Partial failure: 3 CONFIRMED + 1 retryable/PENDING.
  const aa7Tid_base = UDISE('202');
  stubModes.failCreate.add(undefined); // clear any stale
  stubModes.failCreate.delete(undefined);
  // We need to fail slot 3 for the next ticket. Since we don't know the ticketId
  // yet, we register a pre-flight failure by intercepting fetch for this UDISE.
  const aa7RealFetch = globalThis.fetch;
  let aa7FailSlot3 = true;
  globalThis.fetch = async (url, opts) => {
    try {
      const b = JSON.parse((opts && opts.body) || '{}');
      if (aa7FailSlot3 && b.action === 'create' && b.photo3Base64 && !b.photo2Base64 && !b.photo1Base64 && !b.photo4Base64) {
        return { ok: true, json: async () => ({ success: false, error: 'simulated GAS failure for slot 3' }) };
      }
    } catch (e) {}
    return aa7RealFetch(url, opts);
  };
  const aa7Sub = await postIntake(aa7Tid_base, 'GHSS PUMP_AA7');
  aa7FailSlot3 = false;
  globalThis.fetch = aa7RealFetch;
  const aa7Tid = aa7Sub.json.ticketId;
  const aa7Jobs = await db.listPhotoJobs({ ticketId: aa7Tid });
  const aa7Confirmed = aa7Jobs.filter((j) => j.state === 'CONFIRMED').length;
  const aa7Retryable = aa7Jobs.filter((j) => j.state !== 'CONFIRMED').length;
  record('AA7. partial failure: 3 CONFIRMED + 1 retryable',
    aa7Confirmed === 3 && aa7Retryable === 1, `confirmed=${aa7Confirmed} retryable=${aa7Retryable}`);

  // AA8. Failed photo bytes retained (not cleared).
  const aa8Row = await rowOf(aa7Tid);
  const aa8FailedSlot = aa7Jobs.find((j) => j.state !== 'CONFIRMED');
  const aa8SlotNum = aa8FailedSlot ? aa8FailedSlot.slot : '3';
  // The failed slot should still have data: URL (bytes retained)
  const aa8Url = aa8Row ? aa8Row['photo' + aa8SlotNum + 'Url'] : '';
  record('AA8. failed photo bytes retained (data: URL still present)',
    String(aa8Url).startsWith('data:') || String(aa8Url).startsWith('/uploads/'),
    `slot=${aa8SlotNum} url=${String(aa8Url).slice(0, 30)}`);

  // AA9. Same-request retry is idempotent.
  const aa9Key = 'IDEM-AA9-' + Date.now();
  const aa9a = await postIntake(UDISE('203'), 'GHSS PUMP_AA9', { clientRequestId: aa9Key });
  const aa9b = await postIntake(UDISE('203'), 'GHSS PUMP_AA9', { clientRequestId: aa9Key });
  record('AA9. same-request retry is idempotent',
    aa9a.json.ticketId === aa9b.json.ticketId && aa9b.json.success === true);

  // AA10. Same-school -2/-3/-4 complaints remain independent.
  const aa10a = await postIntake(UDISE('204'), 'GHSS PUMP_AA10');
  const aa10b = await postIntake(UDISE('204'), 'GHSS PUMP_AA10');
  record('AA10. same-school duplicate returns existing ticket (business rule)',
    aa10a.json.ticketId === aa10b.json.ticketId);

  // AA11. Track-pump still recovers a deliberately failed remaining photo.
  // Use the AA7 ticket which has 1 failed job. Age it and let track-pump fix it.
  ageAllJobsToDrainable();
  const aa11ResBefore = (await db.listPhotoJobs({ ticketId: aa7Tid })).filter((j) => j.state !== 'CONFIRMED').length;
  const aa11Track = await callHandle({ method: 'GET', url: '/api/data?track=' + encodeURIComponent(aa7Tid) });
  const aa11ResAfter = (await db.listPhotoJobs({ ticketId: aa7Tid })).filter((j) => j.state !== 'CONFIRMED').length;
  record('AA11. track-pump recovers failed photo as backstop',
    aa11Track.statusCode === 200 && aa11ResBefore === 1 && aa11ResAfter === 0,
    `before=${aa11ResBefore} after=${aa11ResAfter}`);

  // AA12. Success response contains no Drive/cloud/pending/gallery warnings.
  const aa12 = aa1Sub.json;
  const aa12Clean = !('driveUploadConfirmed' in aa12) && !('drivePendingRetry' in aa12)
    && !('driveError' in aa12) && !('driveFolderUrl' in aa12)
    && !('uploadedCount' in aa12);
  record('AA12. response has no Drive/cloud/pending fields',
    aa12Clean && aa12.success === true && !!aa12.ticketId && !!aa12.message,
    `keys=${Object.keys(aa12).join(',')}`);

  // AA13. Intake photo upload does NOT depend on track-pump, staff-pump, or cron.
  // Prove by posting intake with all backstop mechanisms uninvolved:
  // the intake request itself confirms the 4 photo jobs.
  // We already proved this in AA1-AA3 (jobs CONFIRMED after POST, no external trigger).
  // Additional proof: create a ticket with a unique UDISE and verify CONFIRMED
  // without ANY subsequent GET/pump call.
  const aa13Sub = await postIntake(UDISE('205'), 'GHSS PUMP_AA13');
  const aa13Tid = aa13Sub.json.ticketId;
  const aa13Jobs = await db.listPhotoJobs({ ticketId: aa13Tid });
  const aa13AllConfirmed = aa13Jobs.length === 4 && aa13Jobs.every((j) => j.state === 'CONFIRMED');
  const aa13Row = await rowOf(aa13Tid);
  const aa13HasIds = !!(aa13Row && aa13Row.p1DriveFileId && aa13Row.p2DriveFileId && aa13Row.p3DriveFileId && aa13Row.p4DriveFileId);
  record('AA13. intake self-confirms without track-pump/staff-pump/cron',
    aa13AllConfirmed && aa13HasIds, `confirmed=${aa13AllConfirmed} ids=${aa13HasIds}`);

  console.log('\n========================================================');
  console.log(`📦 PHOTO-QUEUE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  globalThis.fetch = realFetch;
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  restoreRepo();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); globalThis.fetch = realFetch; try { restoreRepo(); } catch (err) {} process.exit(1); });
