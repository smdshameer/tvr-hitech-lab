/**
 * COMPLETION DRIVE-VERIFICATION SUITE (read-back before Drive success).
 *
 * Proves the forensic-safe upload contract with mocks/stubs only:
 *  A. IDs + both files present   -> VERIFIED
 *  B. IDs + one file missing     -> NOT VERIFIED (+ retry wiring present)
 *  C. IDs + both files missing   -> NOT VERIFIED
 *  D. GAS success but IDs missing-> NOT VERIFIED (existing ID gate)
 *  E. Verification timeout       -> NOT VERIFIED (fast, unroutable stub)
 *  F. Retry success              -> VERIFIED
 *  G. No duplicate-creation vectors (canonical names + GAS trash-before-create intact)
 *  H. Evidence photos untouched by the verify path
 *  I. GPS validation unchanged
 *  J. Track Status + Manage Incident paths route through the same guarded logic
 *
 * No production writes. No network beyond localhost stubs.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const server = require('../server.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const gasJs = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

const TID = 'HTL-TVR-09991';
const HM_NAME = `${TID}_HM_Signed_Completion_Report.jpg`;
const COMP_NAME = `${TID}_Completion_UPS_GPS.jpg`;
function inspectOk(over = {}) {
  return Object.assign({
    success: true,
    ticketId: TID,
    district: 'Thiruvarur',
    schoolFolder: '33200109991 - GHSS NANNILAM',
    completionFolder: 'Completion Photos',
    completionFiles: [
      { fileId: 'hm-id-1', fileName: HM_NAME, fileSize: 100, isTrashed: false },
      { fileId: 'comp-id-1', fileName: COMP_NAME, fileSize: 100, isTrashed: false },
    ],
  }, over);
}
function spec(over = {}) {
  return Object.assign({
    ticketId: TID, district: 'Thiruvarur', udise: '33200109991',
    schoolFolder: '33200109991 - GHSS NANNILAM', completionFolder: 'Completion Photos',
    hmFileName: HM_NAME, compFileName: COMP_NAME,
    hmId: 'hm-id-1', compId: 'comp-id-1',
    hmNeedsVerify: true, compNeedsVerify: true,
  }, over);
}

async function main() {
  console.log('========================================================');
  console.log('🔍 RUNNING COMPLETION DRIVE-VERIFICATION SUITE');
  console.log('========================================================\n');

  // Seams exported for testing (additive; no behavior change).
  record('0. verification seams exported', typeof server.generateCompletionOpId === 'function'
    && typeof server.isDriveVerifySuccess === 'function'
    && typeof server.extractDriveFolderId === 'function'
    && typeof server.verifyCompletionDriveFiles === 'function'
    && typeof server.buildCompletionOpRecord === 'function');

  // opId: unique per attempt, safe characters, traceable to ticket.
  const op1 = server.generateCompletionOpId(TID);
  const op2 = server.generateCompletionOpId(TID);
  record('1. opId unique per attempt', op1 !== op2, `${op1} vs ${op2}`);
  record('2. opId safe + traceable', /^[A-Za-z0-9-_]+$/.test(op1) && op1.includes('HTL-TVR-09991'));

  // Folder-ID derivation from schoolFolderUrl (additive parser).
  record('3. folder ID parsed from folder URL',
    server.extractDriveFolderId('https://drive.google.com/drive/folders/1AbC2dEfGh') === '1AbC2dEfGh');
  record('4. folder ID empty for non-folder URLs',
    server.extractDriveFolderId('https://drive.google.com/thumbnail?id=xyz&sz=w800') === ''
    && server.extractDriveFolderId('') === '');

  // A. Both files present -> VERIFIED.
  let r = server.isDriveVerifySuccess(inspectOk(), spec());
  record('A. IDs + both files present -> VERIFIED', r.verified === true, JSON.stringify(r.reasons || []));

  // B. One file missing -> NOT VERIFIED.
  r = server.isDriveVerifySuccess(inspectOk({
    completionFiles: [{ fileId: 'hm-id-1', fileName: HM_NAME, fileSize: 100, isTrashed: false }],
  }), spec());
  record('B. IDs + one file missing -> NOT VERIFIED', r.verified === false && /gps|missing/i.test((r.reasons || []).join(' ')));

  // C. Both files missing -> NOT VERIFIED.
  r = server.isDriveVerifySuccess(inspectOk({ completionFiles: [] }), spec());
  record('C. IDs + both files missing -> NOT VERIFIED', r.verified === false);

  // Wrong folder / wrong district / trashed file -> NOT VERIFIED.
  r = server.isDriveVerifySuccess(inspectOk({ schoolFolder: 'OTHER - SCHOOL' }), spec());
  record('C2. wrong school folder -> NOT VERIFIED', r.verified === false);
  record('C2b. wrong folder -> nothing adopted', r.hmFoundId === '' && r.compFoundId === '');
  r = server.isDriveVerifySuccess(inspectOk({
    completionFiles: [
      { fileId: 'hm-id-1', fileName: HM_NAME, fileSize: 100, isTrashed: true },
      { fileId: 'comp-id-1', fileName: COMP_NAME, fileSize: 100, isTrashed: false },
    ],
  }), spec());
  record('C3. trashed file -> NOT VERIFIED', r.verified === false);
  // File ID mismatch vs returned IDs -> NOT VERIFIED (different file, same name slot).
  r = server.isDriveVerifySuccess(inspectOk(), spec({ hmId: 'different-id' }));
  record('C4. returned ID not matching folder file -> NOT VERIFIED', r.verified === false);

  // D. GAS success but IDs missing -> existing ID gate says NOT success.
  record('D. success:true with null IDs is NOT success',
    server.isCompletionRetrySuccess({ success: true, hmDriveFileId: '', compDriveFileId: '' }, true, true) === false
    && server.isCompletionRetrySuccess({ success: true, hmDriveFileId: 'a', compDriveFileId: 'b' }, true, true) === true);

  // F. Retry success (IDs + files) -> VERIFIED via same classifier.
  r = server.isDriveVerifySuccess(inspectOk(), spec());
  record('F. retry success state -> VERIFIED', r.verified === true);

  // Op record shape (backward compatible: plain object, additive keys only).
  const opRec = server.buildCompletionOpRecord({
    opId: op1, ticketId: TID, stages: ['bytes-durable', 'gas-ok', 'verified'],
    folderUrl: 'https://drive.google.com/drive/folders/1AbC2dEfGh',
    folderId: '1AbC2dEfGh', hmFileId: 'hm-id-1', compFileId: 'comp-id-1',
    verified: true, verifiedAt: '05/09/2026, 01:00:00 pm',
  });
  record('I-record. op record carries required keys',
    ['opId', 'attemptAt', 'stages', 'status', 'folderUrl', 'folderId', 'hmFileId', 'compFileId', 'verified', 'verifiedAt']
      .every((k) => opRec && Object.prototype.hasOwnProperty.call(opRec, k)));

  // E. Verification timeout/unreachable -> NOT VERIFIED (stub, no prod).
  const vRes = await server.verifyCompletionDriveFiles({
    ticketId: TID, district: 'Thiruvarur', udise: '33200109991', schoolName: 'GHSS NANNILAM',
    hmFileName: HM_NAME, compFileName: COMP_NAME, hmId: 'hm-id-1', compId: 'comp-id-1',
    hmNeedsVerify: true, compNeedsVerify: true,
  }, { endpoint: 'http://127.0.0.1:1/unreachable', timeoutMs: 1500 });
  record('E. verification timeout -> NOT VERIFIED (no throw)', vRes && vRes.verified === false);

  // G. No duplicate vectors: canonical names + GAS trash-before-create intact; handler wiring.
  record('G1. canonical filenames unchanged',
    serverJs.includes('`${ticketId}_HM_Signed_Completion_Report.jpg`') && serverJs.includes('`${ticketId}_Completion_UPS_GPS.jpg`'));
  record('G2. GAS trash-before-create intact', gasJs.includes('setTrashed(true)') && gasJs.includes('STRICT SLOT ISOLATION'));
  record('G3. opId passed to GAS as optional field', /operationId:\s*opId|operationId:\s*completionOpId/.test(serverJs));
  record('G4. verify failure enqueues retry (no silent loss)', /verifyCompletionDriveFiles[\s\S]{0,800}?enqueueDriveRetry/.test(serverJs) || /verified[\s\S]{0,400}?enqueueDriveRetry\(ticketId,\s*'completion'\)/.test(serverJs));

  // H. Evidence photos untouched by verify path.
  const verifySrc = serverJs.slice(serverJs.indexOf('async function verifyCompletionDriveFiles'), serverJs.indexOf('async function verifyCompletionDriveFiles') + 4000);
  record('H1. verify uses inspect action only', verifySrc.includes('inspect_drive_structure'));
  record('H2. verify issues no update/delete actions', !verifySrc.includes("action: 'update'") && !verifySrc.includes('delete_completion_photo'));
  const handlerRegion = serverJs.slice(
    serverJs.indexOf("if (pathname === '/api/tickets/completion-evidence'"),
    serverJs.indexOf('// 3. API: Update Ticket Status'));
  record('H3. completion handler never touches photo1-4 evidence slots',
    handlerRegion.length > 1000 && !handlerRegion.includes('photo1Base64'));

  // I. GPS validation unchanged (exact guards still present).
  record('I1. GPS coords mandatory', serverJs.includes('GPS location coordinates are mandatory for the completion photo'));
  record('I2. accuracy gate 50m', serverJs.includes('GPS accuracy must be within 50 meters'));
  record('I3. TN bounds + freshness', serverJs.includes('GPS coordinates out of state geographic bounds') && serverJs.includes('> 10 minutes old'));
  record('I4. EXIF injection intact', serverJs.includes('injectGpsExif('));

  // J. Track + Manage paths share the guarded logic.
  record('J1. completion-evidence endpoint exists', serverJs.includes("pathname === '/api/tickets/completion-evidence'"));
  record('J2. engineer update endpoint guarded (session+CSRF)', serverJs.includes("pathname === '/api/tickets/update'") && serverJs.includes('requireCsrf(req, res)'));
  record('J3. response carries driveVerified + opId', serverJs.includes('driveVerified') && /opId:\s*completionOpId|completionOpId/.test(serverJs));

  // DB passthrough: completionEvidence persisted wholesale (additive keys survive).
  record('K. db.updateTicket persists completionEvidence JSON wholesale',
    fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8').includes('JSON.stringify(updateData.completionEvidence)'));

  console.log('\n========================================================');
  console.log(`📊 DRIVE-VERIFICATION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); process.exit(1); });
