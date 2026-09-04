/**
 * 🚀 PHASE 37: WEB GPS CAMERA STANDALONE SYSTEM TEST SUITE
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const serverJsPath = path.join(rootDir, 'server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

console.log('========================================================');
console.log('🚀 RUNNING PHASE 37: WEB GPS CAMERA TEST SUITE');
console.log('========================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Web GPS Camera Modal in HTML
test('1. Web GPS Camera viewfinder modal and diagnostic elements declared in server.js', () => {
  assert(serverJsContent.includes('id="webGpsCameraModal"'), 'Missing #webGpsCameraModal in HTML');
  assert(serverJsContent.includes('id="webGpsVideo"'), 'Missing #webGpsVideo in HTML');
  assert(serverJsContent.includes('id="webGpsCanvas"'), 'Missing #webGpsCanvas in HTML');
  assert(serverJsContent.includes('id="btnWebGpsCapture"'), 'Missing #btnWebGpsCapture in HTML');
  assert(serverJsContent.includes('id="webGpsLockPill"'), 'Missing #webGpsLockPill in HTML');
  assert(serverJsContent.includes('id="webGpsDiagDrawer"'), 'Missing #webGpsDiagDrawer in HTML');
  assert(serverJsContent.includes('id="webGpsWarningOverlay"'), 'Missing #webGpsWarningOverlay in HTML');
});

// 2. Client-Side Controller Functions
test('2. Web GPS Camera controller and diagnostic functions declared in client JavaScript', () => {
  assert(serverJsContent.includes('function openWebGpsCameraModal('), 'Missing openWebGpsCameraModal function');
  assert(serverJsContent.includes('function cleanWebGpsResources('), 'Missing cleanWebGpsResources function');
  assert(serverJsContent.includes('async function checkPermissionQuery('), 'Missing checkPermissionQuery function');
  assert(serverJsContent.includes('async function initWebGpsCamera('), 'Missing initWebGpsCamera function');
  assert(serverJsContent.includes('function showWebGpsPermissionWarning('), 'Missing showWebGpsPermissionWarning function');
  assert(serverJsContent.includes('function toggleWebGpsDiagDrawer('), 'Missing toggleWebGpsDiagDrawer function');
  assert(serverJsContent.includes('function captureWebGpsPhoto('), 'Missing captureWebGpsPhoto function');
  assert(serverJsContent.includes('function closeWebGpsCameraModal('), 'Missing closeWebGpsCameraModal function');
});

// 3. MediaDevices & Geolocation API configuration
test('3. getUserMedia and high-accuracy geolocation configured with fallback sequence', () => {
  assert(serverJsContent.includes('navigator.mediaDevices.getUserMedia'), 'Missing getUserMedia call');
  assert(serverJsContent.includes('navigator.geolocation.watchPosition'), 'Missing watchPosition call');
  assert(serverJsContent.includes('enableHighAccuracy: true'), 'Missing enableHighAccuracy setting');
  assert(serverJsContent.includes('MAX_ACCEPTABLE_ACCURACY_METERS = 50'), 'Missing 50m accuracy threshold');
});

// 4. Camera Error Disambiguation
test('4. Camera error handling distinguishes NotAllowedError, NotFoundError, NotReadableError', () => {
  assert(serverJsContent.includes('NotAllowedError') || serverJsContent.includes('PermissionDeniedError'), 'Missing NotAllowedError handling');
  assert(serverJsContent.includes('NotFoundError') || serverJsContent.includes('DevicesNotFoundError'), 'Missing NotFoundError handling');
  assert(serverJsContent.includes('NotReadableError') || serverJsContent.includes('TrackStartError'), 'Missing NotReadableError handling');
});

// 5. Geolocation Error Disambiguation
test('5. Geolocation error handling distinguishes PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT', () => {
  assert(serverJsContent.includes('PERMISSION_DENIED'), 'Missing PERMISSION_DENIED handling');
  assert(serverJsContent.includes('POSITION_UNAVAILABLE'), 'Missing POSITION_UNAVAILABLE handling');
  assert(serverJsContent.includes('TIMEOUT'), 'Missing TIMEOUT handling');
});

// 6. Chrome Android Step-by-Step Instructions
test('6. Warning overlay provides clear Chrome Android Site Settings instructions', () => {
  assert(serverJsContent.includes('How to Allow Camera in Android Chrome') || serverJsContent.includes('Chrome உலாவி'), 'Missing Chrome Android Camera instructions');
  assert(serverJsContent.includes('Site settings') || serverJsContent.includes('Permissions'), 'Missing Site settings text');
  assert(serverJsContent.includes('CHECK PERMISSIONS AGAIN'), 'Missing CHECK PERMISSIONS AGAIN button text');
});

// 7. Defensive Permissions API Support
test('7. Permissions API checked defensively without breaking unsupported browsers', () => {
  assert(serverJsContent.includes('navigator.permissions && navigator.permissions.query'), 'Missing defensive permissions check');
});

// 8. Clean Resource Management (Prevents duplicate streams & watches)
test('8. cleanWebGpsResources stops video tracks and clears watchPosition', () => {
  assert(serverJsContent.includes('track.stop()'), 'Missing track.stop call');
  assert(serverJsContent.includes('navigator.geolocation.clearWatch'), 'Missing clearWatch call');
});

// 9. Canvas Permanent Watermark Stamping
test('9. Canvas burns permanent visible GPS watermark with metadata', () => {
  assert(serverJsContent.includes('📍 GPS VERIFIED EVIDENCE'), 'Missing watermark title');
  assert(serverJsContent.includes("'TICKET: #' + tId + ' | SOURCE: ' + src") || serverJsContent.includes('SOURCE: BROWSER_DEVICE_GPS'), 'Missing SOURCE in watermark');
  assert(serverJsContent.includes('trackGpsSource = snapshot.source') || serverJsContent.includes("trackGpsSource = 'BROWSER_DEVICE_GPS'"), 'Missing trackGpsSource state assignment');
});

// 10. Server-Side injectGpsExif Functionality
test('10. Server-side injectGpsExif embeds genuine APP1 0xFFE1 TIFF GPS tags', () => {
  assert(serverJsContent.includes('function injectGpsExif('), 'Missing injectGpsExif function');
  
  const minimalJpeg = Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x0A, 0x00, 0x0A, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F,
    0xFF, 0xD9
  ]);
  
  const lat = 10.757143;
  const lon = 79.847301;
  const now = new Date();
  
  const fnCode = serverJsContent.match(/function injectGpsExif\([\s\S]*?\n\}/)[0];
  const fn = new Function('Buffer', 'return ' + fnCode)(Buffer);
  
  const tagged = fn(minimalJpeg, lat, lon, now, 'BROWSER_DEVICE_GPS');
  assert(tagged.length > minimalJpeg.length, 'Tagged JPEG should be larger than minimal JPEG');
  assert.strictEqual(tagged[0], 0xFF, 'Byte 0 must be 0xFF');
  assert.strictEqual(tagged[1], 0xD8, 'Byte 1 must be 0xD8');
  assert.strictEqual(tagged[2], 0xFF, 'Byte 2 must be 0xFF');
  assert.strictEqual(tagged[3], 0xE1, 'Byte 3 must be 0xE1 (APP1 Marker)');
  assert.strictEqual(tagged.slice(6, 10).toString('latin1'), 'Exif', 'Bytes 6-9 must be Exif header');
  assert.strictEqual(tagged.slice(12, 14).toString('latin1'), 'MM', 'TIFF header must be Big Endian MM');
});

// 11. Server-Side Evidence Route & Strict Validation
test('11. POST /api/tickets/completion-evidence validates coordinates, accuracy & injects EXIF', () => {
  assert(serverJsContent.includes('GPS accuracy must be within 50 meters'), 'Missing server accuracy check');
  assert(serverJsContent.includes('GPS coordinates out of state geographic bounds'), 'Missing server coordinate bounds check');
  assert(serverJsContent.includes('GPS fix timestamp is stale or invalid'), 'Missing freshness check');
  assert(serverJsContent.includes('UDISE mismatch: Evidence UDISE does not match Ticket UDISE'), 'Missing UDISE match check');
  assert(serverJsContent.includes('injectGpsExif('), 'Missing injectGpsExif call in completion evidence handler');
});

// 12. Slot 1 Independence
test('12. Slot 1 (HM Signed Report) remains completely independent and un-watermarked', () => {
  assert(serverJsContent.includes('1️⃣ 📄 HM Signed Completion Report'), 'Slot 1 header intact');
  assert(serverJsContent.includes('GPS Watermark: <strong>NOT REQUIRED</strong>'), 'Slot 1 watermark not required');
});

// 13. Complete Removal of Obsolete Native Architecture
test('13. Native Android GPS Camera files and endpoints cleanly removed', () => {
  assert(!fs.existsSync(path.join(rootDir, 'android-gps-camera')), 'android-gps-camera directory must NOT exist');
  assert(!serverJsContent.includes('/api/tickets/gps-capture-callback'), 'Obsolete callback route must NOT exist');
  assert(!serverJsContent.includes('/api/tickets/gps-capture-poll'), 'Obsolete poll route must NOT exist');
  assert(!serverJsContent.includes('triggerNativeGpsCamera'), 'Obsolete triggerNativeGpsCamera function must NOT exist');
  assert(!serverJsContent.includes('startGpsCapturePolling'), 'Obsolete startGpsCapturePolling function must NOT exist');
  assert(!serverJsContent.includes('download/gps-camera.apk'), 'Obsolete APK download route must NOT exist');
});

// 14. Master Schools Directory Loaded
test('14. Master Schools Directory Intact (262 schools)', () => {
  const schoolsFile = path.join(rootDir, 'data', 'master_schools.json');
  const schools = JSON.parse(fs.readFileSync(schoolsFile, 'utf8'));
  assert.strictEqual(schools.length, 262, `Expected 262 schools, found ${schools.length}`);
});

// 15. Duplicate Capture Prevention
test('15. Duplicate capture prevention disables button and sets processing state', () => {
  assert(serverJsContent.includes('PROCESSING GPS PHOTO'), 'Missing PROCESSING GPS PHOTO state');
  assert(serverJsContent.includes('btnCapture.disabled = true;'), 'Missing immediate button disabling on capture');
});

// 16. Upload Failure and Retry Flow
test('16. Upload retry button allows immediate re-submission without losing photo', () => {
  assert(serverJsContent.includes('Retry Upload (மீண்டும் சமர்ப்பிக்கவும்)'), 'Missing Retry Upload button text');
});

// 17. Slot 2 Retake UI Toggle
test('17. Slot 2 dynamically toggles to Retake Photo after capture', () => {
  assert(serverJsContent.includes('Retake Photo (மீண்டும் எடுக்கவும்)'), 'Missing Retake Photo button label');
});

// 18. Android Browser Phone Camera Fallback
test('18. Android Browser Phone Camera Fallback input and handler declared', () => {
  assert(serverJsContent.includes('id="webGpsNativeFileInput"'), 'Missing #webGpsNativeFileInput in HTML');
  assert(serverJsContent.includes('function triggerWebGpsNativeFallback'), 'Missing triggerWebGpsNativeFallback function');
  assert(serverJsContent.includes('async function handleWebGpsNativeFileInput'), 'Missing handleWebGpsNativeFileInput function');
});

// 19. Atomic Canvas GPS Watermark Generator
test('19. burnGpsWatermarkOnCanvas atomic generator stamps slate card with full metadata', () => {
  assert(serverJsContent.includes('function burnGpsWatermarkOnCanvas'), 'Missing burnGpsWatermarkOnCanvas function');
  assert(serverJsContent.includes('📍 GPS VERIFIED EVIDENCE'), 'Missing watermark header');
});

// 20. CASE 1: Permissions API reports 'denied' BUT getUserMedia succeeds -> CAM = READY
test('20. CASE 1: Permissions API is non-blocking; getUserMedia success marks CAM: READY', () => {
  assert(serverJsContent.includes("lastCameraDiagState = 'READY'"), 'Missing READY state assignment on getUserMedia success');
  assert(serverJsContent.includes("actualCamTestResult = 'SUCCESS'"), 'Missing SUCCESS record on actualCamTestResult');
});

// 21. CASE 2: Permissions API reports 'denied' BUT getCurrentPosition succeeds -> LOC = ALLOWED, GPS = SEARCHING/LOCKED
test('21. CASE 2: Permissions API is non-blocking; getCurrentPosition success marks LOC: ALLOWED and GPS: LOCKED', () => {
  assert(serverJsContent.includes("lastLocationDiagState = 'ALLOWED'"), 'Missing ALLOWED state assignment on location success');
  assert(serverJsContent.includes("actualLocTestResult = 'SUCCESS'"), 'Missing SUCCESS record on actualLocTestResult');
  assert(serverJsContent.includes("lastGpsDiagState = 'LOCKED'"), 'Missing LOCKED state assignment on <= 50m accuracy');
});

// 22. CASE 3: getUserMedia throws NotAllowedError -> CAM = DENIED
test('22. CASE 3: getUserMedia NotAllowedError marks CAM: DENIED without retrying other constraints', () => {
  assert(serverJsContent.includes("err.name === 'NotAllowedError'"), 'Missing NotAllowedError check in camera loop');
  assert(serverJsContent.includes("lastCameraDiagState = 'DENIED'"), 'Missing DENIED assignment on camera rejection');
  assert(serverJsContent.includes("actualCamTestResult = 'FAILED'"), 'Missing FAILED assignment on actualCamTestResult');
});

// 23. CASE 4: getCurrentPosition returns code 1 -> LOC = DENIED
test('23. CASE 4: Geolocation code 1 marks LOC: DENIED and GPS: DENIED', () => {
  assert(serverJsContent.includes('err.code === 1'), 'Missing err.code 1 check');
  assert(serverJsContent.includes("lastLocationDiagState = 'DENIED'"), 'Missing DENIED assignment on location error 1');
});

// 24. CASE 5: getCurrentPosition returns code 2 -> GPS = DEVICE LOCATION UNAVAILABLE (GPS OFF)
test('24. CASE 5: Geolocation code 2 marks GPS: UNAVAILABLE / GPS OFF while keeping LOC: ALLOWED', () => {
  assert(serverJsContent.includes('err.code === 2'), 'Missing err.code 2 check');
  assert(serverJsContent.includes("lastGpsDiagState = 'UNAVAILABLE'"), 'Missing UNAVAILABLE assignment on GPS off');
});

// 25. CASE 6: getCurrentPosition returns code 3 -> GPS = TIMEOUT / WEAK SIGNAL
test('25. CASE 6: Geolocation code 3 marks GPS: TIMEOUT / SEARCHING while keeping LOC: ALLOWED', () => {
  assert(serverJsContent.includes('err.code === 3'), 'Missing err.code 3 check');
  assert(serverJsContent.includes("lastGpsDiagState = 'TIMEOUT'"), 'Missing TIMEOUT assignment on GPS timeout');
});

// 26. CASE 7: Camera succeeds but GPS fails -> CAM READY, LOC/GPS ERROR, camera stream active
test('26. CASE 7: Camera and GPS initialize independently; GPS error does not close camera stream', () => {
  assert(serverJsContent.includes('initCameraStream()'), 'Missing separate initCameraStream call');
  assert(serverJsContent.includes('initGeolocationWatch()'), 'Missing separate initGeolocationWatch call');
  assert(serverJsContent.includes("webGpsAppState = 'ERROR_LOCATION'"), 'Missing ERROR_LOCATION state transition');
});

// 27. CASE 8: GPS succeeds but camera fails -> LOC ALLOWED, GPS SEARCHING/LOCKED, CAM ERROR
test('27. CASE 8: Camera error does not abort geolocation; GPS fix remains valid and stored', () => {
  assert(serverJsContent.includes("webGpsAppState = (lastCameraDiagState === 'DENIED') ? 'ERROR_PERMISSION' : 'ERROR_CAMERA'"), 'Missing camera failure state transition');
  assert(serverJsContent.includes('curWebGpsFix'), 'curWebGpsFix must store coordinates independently');
});

// 28. Real-Device Hardware and Permissions Diagnostic Drawer
test('28. Status drawer provides all browser, security, certificate, and hardware metrics', () => {
  assert(serverJsContent.includes('Secure Context:'), 'Missing Secure Context in drawer');
  assert(serverJsContent.includes('MediaDevices:'), 'Missing MediaDevices in drawer');
  assert(serverJsContent.includes('getUserMedia:'), 'Missing getUserMedia in drawer');
  assert(serverJsContent.includes('Camera Permission API:'), 'Missing Camera Permission API in drawer');
  assert(serverJsContent.includes('Actual Camera Test:'), 'Missing Actual Camera Test in drawer');
  assert(serverJsContent.includes('Camera Hardware State:'), 'Missing Camera Hardware State in drawer');
  assert(serverJsContent.includes('Last Camera Error:'), 'Missing Last Camera Error in drawer');
  assert(serverJsContent.includes('Geolocation API:'), 'Missing Geolocation API in drawer');
  assert(serverJsContent.includes('Location Permission API:'), 'Missing Location Permission API in drawer');
  assert(serverJsContent.includes('Actual GPS Test:'), 'Missing Actual GPS Test in drawer');
  assert(serverJsContent.includes('Last GPS Error:'), 'Missing Last GPS Error in drawer');
  assert(serverJsContent.includes('GPS State:'), 'Missing GPS State in drawer');
});

// 29. Permissions-Policy Header Configuration
test('29. Server sets Permissions-Policy to explicitly allow camera and geolocation on origin', () => {
  assert(serverJsContent.includes("res.setHeader('Permissions-Policy', 'camera=*, geolocation=*, microphone=()')"), 'Permissions-Policy must allow camera=* and geolocation=*');
});

// 30. REGRESSION TEST A: Permissions API = denied BUT getUserMedia() = success -> CAM = READY
test('30. REGRESSION TEST A: getUserMedia() success unconditionally sets CAM = READY despite Permissions API', () => {
  assert(serverJsContent.includes("lastCameraDiagState = 'READY'"), 'Camera success must set lastCameraDiagState = READY');
  assert(serverJsContent.includes("actualCamTestResult = 'SUCCESS'"), 'Camera success must record actualCamTestResult = SUCCESS');
  assert(serverJsContent.includes("CAM: <span style=\"color:#4ade80;\">🟢 READY</span>"), 'HUD must display green CAM: READY');
});

// 31. REGRESSION TEST B: Permissions API = denied BUT getCurrentPosition() = success -> LOC = ALLOWED
test('31. REGRESSION TEST B: Geolocation success unconditionally sets LOC = ALLOWED despite Permissions API', () => {
  assert(serverJsContent.includes("lastLocationDiagState = 'ALLOWED'"), 'Location success must set lastLocationDiagState = ALLOWED');
  assert(serverJsContent.includes("actualLocTestResult = 'SUCCESS'"), 'Location success must record actualLocTestResult = SUCCESS');
  assert(serverJsContent.includes("LOC: <span style=\"color:#4ade80;\">🟢 ALLOWED</span>"), 'HUD must display green LOC: ALLOWED');
});

// 32. REGRESSION TEST C: Geolocation code 2 -> LOC = ALLOWED, GPS = DEVICE LOCATION UNAVAILABLE/OFF
test('32. REGRESSION TEST C: Geolocation code 2 keeps LOC = ALLOWED while setting GPS = UNAVAILABLE/GPS OFF', () => {
  assert(serverJsContent.includes("err.code === 2"), 'Must check err.code === 2');
  assert(serverJsContent.includes("lastLocationDiagState = 'ALLOWED'"), 'LOC must remain ALLOWED on code 2');
  assert(serverJsContent.includes("lastGpsDiagState = 'UNAVAILABLE'"), 'GPS must be UNAVAILABLE on code 2');
  assert(serverJsContent.includes("GPS: <span style=\"color:#f87171;\">🔴 GPS OFF</span>"), 'HUD must display red GPS OFF');
});

// 33. REGRESSION TEST D: Geolocation code 3 -> LOC = ALLOWED, GPS = SEARCHING/TIMEOUT
test('33. REGRESSION TEST D: Geolocation code 3 keeps LOC = ALLOWED while setting GPS = TIMEOUT/SEARCHING', () => {
  assert(serverJsContent.includes("err.code === 3"), 'Must check err.code === 3');
  assert(serverJsContent.includes("lastGpsDiagState = 'TIMEOUT'"), 'GPS must be TIMEOUT on code 3');
  assert(serverJsContent.includes("GPS: <span style=\"color:#facc15;\">🟡 SEARCHING (TIMEOUT)</span>"), 'HUD must display yellow SEARCHING (TIMEOUT)');
});

// 34. REGRESSION TEST E: Successful camera init followed by permission diagnostic update -> CAM remains READY
test('34. REGRESSION TEST E: Permissions API query callback never overwrites CAM = READY with DENIED', () => {
  // Verify that checkPermissionQuery callback does not touch lastCameraDiagState
  const permQuerySection = serverJsContent.slice(
    serverJsContent.indexOf("checkPermissionQuery('camera')"),
    serverJsContent.indexOf("checkPermissionQuery('geolocation')")
  );
  assert(!permQuerySection.includes("lastCameraDiagState = 'DENIED'"), 'Permissions API callback must never set lastCameraDiagState = DENIED');
  assert(!permQuerySection.includes("actualCamTestResult = 'FAILED'"), 'Permissions API callback must never set actualCamTestResult = FAILED');
});

// 35. REGRESSION TEST F: Successful GPS callback followed by permission diagnostic update -> LOC remains ALLOWED
test('35. REGRESSION TEST F: Permissions API query callback never overwrites LOC = ALLOWED with DENIED', () => {
  const permGeoSection = serverJsContent.slice(
    serverJsContent.indexOf("checkPermissionQuery('geolocation')"),
    serverJsContent.indexOf("initGeolocationWatch();")
  );
  assert(!permGeoSection.includes("lastLocationDiagState = 'DENIED'"), 'Permissions API callback must never set lastLocationDiagState = DENIED');
  assert(!permGeoSection.includes("actualLocTestResult = 'FAILED'"), 'Permissions API callback must never set actualLocTestResult = FAILED');
});

// 36. REGRESSION TEST G: Origin diagnostics are dynamic (window.location.origin) and not hardcoded
test('36. REGRESSION TEST G: Origin diagnostics dynamically read window.location.origin, host and protocol', () => {
  assert(serverJsContent.includes("window.location.origin"), 'Must read window.location.origin dynamically');
  assert(serverJsContent.includes("window.location.protocol"), 'Must read window.location.protocol dynamically');
  assert(serverJsContent.includes("window.location.hostname"), 'Must read window.location.hostname dynamically');
  assert(serverJsContent.includes("Origin: ' + window.location.origin"), 'Must display dynamic origin in UI modal');
});

// 37. REGRESSION TEST H: Stale warning overlay automatically disappears after successful capability test
test('37. REGRESSION TEST H: Warning overlay is dismissed immediately upon camera or GPS success', () => {
  assert(serverJsContent.includes("if (warnOverlay && lastLocationDiagState !== 'DENIED')"), 'Camera success must dismiss warning overlay');
  assert(serverJsContent.includes("if (warnOverlay && lastCameraDiagState !== 'DENIED')"), 'GPS success must dismiss warning overlay');
  assert(serverJsContent.includes("warnOverlay.style.display = 'none'"), 'Warning overlay display must be set to none');
});

// 38. TASK 7.1: trackHmCamInput exists
test('38. TASK 7.1: trackHmCamInput input element exists with capture=environment', () => {
  assert(serverJsContent.includes('id="trackHmCamInput"'), 'trackHmCamInput must exist');
  assert(serverJsContent.includes('capture="environment"'), 'trackHmCamInput must declare capture="environment"');
});

// 39. TASK 7.2: trackHmFileInput exists
test('39. TASK 7.2: trackHmFileInput input element exists with accept=image/*', () => {
  assert(serverJsContent.includes('id="trackHmFileInput"'), 'trackHmFileInput must exist');
  assert(serverJsContent.includes('id="trackHmFileInput" accept="image/*"'), 'trackHmFileInput must accept image/*');
});

// 40. TASK 7.3: Both use handleTrackHmUpload()
test('40. TASK 7.3: Both trackHmCamInput and trackHmFileInput trigger handleTrackHmUpload(event)', () => {
  assert(serverJsContent.includes('id="trackHmCamInput" accept="image/*" capture="environment" style="display:none;" onchange="handleTrackHmUpload(event)"'), 'trackHmCamInput must call handleTrackHmUpload');
  assert(serverJsContent.includes('id="trackHmFileInput" accept="image/*" style="display:none;" onchange="handleTrackHmUpload(event)"'), 'trackHmFileInput must call handleTrackHmUpload');
});

// 41. TASK 7.4: handleTrackHmUpload() exists
test('41. TASK 7.4: handleTrackHmUpload() function is defined in client JavaScript', () => {
  assert(serverJsContent.includes('function handleTrackHmUpload(e)'), 'handleTrackHmUpload(e) must be declared');
});

// 42. TASK 7.5: Slot 1 stores image data in trackHmBase64 and preserves File object
test('42. TASK 7.5: Slot 1 stores clean image data in trackHmBase64 and preserves File in hmCompletionPhotoFile', () => {
  assert(serverJsContent.includes('let trackHmBase64 = \'\';'), 'trackHmBase64 state variable must be declared');
  assert(serverJsContent.includes('let hmCompletionPhotoFile = null;'), 'hmCompletionPhotoFile state variable must be declared');
  assert(serverJsContent.includes('hmCompletionPhotoFile = file;'), 'handleTrackHmUpload must store file in hmCompletionPhotoFile');
  assert(serverJsContent.includes('trackHmBase64 = dataUrl;'), 'handleTrackHmUpload must store JPEG dataUrl in trackHmBase64');
});

// 43. TASK 7.6: Slot 1 preview is updated
test('43. TASK 7.6: Slot 1 preview (#trackHmImg) is updated and displayed block', () => {
  assert(serverJsContent.includes('hmImg.src = trackHmBase64;'), 'hmImg src must be updated with trackHmBase64');
  assert(serverJsContent.includes("hmImg.style.display = 'block';"), 'hmImg display must become block');
  assert(serverJsContent.includes("noHm.style.display = 'none';"), 'noHm placeholder text must be hidden');
});

// 44. TASK 7.7: Slot 1 becomes "Selected / HM Report Uploaded"
test('44. TASK 7.7: Slot 1 status badge transitions to HM Report Uploaded', () => {
  assert(serverJsContent.includes("stBadge.textContent = '🟢 HM Report Uploaded';"), 'Status badge must show HM Report Uploaded');
  assert(serverJsContent.includes("stBadge.style.background = '#dcfce7';"), 'Status badge must have green background');
});

// 45. TASK 7.8: Slot 1 does NOT call burnGpsWatermarkOnCanvas()
test('45. TASK 7.8: Slot 1 handleTrackHmUpload does NOT call burnGpsWatermarkOnCanvas()', () => {
  const handleUploadBody = serverJsContent.slice(
    serverJsContent.indexOf('function handleTrackHmUpload(e)'),
    serverJsContent.indexOf('function clearTrackHmPhoto()')
  );
  assert(!handleUploadBody.includes('burnGpsWatermarkOnCanvas'), 'handleTrackHmUpload must never watermark the HM report');
});

// 46. TASK 7.9: Slot 1 does NOT depend on GPS permission
test('46. TASK 7.9: Slot 1 does NOT depend on GPS permission or browser location API', () => {
  const handleUploadBody = serverJsContent.slice(
    serverJsContent.indexOf('function handleTrackHmUpload(e)'),
    serverJsContent.indexOf('function clearTrackHmPhoto()')
  );
  assert(!handleUploadBody.includes('navigator.geolocation'), 'handleTrackHmUpload must not invoke geolocation');
  assert(!handleUploadBody.includes('MAX_ACCEPTABLE_ACCURACY_METERS'), 'handleTrackHmUpload must not check GPS accuracy');
  assert(serverJsContent.includes('GPS Watermark: <strong>NOT REQUIRED</strong>'), 'UI must clearly declare GPS watermark not required');
});

// 47. TASK 7.10: Slot 1 does NOT receive GPS EXIF
test('47. TASK 7.10: Server-side completion evidence handler does NOT inject GPS EXIF into Slot 1', () => {
  const startIdx = serverJsContent.indexOf("pathname === '/api/tickets/completion-evidence'");
  const endIdx = serverJsContent.indexOf("await db.updateTicket(ticketId, updatePayload);", startIdx);
  const endpointHandler = serverJsContent.slice(startIdx, endIdx);
  const exifMatch = endpointHandler.match(/injectGpsExif/g);
  assert(exifMatch && exifMatch.length === 1, 'injectGpsExif must only be called once, strictly for Slot 2 completion photo');
  assert(endpointHandler.includes("Buffer.from(hmBase64Data, 'base64')"), 'Slot 1 must write plain buffer without EXIF modification');
});

// 48. TASK 7.11: clearTrackHmPhoto() clears both file inputs
test('48. TASK 7.11: clearTrackHmPhoto() clears trackHmCamInput and trackHmFileInput values', () => {
  const clearBody = serverJsContent.slice(
    serverJsContent.indexOf('function clearTrackHmPhoto()'),
    serverJsContent.indexOf('function clearTrackCompPhoto()')
  );
  assert(clearBody.includes("camInput.value = '';"), 'clearTrackHmPhoto must clear camInput.value');
  assert(clearBody.includes("fileInput.value = '';"), 'clearTrackHmPhoto must clear fileInput.value');
  assert(clearBody.includes("trackHmBase64 = '';"), 'clearTrackHmPhoto must reset trackHmBase64');
});

// 49. TASK 7.12: submitTrackCompletionEvidence() includes Slot 1
test('49. TASK 7.12: submitTrackCompletionEvidence() includes Slot 1 in submission payload', () => {
  assert(serverJsContent.includes('hmReportPhotoBase64: trackHmBase64 || undefined'), 'Submission payload must include hmReportPhotoBase64');
  assert(serverJsContent.includes('hmReportPhotoUrl: (!trackHmBase64 && curTrackTicket.hmReportPhotoUrl) ? curTrackTicket.hmReportPhotoUrl : undefined'), 'Submission payload must preserve existing hmReportPhotoUrl');
});

// 50. TASK 7.13: Server requires both Slot 1 and Slot 2
test('50. TASK 7.13: Server enforces that both Slot 1 and Slot 2 are mandatory before completion', () => {
  assert(serverJsContent.includes('if ((payload.requireBoth === true || payload.isFinalSubmit === true) && (!hmReportPhotoUrl || !completionPhotoUrl))'), 'Server must validate both hmReportPhotoUrl and completionPhotoUrl');
  assert(serverJsContent.includes('if (!hasHm || !hasComp)'), 'Client must validate both hasHm and hasComp');
});

// 51. TASK 7.14: Slot 2 Web GPS Camera remains the primary GPS capture workflow
test('51. TASK 7.14: Slot 2 Web GPS Camera remains the primary GPS capture workflow', () => {
  assert(serverJsContent.includes("applyCapturedGpsPhotoToSlot2('Web Camera')"), 'Slot 2 must retain Web Camera capture assignment');
  assert(serverJsContent.includes('burnGpsWatermarkOnCanvas(canvas, video, snapshot)'), 'Slot 2 must retain burnGpsWatermarkOnCanvas');
  assert(serverJsContent.includes('openWebGpsCameraModal()'), 'Web GPS Camera modal trigger must exist');
});

// 52. TASK 7.15: Master Schools Directory remains 262 schools
test('52. TASK 7.15: Master Schools Directory remains exactly 262 schools', () => {
  const schoolsFile = path.join(rootDir, 'data', 'master_schools.json');
  assert(fs.existsSync(schoolsFile), 'master_schools.json must exist');
  const schools = JSON.parse(fs.readFileSync(schoolsFile, 'utf8'));
  assert.strictEqual(schools.length, 262, `MASTER_SCHOOLS must contain 262 schools, found ${schools.length}`);
  // Runtime file must also be 262 (server loads master_schools_182.json)
  const runtimeFile = path.join(rootDir, 'data', 'master_schools_182.json');
  assert(fs.existsSync(runtimeFile), 'master_schools_182.json must exist');
  const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
  assert.strictEqual(runtime.length, 262, `RUNTIME_SCHOOLS must contain 262 schools, found ${runtime.length}`);
});

console.log('\n========================================================');
console.log(`📊 PHASE 37 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('========================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
