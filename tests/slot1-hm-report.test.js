/**
 * tests/slot1-hm-report.test.js
 * Dedicated Regression Test Suite for Slot 1 — HM Signed Completion Report
 * Verifies all 18 lifecycle requirements specified in Step 12.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const serverJsPath = path.join(rootDir, 'server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n========================================================');
console.log('🧪 RUNNING SLOT 1 HM SIGNED REPORT DEDICATED TEST SUITE');
console.log('========================================================\n');

// 1. Slot 1 camera button exists
test('1. Slot 1 camera button (#btnTrackHmCam) exists', () => {
  assert(serverJsContent.includes('id="btnTrackHmCam"'), 'btnTrackHmCam button must exist in HTML');
  assert(serverJsContent.includes("triggerTrackHmCapture('cam')"), 'btnTrackHmCam must call triggerTrackHmCapture("cam")');
});

// 2. Slot 1 file button exists
test('2. Slot 1 file button (#btnTrackHmFile) exists', () => {
  assert(serverJsContent.includes('id="btnTrackHmFile"'), 'btnTrackHmFile button must exist in HTML');
  assert(serverJsContent.includes("triggerTrackHmCapture('file')"), 'btnTrackHmFile must call triggerTrackHmCapture("file")');
});

// 3. triggerTrackHmCapture exists
test('3. triggerTrackHmCapture(type) function declared and handles programmatic click', () => {
  assert(serverJsContent.includes('function triggerTrackHmCapture(type)'), 'triggerTrackHmCapture function must be declared');
  assert(serverJsContent.includes('el.click()'), 'triggerTrackHmCapture must dispatch click on input');
});

// 4. Slot 1 File state exists
test('4. Slot 1 File state variables hmCompletionPhotoFile and trackHmFile exist', () => {
  assert(serverJsContent.includes('let hmCompletionPhotoFile = null;'), 'hmCompletionPhotoFile must be declared');
  assert(serverJsContent.includes('let trackHmFile = null;'), 'trackHmFile must be declared');
});

// 5. handleTrackHmUpload exists
test('5. handleTrackHmUpload(e) function declared with safe target extraction', () => {
  assert(serverJsContent.includes('function handleTrackHmUpload(e)'), 'handleTrackHmUpload function must be declared');
  assert(serverJsContent.includes('hmCompletionPhotoFile = file;'), 'handleTrackHmUpload must store File in hmCompletionPhotoFile');
});

// 6. Slot 1 preview state changes
test('6. Slot 1 preview (#trackHmImg) updates src and displays block', () => {
  assert(serverJsContent.includes('hmImg.src = trackHmBase64;'), 'hmImg.src must be assigned dataUrl');
  assert(serverJsContent.includes("hmImg.style.display = 'block';"), 'hmImg must become block display');
  assert(serverJsContent.includes("noHm.style.display = 'none';"), 'noHm placeholder must be hidden');
});

// 7. Slot 1 status changes to HM Report Uploaded
test('7. Slot 1 status badge changes to 🟢 HM Report Uploaded', () => {
  assert(serverJsContent.includes("stBadge.textContent = '🟢 HM Report Uploaded';"), 'Badge text must be 🟢 HM Report Uploaded');
  assert(serverJsContent.includes("stBadge.style.background = '#dcfce7';"), 'Badge background must be green #dcfce7');
});

// 8. Evidence counter correctly detects Slot 1
test('8. Evidence counter correctly detects Slot 1 and advances to 2 of 2 Submitted when both present', () => {
  assert(serverJsContent.includes("badge.textContent = '🟢 Completion Evidence: 2 of 2 Submitted';"), 'Counter must show 2 of 2 Submitted when both present');
  assert(serverJsContent.includes("badge.textContent = '🟡 Completion Evidence: 1 of 2 Submitted';"), 'Counter must show 1 of 2 Submitted when only one present');
  assert(serverJsContent.includes("badge.textContent = '🔴 Completion Evidence: 0 of 2 Submitted';"), 'Counter must show 0 of 2 Submitted when neither present');
});

// 9. Final submission contains Slot 1
test('9. Final submission payload explicitly contains Slot 1 (hmReportPhotoBase64)', () => {
  assert(serverJsContent.includes('hmReportPhotoBase64: trackHmBase64 || undefined'), 'Payload must include hmReportPhotoBase64');
});

// 10. Final submission contains Slot 2
test('10. Final submission payload explicitly contains Slot 2 (completionPhotoBase64)', () => {
  assert(serverJsContent.includes('completionPhotoBase64: trackCompBase64 || undefined'), 'Payload must include completionPhotoBase64');
});

// 11. Server accepts both
test('11. Server POST /api/tickets/completion-evidence accepts both Slot 1 and Slot 2', () => {
  assert(serverJsContent.includes("const hmBase64Payload = payload.hmReportPhotoBase64"), 'Server must extract hmReportPhotoBase64');
  assert(serverJsContent.includes("const hasNewCompPhoto = !!(payload.completionPhotoBase64"), 'Server must extract completionPhotoBase64');
});

// 12. Server rejects missing Slot 1
test('12. Server rejects final submission when Slot 1 is missing', () => {
  assert(serverJsContent.includes('if ((payload.requireBoth === true || payload.isFinalSubmit === true) && (!hmReportPhotoUrl || !completionPhotoUrl))'), 'Server must validate both photos are present');
});

// 13. Server rejects missing Slot 2
test('13. Client and server reject final submission when Slot 2 is missing', () => {
  assert(serverJsContent.includes('if (!hasHm || !hasComp)'), 'Client must alert if either photo is missing');
});

// 14. Slot 1 is saved without GPS EXIF
test('14. Slot 1 file is saved directly to disk without GPS EXIF modification', () => {
  const startIdx = serverJsContent.indexOf("pathname === '/api/tickets/completion-evidence'");
  const endIdx = serverJsContent.indexOf("await db.updateTicket(ticketId, updatePayload);", startIdx);
  const endpointHandler = serverJsContent.slice(startIdx, endIdx);
  
  assert(endpointHandler.includes("fs.writeFileSync(hmFilePath, Buffer.from(hmBase64Data, 'base64'))"), 'Slot 1 must write plain Buffer without EXIF');
  assert(!endpointHandler.includes("injectGpsExif(hmFilePath"), 'injectGpsExif must not be called on Slot 1');
});

// 15. Slot 2 still receives GPS EXIF
test('15. Slot 2 still receives GPS EXIF injection with coordinates', () => {
  const startIdx = serverJsContent.indexOf("pathname === '/api/tickets/completion-evidence'");
  const endIdx = serverJsContent.indexOf("await db.updateTicket(ticketId, updatePayload);", startIdx);
  const endpointHandler = serverJsContent.slice(startIdx, endIdx);

  assert(endpointHandler.includes("rawCompBuffer = injectGpsExif("), 'Slot 2 must call injectGpsExif');
});

// 16. clear Slot 1 does not clear Slot 2
test('16. clearTrackHmPhoto() only clears Slot 1 without affecting Slot 2', () => {
  const clearBody = serverJsContent.slice(
    serverJsContent.indexOf('function clearTrackHmPhoto()'),
    serverJsContent.indexOf('function clearTrackCompPhoto()')
  );
  assert(clearBody.includes("trackHmBase64 = '';"), 'Must reset trackHmBase64');
  assert(clearBody.includes("hmCompletionPhotoFile = null;"), 'Must reset hmCompletionPhotoFile');
  assert(!clearBody.includes("trackCompBase64"), 'Must NOT touch trackCompBase64');
  assert(!clearBody.includes("trackGpsLat"), 'Must NOT touch trackGpsLat');
});

// 17. clear Slot 2 does not clear Slot 1
test('17. clearTrackCompPhoto() only clears Slot 2 without affecting Slot 1', () => {
  const clearCompBody = serverJsContent.slice(
    serverJsContent.indexOf('function clearTrackCompPhoto()'),
    serverJsContent.indexOf('function updateTrackEvidenceStatusUI()')
  );
  assert(clearCompBody.includes("trackCompBase64 = '';"), 'Must reset trackCompBase64');
  assert(clearCompBody.includes("trackGpsLat = null;"), 'Must reset trackGpsLat');
  assert(!clearCompBody.includes("trackHmBase64"), 'Must NOT touch trackHmBase64');
  assert(!clearCompBody.includes("hmCompletionPhotoFile"), 'Must NOT touch hmCompletionPhotoFile');
});

// 18. Retry preserves both photos
test('18. Submission failure prompts Retry without wiping Slot 1 or Slot 2 state', () => {
  const submitBody = serverJsContent.slice(
    serverJsContent.indexOf('async function submitTrackCompletionEvidence()'),
    serverJsContent.indexOf('function viewTrackHmFullscreen()')
  );
  assert(submitBody.includes("btn.textContent = '🔄 Retry Upload (மீண்டும் சமர்ப்பிக்கவும்)';"), 'Must toggle button to Retry Upload');
  assert(!submitBody.includes("trackHmBase64 = ''"), 'Must NOT wipe trackHmBase64 on failure');
  assert(!submitBody.includes("trackCompBase64 = ''"), 'Must NOT wipe trackCompBase64 on failure');
});

console.log('\n========================================================');
console.log(`📊 SLOT 1 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
