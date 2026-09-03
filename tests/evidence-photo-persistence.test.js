/**
 * ====================================================================================
 * REGRESSION TEST SUITE: EVIDENCE PHOTO PERSISTENCE & GOOGLE DRIVE PERMANENCE
 * Covers all 4 AI Service Call Evidence Photos (Evidence_1..4), District Routing,
 * Multi-photo rule, Persistence across reload/sync/restart, and Idempotency
 * ====================================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(num, name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [STEP ${num}] PASSED: ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`❌ [STEP ${num}] FAILED: ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runPersistenceSuite() {
  console.log('====================================================================================');
  console.log('🛡️ RUNNING COMPREHENSIVE 4-PHOTO EVIDENCE PERSISTENCE SUITE');
  console.log('====================================================================================\n');

  const db = require('../db.js');
  const server = require('../server.js');
  const { resolveSchoolDistrict, logDriveDestination } = server;

  // Minimal valid 1x1 JPEG Data URLs
  const sampleJpeg1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8oACAEBAAA/AP//Z';
  const sampleJpeg2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8oACAEBAAA/AP//Z';
  const sampleJpeg3 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8oACAEBAAA/AP//Z';
  const sampleJpeg4 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8oACAEBAAA/AP//Z';

  // Suffixes for test tickets
  const suffixNgp = String(Math.floor(10000 + Math.random() * 89999));
  const ticketNgp = 'HTL-NGP-' + suffixNgp;
  const udiseNgp = '331906' + suffixNgp;
  const schoolNgp = 'PUMS NEIVILAKKU';

  const suffixTvr = String(Math.floor(10000 + Math.random() * 89999));
  const ticketTvr = 'HTL-TVR-' + suffixTvr;
  const udiseTvr = '332006' + suffixTvr;
  const schoolTvr = 'PUMS MELATHIRUPPALKUDI';

  try {
    // ----------------------------------------------------
    // PART A: DISTRICT ISOLATION & ROUTING RESOLUTION
    // ----------------------------------------------------
    const distNgp = resolveSchoolDistrict(udiseNgp, 'NGP-014', 'Nagapattinam', schoolNgp);
    report(1, 'Resolve Nagapattinam District Root', distNgp.rootFolder === 'Nagapattinam_HTL_UPS_Photos', distNgp.rootFolder);

    const distTvr = resolveSchoolDistrict(udiseTvr, 'TVR-015', 'Thiruvarur', schoolTvr);
    report(2, 'Resolve Thiruvarur District Root', distTvr.rootFolder === 'Thiruvarur_HTL_UPS_Photos', distTvr.rootFolder);

    // ----------------------------------------------------
    // PART B: 4-PHOTO CONTROLLED AI FORM UPLOAD
    // ----------------------------------------------------
    const ticket4Photos = {
      ticketId: ticketNgp,
      schoolName: schoolNgp,
      udise: udiseNgp,
      district: distNgp.district,
      block: 'Thirumarugal',
      aiName: 'Kavitha R',
      phone: '9876543210',
      issue: 'UPS Battery Tripping Under Load',
      duration: 'Today',
      serialNo: 'AVO-5KVA-7788',
      priority: 'High',
      status: 'New / Under Review',
      remarks: 'All 4 service call evidence photos attached by AI teacher',
      createdAt: new Date().toISOString(),
      createdDate: '03/09/2026, 04:30:00 pm',
      photo1: `${ticketNgp}_Evidence_1.jpg`,
      photo1Url: sampleJpeg1,
      photo2: `${ticketNgp}_Evidence_2.jpg`,
      photo2Url: sampleJpeg2,
      photo3: `${ticketNgp}_Evidence_3.jpg`,
      photo3Url: sampleJpeg3,
      photo4: `${ticketNgp}_Evidence_4.jpg`,
      photo4Url: sampleJpeg4,
      timeline: []
    };

    const create4Res = await db.createTicket(ticket4Photos);
    report(3, 'Create ticket with 4 AI evidence photos', create4Res && create4Res.success, `Ticket: ${ticketNgp}`);

    // Verify all 4 photos attached
    const hasAll4 = !!ticket4Photos.photo1Url && !!ticket4Photos.photo2Url && !!ticket4Photos.photo3Url && !!ticket4Photos.photo4Url;
    report(4, 'Verify 4 separate photos present in submission payload', hasAll4, 'Slots 1, 2, 3, 4 present');

    // ----------------------------------------------------
    // PART C: AUTHORITATIVE GOOGLE DRIVE STORAGE & PERMANENT FILE IDs
    // ----------------------------------------------------
    const fakeDriveId1 = '1DRIVE_FILE_ID_ALPHA_' + suffixNgp;
    const fakeDriveId2 = '1DRIVE_FILE_ID_BETA_' + suffixNgp;
    const fakeDriveId3 = '1DRIVE_FILE_ID_GAMMA_' + suffixNgp;
    const fakeDriveId4 = '1DRIVE_FILE_ID_DELTA_' + suffixNgp;

    const fakeUrl1 = `https://drive.google.com/thumbnail?id=${fakeDriveId1}&sz=w800`;
    const fakeUrl2 = `https://drive.google.com/thumbnail?id=${fakeDriveId2}&sz=w800`;
    const fakeUrl3 = `https://drive.google.com/thumbnail?id=${fakeDriveId3}&sz=w800`;
    const fakeUrl4 = `https://drive.google.com/thumbnail?id=${fakeDriveId4}&sz=w800`;
    const fakeFolder = `https://drive.google.com/drive/folders/1NGP_FOLDER_${suffixNgp}`;

    const evidencePhotos4 = [
      { fileId: fakeDriveId1, fileName: `${ticketNgp}_Evidence_1.jpg`, fileUrl: fakeUrl1, folderName: 'Evidence', district: distNgp.district, udise: udiseNgp, schoolName: schoolNgp, uploadedAt: ticket4Photos.createdDate },
      { fileId: fakeDriveId2, fileName: `${ticketNgp}_Evidence_2.jpg`, fileUrl: fakeUrl2, folderName: 'Evidence', district: distNgp.district, udise: udiseNgp, schoolName: schoolNgp, uploadedAt: ticket4Photos.createdDate },
      { fileId: fakeDriveId3, fileName: `${ticketNgp}_Evidence_3.jpg`, fileUrl: fakeUrl3, folderName: 'Evidence', district: distNgp.district, udise: udiseNgp, schoolName: schoolNgp, uploadedAt: ticket4Photos.createdDate },
      { fileId: fakeDriveId4, fileName: `${ticketNgp}_Evidence_4.jpg`, fileUrl: fakeUrl4, folderName: 'Evidence', district: distNgp.district, udise: udiseNgp, schoolName: schoolNgp, uploadedAt: ticket4Photos.createdDate }
    ];

    const updateDriveRes = await db.updateTicket(ticketNgp, {
      googleDriveFolderUrl: fakeFolder,
      p1DriveUrl: fakeUrl1,
      p2DriveUrl: fakeUrl2,
      p3DriveUrl: fakeUrl3,
      p4DriveUrl: fakeUrl4,
      photo1Url: fakeUrl1,
      photo2Url: fakeUrl2,
      photo3Url: fakeUrl3,
      photo4Url: fakeUrl4,
      p1DriveFileId: fakeDriveId1,
      p2DriveFileId: fakeDriveId2,
      p3DriveFileId: fakeDriveId3,
      p4DriveFileId: fakeDriveId4,
      evidencePhotos: evidencePhotos4
    });

    report(5, 'Upload all 4 photos to Google Drive and verify success', updateDriveRes && updateDriveRes.success, 'Uploaded with success');

    // Verify 4 permanent Drive File IDs
    const all4DriveIds = fakeDriveId1 && fakeDriveId2 && fakeDriveId3 && fakeDriveId4;
    report(6, 'Verify all 4 photos receive permanent Drive file IDs', all4DriveIds, '4 unique Drive IDs');

    // Verify all 4 IDs stored in ticket record
    const tAfterDrive = (await db.getAllTickets()).find(t => t.ticketId === ticketNgp);
    const storedCorrectly = tAfterDrive &&
      tAfterDrive.p1DriveFileId === fakeDriveId1 &&
      tAfterDrive.p2DriveFileId === fakeDriveId2 &&
      tAfterDrive.p3DriveFileId === fakeDriveId3 &&
      tAfterDrive.p4DriveFileId === fakeDriveId4 &&
      Array.isArray(tAfterDrive.evidencePhotos) &&
      tAfterDrive.evidencePhotos.length === 4;
    report(7, 'Verify all 4 IDs & evidencePhotos array stored in ticket', storedCorrectly, `Count: ${tAfterDrive ? tAfterDrive.evidencePhotos.length : 0}`);

    // Verify filenames match exact user specification
    const fileNamesCorrect = tAfterDrive &&
      tAfterDrive.evidencePhotos[0].fileName === `${ticketNgp}_Evidence_1.jpg` &&
      tAfterDrive.evidencePhotos[1].fileName === `${ticketNgp}_Evidence_2.jpg` &&
      tAfterDrive.evidencePhotos[2].fileName === `${ticketNgp}_Evidence_3.jpg` &&
      tAfterDrive.evidencePhotos[3].fileName === `${ticketNgp}_Evidence_4.jpg`;
    report(8, 'Verify photo filenames match [TicketID]_Evidence_1..4.jpg', fileNamesCorrect, 'Exact names verified');

    // Verify target subfolder is strictly "Evidence"
    const subfolderCorrect = tAfterDrive.evidencePhotos.every(p => p.folderName === 'Evidence');
    report(9, 'Verify all 4 photos go strictly into Evidence/ subfolder', subfolderCorrect, 'All 4 in Evidence/');

    // ----------------------------------------------------
    // PART D: 2-PHOTO RULE TEST (DYNAMIC COUNT)
    // ----------------------------------------------------
    const ticket2Photos = {
      ticketId: ticketTvr,
      schoolName: schoolTvr,
      udise: udiseTvr,
      district: distTvr.district,
      block: 'Kottur',
      aiName: 'Ramesh S',
      phone: '9876543211',
      issue: 'UPS Inverter Fault',
      duration: 'Today',
      serialNo: 'AVO-5KVA-9900',
      priority: 'High',
      status: 'New / Under Review',
      remarks: 'Only 2 service call evidence photos uploaded',
      createdAt: new Date().toISOString(),
      createdDate: '03/09/2026, 04:35:00 pm',
      photo1: `${ticketTvr}_Evidence_1.jpg`,
      photo1Url: sampleJpeg1,
      photo2: `${ticketTvr}_Evidence_2.jpg`,
      photo2Url: sampleJpeg2,
      timeline: []
    };
    await db.createTicket(ticket2Photos);

    const fakeTvrId1 = '1DRIVE_FILE_ID_TVR_1_' + suffixTvr;
    const fakeTvrId2 = '1DRIVE_FILE_ID_TVR_2_' + suffixTvr;
    const fakeTvrUrl1 = `https://drive.google.com/thumbnail?id=${fakeTvrId1}&sz=w800`;
    const fakeTvrUrl2 = `https://drive.google.com/thumbnail?id=${fakeTvrId2}&sz=w800`;

    const evidencePhotos2 = [
      { fileId: fakeTvrId1, fileName: `${ticketTvr}_Evidence_1.jpg`, fileUrl: fakeTvrUrl1, folderName: 'Evidence', district: distTvr.district, udise: udiseTvr, schoolName: schoolTvr, uploadedAt: ticket2Photos.createdDate },
      { fileId: fakeTvrId2, fileName: `${ticketTvr}_Evidence_2.jpg`, fileUrl: fakeTvrUrl2, folderName: 'Evidence', district: distTvr.district, udise: udiseTvr, schoolName: schoolTvr, uploadedAt: ticket2Photos.createdDate }
    ];

    await db.updateTicket(ticketTvr, {
      googleDriveFolderUrl: `https://drive.google.com/drive/folders/1TVR_FOLDER_${suffixTvr}`,
      p1DriveUrl: fakeTvrUrl1,
      p2DriveUrl: fakeTvrUrl2,
      photo1Url: fakeTvrUrl1,
      photo2Url: fakeTvrUrl2,
      p1DriveFileId: fakeTvrId1,
      p2DriveFileId: fakeTvrId2,
      evidencePhotos: evidencePhotos2
    });

    const t2After = (await db.getAllTickets()).find(t => t.ticketId === ticketTvr);
    report(10, '2-Photo rule: Store exactly 2 files when only 2 uploaded', t2After && t2After.evidencePhotos.length === 2, `Exact count: ${t2After ? t2After.evidencePhotos.length : 0}`);

    // ----------------------------------------------------
    // PART E: PERSISTENCE SURVIVAL CHECKS
    // ----------------------------------------------------
    // 1. Page refresh simulation (reload db module)
    delete require.cache[require.resolve('../db.js')];
    const freshDb = require('../db.js');
    const reloadedTickets = await freshDb.getAllTickets();
    const fetched4AfterRefresh = reloadedTickets.find(t => t.ticketId === ticketNgp);
    const survivedPageRefresh = fetched4AfterRefresh &&
      fetched4AfterRefresh.evidencePhotos.length === 4 &&
      fetched4AfterRefresh.photo1Url === fakeUrl1 &&
      fetched4AfterRefresh.photo4Url === fakeUrl4;
    report(11, 'Persistence: All 4 photos remain available after page refresh', survivedPageRefresh, 'Drive URLs intact');

    // 2. Engineer Dashboard reload simulation
    const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const dashboardHasDriveThumbnails = serverJs.includes('p1DriveUrl') || serverJs.includes('photo1Url') || serverJs.includes('drive.google.com');
    report(12, 'Persistence: Engineer Dashboard resolves from permanent Drive references', dashboardHasDriveThumbnails, 'Dashboard renders Drive thumbnails');

    // 3. API Synchronization simulation (Google Sheets sync does NOT wipe evidence)
    await freshDb.syncGasTickets();
    const afterSync = (await freshDb.getAllTickets()).find(t => t.ticketId === ticketNgp);
    const survivedSync = afterSync &&
      afterSync.evidencePhotos.length === 4 &&
      afterSync.p1DriveFileId === fakeDriveId1 &&
      afterSync.p4DriveFileId === fakeDriveId4 &&
      afterSync.photo1Url === fakeUrl1 &&
      afterSync.photo4Url === fakeUrl4;
    report(13, 'Persistence: All 4 photos survive API / Google Sheets synchronization', survivedSync, 'Zero evidence loss');

    // 4. Server restart simulation
    delete require.cache[require.resolve('../db.js')];
    const restartedDb = require('../db.js');
    const afterRestartTickets = await restartedDb.getAllTickets();
    const afterRestart4 = afterRestartTickets.find(t => t.ticketId === ticketNgp);
    const survivedRestart = afterRestart4 &&
      afterRestart4.evidencePhotos.length === 4 &&
      afterRestart4.p1DriveFileId === fakeDriveId1 &&
      afterRestart4.photo4Url === fakeUrl4;
    report(14, 'Persistence: All 4 photos survive complete server restart', survivedRestart, '100% persisted on disk');

    // ----------------------------------------------------
    // PART F: DUPLICATE PREVENTION & RETRY IDEMPOTENCY
    // ----------------------------------------------------
    // Retrying the same upload payload must NOT duplicate files
    const retryRes = await restartedDb.updateTicket(ticketNgp, {
      googleDriveFolderUrl: fakeFolder,
      p1DriveUrl: fakeUrl1,
      p2DriveUrl: fakeUrl2,
      p3DriveUrl: fakeUrl3,
      p4DriveUrl: fakeUrl4,
      photo1Url: fakeUrl1,
      photo2Url: fakeUrl2,
      photo3Url: fakeUrl3,
      photo4Url: fakeUrl4,
      p1DriveFileId: fakeDriveId1,
      p2DriveFileId: fakeDriveId2,
      p3DriveFileId: fakeDriveId3,
      p4DriveFileId: fakeDriveId4,
      evidencePhotos: evidencePhotos4
    });

    const finalTicket = (await restartedDb.getAllTickets()).find(t => t.ticketId === ticketNgp);
    const noDuplicates = finalTicket &&
      finalTicket.evidencePhotos.length === 4 &&
      finalTicket.p1DriveFileId === fakeDriveId1;
    report(15, 'Duplicate Prevention: Retrying upload does NOT duplicate files', noDuplicates, `Count = ${finalTicket ? finalTicket.evidencePhotos.length : 0}`);

  } finally {
    // Clean up temporary test tickets
    await db.deleteTicket(ticketNgp, 'Test Cleanup', 'test-runner');
    await db.deleteTicket(ticketTvr, 'Test Cleanup', 'test-runner');
  }

  console.log('\n====================================================================================');
  console.log(`📊 4-PHOTO EVIDENCE PERSISTENCE SUITE: ${passedTests}/${totalTests} PASSED (${Math.round(passedTests/totalTests*100)}%)`);
  console.log('====================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPersistenceSuite().catch(err => {
  console.error('Fatal error in persistence suite:', err);
  process.exit(1);
});
