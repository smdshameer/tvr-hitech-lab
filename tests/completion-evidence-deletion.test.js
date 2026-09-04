/**
 * DEDICATED TEST SUITE:
 * Completion Evidence Photo Deletion & Strict Slot Isolation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 TEST: Completion Evidence Photo Deletion & Strict Slot Isolation');
console.log('======================================================================\n');

class MockDriveFile {
  constructor(id, name, folderId) {
    this.id = id;
    this.name = name;
    this.folderId = folderId;
    this.trashed = false;
  }
  getId() { return this.id; }
  getName() { return this.name; }
  isTrashed() { return this.trashed; }
  setTrashed(val) { this.trashed = !!val; }
}

class MockDriveFolder {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.files = [];
  }
  getId() { return this.id; }
  getName() { return this.name; }
  createFile(name) {
    const fid = `mock_${Math.random().toString(36).substring(2, 9)}`;
    const f = new MockDriveFile(fid, name, this.id);
    this.files.push(f);
    return f;
  }
  getFilesByName(name) {
    const matched = this.files.filter(f => !f.isTrashed() && f.getName() === name);
    let idx = 0;
    return {
      hasNext: () => idx < matched.length,
      next: () => matched[idx++]
    };
  }
  getActiveFiles() {
    return this.files.filter(f => !f.isTrashed());
  }
}

function emulateGasDelete(compFolder, tid, slot, fileId) {
  const isSlot1 = slot === 'HM_REPORT' || slot === '1';
  const isSlot2 = slot === 'GPS_COMPLETION' || slot === '2';
  const targetFilename = (tid ? tid + '_' : '') + (isSlot1 ? 'HM_Signed_Completion_Report.jpg' : 'Completion_UPS_GPS.jpg');
  let trashedCount = 0;

  if (fileId) {
    const f = compFolder.files.find(item => item.getId() === fileId);
    if (f && !f.isTrashed()) {
      const fName = f.getName();
      let safeToTrash = false;
      if (isSlot1 && fName.indexOf('HM_Signed') !== -1) safeToTrash = true;
      else if (isSlot2 && (fName.indexOf('GPS') !== -1 || fName.indexOf('Completion_UPS') !== -1)) safeToTrash = true;
      else if (fName === targetFilename) safeToTrash = true;

      if (safeToTrash) {
        f.setTrashed(true);
        trashedCount++;
      }
    }
  }

  const exactFiles = compFolder.getFilesByName(targetFilename);
  while (exactFiles.hasNext()) {
    const ef = exactFiles.next();
    const efName = ef.getName();
    if (isSlot1 && (efName.indexOf('UPS_GPS') !== -1 || efName.indexOf('Completion_UPS') !== -1)) continue;
    if (isSlot2 && efName.indexOf('HM_Signed') !== -1) continue;
    if (!ef.isTrashed()) {
      ef.setTrashed(true);
      trashedCount++;
    }
  }

  return { success: true, slot, trashedCount };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  // TEST 1
  test('1. Strict Slot Isolation: Deleting Slot 1 trashes only HM Report and leaves Slot 2 active', () => {
    const compFolder = new MockDriveFolder('comp_1', 'Completion Photos');
    const hmFile = compFolder.createFile('HTL-TEST-001_HM_Signed_Completion_Report.jpg');
    const compFile = compFolder.createFile('HTL-TEST-001_Completion_UPS_GPS.jpg');

    assert.strictEqual(compFolder.getActiveFiles().length, 2, 'Should have 2 active files initially');

    const res = emulateGasDelete(compFolder, 'HTL-TEST-001', 'HM_REPORT', hmFile.getId());
    assert.strictEqual(res.success, true);
    assert.strictEqual(hmFile.isTrashed(), true, 'HM Signed Report must be trashed');
    assert.strictEqual(compFile.isTrashed(), false, 'GPS Completion Photo MUST NOT be trashed');
    assert.strictEqual(compFolder.getActiveFiles().length, 1, 'Exactly 1 active file should remain');
    assert.strictEqual(compFolder.getActiveFiles()[0].getId(), compFile.getId(), 'Remaining file must be GPS photo');
  });

  // TEST 2
  test('2. Strict Slot Isolation: Deleting Slot 2 trashes only GPS Photo and leaves Slot 1 active', () => {
    const compFolder = new MockDriveFolder('comp_2', 'Completion Photos');
    const hmFile = compFolder.createFile('HTL-TEST-002_HM_Signed_Completion_Report.jpg');
    const compFile = compFolder.createFile('HTL-TEST-002_Completion_UPS_GPS.jpg');

    const res = emulateGasDelete(compFolder, 'HTL-TEST-002', 'GPS_COMPLETION', compFile.getId());
    assert.strictEqual(res.success, true);
    assert.strictEqual(compFile.isTrashed(), true, 'GPS Completion Photo must be trashed');
    assert.strictEqual(hmFile.isTrashed(), false, 'HM Signed Report MUST NOT be trashed');
    assert.strictEqual(compFolder.getActiveFiles().length, 1, 'Exactly 1 active file should remain');
    assert.strictEqual(compFolder.getActiveFiles()[0].getId(), hmFile.getId(), 'Remaining file must be HM report');
  });

  // TEST 3
  test('3. Evidence folder safety: Deleting completion photo does not touch Evidence folder photos', () => {
    const evidenceFolder = new MockDriveFolder('evid_1', 'Evidence');
    const e1 = evidenceFolder.createFile('HTL-TEST-003_Evidence_1.jpg');
    const e2 = evidenceFolder.createFile('HTL-TEST-003_Evidence_2.jpg');
    const e3 = evidenceFolder.createFile('HTL-TEST-003_Evidence_3.jpg');
    const e4 = evidenceFolder.createFile('HTL-TEST-003_Evidence_4.jpg');

    const compFolder = new MockDriveFolder('comp_3', 'Completion Photos');
    const hmFile = compFolder.createFile('HTL-TEST-003_HM_Signed_Completion_Report.jpg');

    emulateGasDelete(compFolder, 'HTL-TEST-003', 'HM_REPORT', hmFile.getId());
    assert.strictEqual(evidenceFolder.getActiveFiles().length, 4, 'All 4 evidence photos must remain active');
  });

  // TEST 4
  const testId1 = 'HTL-TVR-05301-REG-DEL1';
  await testAsync('4. db.deleteCompletionEvidence for Slot 1: clears hmDriveFileId and sets partial status', async () => {
    await db.createTicket({
      ticketId: testId1,
      status: 'Resolved Remotely',
      district: 'Thiruvarur',
      schoolName: 'GHSS KORADACHERY',
      udise: '33200505301',
      issue: 'Inverter output voltage low',
      hmDriveFileId: 'drive_hm_123',
      hmReportPhotoUrl: 'https://lh3.googleusercontent.com/d/drive_hm_123=w800',
      compDriveFileId: 'drive_comp_456',
      completionPhotoUrl: 'https://lh3.googleusercontent.com/d/drive_comp_456=w800',
      completionEvidenceStatus: 'SUBMITTED',
      completionEvidence: {
        status: 'complete',
        hmSignedReport: { uploaded: true, driveFileId: 'drive_hm_123' },
        completionPhoto: { uploaded: true, driveFileId: 'drive_comp_456' }
      }
    });

    const res = await db.deleteCompletionEvidence(testId1, 'HM_REPORT');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.ticket.hmDriveFileId, '', 'hmDriveFileId must be cleared');
    assert.strictEqual(res.ticket.hmReportPhotoUrl, '', 'hmReportPhotoUrl must be cleared');
    assert.strictEqual(res.ticket.compDriveFileId, 'drive_comp_456', 'compDriveFileId must remain intact');
    assert.strictEqual(res.ticket.completionEvidence.hmSignedReport.uploaded, false, 'hmSignedReport uploaded must be false');
    assert.strictEqual(res.ticket.completionEvidence.completionPhoto.uploaded, true, 'completionPhoto uploaded must remain true');
    assert.strictEqual(res.ticket.completionEvidenceStatus, 'PARTIALLY_UPLOADED', 'status must be PARTIALLY_UPLOADED');
  });

  // TEST 5
  await testAsync('5. db.deleteCompletionEvidence for Slot 2: clears compDriveFileId and sets PENDING if both gone', async () => {
    const res = await db.deleteCompletionEvidence(testId1, 'GPS_COMPLETION');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.ticket.compDriveFileId, '', 'compDriveFileId must be cleared');
    assert.strictEqual(res.ticket.completionPhotoUrl, '', 'completionPhotoUrl must be cleared');
    assert.strictEqual(res.ticket.completionEvidence.completionPhoto.uploaded, false, 'completionPhoto uploaded must be false');
    assert.strictEqual(res.ticket.completionEvidenceStatus, 'PENDING', 'status must be PENDING when both slots deleted');
  });

  // TEST 6
  test('6. server.js markup contracts: deleteCompletionModal, confirmation triggers, and endpoints exist', () => {
    const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    assert(serverCode.includes('id="deleteCompletionModal"'), 'deleteCompletionModal must exist in server.js');
    assert(serverCode.includes('id="btnConfirmDeleteCompletion"'), 'btnConfirmDeleteCompletion must exist');
    assert(serverCode.includes('executeDeleteCompletionPhoto()'), 'executeDeleteCompletionPhoto must exist');
    assert(serverCode.includes('closeDeleteCompletionModal()'), 'closeDeleteCompletionModal must exist');
    assert(serverCode.includes("pathname === '/api/tickets/delete-completion-evidence'"), 'delete-completion-evidence API endpoint must be declared');
    assert(serverCode.includes('deleteCompletionEvidenceFromGoogleDrive'), 'deleteCompletionEvidenceFromGoogleDrive must be declared');
    assert(serverCode.includes('Delete HM Signed Report?'), 'Confirmation message for HM report must match requirement');
    assert(serverCode.includes('Delete GPS Completion Photo?'), 'Confirmation message for GPS photo must match requirement');
  });

  // TEST 7
  test('7. google_apps_script_code.js contracts: delete_completion_photo action and function exist', () => {
    const gasCode = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

    assert(gasCode.includes("action === 'delete_completion_photo'"), 'delete_completion_photo action must be handled in GAS');
    assert(gasCode.includes('function deleteCompletionPhoto('), 'deleteCompletionPhoto function must be defined in GAS');
    assert(gasCode.includes('HM_Signed_Completion_Report.jpg'), 'Exact HM filename must be targeted');
    assert(gasCode.includes('Completion_UPS_GPS.jpg'), 'Exact GPS filename must be targeted');
  });

  // TEST 8
  const testId2 = 'HTL-TVR-05301-REG-DEL2';
  await testAsync('8. Re-upload after deletion: Slot 1 can be re-uploaded and both slots become complete', async () => {
    await db.createTicket({
      ticketId: testId2,
      district: 'Thiruvarur',
      schoolName: 'GHSS KORADACHERY',
      udise: '33200505301',
      issue: 'Input fuse blown',
      compDriveFileId: 'drive_comp_existing',
      completionPhotoUrl: 'https://lh3.googleusercontent.com/d/drive_comp_existing=w800',
      completionEvidenceStatus: 'PARTIALLY_UPLOADED',
      completionEvidence: {
        status: 'partial',
        hmSignedReport: { uploaded: false, driveFileId: '' },
        completionPhoto: { uploaded: true, driveFileId: 'drive_comp_existing' }
      }
    });

    const res = await db.updateTicket(testId2, {
      hmDriveFileId: 'drive_hm_new_reupload',
      hmReportPhotoUrl: 'https://lh3.googleusercontent.com/d/drive_hm_new_reupload=w800',
      completionEvidence: {
        hmSignedReport: { uploaded: true, driveFileId: 'drive_hm_new_reupload' },
        completionPhoto: { uploaded: true, driveFileId: 'drive_comp_existing' }
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.ticket.hmDriveFileId, 'drive_hm_new_reupload');
    assert.strictEqual(res.ticket.compDriveFileId, 'drive_comp_existing');
    assert.strictEqual(res.ticket.completionEvidence.status, 'complete');
  });

  // Cleanup test tickets
  try {
    const list = db.loadTicketsFromJson().filter(t => t.ticketId !== testId1 && t.ticketId !== testId2);
    db.safeWriteFileSync(path.join(__dirname, '../data/tickets.json'), JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}

  console.log('\n======================================================================');
  console.log(`📊 RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
