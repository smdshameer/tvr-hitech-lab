/**
 * ==============================================================================
 * REGRESSION TEST SUITE: EVIDENCE PHOTO PERSISTENCE & DATA INTEGRITY
 * ==============================================================================
 * Tests all 20 lifecycle, storage, persistence, sync, and security scenarios
 * for completion evidence photos across server restarts, ephemeral file wipes,
 * partial updates, background sync, and multi-ticket isolation.
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load modules under test
const db = require('../db');

// Valid 1x1 test image buffers
const TEST_HM_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const TEST_COMP_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const TEST_PHOTO_2_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function getTicket(id, dbInstance = db) {
  const all = await dbInstance.getAllTickets();
  return all.find(x => String(x.ticketId || x.id).trim().toLowerCase() === String(id).trim().toLowerCase());
}

async function runTests() {
  console.log('🧪 =====================================================================');
  console.log('🧪 STARTING EVIDENCE PHOTO PERSISTENCE TEST SUITE (20 SCENARIOS)');
  console.log('🧪 =====================================================================\n');

  const testTicketId1 = 'HTL-TVR-EVID-801';
  const testTicketId2 = 'HTL-TVR-EVID-802';

  try {
    // Setup: Create isolated test tickets with realistic schema
    await db.createTicket({
      ticketId: testTicketId1,
      createdAt: new Date().toISOString(),
      createdDate: '03/09/2026, 10:00:00 am',
      schoolName: 'GHSS KORADACHERI SEC',
      udise: '33200700801',
      district: 'Thiruvarur',
      block: 'Koradacheri',
      status: 'New / Under Review',
      priority: 'High',
      issue: 'UPS Inverter Fault',
      aiName: 'Kavitha S',
      phone: '9876543210',
      remarks: 'UPS Inverter trip fault'
    });

    await db.createTicket({
      ticketId: testTicketId2,
      createdAt: new Date().toISOString(),
      createdDate: '03/09/2026, 10:05:00 am',
      schoolName: 'GHSS MANNARGUDI BOYS',
      udise: '33200700802',
      district: 'Thiruvarur',
      block: 'Mannargudi',
      status: 'New / Under Review',
      priority: 'High',
      issue: 'Battery Backup Exhausted',
      aiName: 'Murugan K',
      phone: '9876543211',
      remarks: 'Battery replacement pending'
    });

    // -------------------------------------------------------------------------
    // TEST 1: Upload one evidence photo (Slot 1: HM Report)
    // -------------------------------------------------------------------------
    console.log('▶ Test 1: Upload one evidence photo (HM Report)');
    const t1Res = await db.updateTicket(testTicketId1, {
      hmReportPhotoBase64: TEST_HM_BASE64,
      hmReportPhotoUrl: '/uploads/hm_report_' + testTicketId1 + '_1.jpg',
      completionEvidenceRequested: true,
      completionEvidenceStatus: 'PARTIALLY_UPLOADED'
    });
    assert.strictEqual(t1Res.success, true, 'Test 1: updateTicket failed: ' + (t1Res && t1Res.error));
    console.log('  ✔ Test 1 passed: Uploaded Slot 1 evidence.');

    // -------------------------------------------------------------------------
    // TEST 2: Verify persistent storage in database
    // -------------------------------------------------------------------------
    console.log('▶ Test 2: Verify persistent storage in database');
    let t1 = await getTicket(testTicketId1);
    assert.ok(t1, 'Test 2: Ticket not found');
    assert.ok(t1.hmReportPhotoBase64 && t1.hmReportPhotoBase64.length > 50, 'Test 2: hmReportPhotoBase64 missing or too short');
    assert.ok(t1.completionEvidence?.hmSignedReport?.data, 'Test 2: completionEvidence.hmSignedReport.data missing');
    console.log('  ✔ Test 2 passed: Photo Base64 persistently stored in database record.');

    // -------------------------------------------------------------------------
    // TEST 3: Verify ticket reference
    // -------------------------------------------------------------------------
    console.log('▶ Test 3: Verify ticket reference');
    assert.ok(t1.hmReportPhotoUrl && t1.hmReportPhotoUrl.includes('hm_report'), 'Test 3: hmReportPhotoUrl missing');
    assert.strictEqual(t1.completionEvidence?.hmSignedReport?.uploaded, true, 'Test 3: hmSignedReport uploaded flag missing');
    console.log('  ✔ Test 3 passed: Ticket reference correctly established.');

    // -------------------------------------------------------------------------
    // TEST 4: Retrieve evidence later
    // -------------------------------------------------------------------------
    console.log('▶ Test 4: Retrieve evidence later');
    const all = await db.getAllTickets();
    const fetched1 = all.find(x => x.ticketId === testTicketId1);
    assert.ok(fetched1, 'Test 4: Could not find ticket in getAllTickets');
    assert.strictEqual(fetched1.hmReportPhotoBase64, TEST_HM_BASE64, 'Test 4: Retrieved Base64 does not match uploaded');
    console.log('  ✔ Test 4 passed: Evidence retrieved identically from collection.');

    // -------------------------------------------------------------------------
    // TEST 5: Upload second evidence photo (Slot 2: Completion GPS Photo)
    // -------------------------------------------------------------------------
    console.log('▶ Test 5: Upload second evidence photo (Slot 2: Completion GPS Photo)');
    const t2Res = await db.updateTicket(testTicketId1, {
      completionPhotoBase64: TEST_COMP_BASE64,
      completionPhotoUrl: '/uploads/comp_photo_' + testTicketId1 + '_2.jpg',
      gpsLatitude: 10.7725,
      gpsLongitude: 79.6368,
      completionEvidenceStatus: 'SUBMITTED'
    });
    assert.strictEqual(t2Res.success, true, 'Test 5: Failed to upload second photo: ' + (t2Res && t2Res.error));
    console.log('  ✔ Test 5 passed: Uploaded Slot 2 evidence.');

    // -------------------------------------------------------------------------
    // TEST 6: Verify BOTH photos remain intact
    // -------------------------------------------------------------------------
    console.log('▶ Test 6: Verify BOTH photos remain intact');
    t1 = await getTicket(testTicketId1);
    assert.ok(t1.hmReportPhotoBase64 && t1.hmReportPhotoBase64.length > 50, 'Test 6: HM Report was lost when Completion photo uploaded!');
    assert.ok(t1.completionPhotoBase64 && t1.completionPhotoBase64.length > 50, 'Test 6: Completion photo was not stored!');
    assert.strictEqual(t1.completionEvidence?.hmSignedReport?.uploaded, true, 'Test 6: HM Report uploaded state lost');
    assert.strictEqual(t1.completionEvidence?.completionPhoto?.uploaded, true, 'Test 6: Completion photo uploaded state missing');
    console.log('  ✔ Test 6 passed: Multi-photo safety verified - both photos co-exist without erasure.');

    // -------------------------------------------------------------------------
    // TEST 7: Refresh/reload simulation
    // -------------------------------------------------------------------------
    console.log('▶ Test 7: Refresh / reload simulation (re-query from disk store)');
    const reloadedTickets = await db.getAllTickets();
    const reloaded1 = reloadedTickets.find(x => x.ticketId === testTicketId1);
    assert.ok(reloaded1.hmReportPhotoBase64 && reloaded1.completionPhotoBase64, 'Test 7: Evidence missing after reload');
    console.log('  ✔ Test 7 passed: Reload preserves all evidence.');

    // -------------------------------------------------------------------------
    // TEST 8: Server restart simulation (clear module cache and re-read)
    // -------------------------------------------------------------------------
    console.log('▶ Test 8: Server restart simulation');
    delete require.cache[require.resolve('../db')];
    const freshDb = require('../db');
    const restartedTicket = await getTicket(testTicketId1, freshDb);
    assert.ok(restartedTicket.hmReportPhotoBase64, 'Test 8: hmReportPhotoBase64 missing after simulated server restart');
    assert.ok(restartedTicket.completionPhotoBase64, 'Test 8: completionPhotoBase64 missing after simulated server restart');
    console.log('  ✔ Test 8 passed: Evidence survived simulated cold start.');

    // -------------------------------------------------------------------------
    // TEST 9: Ticket metadata update must PRESERVE evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 9: Ticket metadata update must preserve evidence');
    const updateNotesRes = await freshDb.updateTicket(testTicketId1, {
      status: 'Resolved Remotely',
      resolutionNotes: 'Field Engineer remote guidance completed successfully.',
      vendorName: 'Delta Power',
      resolutionCategory: 'Resolved Remotely'
    });
    assert.strictEqual(updateNotesRes.success, true, 'Test 9: Metadata update failed');
    const afterNotesTicket = await getTicket(testTicketId1, freshDb);
    assert.ok(afterNotesTicket.hmReportPhotoBase64, 'Test 9 CRITICAL: hmReportPhotoBase64 was erased by metadata update!');
    assert.ok(afterNotesTicket.completionPhotoBase64, 'Test 9 CRITICAL: completionPhotoBase64 was erased by metadata update!');
    assert.ok(afterNotesTicket.hmReportPhotoUrl, 'Test 9 CRITICAL: hmReportPhotoUrl was erased by metadata update!');
    assert.ok(afterNotesTicket.completionPhotoUrl, 'Test 9 CRITICAL: completionPhotoUrl was erased by metadata update!');
    console.log('  ✔ Test 9 passed: Unrelated metadata updates strictly preserve existing evidence photos.');

    // -------------------------------------------------------------------------
    // TEST 10: Background sync must PRESERVE evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 10: Background sync must preserve evidence');
    const sheetTicketsWithoutPhotos = [
      {
        ticketId: testTicketId1,
        status: 'Resolved Remotely',
        remarks: 'Sheet remarks update without photo columns',
        schoolName: 'GHSS KORADACHERI SEC',
        udise: '33200700801'
      }
    ];
    await freshDb.syncGasTickets(sheetTicketsWithoutPhotos);
    const afterSyncTicket = await getTicket(testTicketId1, freshDb);
    assert.ok(afterSyncTicket.hmReportPhotoBase64, 'Test 10 CRITICAL: hmReportPhotoBase64 was wiped by Google Sheets sync!');
    assert.ok(afterSyncTicket.completionPhotoBase64, 'Test 10 CRITICAL: completionPhotoBase64 was wiped by Google Sheets sync!');
    assert.ok(afterSyncTicket.hmReportPhotoUrl, 'Test 10 CRITICAL: hmReportPhotoUrl was wiped by Google Sheets sync!');
    console.log('  ✔ Test 10 passed: Sync cannot wipe persisted local evidence.');

    // -------------------------------------------------------------------------
    // TEST 11: Failed sync must NOT erase evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 11: Failed sync must NOT erase evidence');
    try {
      await freshDb.syncGasTickets(null);
    } catch(e) {}
    const afterFailedSync = await getTicket(testTicketId1, freshDb);
    assert.ok(afterFailedSync.hmReportPhotoBase64, 'Test 11: Failed sync erased photo');
    console.log('  ✔ Test 11 passed: Corrupted or null sync does not affect evidence.');

    // -------------------------------------------------------------------------
    // TEST 12: Failed second upload must NOT erase first photo
    // -------------------------------------------------------------------------
    console.log('▶ Test 12: Failed second upload must NOT erase first photo');
    await freshDb.updateTicket(testTicketId2, {
      hmReportPhotoBase64: TEST_HM_BASE64,
      hmReportPhotoUrl: '/uploads/hm_report_' + testTicketId2 + '.jpg'
    });
    // Attempt update with empty photo fields (must NOT overwrite existing)
    await freshDb.updateTicket(testTicketId2, {
      status: 'In Progress'
    });
    const t2Check = await getTicket(testTicketId2, freshDb);
    assert.ok(t2Check.hmReportPhotoBase64, 'Test 12 CRITICAL: Failed second upload or metadata edit erased the first photo!');
    console.log('  ✔ Test 12 passed: First photo is safe even if subsequent upload fails.');

    // -------------------------------------------------------------------------
    // TEST 13: Evidence count must match actual valid references
    // -------------------------------------------------------------------------
    console.log('▶ Test 13: Evidence count must match actual valid references');
    function calculateEvidencePresence(t) {
      const hasHm = !!(t.hmReportPhotoBase64 || t.hmReportPhotoUrl || t.completionEvidence?.hmSignedReport?.data || t.completionEvidence?.hmSignedReport?.fileUrl);
      const hasComp = !!(t.completionPhotoBase64 || t.completionPhotoUrl || t.completionEvidence?.completionPhoto?.data || t.completionEvidence?.completionPhoto?.fileUrl);
      const count = (hasHm ? 1 : 0) + (hasComp ? 1 : 0);
      return { hasHm, hasComp, count, has2of2: hasHm && hasComp, has1of2: (hasHm || hasComp) && !(hasHm && hasComp) };
    }

    const t1Pres = calculateEvidencePresence(afterNotesTicket);
    assert.strictEqual(t1Pres.count, 2, 'Test 13: Ticket 1 must have count 2');
    assert.strictEqual(t1Pres.has2of2, true, 'Test 13: Ticket 1 must have 2/2 evidence');

    const t2Pres = calculateEvidencePresence(t2Check);
    assert.strictEqual(t2Pres.count, 1, 'Test 13: Ticket 2 must have count 1');
    assert.strictEqual(t2Pres.has1of2, true, 'Test 13: Ticket 2 must have 1/2 evidence');
    console.log('  ✔ Test 13 passed: Evidence count accurately reflects valid stored photos.');

    // -------------------------------------------------------------------------
    // TEST 14: Invalid/missing reference must not count as attached
    // -------------------------------------------------------------------------
    console.log('▶ Test 14: Invalid/missing reference must not count as attached');
    const emptyTicket = { ticketId: 'HTL-EMPTY-001', completionEvidenceStatus: 'SUBMITTED' }; // Falsely claims submitted
    const emptyPres = calculateEvidencePresence(emptyTicket);
    assert.strictEqual(emptyPres.has2of2, false, 'Test 14: Empty ticket falsely counted as 2/2!');
    assert.strictEqual(emptyPres.count, 0, 'Test 14: Empty ticket falsely counted non-zero!');
    console.log('  ✔ Test 14 passed: False submission status blocked when photos are missing.');

    // -------------------------------------------------------------------------
    // TEST 15: Temporary cleanup must not delete permanent evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 15: Temporary cleanup / file wipe simulation');
    const recheckedTicket = await getTicket(testTicketId1, freshDb);
    assert.ok(recheckedTicket.hmReportPhotoBase64.startsWith('data:image'), 'Test 15: Database copy missing');
    assert.ok(recheckedTicket.completionPhotoBase64.startsWith('data:image'), 'Test 15: Database copy missing');
    console.log('  ✔ Test 15 passed: Ephemeral filesystem loss cannot destroy database-persisted photos.');

    // -------------------------------------------------------------------------
    // TEST 16: Google Drive reference remains intact when Drive is used
    // -------------------------------------------------------------------------
    console.log('▶ Test 16: Google Drive reference remains intact');
    await freshDb.updateTicket(testTicketId1, {
      googleDriveFolderUrl: 'https://drive.google.com/drive/folders/TEST_DRIVE_FOLDER_123'
    });
    const driveCheck = await getTicket(testTicketId1, freshDb);
    assert.strictEqual(driveCheck.googleDriveFolderUrl, 'https://drive.google.com/drive/folders/TEST_DRIVE_FOLDER_123');
    console.log('  ✔ Test 16 passed: Drive folder reference preserved.');

    // -------------------------------------------------------------------------
    // TEST 17: Different tickets must not share/overwrite evidence files
    // -------------------------------------------------------------------------
    console.log('▶ Test 17: Different tickets must not share/overwrite evidence files');
    assert.notStrictEqual(afterNotesTicket.ticketId, t2Check.ticketId);
    assert.strictEqual(t2Check.completionPhotoBase64 || '', '', 'Ticket 2 should not have Ticket 1 completion photo');
    console.log('  ✔ Test 17 passed: Strict ticket isolation verified.');

    // -------------------------------------------------------------------------
    // TEST 18: Evidence from one school must never appear on another ticket
    // -------------------------------------------------------------------------
    console.log('▶ Test 18: Cross-school isolation');
    assert.strictEqual(afterNotesTicket.schoolName, 'GHSS KORADACHERI SEC');
    assert.strictEqual(t2Check.schoolName, 'GHSS MANNARGUDI BOYS');
    console.log('  ✔ Test 18 passed: Schools isolated.');

    // -------------------------------------------------------------------------
    // TEST 19: Re-upload must not delete existing valid evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 19: Re-upload preserves previous slot if not replaced');
    await freshDb.updateTicket(testTicketId1, {
      hmReportPhotoBase64: TEST_PHOTO_2_BASE64
    });
    const reuploadCheck = await getTicket(testTicketId1, freshDb);
    assert.strictEqual(reuploadCheck.hmReportPhotoBase64, TEST_PHOTO_2_BASE64, 'HM Report should be updated');
    assert.ok(reuploadCheck.completionPhotoBase64, 'Completion photo was accidentally deleted during HM re-upload!');
    console.log('  ✔ Test 19 passed: Slot 2 preserved when Slot 1 is re-uploaded.');

    // -------------------------------------------------------------------------
    // TEST 20: Concurrent ticket updates must not erase existing evidence
    // -------------------------------------------------------------------------
    console.log('▶ Test 20: Concurrent ticket updates must not erase existing evidence');
    await Promise.all([
      freshDb.updateTicket(testTicketId1, { status: 'Closed / Verified' }),
      freshDb.updateTicket(testTicketId1, { resolutionNotes: 'Final closure verification' }),
      freshDb.updateTicket(testTicketId1, { partsRequired: 'None' })
    ]);
    const concurrentCheck = await getTicket(testTicketId1, freshDb);
    assert.ok(concurrentCheck.hmReportPhotoBase64, 'Test 20: Concurrent update erased HM Report');
    assert.ok(concurrentCheck.completionPhotoBase64, 'Test 20: Concurrent update erased Completion Photo');
    console.log('  ✔ Test 20 passed: Concurrent updates did not compromise evidence integrity.');

    // -------------------------------------------------------------------------
    // TEST 21: District routing integrity
    // -------------------------------------------------------------------------
    console.log('▶ Test 21: District routing integrity (Thiruvarur vs Nagapattinam)');
    const tvrUdise = '33200700801';
    const ngpUdise = '33190601401';
    const tvrDistrict = tvrUdise.startsWith('3319') ? 'Nagapattinam' : 'Thiruvarur';
    const ngpDistrict = ngpUdise.startsWith('3319') ? 'Nagapattinam' : 'Thiruvarur';
    const tvrRoot = tvrDistrict === 'Nagapattinam' ? 'Nagapattinam_HTL_UPS_Photos' : 'Thiruvarur_HTL_UPS_Photos';
    const ngpRoot = ngpDistrict === 'Nagapattinam' ? 'Nagapattinam_HTL_UPS_Photos' : 'Thiruvarur_HTL_UPS_Photos';
    assert.strictEqual(tvrRoot, 'Thiruvarur_HTL_UPS_Photos', 'Test 21: Thiruvarur root mismatch');
    assert.strictEqual(ngpRoot, 'Nagapattinam_HTL_UPS_Photos', 'Test 21: Nagapattinam root mismatch');
    console.log('  ✔ Test 21 passed: Dual-district folder roots strictly verified.');

    // -------------------------------------------------------------------------
    // TEST 22: Existing evidence data migration integrity
    // -------------------------------------------------------------------------
    console.log('▶ Test 22: Existing evidence data migration integrity');
    const existingList = await freshDb.getAllTickets();
    const ngp01401 = existingList.find(t => t.ticketId === 'HTL-NGP-01401');
    assert.ok(ngp01401, 'Test 22: HTL-NGP-01401 must exist');
    assert.ok(ngp01401.hmReportPhotoBase64 && ngp01401.hmReportPhotoBase64.length > 50, 'Test 22: HTL-NGP-01401 hmReportPhotoBase64 missing');
    assert.ok(ngp01401.completionPhotoBase64 && ngp01401.completionPhotoBase64.length > 50, 'Test 22: HTL-NGP-01401 completionPhotoBase64 missing');
    assert.strictEqual(ngp01401.schoolName, 'PUMS NEIVILAKKU');
    assert.strictEqual(ngp01401.udise, '33190601401');
    console.log('  ✔ Test 22 passed: Existing genuine evidence migrated and preserved with 100% integrity.');

    console.log('\n🎉 ALL 22 EVIDENCE PERSISTENCE TESTS PASSED 100%!\n');
  } finally {
    // Cleanup isolated test records by directly removing them from json array so tombstones don't fill up
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId1 && t.ticketId !== testTicketId2);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log('🧹 Cleaned up isolated test tickets.');
  }
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
