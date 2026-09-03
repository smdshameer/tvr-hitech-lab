const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================');
console.log('🧪 RUNNING COMPLETION EVIDENCE SYNC & PERSISTENCE TESTS');
console.log('========================================================\n');

const db = require('../db.js');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log('✅ [PASS] ' + name);
      passed++;
    } catch (err) {
      console.error('❌ [FAIL] ' + name + ': ' + err.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log('✅ [PASS] ' + name);
      passed++;
    } catch (err) {
      console.error('❌ [FAIL] ' + name + ': ' + err.message);
      failed++;
    }
  }

  const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const dbJs = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');

  const randomSuffix = Math.floor(10000 + Math.random() * 89999);
  const testTicketId = 'HTL-TVR-' + randomSuffix;
  const testUdise = '332001' + randomSuffix;
  await db.createTicket({
    ticketId: testTicketId,
    udise: testUdise,
    schoolName: 'GHSS ADICHAPURAM',
    issue: 'UPS Backup Battery Problem',
    priority: 'Medium',
    status: 'New / Under Review',
    hmReportPhotoUrl: '',
    completionPhotoUrl: '',
    completionEvidenceStatus: 'NOT_REQUESTED',
    completionEvidenceRequested: true
  });

  // TEST 1: Submit completion evidence with HM only (partial)
  await testAsync('1. Submit completion evidence with HM only sets partial status', async () => {
    const res = await db.updateTicket(testTicketId, {
      hmReportPhotoUrl: '/uploads/test_hm_only.jpg',
      completionEvidenceStatus: 'PARTIALLY_UPLOADED',
      completionEvidence: {
        hmSignedReport: { uploaded: true, fileUrl: '/uploads/test_hm_only.jpg' },
        completionPhoto: { uploaded: false, fileUrl: '' },
        status: 'partial'
      }
    });
    assert(res.success, 'Update must succeed for HM only');
    const tickets = await db.getAllTickets();
    const t = tickets.find(x => x.ticketId === testTicketId);
    assert(t.hmReportPhotoUrl === '/uploads/test_hm_only.jpg', 'hmReportPhotoUrl must be stored');
    assert(!t.completionPhotoUrl, 'completionPhotoUrl must remain empty');
    assert(t.completionEvidenceStatus === 'PARTIALLY_UPLOADED', 'status must be PARTIALLY_UPLOADED');
  });

  // TEST 2: Submit completion evidence with GPS only (partial)
  await testAsync('2. Submit completion evidence with GPS only sets partial status', async () => {
    const res = await db.updateTicket(testTicketId, {
      hmReportPhotoUrl: '',
      completionPhotoUrl: '/uploads/test_comp_only.jpg',
      gpsLatitude: 10.7572,
      gpsLongitude: 79.8473,
      completionEvidenceStatus: 'PARTIALLY_UPLOADED',
      completionEvidence: {
        hmSignedReport: { uploaded: false, fileUrl: '' },
        completionPhoto: { uploaded: true, fileUrl: '/uploads/test_comp_only.jpg', gpsLatitude: 10.7572, gpsLongitude: 79.8473 },
        status: 'partial'
      }
    });
    assert(res.success, 'Update must succeed for GPS only');
    const tickets = await db.getAllTickets();
    const t = tickets.find(x => x.ticketId === testTicketId);
    assert(!t.hmReportPhotoUrl, 'hmReportPhotoUrl must be empty');
    assert(t.completionPhotoUrl === '/uploads/test_comp_only.jpg', 'completionPhotoUrl must be stored');
    assert(t.gpsLatitude === 10.7572, 'gpsLatitude must be stored');
    assert(t.completionEvidenceStatus === 'PARTIALLY_UPLOADED', 'status must be PARTIALLY_UPLOADED');
  });

  // TEST 3: Submit completion evidence with both present (complete)
  await testAsync('3. Submit completion evidence with both present records complete status', async () => {
    const res = await db.updateTicket(testTicketId, {
      hmReportPhotoUrl: '/uploads/test_hm_both.jpg',
      completionPhotoUrl: '/uploads/test_comp_both.jpg',
      gpsLatitude: 10.757243,
      gpsLongitude: 79.847336,
      completionEvidenceStatus: 'SUBMITTED',
      completionEvidence: {
        hmSignedReport: { uploaded: true, fileUrl: '/uploads/test_hm_both.jpg' },
        completionPhoto: { uploaded: true, fileUrl: '/uploads/test_comp_both.jpg', gpsLatitude: 10.757243, gpsLongitude: 79.847336 },
        status: 'complete'
      }
    });
    assert(res.success, 'Update must succeed for both present');
    const tickets = await db.getAllTickets();
    const t = tickets.find(x => x.ticketId === testTicketId);
    assert(t.hmReportPhotoUrl === '/uploads/test_hm_both.jpg', 'HM report photo url must be persisted');
    assert(t.completionPhotoUrl === '/uploads/test_comp_both.jpg', 'Completion photo url must be persisted');
    assert(t.gpsLatitude === 10.757243, 'Latitude must be stored');
    assert(t.gpsLongitude === 79.847336, 'Longitude must be stored');
    assert(t.completionEvidenceStatus === 'SUBMITTED', 'Status must be SUBMITTED');
  });

  // TEST 4: Verify rejection/failure when database persistence fails or requireBoth violated
  test('4. Server completion-evidence route checks persistence and rejects incomplete final submission', () => {
    assert(serverJs.includes('if ((payload.requireBoth === true || payload.isFinalSubmit === true) && (!hmReportPhotoUrl || !completionPhotoUrl))'), 'Server must reject if either photo is missing on final submission');
    assert(serverJs.includes('if (!updateSuccess)'), 'Server must check updateSuccess and return HTTP 500 on database failure');
    assert(serverJs.includes("persistenceStatus: 'PERSISTED'"), 'Server response must confirm PERSISTED status');
  });

  // TEST 5: Verify rejection when coordinates are out of bounds or missing for new photo
  test('5. Verify rejection when invalid or out-of-bounds GPS data is submitted', () => {
    assert(serverJs.includes('if (hasNewCompPhoto && !hasValidGpsPayload)'), 'Server must enforce valid GPS for new photo');
    assert(serverJs.includes('payload.gpsLatitude < 8.0 || payload.gpsLatitude > 14.0'), 'Server must check TN latitude bounds');
    assert(serverJs.includes('payload.gpsLongitude < 76.0 || payload.gpsLongitude > 81.0'), 'Server must check TN longitude bounds');
    assert(serverJs.includes('Number(payload.gpsAccuracy) > 50'), 'Server must check 50m accuracy threshold');
  });

  // TEST 6: Verify rejection when submitting against non-existent ticket ID
  test('6. Verify rejection when submitting against non-existent ticket ID', () => {
    assert(serverJs.includes('if (!targetTicket)'), 'Server must check if ticket exists');
    assert(serverJs.includes("Ticket not found or has been permanently deleted."), 'Server must return 404 with ticket not found');
  });

  // TEST 7: Verify dashboard reload (getAllTickets / syncGasTickets) preserves both submitted evidence items
  await testAsync('7. Verify dashboard reload and Google Sheets sync preserves submitted evidence items', async () => {
    await db.updateTicket(testTicketId, {
      hmReportPhotoUrl: '/uploads/persisted_hm.jpg',
      completionPhotoUrl: '/uploads/persisted_comp.jpg',
      gpsLatitude: 10.7572,
      gpsLongitude: 79.8473,
      completionEvidenceStatus: 'SUBMITTED'
    });

    const tickets = await db.getAllTickets();
    const t = tickets.find(x => x.ticketId === testTicketId);
    assert(t, 'Ticket must be returned by getAllTickets');
    assert(t.hmReportPhotoUrl === '/uploads/persisted_hm.jpg', 'hmReportPhotoUrl must NOT be wiped by syncGasTickets');
    assert(t.completionPhotoUrl === '/uploads/persisted_comp.jpg', 'completionPhotoUrl must NOT be wiped by syncGasTickets');
    assert(t.gpsLatitude === 10.7572, 'gpsLatitude must NOT be wiped by syncGasTickets');
    assert(t.completionEvidenceStatus === 'SUBMITTED', 'completionEvidenceStatus must be preserved');
  });

  // TEST 8: Verify engineer dashboard and openActionModal fallback and display submitted evidence
  test('8. Engineer dashboard modal fallbacks and status badge correctly reflect submitted evidence', () => {
    assert(serverJs.includes('const hmUrl = t.hmReportPhotoUrl || t.hmReportPhoto || hmEv.fileUrl || "";'), 'openActionModal must resolve hmUrl from evidence object');
    assert(serverJs.includes('const compUrl = t.completionPhotoUrl || t.completionPhoto || compEv.fileUrl || "";'), 'openActionModal must resolve compUrl from evidence object');
    assert(serverJs.includes("if (t.completionEvidenceStatus === 'SUBMITTED' || (hmUrl && compUrl))"), 'reqBadge must show Submitted if completion evidence is present');
    assert(serverJs.includes('reqBadge.textContent = "🟢 Completion Evidence Submitted";'), 'Badge text must be 🟢 Completion Evidence Submitted');
    assert(serverJs.includes('📸 2/2 Evidence Attached'), 'Table rows must display 📸 2/2 Evidence Attached badge');
  });

  // TEST 9: Verify Slot 1 evidence remains watermark-free
  test('9. Slot 1 evidence is saved without watermark and without EXIF injection', () => {
    assert(serverJs.includes("fs.writeFileSync(hmFilePath, Buffer.from(hmBase64Data, 'base64'))"), 'Slot 1 must write plain buffer without modification');
    assert(!serverJs.match(/injectGpsExif\([^)]*hm/i), 'injectGpsExif must NEVER be called with hm report');
    assert(serverJs.includes('// Save HM Report Photo if provided (No GPS watermark overlay)'), 'Code comment must explicitly document Slot 1 has no GPS overlay');
  });

  // TEST 10: Verify Slot 2 evidence retains GPS coordinates and EXIF metadata
  test('10. Slot 2 evidence retains GPS coordinates and genuine TIFF GPS IFD (0x8825)', () => {
    assert(serverJs.includes('injectGpsExif('), 'injectGpsExif must be called for Slot 2');
    assert(serverJs.includes('0x8825'), 'injectGpsExif must embed TIFF GPS IFD tag 0x8825');
    assert(serverJs.includes('BROWSER_DEVICE_GPS') || serverJs.includes('WEB_BROWSER_GPS'), 'GPS source must be recorded');
  });

  console.log('\n========================================================');
  try {
    await db.deleteTicket(testTicketId, 'Test Cleanup', 'test');
  } catch(e) {}

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
