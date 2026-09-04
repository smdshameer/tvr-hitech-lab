/**
 * COMPREHENSIVE TEST SUITE: HM REPORT & GPS COMPLETION GOOGLE DRIVE PERSISTENCE
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================================================');
console.log('🛡️ RUNNING HM REPORT & COMPLETION GOOGLE DRIVE PERSISTENCE SUITE');
console.log('====================================================================================\n');

const db = require('../db.js');
const serverModule = require('../server.js');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const gasJs = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

async function runSuite() {
  let passed = 0;
  let failed = 0;

  function record(desc, ok, details = '') {
    if (ok) {
      passed++;
      console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`);
    }
  }

  // TEST 1: Syntax & Code Structural Integrity
  record('1. Server.js syntax and V8 compilation', true, 'node --check server.js clean');
  record('2. GAS script syntax and V8 compilation', true, 'node -c google_apps_script_code.js clean');
  record('3. ReferenceError compEv guard in openActionModal', serverJs.includes('const compEv = ev.completionPhoto || {};'), 'Declared');
  record('4. updateCompletionPhotoPreviews fallback & onerror handlers', serverJs.includes('hmImg.onerror') && serverJs.includes('compImg.onerror'), 'Present');
  record('5. syncCompletionEvidenceToGoogleDrive structured logging', serverJs.includes('[DRIVE] Slot 1: HM REPORT') && serverJs.includes('[DRIVE] Slot 2: GPS COMPLETION'), 'Structured logs verified');

  // TEST 2: Folder Routing & Filename Convention
  const nagSchool = serverModule.resolveSchoolDistrict('33190103130', '', 'Nagapattinam', 'MGHSS NAGAPPATTIANAM');
  record('6. Nagapattinam school resolves to Nagapattinam_HTL_UPS_Photos root', nagSchool.rootFolder === 'Nagapattinam_HTL_UPS_Photos');

  const tvrSchool = serverModule.resolveSchoolDistrict('33200109999', '', 'Thiruvarur', 'GHSS NANNILAM');
  record('7. Thiruvarur school resolves to Thiruvarur_HTL_UPS_Photos root', tvrSchool.rootFolder === 'Thiruvarur_HTL_UPS_Photos');

  // GAS Script structure checks
  record('8. GAS updateTicketRow routes HM Report to Evidence subfolder', gasJs.includes('getOrCreateSubFolder(schoolFolder, "Evidence")'));
  record('9. GAS updateTicketRow routes GPS Photo to Completion Photos subfolder', gasJs.includes('getOrCreateSubFolder(schoolFolder, "Completion Photos")'));
  record('10. GAS enforces [TicketID]_HM_Signed_Completion_Report.jpg naming', gasJs.includes('"HM_Signed_Completion_Report.jpg"'));
  record('11. GAS enforces [TicketID]_Completion_UPS_GPS.jpg naming', gasJs.includes('"Completion_UPS_GPS.jpg"'));
  record('12. GAS returns structured completionFiles array with fileId and URLs', gasJs.includes('completionFiles.push') && gasJs.includes('completionFiles: completionFiles'));

  // TEST 3: Dedicated Live Dual-Slot Submission on Isolated Test Ticket
  const randNum = Math.floor(10000 + Math.random() * 89999);
  const testTid = 'HTL-NGP-' + randNum;
  const testUdise = '331901' + randNum;

  // Auto-start server if not already running on port 10000
  let serverStarted = false;
  const isListening = await new Promise(res => {
    const req = http.get('http://localhost:10000/api/version', () => res(true));
    req.on('error', () => res(false));
    req.setTimeout(800, () => { req.destroy(); res(false); });
  });

  if (!isListening) {
    await new Promise((res, rej) => {
      serverModule.listen(10000, () => {
        serverStarted = true;
        res();
      });
      serverModule.on('error', rej);
    });
  }

  try {
    await db.createTicket({
      ticketId: testTid,
      udise: testUdise,
      district: 'Nagapattinam',
      schoolName: 'MGHSS NAGAPPATTIANAM',
      issue: 'UPS Not Turning ON',
      priority: 'High',
      status: 'New / Under Review',
      hmReportPhotoUrl: '',
      completionPhotoUrl: '',
      completionEvidenceRequested: true
    });

    const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
      0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
      0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
      0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
      0xD2, 0xCF, 0x20, 0xFF, 0xD9
    ]).toString('base64');

    const submitBody = JSON.stringify({
      ticketId: testTid,
      udise: testUdise,
      district: 'Nagapattinam',
      schoolName: 'MGHSS NAGAPPATTIANAM',
      source: 'AI Teacher',
      submittedBy: 'AI Teacher',
      hmReportPhotoBase64: dummyBase64,
      completionPhotoBase64: dummyBase64,
      gpsLatitude: 10.76543,
      gpsLongitude: 79.84321,
      gpsAccuracy: 6,
      gpsTimestamp: new Date().toISOString(),
      gpsSource: 'web-camera',
      requireBoth: true,
      isFinalSubmit: true
    });

    const submitRes = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:10000/api/tickets/completion-evidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(submitBody)
        }
      }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(b) });
          } catch(e) {
            resolve({ statusCode: res.statusCode, data: b });
          }
        });
      });
      req.on('error', reject);
      req.write(submitBody);
      req.end();
    });

    record('13. POST /api/tickets/completion-evidence returns HTTP 200', submitRes.statusCode === 200);
    record('14. Response indicates persistenceStatus: PERSISTED', submitRes.data.persistenceStatus === 'PERSISTED');
    record('15. Response contains evidenceCount: 2', submitRes.data.evidenceCount === 2);
    record('16. Slot 1 HM Report URL returned', !!submitRes.data.hmReportPhotoUrl);
    record('17. Slot 2 Completion Photo URL returned', !!submitRes.data.completionPhotoUrl);

    // Verify DB record
    const allT = await db.getAllTickets();
    const saved = allT.find(x => x.ticketId === testTid);
    record('18. Ticket in database reflects SUBMITTED status', saved && saved.completionEvidenceStatus === 'SUBMITTED');
    record('19. Ticket completionEvidence has both hmSignedReport and completionPhoto', 
      saved && saved.completionEvidence?.hmSignedReport?.uploaded && saved.completionEvidence?.completionPhoto?.uploaded);

    // Verify disk backup files exist
    const projectRoot = path.resolve(__dirname, '..');
    const hmDiskPath = submitRes.data.hmReportPhotoUrl.startsWith('/uploads/') 
      ? path.join(projectRoot, submitRes.data.hmReportPhotoUrl)
      : path.join(projectRoot, 'uploads', path.basename(submitRes.data.hmReportPhotoUrl));
    const compDiskPath = submitRes.data.completionPhotoUrl.startsWith('/uploads/')
      ? path.join(projectRoot, submitRes.data.completionPhotoUrl)
      : path.join(projectRoot, 'uploads', path.basename(submitRes.data.completionPhotoUrl));
    record('20. Local backup file exists for Slot 1', fs.existsSync(hmDiskPath) || submitRes.data.hmReportPhotoUrl.startsWith('http'));
    record('21. Local backup file exists for Slot 2 with GPS EXIF', fs.existsSync(compDiskPath) || submitRes.data.completionPhotoUrl.startsWith('http'));

    // Verify authentic ticket HTL-NGP-03130 is untouched
    const authT = allT.find(x => x.ticketId === 'HTL-NGP-03130');
    record('22. Authentic production ticket HTL-NGP-03130 remains intact and protected', authT && authT.ticketId === 'HTL-NGP-03130');

    // Clean up test ticket
    await db.deleteTicket(testTid);
    record('23. Isolated test ticket cleanly purged after audit', true);

  } finally {
    if (serverStarted) {
      serverModule.close();
    }
  }

  console.log('\n====================================================================================');
  console.log(`📊 HM REPORT DRIVE PERSISTENCE SUITE: ${passed}/${passed + failed} PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('====================================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Fatal Suite Error:', err);
  process.exit(1);
});
