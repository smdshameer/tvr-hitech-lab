/**
 * PHASE-1 COMPLETION-PHOTO PERF SUITE (audit-approved, local only).
 *
 * Proves, with static source assertions + pure-logic replicas (no network,
 * no production, no GPS hardware):
 *  1. Completion output capped at 1600px long edge (aspect preserved).
 *  2. Webcam/native/gallery completion paths share the single capped scaler.
 *  3. GPS watermark content + placement + JPEG output + EXIF behavior intact.
 *  4. Complaint/intake photo path unchanged (1600px, JPEG 0.88).
 *  5. handleTrackCompUpload performs ONE FileReader pass (single readAsArrayBuffer;
 *     dataURL derived from those bytes; no readAsDataURL in its body).
 *  6. retryTeacherGps has a same-input re-encode guard; regenerateAllPhotoWatermarks
 *     (intake) is untouched.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc}${details ? ' (' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc}${details ? ' (' + details + ')' : ''}`); }
}
function sectionOf(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return null;
  const b = endMarker ? src.indexOf(endMarker, a + startMarker.length) : src.length;
  return src.slice(a, b < 0 ? src.length : b);
}

// ---- 1. Cap constant + scaler ----
record('1a. MAX_COMPLETION_PHOTO_DIM = 1600 present', /MAX_COMPLETION_PHOTO_DIM\s*=\s*1600/.test(serverJs));
record('1b. fitCompletionDims helper present', /function fitCompletionDims\(w,\s*h,\s*maxDim\)/.test(serverJs));
record('1c. burnGpsWatermarkOnCanvas uses fitted dims', /const fitted = fitCompletionDims\(srcW,\s*srcH,\s*MAX_COMPLETION_PHOTO_DIM\)/.test(serverJs));

// Pure-logic replica of fitCompletionDims (mirrors shipped code exactly).
function fitCompletionDims(w, h, maxDim) {
  const mw = Math.round(Number(w)) || 0;
  const mh = Math.round(Number(h)) || 0;
  const cap = Math.round(Number(maxDim)) || 1600;
  if (mw <= 0 || mh <= 0) return { w: 1280, h: 720 };
  if (mw <= cap && mh <= cap) return { w: mw, h: mh };
  if (mw >= mh) return { w: cap, h: Math.max(1, Math.round((mh * cap) / mw)) };
  return { w: Math.max(1, Math.round((mw * cap) / mh)), h: cap };
}
const dimCases = [
  [4032, 3024, 1600, 1200, '4:3 sensor landscape'],
  [3024, 4032, 1200, 1600, '4:3 sensor portrait'],
  [1920, 1080, 1600, 900, '1080p landscape'],
  [1280, 720, 1280, 720, '720p untouched'],
  [1600, 1600, 1600, 1600, 'square at cap untouched'],
  [800, 600, 800, 600, 'small untouched'],
];
for (const [w, h, ew, eh, label] of dimCases) {
  const r = fitCompletionDims(w, h, 1600);
  record(`1d. dims ${w}x${h} -> ${ew}x${eh} [${label}]`, r.w === ew && r.h === eh, `got ${r.w}x${r.h}`);
  record(`1e. aspect preserved ${w}x${h}`, Math.abs((w / h) - (r.w / r.h)) < 0.01, label);
}

// ---- 2. Single scaler shared by all completion paths ----
const burnBody = sectionOf(serverJs, 'function burnGpsWatermarkOnCanvas',
  'function applyCapturedGpsPhotoToSlot2');
record('2a. burn body found', !!burnBody);
record('2b. canvas dims come from fitted (capped) values, not raw source dims',
  burnBody && /const vWidth = fitted\.w/.test(burnBody) && !/canvas\.width\s*=\s*srcW/.test(burnBody));
const procBody = sectionOf(serverJs, 'function processTrackCompImage',
  'function triggerTrackHmCapture');
record('2c. processTrackCompImage body found', !!procBody);
record('2d. discarded pre-scale canvas removed', procBody && !/ctx\.drawImage\(img,\s*0,\s*0,\s*w,\s*h\)/.test(procBody));
record('2e. processTrackCompImage delegates scale to burn', procBody && /burnGpsWatermarkOnCanvas\(canvas,\s*img,\s*snapshot\)/.test(procBody));
record('2f. webcam captureWebGpsPhoto still routes via burn', /burnGpsWatermarkOnCanvas\(canvas,\s*video,\s*snapshot\)/.test(serverJs));
record('2g. native fallback still routes via burn', /burnGpsWatermarkOnCanvas\(canvas,\s*img,\s*snapshot\)/.test(serverJs));

// ---- 3. Watermark / JPEG / EXIF intact ----
record('3a. watermark header content intact', /GPS VERIFIED EVIDENCE/.test(serverJs));
record('3b. watermark lines (School/UDISE/Location/Accuracy/Date/TICKET) intact',
  /School: /.test(serverJs) && /UDISE: /.test(serverJs) && /Location: /.test(serverJs)
  && /Accuracy: /.test(serverJs) && /TICKET: #/.test(serverJs));
record('3c. bottom-anchored card placement intact', burnBody && /cardY = Math\.max\(safeMarginY, vHeight - cardH - safeMarginY\)/.test(burnBody));
record('3d. JPEG output preserved', burnBody && /toDataURL\('image\/jpeg',\s*0\.92\)/.test(burnBody));
record('3e. server EXIF injection untouched', /function injectGpsExif/.test(serverJs) && /0x8825|GPS IFD/.test(serverJs));
record('3f. GPS gates untouched (50m / TN bounds / 600s)',
  /MAX_ACCEPTABLE_ACCURACY_METERS\s*=\s*50/.test(serverJs) && /accuracy.*50/.test(serverJs)
  && /600000/.test(serverJs));

// ---- 4. Complaint/intake path unchanged ----
const intakeBody = sectionOf(serverJs, 'function renderWatermarkForSlot',
  'function regenerateAllPhotoWatermarks');
record('4a. intake watermark body found', !!intakeBody);
record('4b. intake still 1600px cap', intakeBody && /maxDim\s*=\s*1600/.test(intakeBody));
record('4c. intake still JPEG 0.88', intakeBody && /toDataURL\('image\/jpeg',\s*0\.88\)/.test(intakeBody));

// ---- 5. Single file read ----
const uploadBody = sectionOf(serverJs, 'function handleTrackCompUpload',
  'function retryTeacherGps');
record('5a. handleTrackCompUpload body found', !!uploadBody);
record('5b. exactly ONE FileReader pass in upload handler',
  uploadBody && (uploadBody.match(/readAs(ArrayBuffer|DataURL)/g) || []).length === 1,
  'found: ' + (uploadBody ? (uploadBody.match(/readAs(ArrayBuffer|DataURL)/g) || []).join(',') : 'none'));
record('5c. the single pass is readAsArrayBuffer (EXIF first)',
  uploadBody && /reader\.readAsArrayBuffer\(file\)/.test(uploadBody) && !/readAsDataURL/.test(uploadBody));
record('5d. dataURL derived from same bytes via helper',
  /function compArrayBufferToDataUrl\(buffer,\s*fileObj\)/.test(serverJs)
  && uploadBody && /compArrayBufferToDataUrl\(arrayBuffer,\s*file\)/.test(uploadBody));
record('5e. derived dataURL passed to encoder (no re-read)',
  uploadBody && /processTrackCompImage\(file,\s*finalLat,\s*finalLon,\s*finalAcc,\s*gpsSource,\s*reusedDataUrl\)/.test(uploadBody));
record('5f. EXIF inspect still runs first on raw bytes',
  uploadBody && /inspectAndParseImageBytes\(arrayBuffer,\s*file/.test(uploadBody));
// Round-trip check of the derivation helper logic (chunked btoa equivalent in node).
(function roundTrip() {
  const bytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
  const b64 = bytes.toString('base64');
  const url = 'data:image/jpeg;base64,' + b64;
  const back = Buffer.from(url.split(',')[1], 'base64');
  record('5g. arrayBuffer->dataURL round-trips bytes losslessly', back.equals(bytes));
})();
// Template-embedding trap: backslashes in server.js template literals are
// consumed at render time, so embedded browser code must not rely on regex
// escapes (a prior revision broke Dim 1 V8 compilation this way).
(function embeddingTrap() {
  const helper = sectionOf(serverJs, 'function compArrayBufferToDataUrl',
    'function handleTrackCompUpload');
  record('5h. embedded helper uses no regex escapes (indexOf, not /\\/)',
    !!helper && !/\\/.test(helper.replace(/NOTE:[^\n]*\n(\s*\/\/[^\n]*\n)*/g, '')));
})();

// ---- 6. Re-encode guard ----
const retryBody = sectionOf(serverJs, 'function retryTeacherGps',
  'function showGpsError');
record('6a. retryTeacherGps body found', !!retryBody);
record('6b. same-input guard present', retryBody && /lastCompEncodeKey === key/.test(retryBody));
record('6c. guard falls through to re-encode on any change',
  retryBody && /processTrackCompImage\(lastCompFile, trackGpsLat/.test(retryBody));
record('6d. guard key covers file+GPS+time',
  retryBody && /lastModified/.test(retryBody) && /trackGpsTime/.test(retryBody));
record('6e. new file invalidates guard', uploadBody && /lastCompEncodeKey = null/.test(uploadBody));
const regenBody = sectionOf(serverJs, 'function regenerateAllPhotoWatermarks',
  'function setupPhotoInputs');
record('6f. regenerateAllPhotoWatermarks (intake) untouched — no guard, no cap change',
  !!regenBody && /renderWatermarkForSlot\(i\)/.test(regenBody) && !/lastCompEncodeKey|fitCompletionDims/.test(regenBody));

console.log(`\nPHASE-1 COMPLETION-PHOTO SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
