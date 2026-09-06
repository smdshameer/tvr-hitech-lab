// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * DRIVE VERIFY CALL-SITE REGRESSION SUITE (emergency fix for the missing
 * schoolFolder spec that made every read-back fail in production).
 *
 * A. normal folder (UDISE + school)            -> VERIFIED
 * B. legacy ticket-prefixed folder + same UDISE-> VERIFIED
 * C. wrong UDISE                               -> NOT VERIFIED
 * D. missing schoolFolder/udise in spec        -> MUST NOT falsely PASS
 * E. intake call-site passes resolved folder   -> live sync VERIFIED + IDs kept
 * F. completion call-site passes folder        -> wiring present (live: T7 suite)
 * G. stub success + correct files              -> success + IDs persisted, no retry
 * H. stub success + wrong folder               -> safe fail, retry preserved
 *
 * Hermetic GAS stub + tmpdir isolation. Zero production writes.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DATA = path.join(os.tmpdir(), 'tvr_data');
const TMP_UP = path.join(os.tmpdir(), 'tvr_uploads');
for (const d of [TMP_DATA, TMP_UP]) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
}

const server = require('../server.js');
const db = require('../db.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

const TID = 'HTL-TVR-09994';
const UDISE = '33200109994';
const EV = (i) => `${TID}_Evidence_${i}.jpg`;
const NORMAL_FOLDER = `${UDISE} - GHSS CALLSITE`;
const LEGACY_FOLDER = `${TID}-9 - GHSS CALLSITE (${UDISE})`;
function inspectOk(folder, over = {}) {
  return Object.assign({
    success: true, ticketId: TID, district: 'Thiruvarur',
    schoolFolder: folder, evidenceFolder: 'Evidence',
    evidenceFiles: [1, 2, 3, 4].map((i) => ({ fileId: `cs-id-${i}`, fileName: EV(i), fileSize: 100, isTrashed: false })),
  }, over);
}
function spec(over = {}) {
  return Object.assign({
    ticketId: TID, district: 'Thiruvarur', udise: UDISE,
    schoolFolder: NORMAL_FOLDER, evidenceFolder: 'Evidence',
    fileNames: [EV(1), EV(2), EV(3), EV(4)],
    ids: ['cs-id-1', 'cs-id-2', 'cs-id-3', 'cs-id-4'],
    needsVerify: [true, true, true, true],
  }, over);
}

// ---- Hermetic GAS stub ----
const driveFiles = new Map();
let forceFolder = null; // when set, inspect reports this folder (wrong-folder test)
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
        success: true, ticketId: tid, district: 'Thiruvarur',
        schoolFolder: forceFolder || `${UDISE} - GHSS CALLSITE`,
        evidenceFolder: 'Evidence',
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
  console.log('🔌 RUNNING DRIVE VERIFY CALL-SITE REGRESSION SUITE');
  console.log('========================================================\n');

  // A/B/C/D classifier behavior.
  let r = server.isIntakeVerifySuccess(inspectOk(NORMAL_FOLDER), spec());
  record('A. normal folder -> VERIFIED', r.verified === true);
  r = server.isIntakeVerifySuccess(inspectOk(LEGACY_FOLDER), spec());
  record('B. legacy ticket-prefixed folder + same UDISE -> VERIFIED', r.verified === true);
  r = server.isIntakeVerifySuccess(inspectOk('33200100000 - OTHER SCHOOL'), spec());
  record('C. wrong UDISE folder -> NOT VERIFIED', r.verified === false);
  r = server.isIntakeVerifySuccess(inspectOk(NORMAL_FOLDER),
    { ticketId: TID, district: 'Thiruvarur', fileNames: [EV(1), EV(2), EV(3), EV(4)], ids: ['cs-id-1', 'cs-id-2', 'cs-id-3', 'cs-id-4'], needsVerify: [true, true, true, true] });
  record('D. missing schoolFolder+udise -> MUST NOT falsely PASS', r.verified === false);
  // Completion classifier honors the same rule.
  r = server.isDriveVerifySuccess(
    { success: true, ticketId: TID, district: 'Thiruvarur', schoolFolder: LEGACY_FOLDER, completionFolder: 'Completion Photos', completionFiles: [{ fileId: 'h1', fileName: `${TID}_HM_Signed_Completion_Report.jpg`, fileSize: 9, isTrashed: false }] },
    { ticketId: TID, district: 'Thiruvarur', udise: UDISE, hmFileName: `${TID}_HM_Signed_Completion_Report.jpg`, compFileName: `${TID}_Completion_UPS_GPS.jpg`, hmId: 'h1', compId: '', hmNeedsVerify: true, compNeedsVerify: false });
  record('B2. completion legacy folder -> VERIFIED', r.verified === true);

  // E/F. Call sites pass the resolved folder (static wiring).
  const syncSrc = serverJs.slice(serverJs.indexOf('async function syncTicketToGoogleDrive'),
    serverJs.indexOf('async function syncTicketToGoogleDrive') + 11500);
  record('E. intake call-site passes resolved schoolFolder',
    syncSrc.includes('schoolFolder: schoolFolderDisplay'));
  record('F. completion call-site passes resolved schoolFolder',
    serverJs.includes('schoolFolder: compSchoolFolder'));

  // G. Live intake sync end-to-end: success + IDs persisted, no retry needed.
  await db.createTicket({ ticketId: TID, udise: UDISE, district: 'Thiruvarur', schoolName: 'GHSS CALLSITE', priority: 'High', status: 'New / Under Review', photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL });
  const t0 = (await db.getAllTickets()).find((t) => t.ticketId === TID);
  const res = await server.syncTicketToGoogleDrive(t0, { photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL });
  record('G1. stub success + correct files -> sync success', res && res.success === true);
  {
    const row = (await db.getAllTickets()).find((t) => t.ticketId === TID);
    record('G2. IDs persisted (no retry loop)', !!(row && row.p1DriveFileId && row.p2DriveFileId && row.p3DriveFileId && row.p4DriveFileId));
  }

  // H. Wrong folder at runtime: safe fail, IDs preserved as pre-call, retry kept.
  forceFolder = '99999999999 - ELSEWHERE';
  await db.updateTicket(TID, { p1DriveFileId: '', p2DriveFileId: '', p3DriveFileId: '', p4DriveFileId: '' });
  const resH = await server.syncTicketToGoogleDrive(
    (await db.getAllTickets()).find((t) => t.ticketId === TID),
    { photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL });
  record('H1. wrong folder -> sync NOT success', !resH || resH.success !== true);
  {
    const row = (await db.getAllTickets()).find((t) => t.ticketId === TID);
    record('H2. no phantom IDs persisted', !!row && !row.p1DriveFileId && !row.p2DriveFileId && !row.p3DriveFileId && !row.p4DriveFileId);
  }
  forceFolder = null;

  console.log('\n========================================================');
  console.log(`📊 CALL-SITE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  globalThis.fetch = realFetch;
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); globalThis.fetch = realFetch; process.exit(1); });
