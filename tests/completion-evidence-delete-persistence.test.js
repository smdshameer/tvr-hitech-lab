/**
 * REGRESSION SUITE: Completion Evidence Delete Persistence (A-I matrix)
 * Scope: ONLY the dedicated delete path. No redesign, no production data.
 *
 * - Executes the REAL GAS deleteCompletionPhoto() (extracted from
 *   google_apps_script_code.js) against in-memory Drive/Sheet mocks.
 * - db.updateTicket empty-preserve check uses an isolated probe ticket with
 *   full backup/restore of the local JSON store (production data untouched).
 * - Server/client wiring verified via source contracts (no live server).
 *
 * Matrix:
 *  A: HM+GPS coexist after upload
 *  B: Delete HM -> HM gone, GPS remains
 *  C: Delete GPS -> GPS gone, HM remains
 *  D: Delete HM + refetch -> HM must NOT resurrect
 *  E: Delete GPS + refetch -> GPS must NOT resurrect
 *  F: Delete via Drive ID -> physical trash confirmed (trashedFilesCount 1)
 *  G: Wrong/missing Drive ID -> failure, NOT success; Sheet untouched
 *  H: Evidence_1..4 untouched by completion deletes
 *  I: Normal update with empty completion fields preserves evidence
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// In-memory Google Drive mocks (faithful to DriveApp semantics used in GAS)
// ---------------------------------------------------------------------------
let __fid = 0;
class MockFile {
  constructor(name) {
    this._id = 'mockid_' + (++__fid);
    this._name = name;
    this._trashed = false;
  }
  getId() { return this._id; }
  getName() { return this._name; }
  getUrl() { return 'https://drive.google.com/file/d/' + this._id + '/view'; }
  isTrashed() { return this._trashed; }
  setTrashed(v) { this._trashed = !!v; }
  setSharing() { return this; }
}
function mockIterator(arr) {
  let i = 0;
  return { hasNext: () => i < arr.length, next: () => arr[i++] };
}
class MockFolder {
  constructor(name) {
    this._name = name;
    this._id = 'mockfld_' + (++__fid);
    this.files = [];
    this.folders = [];
  }
  getName() { return this._name; }
  getId() { return this._id; }
  getUrl() { return 'https://drive.google.com/drive/folders/' + this._id; }
  setSharing() { return this; }
  createFolder(name) {
    const f = new MockFolder(name);
    this.folders.push(f);
    return f;
  }
  createFile(blob) {
    const f = new MockFile(blob && blob.getName ? blob.getName() : 'unnamed');
    this.files.push(f);
    return f;
  }
  getFolders() { return mockIterator(this.folders.slice()); }
  getFoldersByName(n) { return mockIterator(this.folders.filter(f => f.getName() === n)); }
  getFiles() { return mockIterator(this.files.slice()); }
  getFilesByName(n) { return mockIterator(this.files.filter(f => !f.isTrashed() && f.getName() === n)); }
  activeFiles() { return this.files.filter(f => !f.isTrashed()); }
}
function buildDriveApp(topFolders, fileIndex) {
  return {
    Access: { ANYONE_WITH_LINK: 'anyone' },
    Permission: { VIEW: 'view' },
    getFileById: (id) => {
      const f = fileIndex[id];
      if (!f) throw new Error('File not found: ' + id);
      return f;
    },
    getFoldersByName: (n) => mockIterator(topFolders.filter(f => f.getName() === n)),
    getFolders: () => mockIterator(topFolders.slice()),
    createFolder: (n) => {
      const f = new MockFolder(n);
      topFolders.push(f);
      return f;
    }
  };
}

// ---------------------------------------------------------------------------
// In-memory Sheet mock (1-indexed Range API subset used by GAS)
// ---------------------------------------------------------------------------
class MockSheet {
  constructor() { this.rows = []; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length ? this.rows[0].length : 0; }
  setFrozenRows() {}
  appendRow(r) { this.rows.push(r.slice()); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getRange(r, c, nr, nc) {
    const self = this;
    const chain = {
      getValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) {
            const rr = self.rows[r - 1 + i];
            row.push(rr ? (rr[c - 1 + j] !== undefined ? rr[c - 1 + j] : '') : '');
          }
          out.push(row);
        }
        return out;
      },
      getValue: () => {
        const rr = self.rows[r - 1];
        return (rr && rr[c - 1] !== undefined) ? rr[c - 1] : '';
      },
      setValue: (v) => {
        while (self.rows.length < r) self.rows.push([]);
        while (self.rows[r - 1].length < c) self.rows[r - 1].push('');
        self.rows[r - 1][c - 1] = v;
        return chain;
      },
      setValues: (vals) => {
        vals.forEach((rowArr, i) => rowArr.forEach((v, j) => {
          while (self.rows.length < r + i) self.rows.push([]);
          while (self.rows[r + i - 1].length < c + j) self.rows[r + i - 1].push('');
          self.rows[r + i - 1][c + j - 1] = v;
        }));
        return chain;
      },
      setFontWeight: () => chain,
      setBackground: () => chain,
      setFontColor: () => chain
    };
    return chain;
  }
}

// ---------------------------------------------------------------------------
// Load the REAL GAS functions under test (no copies, no emulation)
// ---------------------------------------------------------------------------
const gasSrc = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');
function extractFn(src, name, nextMarker) {
  const start = src.indexOf('function ' + name + '(');
  assert(start !== -1, 'GAS function missing: ' + name);
  const end = nextMarker ? src.indexOf(nextMarker, start) : src.length;
  assert(end !== -1, 'GAS marker missing after: ' + name);
  return src.slice(start, end);
}
const harnessSrc =
  extractFn(gasSrc, 'ensureHeader', '\nfunction deleteTicketRow') +
  extractFn(gasSrc, 'getOrCreateDistrictFolder', '\nfunction getOrCreateSchoolFolder') +
  extractFn(gasSrc, 'getOrCreateSchoolFolder', '\nfunction getOrCreateSubFolder') +
  extractFn(gasSrc, 'getOrCreateSubFolder', '\nfunction extractTicketPrefix') +
  extractFn(gasSrc, 'deleteCompletionPhoto', '\nfunction updateTicketRow');

function makeGasEnv() {
  const topFolders = [];
  const fileIndex = {};
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (s) => ({ setMimeType: () => ({ __json: s }) })
  };
  const DriveApp = buildDriveApp(topFolders, fileIndex);
  const fns = new Function(
    'DriveApp', 'ContentService', 'Utilities',
    harnessSrc + '\nreturn { deleteCompletionPhoto, getOrCreateDistrictFolder, getOrCreateSchoolFolder, getOrCreateSubFolder };'
  )(DriveApp, ContentService, {});
  return { topFolders, fileIndex, fns };
}
function callDelete(env, sheet, data) {
  const out = env.fns.deleteCompletionPhoto(sheet, data);
  return JSON.parse(out.__json);
}
function seedDrive(env, tid) {
  const dist = env.fns.getOrCreateDistrictFolder('Thiruvarur');
  const school = env.fns.getOrCreateSchoolFolder(dist, '33200505301', 'GHSS KORADACHERY');
  const comp = env.fns.getOrCreateSubFolder(school, 'Completion Photos');
  const evid = env.fns.getOrCreateSubFolder(school, 'Evidence');
  const hm = new MockFile(tid + '_HM_Signed_Completion_Report.jpg');
  const gps = new MockFile(tid + '_Completion_UPS_GPS.jpg');
  comp.files.push(hm, gps);
  env.fileIndex[hm.getId()] = hm;
  env.fileIndex[gps.getId()] = gps;
  for (let i = 1; i <= 4; i++) evid.files.push(new MockFile(tid + '_Evidence_' + i + '.jpg'));
  return { comp, evid, hm, gps };
}
function seedSheet() {
  const sheet = new MockSheet();
  sheet.appendRow(new Array(24).fill('H'));
  return sheet;
}
function seedTicketRow(sheet, tid, hmId, gpsId) {
  const row = new Array(24).fill('');
  row[0] = tid;
  row[19] = hmId ? 'https://drive.google.com/thumbnail?id=' + hmId + '&sz=w800' : '';
  row[20] = gpsId ? 'https://drive.google.com/thumbnail?id=' + gpsId + '&sz=w800' : '';
  row[21] = hmId || '';
  row[22] = gpsId || '';
  row[23] = 'SUBMITTED';
  sheet.appendRow(row);
  return 2;
}

let passed = 0;
let failed = 0;
const __pending = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      __pending.push(
        r.then(
          () => { console.log(`✅ [PASS] ${name}`); passed++; },
          (err) => { console.error(`❌ [FAIL] ${name}`); console.error(`   Error: ${(err && err.message) || err}`); failed++; }
        )
      );
    } else {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

const TID = 'HTL-TEST-PDEL-01';

// TEST A: both slots coexist
test('A. Upload state: HM + GPS coexist in Completion Photos', () => {
  const env = makeGasEnv();
  const { comp, hm, gps } = seedDrive(env, TID);
  assert.strictEqual(comp.activeFiles().length, 2);
  assert.strictEqual(hm.isTrashed(), false);
  assert.strictEqual(gps.isTrashed(), false);
});

// TEST B + F(HM): delete HM via legacy driveFileId -> HM trashed, GPS intact, structured success
test('B+F. Delete HM (legacy driveFileId): HM trashed, GPS remains, trashedFilesCount=1', () => {
  const env = makeGasEnv();
  const { comp, hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  const res = callDelete(env, sheet, {
    ticketId: TID, slot: 'HM_REPORT', driveFileId: hm.getId(),
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.slot, 'HM_REPORT');
  assert.strictEqual(res.trashedFilesCount, 1);
  assert.strictEqual(res.fileId, hm.getId());
  assert.strictEqual(hm.isTrashed(), true);
  assert.strictEqual(gps.isTrashed(), false, 'GPS MUST NOT be trashed');
  assert.strictEqual(comp.activeFiles().length, 1);
  assert.strictEqual(String(sheet.getRange(2, 22).getValue() || ''), '', 'HM Drive ID col cleared');
  assert.strictEqual(String(sheet.getRange(2, 23).getValue() || ''), gps.getId(), 'GPS Drive ID col intact');
});

// TEST C + F(GPS): delete GPS via new compDriveFileId field
test('C+F. Delete GPS (compDriveFileId): GPS trashed, HM remains, trashedFilesCount=1', () => {
  const env = makeGasEnv();
  const { comp, hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  const res = callDelete(env, sheet, {
    ticketId: TID, slot: 'GPS_COMPLETION', compDriveFileId: gps.getId(),
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.slot, 'GPS_COMPLETION');
  assert.strictEqual(res.trashedFilesCount, 1);
  assert.strictEqual(gps.isTrashed(), true);
  assert.strictEqual(hm.isTrashed(), false, 'HM MUST NOT be trashed');
  assert.strictEqual(String(sheet.getRange(2, 23).getValue() || ''), '', 'GPS Drive ID col cleared');
  assert.strictEqual(String(sheet.getRange(2, 22).getValue() || ''), hm.getId(), 'HM Drive ID col intact');
});

// TEST B2: delete HM via new hmDriveFileId field (slot-specific contract)
test('B2. Delete HM via hmDriveFileId field (new contract)', () => {
  const env = makeGasEnv();
  const { hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  const res = callDelete(env, sheet, {
    ticketId: TID, slot: 'HM_REPORT', hmDriveFileId: hm.getId(),
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(hm.isTrashed(), true);
  assert.strictEqual(gps.isTrashed(), false);
});

// TEST D: delete HM + refetch-style re-read -> HM absent, no resurrection
test('D. Delete HM + refetch: HM stays absent, GPS intact', () => {
  const env = makeGasEnv();
  const { hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  callDelete(env, sheet, {
    ticketId: TID, slot: 'HM_REPORT', driveFileId: hm.getId(),
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  // refetch: re-read Drive + Sheet as a fresh client would
  assert.strictEqual(hm.isTrashed(), true, 'HM must stay trashed on refetch');
  assert.strictEqual(String(sheet.getRange(2, 20).getValue() || ''), '', 'HM URL stays cleared');
  assert.strictEqual(String(sheet.getRange(2, 22).getValue() || ''), '', 'HM ID stays cleared');
  assert.strictEqual(String(sheet.getRange(2, 21).getValue() || '').includes(gps.getId()), true, 'GPS URL resurrected check: intact');
  assert.strictEqual(String(sheet.getRange(2, 24).getValue() || ''), 'PARTIALLY_UPLOADED');
});

// TEST E: delete GPS + refetch -> GPS stays absent
test('E. Delete GPS + refetch: GPS stays absent, HM intact', () => {
  const env = makeGasEnv();
  const { hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  callDelete(env, sheet, {
    ticketId: TID, slot: 'GPS_COMPLETION', driveFileId: gps.getId(),
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(gps.isTrashed(), true);
  assert.strictEqual(String(sheet.getRange(2, 21).getValue() || ''), '', 'GPS URL stays cleared');
  assert.strictEqual(String(sheet.getRange(2, 23).getValue() || ''), '', 'GPS ID stays cleared');
  assert.strictEqual(hm.isTrashed(), false, 'HM intact');
});

// TEST G: wrong/missing Drive ID -> failure, NOT success; Sheet untouched
test('G. Wrong Drive ID: success=false, trashedFilesCount=0, Sheet untouched', () => {
  const env = makeGasEnv();
  const { hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  const res = callDelete(env, sheet, {
    ticketId: 'HTL-TEST-PDEL-NOPE', slot: 'HM_REPORT', driveFileId: 'nonexistent_id_xyz',
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(res.success, false, 'must NOT return success');
  assert.strictEqual(res.trashedFilesCount, 0);
  assert(hm.isTrashed() === false && gps.isTrashed() === false, 'no file may be trashed');
  assert.strictEqual(String(sheet.getRange(2, 22).getValue() || ''), hm.getId(), 'Sheet HM ID untouched on failure');
});

// TEST G2: missing ID with no matching file -> failure
test('G2. Missing Drive ID + unknown ticket file: success=false', () => {
  const env = makeGasEnv();
  seedDrive(env, TID);
  const sheet = seedSheet();
  const res = callDelete(env, sheet, {
    ticketId: 'HTL-TEST-PDEL-GHOST', slot: 'GPS_COMPLETION',
    district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY'
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.trashedFilesCount, 0);
});

// TEST H: Evidence_1..4 untouched
test('H. Evidence photos untouched by completion deletes', () => {
  const env = makeGasEnv();
  const { evid, hm, gps } = seedDrive(env, TID);
  const sheet = seedSheet();
  seedTicketRow(sheet, TID, hm.getId(), gps.getId());
  const base = { ticketId: TID, district: 'Thiruvarur', udise: '33200505301', schoolName: 'GHSS KORADACHERY' };
  callDelete(env, sheet, { ...base, slot: 'HM_REPORT', driveFileId: hm.getId() });
  callDelete(env, sheet, { ...base, slot: 'GPS_COMPLETION', driveFileId: gps.getId() });
  assert.strictEqual(evid.activeFiles().length, 4, 'all 4 Evidence photos must remain');
});

// TEST I: normal update with empty completion fields preserves evidence (isolated probe, store restored)
test('I. db.updateTicket with empty completion fields preserves evidence', async () => {
  const db = require('../db');
  const dataFile = path.join(__dirname, '../data/htl_itsm_tickets.json');
  const hadFile = fs.existsSync(dataFile);
  const backup = hadFile ? fs.readFileSync(dataFile, 'utf8') : null;
  const probeId = 'HTL-TVR-05301-PDEL-I';
  try {
    await db.createTicket({
      ticketId: probeId,
      status: 'New / Under Review',
      district: 'Thiruvarur',
      schoolName: 'GHSS KORADACHERY',
      udise: '33200505301',
      issue: 'Probe issue',
      hmDriveFileId: 'drive_hm_probe',
      hmReportPhotoUrl: 'https://drive.google.com/thumbnail?id=drive_hm_probe&sz=w800',
      compDriveFileId: 'drive_comp_probe',
      completionPhotoUrl: 'https://drive.google.com/thumbnail?id=drive_comp_probe&sz=w800',
      completionEvidenceStatus: 'SUBMITTED',
      completionEvidence: {
        status: 'complete',
        hmSignedReport: { uploaded: true, driveFileId: 'drive_hm_probe', fileUrl: 'https://drive.google.com/thumbnail?id=drive_hm_probe&sz=w800' },
        completionPhoto: { uploaded: true, driveFileId: 'drive_comp_probe', fileUrl: 'https://drive.google.com/thumbnail?id=drive_comp_probe&sz=w800' }
      }
    });
    const res = await db.updateTicket(probeId, { status: 'In Progress (Remote)', remarks: 'probe note' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.ticket.hmDriveFileId, 'drive_hm_probe', 'HM ID preserved on empty update');
    assert.strictEqual(res.ticket.compDriveFileId, 'drive_comp_probe', 'GPS ID preserved on empty update');
    assert.strictEqual(res.ticket.completionEvidence.hmSignedReport.uploaded, true);
    assert.strictEqual(res.ticket.completionEvidence.completionPhoto.uploaded, true);
    // dedicated delete path still clears (control)
    const del = await db.deleteCompletionEvidence(probeId, 'HM_REPORT');
    assert.strictEqual(del.success, true);
    assert.strictEqual(del.ticket.hmDriveFileId, '');
    assert.strictEqual(del.ticket.compDriveFileId, 'drive_comp_probe', 'other slot intact after dedicated delete');
  } finally {
    try {
      if (backup !== null) fs.writeFileSync(dataFile, backup, 'utf8');
      else if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    } catch (e) {}
  }
});

// Server/client wiring contracts (source-level, no live server)
test('Server wiring: slot-specific IDs sent, failure gates response, verification read present', () => {
  const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert(src.includes('gasBody.hmDriveFileId = driveFileId'), 'Node must send hmDriveFileId');
  assert(src.includes('gasBody.compDriveFileId = driveFileId'), 'Node must send compDriveFileId');
  assert(src.includes("driveResult.success !== true"), 'endpoint must gate on driveResult.success');
  assert(src.includes('Post-delete verification read'), 'endpoint must verify after DB clear');
  assert(src.includes('COMPLETION_EVIDENCE_DELETE_FAILED'), 'endpoint must audit failures');
  assert(src.includes('await loadData()'), 'client must refetch after verified delete');
  assert(src.includes('Server deleted the file but refetched data still shows it'), 'client must detect resurrection');
});

(async () => {
  await Promise.all(__pending);
  console.log('\n======================================================================');
  console.log(`📊 DELETE-PERSISTENCE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');
  if (failed > 0) process.exit(1);
})();
