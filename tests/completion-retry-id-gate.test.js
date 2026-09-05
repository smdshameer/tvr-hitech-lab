/**
 * REGRESSION SUITE: completion retry ID-gate (CASE A-G).
 * Guards the serverless cold-instance pseudo-success hole: a queued completion
 * upload must succeed ONLY when Drive File IDs return for sent slots, and
 * missing-bytes reads must stay retryable without burning real attempts.
 *
 * Executes the REAL pure helpers extracted from server.js
 * (dataUrlOrEmpty, isLocalUploadUrl, getCompletionRetryPlan,
 *  isCompletionRetrySuccess). No servers, no network, no production data.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  assert(start !== -1, 'helper missing in server.js: ' + name);
  // balanced-brace slice from the opening brace
  let i = src.indexOf('{', start);
  let depth = 0;
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert(depth === 0, 'unbalanced braces in: ' + name);
  return src.slice(start, i + 1);
}
const harness =
  extractFn('dataUrlOrEmpty') +
  extractFn('isLocalUploadUrl') +
  extractFn('isExternalUploadUrl') +
  extractFn('getCompletionRetryPlan') +
  extractFn('isCompletionRetrySuccess');
const H = new Function(harness + '\nreturn { dataUrlOrEmpty, isLocalUploadUrl, isExternalUploadUrl, getCompletionRetryPlan, isCompletionRetrySuccess };')();

const B64 = 'data:image/jpeg;base64,/9j/4AAQ';
function ticket(over) {
  return Object.assign({
    ticketId: 'HTL-TVR-00000',
    hmReportPhotoBase64: '',
    completionPhotoBase64: '',
    hmReportPhotoUrl: '',
    completionPhotoUrl: '',
    hmDriveFileId: '',
    compDriveFileId: '',
    completionEvidence: {
      hmSignedReport: { uploaded: false, fileUrl: '', data: '', driveFileId: '' },
      completionPhoto: { uploaded: false, fileUrl: '', data: '', driveFileId: '' }
    }
  }, over || {});
}
function bothBytes() {
  return ticket({
    hmReportPhotoBase64: B64,
    completionPhotoBase64: B64,
    hmReportPhotoUrl: '/uploads/hm_x.jpg',
    completionPhotoUrl: '/uploads/comp_x.jpg',
    completionEvidence: {
      hmSignedReport: { uploaded: true, fileUrl: '/uploads/hm_x.jpg', data: B64, driveFileId: '' },
      completionPhoto: { uploaded: true, fileUrl: '/uploads/comp_x.jpg', data: B64, driveFileId: '' }
    }
  });
}

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

// CASE A: HM bytes sent + HM Drive ID returned -> success.
test('A. HM sent + hmDriveFileId returned => success', () => {
  const t = bothBytes();
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(plan.hmIntended, true);
  assert.strictEqual(plan.coldMissing, false);
  assert.strictEqual(
    H.isCompletionRetrySuccess({ success: true, hmDriveFileId: 'hm1', compDriveFileId: '' }, !!plan.hmBytes, false),
    true
  );
});

// CASE B: GPS bytes sent + GPS Drive ID returned -> success.
test('B. GPS sent + compDriveFileId returned => success', () => {
  const t = bothBytes();
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(plan.gpsIntended, true);
  assert.strictEqual(
    H.isCompletionRetrySuccess({ success: true, hmDriveFileId: '', compDriveFileId: 'c1' }, false, !!plan.gpsBytes),
    true
  );
});

// CASE C: intended slot but bytes unavailable (cold read) -> coldMissing, never pseudo-success.
test('C. Intended slot, bytes evaporated => coldMissing (retryable, no success)', () => {
  const t = ticket({
    completionEvidence: {
      hmSignedReport: { uploaded: true, fileUrl: '', data: '', driveFileId: '' },
      completionPhoto: { uploaded: true, fileUrl: '', data: '', driveFileId: '' }
    }
  });
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(plan.hmIntended, true);
  assert.strictEqual(plan.gpsIntended, true);
  assert.strictEqual(plan.coldMissing, true, 'must be flagged cold-missing, not sent');
  assert.strictEqual(plan.hmBytes, '');
  assert.strictEqual(plan.gpsBytes, '');
});

// CASE D: success:true but expected Drive ID null -> NOT success.
test('D. success:true with null IDs for sent slots => failure', () => {
  assert.strictEqual(H.isCompletionRetrySuccess({ success: true, hmDriveFileId: null, compDriveFileId: null }, true, true), false);
  assert.strictEqual(H.isCompletionRetrySuccess({ success: true, hmDriveFileId: 'hm1', compDriveFileId: null }, true, true), false);
  assert.strictEqual(H.isCompletionRetrySuccess({ success: false, hmDriveFileId: 'hm1', compDriveFileId: 'c1' }, true, true), false);
  assert.strictEqual(H.isCompletionRetrySuccess(null, true, true), false);
});

// CASE E: both slots sent -> both IDs required.
test('E. Both sent requires both IDs', () => {
  const t = bothBytes();
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(H.isCompletionRetrySuccess({ success: true, hmDriveFileId: 'h', compDriveFileId: 'c' }, !!plan.hmBytes, !!plan.gpsBytes), true);
  assert.strictEqual(H.isCompletionRetrySuccess({ success: true, hmDriveFileId: 'h', compDriveFileId: '' }, !!plan.hmBytes, !!plan.gpsBytes), false);
});

// CASE F: evidence/intake + delete paths untouched by this change.
test('F. Intake + delete wiring untouched', () => {
  assert(src.includes('res = await syncTicketToGoogleDrive(t, {'), 'intake retry branch must be unchanged');
  assert(src.includes('deleteCompletionEvidenceFromGoogleDrive(targetTicket, slot, driveFileId)'), 'delete path must be unchanged');
  assert(src.includes('gasBody.hmDriveFileId = driveFileId'), 'slot-specific delete payload must be unchanged');
  // completion branch must use the ID-gated helpers
  assert(src.includes('getCompletionRetryPlan(t)'), 'retry branch must use getCompletionRetryPlan');
  assert(src.includes('isCompletionRetrySuccess(res,'), 'retry branch must use isCompletionRetrySuccess');
  assert(src.includes('emptyHits'), 'cold-missing must not burn real attempts');
});

// CASE G: URL-only legacy slots (external https, no bytes) ride on res.success, IDs not demanded.
test('G. URL-only slots do not demand IDs', () => {
  const t = ticket({
    hmReportPhotoUrl: 'https://drive.google.com/thumbnail?id=x&sz=w800',
    completionPhotoUrl: 'https://drive.google.com/thumbnail?id=y&sz=w800',
    completionEvidence: {
      hmSignedReport: { uploaded: true, fileUrl: 'https://drive.google.com/thumbnail?id=x&sz=w800', data: '', driveFileId: '' },
      completionPhoto: { uploaded: true, fileUrl: 'https://drive.google.com/thumbnail?id=y&sz=w800', data: '', driveFileId: '' }
    }
  });
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(plan.coldMissing, false, 'external-URL slots are not cold-missing');
  assert.strictEqual(H.isCompletionRetrySuccess({ success: true }, !!plan.hmBytes, !!plan.gpsBytes), true);
});

// Guard: local /uploads/ URL without bytes still routes to cold-missing (recoverable locally).
test('H. Local URL without bytes is cold-missing, not success', () => {
  const t = ticket({
    hmReportPhotoUrl: '/uploads/hm_x.jpg',
    completionEvidence: {
      hmSignedReport: { uploaded: true, fileUrl: '/uploads/hm_x.jpg', data: '', driveFileId: '' },
      completionPhoto: { uploaded: false, fileUrl: '', data: '', driveFileId: '' }
    }
  });
  const plan = H.getCompletionRetryPlan(t);
  assert.strictEqual(plan.hmIntended, true);
  assert.strictEqual(plan.coldMissing, true);
});

console.log('\n======================================================================');
console.log(`📊 RETRY-ID-GATE RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('======================================================================\n');
if (failed > 0) process.exit(1);
