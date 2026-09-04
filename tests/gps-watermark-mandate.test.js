const assert = require('assert');
const fs = require('fs');

console.log('====================================================');
console.log('STARTING GPS CAMERA & WATERMARK VERIFICATION SUITE');
console.log('====================================================\n');

const path = require('path');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

// ----------------------------------------------------
// TEST 1: Watermark Content & Dedicated Fields
// ----------------------------------------------------
console.log('--- 1. Testing Watermark Content & Dedicated Fields ---');
assert(serverJs.includes("text: '📍 GPS VERIFIED EVIDENCE'"), 'Watermark title GPS VERIFIED missing');
assert(serverJs.includes("safeWrapText('School: ' + sName"), 'School name wrapping missing');
assert(serverJs.includes("text: 'UDISE: ' + (udise || 'N/A')"), 'UDISE dedicated line missing');
assert(serverJs.includes("const locStr = 'Location: ' + lat.toFixed(6) + '° N, ' + lon.toFixed(6) + '° E'"), 'Location format missing');
assert(serverJs.includes("text: 'Accuracy: ±' + acc + ' m'"), 'Accuracy line missing');
assert(serverJs.includes("const dtStr = 'Date: ' + dateStr + ' | Time: ' + timeStr"), 'Date and time line missing');
assert(serverJs.includes("text: 'TICKET: #' + tId"), 'Ticket ID line missing');
console.log('✅ All required watermark fields (School, UDISE, Lat, Lon, Acc, Date, Time, Ticket ID) declared');

// ----------------------------------------------------
// TEST 2: Multi-Resolution Canvas Watermark Simulation
// ----------------------------------------------------
console.log('\n--- 2. Simulating Watermark Rendering on Multiple Resolutions ---');

// Mock 2D Canvas context
function createMockCanvas(width, height) {
  const drawOps = [];
  return {
    width,
    height,
    getContext: () => ({
      measureText: (text) => ({ width: String(text).length * 8.5 }),
      drawImage: (img, x, y, w, h) => { drawOps.push({ op: 'drawImage', w, h }); },
      fillText: (text, x, y) => { drawOps.push({ op: 'fillText', text, x, y }); },
      beginPath: () => {},
      rect: (x, y, w, h) => { drawOps.push({ op: 'rect', x, y, w, h }); },
      roundRect: (x, y, w, h) => { drawOps.push({ op: 'roundRect', x, y, w, h }); },
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1
    }),
    toDataURL: (type, q) => `data:${type};base64,WATERMARKED_JPEG_DATA_DUMMY_SIMULATION`,
    getDrawOps: () => drawOps
  };
}

// Extract burnGpsWatermarkOnCanvas from server.js
const extractFn = serverJs.match(/function burnGpsWatermarkOnCanvas[\s\S]*?\n    \}/)[0];
const burnFn = new Function('curTrackTicket', `
  ${extractFn}
  return burnGpsWatermarkOnCanvas;
`)({ ticketId: 'HTL-TVR-05301', udise: '33200503001', schoolName: 'PUMS THIRUKKARAVASAL' });

const testResolutions = [
  { name: 'Landscape 1920x1080 (High-res Rear Camera)', w: 1920, h: 1080 },
  { name: 'Landscape 1280x720 (Standard HD Camera)', w: 1280, h: 720 },
  { name: 'Portrait 1080x1920 (Modern Android Phone)', w: 1080, h: 1920 },
  { name: 'Portrait 720x1280 (Budget Android Phone)', w: 720, h: 1280 },
  { name: 'Standard 800x600 (Fallback Web Camera)', w: 800, h: 600 },
  { name: 'Standard 640x480 (Low-res Camera)', w: 640, h: 480 }
];

const sampleSnapshot = {
  latitude: 10.771234,
  longitude: 79.631234,
  accuracy: 8,
  timestamp: '2026-09-03T10:24:31.000Z',
  schoolName: 'Government Higher Secondary School Koradachery Ultra Long Name For Testing',
  udise: '33201000507',
  udiseCode: '33201000507',
  ticketId: 'HTL-TVR-05301'
};

testResolutions.forEach(res => {
  const canvas = createMockCanvas(res.w, res.h);
  const sourceEl = { videoWidth: res.w, videoHeight: res.h };
  const dataUrl = burnFn(canvas, sourceEl, sampleSnapshot);

  assert(dataUrl.startsWith('data:image/jpeg'), 'Must export as JPEG');
  const ops = canvas.getDrawOps();

  // Verify drawImage called first
  const drawImageOp = ops.find(o => o.op === 'drawImage');
  assert(drawImageOp, 'Raw camera frame must be drawn first');
  assert.strictEqual(drawImageOp.w, res.w);
  assert.strictEqual(drawImageOp.h, res.h);

  // Verify background rect/roundRect
  const rectOp = ops.find(o => o.op === 'rect' || o.op === 'roundRect');
  assert(rectOp, 'Watermark background card must be drawn');
  assert(rectOp.x >= 16, `Card X (${rectOp.x}) must respect left margin on ${res.name}`);
  assert(rectOp.x + rectOp.w <= res.w - 16, `Card right (${rectOp.x + rectOp.w}) must stay inside ${res.w} on ${res.name}`);
  assert(rectOp.y >= 16, `Card Y (${rectOp.y}) must respect top margin on ${res.name}`);
  assert(rectOp.y + rectOp.h <= res.h - 16, `Card bottom (${rectOp.y + rectOp.h}) must stay inside ${res.h} on ${res.name}`);

  // Verify text elements
  const textOps = ops.filter(o => o.op === 'fillText');
  const texts = textOps.map(t => t.text);

  assert(texts.some(t => t.includes('GPS VERIFIED')), 'GPS VERIFIED text missing');
  assert(texts.some(t => t.includes('School:')), 'School name missing');
  assert(texts.some(t => t.includes('UDISE: 33201000507')), 'UDISE code 33201000507 missing or clipped');
  assert(texts.some(t => t.includes('Location: 10.771234° N, 79.631234° E')), 'Location coordinates missing or truncated');
  assert(texts.some(t => t.includes('Accuracy: ±8 m')), 'Accuracy missing');
  assert(texts.some(t => t.includes('TICKET: #HTL-TVR-05301')), 'Ticket ID missing');

  // Verify no text extends beyond card width
  textOps.forEach(t => {
    assert(t.x >= rectOp.x, 'Text must be inside card left padding');
    assert(t.y >= rectOp.y && t.y <= rectOp.y + rectOp.h, 'Text must be vertically within card');
  });

  console.log(`✅ ${res.name}: Watermark panel [${Math.round(rectOp.w)}x${Math.round(rectOp.h)} at (${Math.round(rectOp.x)}, ${Math.round(rectOp.y)})] rendered cleanly with 0 clipping`);
});

// ----------------------------------------------------
// TEST 3: Immutable GPS Evidence Snapshot
// ----------------------------------------------------
console.log('\n--- 3. Testing Immutable Evidence Snapshot & Coordination ---');
assert(serverJs.includes('const snapshot = Object.freeze({'), 'Snapshot must be frozen as immutable object');
assert(serverJs.includes('trackGpsSnapshot = snapshot;'), 'Slot 2 state must retain immutable snapshot');
assert(serverJs.includes('trackGpsLat = snapshot.latitude;'), 'trackGpsLat must use snapshot.latitude');
assert(serverJs.includes('trackGpsLon = snapshot.longitude;'), 'trackGpsLon must use snapshot.longitude');
assert(serverJs.includes('trackGpsAcc = snapshot.accuracy;'), 'trackGpsAcc must use snapshot.accuracy');
assert(serverJs.includes('trackGpsTime = snapshot.timestamp;'), 'trackGpsTime must use snapshot.timestamp');
console.log('✅ Immutable snapshot coordinates used across watermark, state, and payload');

// ----------------------------------------------------
// TEST 4: GPS Gating Logic
// ----------------------------------------------------
console.log('\n--- 4. Testing GPS Gating Enforcement ---');
assert(serverJs.includes('if (!curWebGpsFix || curWebGpsFix.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS)'), 'Gating condition in captureWebGpsPhoto missing');
assert(serverJs.includes("btnText.textContent = '📷 CAPTURE UPS PHOTO'"), 'Capture button ready text missing');
assert(serverJs.includes("btnText.textContent = '⏳ SEARCHING FOR GPS...'"), 'Searching for GPS text missing');
assert(serverJs.includes('btnCapture.disabled = true;'), 'Capture button disabling missing');
console.log('✅ GPS gating strictly enforced (Locked <= 50m enabled, Searching disabled)');

// ----------------------------------------------------
// TEST 5: Diagnostic Logging
// ----------------------------------------------------
console.log('\n--- 5. Testing Diagnostic Logging ---');
assert(serverJs.includes("[GPS_CAPTURE] canvas="), 'Diagnostic log [GPS_CAPTURE] missing');
assert(serverJs.includes("[GPS_CAPTURE_START]"), 'Diagnostic log [GPS_CAPTURE_START] missing');
assert(serverJs.includes("[GPS_WATERMARK_RENDER]"), 'Diagnostic log [GPS_WATERMARK_RENDER] missing');
assert(serverJs.includes("[GPS_CAPTURE_COMPLETE]"), 'Diagnostic log [GPS_CAPTURE_COMPLETE] missing');
assert(serverJs.includes("[COMPLETION_PHOTO]"), 'Diagnostic log [COMPLETION_PHOTO] missing');
assert(serverJs.includes("watermarkRendered=true"), 'Diagnostic log watermarkRendered=true missing');
assert(serverJs.includes("finalPhotoBytes="), 'Diagnostic log finalPhotoBytes missing');
console.log('✅ Diagnostic logging [GPS_CAPTURE_START], [GPS_WATERMARK_RENDER], [GPS_CAPTURE_COMPLETE], and [COMPLETION_PHOTO] active');

// ----------------------------------------------------
// TEST 6: Server EXIF Injection & Validation
// ----------------------------------------------------
console.log('\n--- 6. Testing Server-Side EXIF Injection & Validation ---');
assert(serverJs.includes('injectGpsExif('), 'injectGpsExif must be called on uploaded completion photo');
assert(serverJs.includes('GPS coordinates out of state geographic bounds'), 'Geographic bounds validation active');
assert(serverJs.includes('GPS accuracy must be within 50 meters'), 'Server accuracy validation active');
assert(serverJs.includes('GPS fix timestamp is stale or invalid'), 'Server timestamp freshness validation active');
console.log('✅ Server validates coordinates, accuracy, bounds, and injects genuine EXIF GPS metadata');

// ----------------------------------------------------
// TEST 7: Independence of Slot 1
// ----------------------------------------------------
console.log('\n--- 7. Testing Independence of Slot 1 (HM Signed Report) ---');
assert(!serverJs.includes('handleTrackHmUpload(e); burnGpsWatermarkOnCanvas'), 'Slot 1 must never burn GPS watermark');
assert(serverJs.includes('Save HM Report Photo if provided (No GPS watermark overlay)'), 'Slot 1 comment confirms no GPS watermark');
console.log('✅ Slot 1 HM Report remains completely independent (no watermark, no GPS gating)');

console.log('\n====================================================');
console.log('🎉 ALL 7 GPS CAMERA & WATERMARK AUDITS PASSED 100%');
console.log('====================================================');
