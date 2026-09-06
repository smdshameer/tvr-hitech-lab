/**
 * INTAKE EVIDENCE VERIFICATION SUITE (read-back before intake Drive success).
 *
 * Covers (mocked, localhost stubs only — no production writes):
 *  A. 4 IDs + files verify            -> SUCCESS
 *  B. success:true + missing IDs      -> NOT SUCCESS + RETRY
 *  C. partial IDs                     -> NOT SUCCESS + RETRY
 *  D. timeout after Drive creation    -> later retry can adopt existing files
 *  E. 4 files exist + ticket has none -> READ-ADOPT -> VERIFIED
 *  F. one file missing                -> NOT VERIFIED + RETRY
 *  G. wrong folder                    -> NOT VERIFIED
 *  H. wrong filename                  -> NOT VERIFIED
 *  I. returned ID differs from observed-> NOT VERIFIED
 *  J. retry creates no duplicates (canonical names + trash-before-create)
 *  K. verify never deletes Evidence files
 *  L. PG photo bytes stay durable on Drive failure
 *  M. completion verification suite unaffected (run separately)
 *  N. GPS behavior untouched (intake EXIF path intact)
 *  O. auth/security controls untouched
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = require('../server.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const gasJs = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

const TID = 'HTL-TVR-09992';
const EV = (i) => `${TID}_Evidence_${i}.jpg`;
function inspectOk(over = {}) {
  return Object.assign({
    success: true,
    ticketId: TID,
    district: 'Thiruvarur',
    schoolFolder: '33200109992 - GHSS NANNILAM',
    evidenceFolder: 'Evidence',
    evidenceFiles: [1, 2, 3, 4].map((i) => ({ fileId: `ev-id-${i}`, fileName: EV(i), fileSize: 100, isTrashed: false })),
  }, over);
}
function spec(over = {}) {
  return Object.assign({
    ticketId: TID, district: 'Thiruvarur',
    schoolFolder: '33200109992 - GHSS NANNILAM', evidenceFolder: 'Evidence',
    fileNames: [EV(1), EV(2), EV(3), EV(4)],
    ids: ['ev-id-1', 'ev-id-2', 'ev-id-3', 'ev-id-4'],
    needsVerify: [true, true, true, true],
  }, over);
}

async function main() {
  console.log('========================================================');
  console.log('📥 RUNNING INTAKE EVIDENCE VERIFICATION SUITE');
  console.log('========================================================\n');

  record('0. intake seams exported',
    typeof server.isIntakeVerifySuccess === 'function'
    && typeof server.verifyIntakeDriveFiles === 'function'
    && typeof server.intakeUploadComplete === 'function');

  // A. Full match -> VERIFIED.
  let r = server.isIntakeVerifySuccess(inspectOk(), spec());
  record('A. 4 IDs + files verify -> VERIFIED', r.verified === true
    && JSON.stringify(r.adoptedIds) === JSON.stringify(['ev-id-1', 'ev-id-2', 'ev-id-3', 'ev-id-4']));

  // B/C. Missing or partial IDs at gate level -> NOT SUCCESS.
  record('B. success:true + all IDs missing -> NOT SUCCESS',
    server.intakeUploadComplete({ success: true }, [true, true, true, true], ['', '', '', '']).complete === false);
  record('C. partial IDs -> NOT SUCCESS',
    server.intakeUploadComplete({ success: true }, [true, true, true, true], ['a', '', 'c', '']).complete === false
    && server.intakeUploadComplete({ success: true }, [true, true, true, true], ['a', 'b', 'c', 'd']).complete === true);
  record('C2. unsent slots do not require IDs',
    server.intakeUploadComplete({ success: true }, [true, false, true, false], ['a', '', 'c', '']).complete === true);
  record('C3. GAS failure stays failure',
    server.intakeUploadComplete({ success: false }, [true, true, true, true], ['a', 'b', 'c', 'd']).complete === false);

  // D/E. No returned IDs + files present -> adopt -> VERIFIED (retry recovery path).
  r = server.isIntakeVerifySuccess(inspectOk(), spec({ ids: ['', '', '', ''] }));
  record('D/E. no IDs + 4 files present -> ADOPT + VERIFIED', r.verified === true
    && JSON.stringify(r.adoptedIds) === JSON.stringify(['ev-id-1', 'ev-id-2', 'ev-id-3', 'ev-id-4']));

  // F/G/H/I negatives.
  r = server.isIntakeVerifySuccess(inspectOk({
    evidenceFiles: [1, 2, 3].map((i) => ({ fileId: `ev-id-${i}`, fileName: EV(i), fileSize: 100, isTrashed: false })),
  }), spec());
  record('F. one file missing -> NOT VERIFIED + reasons', r.verified === false && r.reasons.join(' ').includes('Evidence_4'));
  r = server.isIntakeVerifySuccess(inspectOk({ schoolFolder: 'OTHER - SCHOOL' }), spec());
  record('G. wrong folder -> NOT VERIFIED', r.verified === false);
  r = server.isIntakeVerifySuccess(inspectOk({
    evidenceFiles: [1, 2, 3, 4].map((i) => ({ fileId: `ev-id-${i}`, fileName: `WRONG_${i}.jpg`, fileSize: 100, isTrashed: false })),
  }), spec());
  record('H. wrong filenames -> NOT VERIFIED', r.verified === false);
  r = server.isIntakeVerifySuccess(inspectOk(), spec({ ids: ['ev-id-1', 'STALE', 'ev-id-3', 'ev-id-4'] }));
  record('I. returned ID differs from observed -> NOT VERIFIED', r.verified === false
    && r.reasons.join(' ').includes('id-mismatch'));

  // Trashed file does not validate.
  r = server.isIntakeVerifySuccess(inspectOk({
    evidenceFiles: [1, 2, 3, 4].map((i) => ({ fileId: `ev-id-${i}`, fileName: EV(i), fileSize: 100, isTrashed: i === 2 })),
  }), spec());
  record('F2. trashed file -> NOT VERIFIED', r.verified === false);

  // Timeout/unreachable verify -> NOT VERIFIED, no throw (mirrors completion E).
  const vRes = await server.verifyIntakeDriveFiles({
    ticketId: TID, district: 'Thiruvarur', udise: '33200109992', schoolName: 'GHSS NANNILAM',
    fileNames: [EV(1), EV(2), EV(3), EV(4)], ids: ['ev-id-1', 'ev-id-2', 'ev-id-3', 'ev-id-4'],
    needsVerify: [true, true, true, true],
  }, { endpoint: 'http://127.0.0.1:1/unreachable', timeoutMs: 1500 });
  record('E2. verification timeout -> NOT VERIFIED (no throw)', vRes && vRes.verified === false);

  // J. No duplicate vectors: GAS canonical Evidence_N names (no timestamps), trash-before-create.
  record('J1. GAS canonical Evidence names have no timestamps',
    gasJs.includes('"Evidence_1.jpg"') && !/Evidence_"\s*\+\s*Date\.now|Date\.now\(\)\s*\+\s*"[^"]*Evidence/.test(gasJs));
  record('J2. GAS trash-before-create intact', gasJs.includes('setTrashed(true)'));
  record('J3. intake sync sends same canonical payload on retry (no renaming)',
    serverJs.includes("fileName: `${ticket.ticketId}_Evidence_1.jpg`"));

  // K. Verify path is inspect-only.
  const vSrc = serverJs.slice(serverJs.indexOf('async function verifyIntakeDriveFiles'), serverJs.indexOf('async function verifyIntakeDriveFiles') + 3500);
  record('K1. intake verify uses inspect action only', vSrc.includes('inspect_drive_structure'));
  record('K2. verify issues no update/delete/trash', !vSrc.includes("action: 'update'") && !vSrc.includes("action: 'create'") && !vSrc.includes('delete') && !vSrc.includes('setTrashed'));

  // L. PG bytes durable: ticket persisted BEFORE any Drive call; failures never clear photo bytes.
  const intakeRegion = serverJs.slice(
    serverJs.indexOf("if (pathname === '/api/tickets' && req.method === 'POST')"),
    serverJs.indexOf('// 3. API: Engineer Ask Completion Photos'));
  record('L1. db.createTicket precedes Drive sync',
    intakeRegion.indexOf('await db.createTicket(newTicket)') < intakeRegion.indexOf('syncTicketToGoogleDrive(newTicket'));
  record('L2. failure paths never blank photo bytes',
    !/photo1Url:\s*['"]{2}/.test(intakeRegion) && intakeRegion.includes('Photos are durable in DB'));

  // N. GPS intake behavior untouched (EXIF inject + coord capture still wired).
  record('N1. intake EXIF injection intact', serverJs.includes('Intake EXIF inject skipped') && serverJs.includes('injectGpsExif(r.buffer'));
  record('N2. intake GPS coord capture intact', intakeRegion.includes('data.gpsLatitude'));

  // O. Auth/security controls untouched.
  record('O1. intake stays public-teacher (documented, unchanged)', intakeRegion.includes('Teacher submissions don'));
  record('O2. engineer update still session+CSRF guarded', serverJs.includes("pathname === '/api/tickets/update'") && serverJs.includes('requireCsrf(req, res)'));
  record('O3. cross-UDISE/district gates intact in intake', intakeRegion.includes('checkOpenTicketByUdise') || serverJs.includes('Cross-UDISE'));

  // Gate wired into intake sync + retry acceptance.
  record('W1. intake sync enforces ID gate', /missingIntakeIds|intakeUploadComplete\(/.test(
    serverJs.slice(serverJs.indexOf('async function syncTicketToGoogleDrive'), serverJs.indexOf('async function syncTicketToGoogleDrive') + 9000)));
  record('W2. response reports verifiedDB-safe pending (no false confirm)',
    intakeRegion.includes('driveUploadConfirmed'));

  // A. Byte-less + ID-less must NEVER verify (nothing-to-confirm guard).
  r = server.isIntakeVerifySuccess(inspectOk({ evidenceFiles: [] }),
    spec({ ids: ['', '', '', ''], needsVerify: [false, false, false, false] }));
  record('A. byte-less/no-ID retry -> verified=false', r.verified === false
    && r.reasons.join(' ').includes('nothing-to-confirm'));
  // A2. IDs present (no new bytes) + files match -> legitimate re-confirm.
  r = server.isIntakeVerifySuccess(inspectOk(), spec({ needsVerify: [false, false, false, false] }));
  record('A2. IDs present + files match -> VERIFIED (no over-blocking)', r.verified === true);

  // B. Backfill: valid thumbnail -> ID; data/non/empty URLs -> ''.
  record('B. backfill valid thumbnail URL -> ID',
    server.backfillDriveIdFromUrl('https://drive.google.com/thumbnail?id=ABC123xyz&sz=w800') === 'ABC123xyz');
  record('B2. backfill ignores data URLs',
    server.backfillDriveIdFromUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD') === '');
  record('B3. backfill ignores non URLs', server.backfillDriveIdFromUrl('No Photo') === ''
    && server.backfillDriveIdFromUrl('') === '' && server.backfillDriveIdFromUrl(null) === '');

  // C. Recovered-as-expected IDs + files -> VERIFIED with adoption.
  r = server.isIntakeVerifySuccess(inspectOk(), spec({ ids: ['ev-id-1', 'ev-id-2', 'ev-id-3', 'ev-id-4'] }));
  record('C. recovered IDs + files -> VERIFIED + adopted', r.verified === true
    && r.adoptedIds[0] === 'ev-id-1' && r.adoptedIds[3] === 'ev-id-4');

  // D. Malformed URLs -> safe ''.
  record('D. malformed URLs -> safe empty',
    server.backfillDriveIdFromUrl('https://drive.google.com/thumbnail') === ''
    && server.backfillDriveIdFromUrl('not a url at all') === ''
    && server.backfillDriveIdFromUrl('ftp://x/y') === '');

  // E. Recovered ID present but file missing -> NOT VERIFIED.
  r = server.isIntakeVerifySuccess(inspectOk({ evidenceFiles: [] }), spec({ ids: ['ev-id-1', '', '', ''] }));
  record('E. URL ID exists but file missing -> NOT VERIFIED', r.verified === false);

  // F. Client cannot supply IDs to bypass: intake sync/handler never read client Drive IDs.
  const syncSrcF = serverJs.slice(serverJs.indexOf('async function syncTicketToGoogleDrive'),
    serverJs.indexOf('async function syncTicketToGoogleDrive') + 9500);
  const intakeHF = serverJs.slice(
    serverJs.indexOf("if (pathname === '/api/tickets' && req.method === 'POST')"),
    serverJs.indexOf('// 3. API: Engineer Ask Completion Photos'));
  const clientIdRead = /data\.p[1-4]DriveFileId|payload\.p[1-4]DriveFileId/;
  record('F. no client-supplied IDs in intake sync/handler', !clientIdRead.test(syncSrcF) && !clientIdRead.test(intakeHF));

  console.log('\n========================================================');
  console.log(`📊 INTAKE-VERIFICATION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); process.exit(1); });
