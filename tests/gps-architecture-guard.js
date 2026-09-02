const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

console.log('========================================================');
console.log('🛡️ RUNNING WEB GPS ARCHITECTURE GUARD');
console.log('========================================================\n');

let failed = 0;

function check(name, condition, msg) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}: ${msg}`);
    failed++;
  }
}

// 1. Web GPS Camera must be present
check('Web GPS Modal', serverJs.includes('id="webGpsCameraModal"'), 'Missing #webGpsCameraModal');
check('Web GPS Video', serverJs.includes('id="webGpsVideo"'), 'Missing #webGpsVideo');
check('Web GPS Canvas', serverJs.includes('id="webGpsCanvas"'), 'Missing #webGpsCanvas');
check('Web GPS Controller', serverJs.includes('function openWebGpsCameraModal'), 'Missing openWebGpsCameraModal');

// 2. Native Android APK must be completely absent from runtime
check('No android-gps-camera folder', !fs.existsSync(path.join(rootDir, 'android-gps-camera')), 'android-gps-camera folder exists');
check('No Native Callback API', !serverJs.includes('/api/tickets/gps-capture-callback'), 'Obsolete callback route exists');
check('No Native Poll API', !serverJs.includes('/api/tickets/gps-capture-poll'), 'Obsolete poll route exists');
check('No Native APK Download API', !serverJs.includes('/download/gps-camera.apk'), 'Obsolete download route exists');
check('No triggerNativeGpsCamera function', !serverJs.includes('triggerNativeGpsCamera'), 'Obsolete trigger function exists');

// 3. Slot 1 must remain independent
check('Slot 1 Independence', serverJs.includes('1️⃣ 📄 HM Signed Completion Report'), 'Slot 1 missing');
check('Slot 1 Watermark Not Required', serverJs.includes('GPS Watermark: <strong>NOT REQUIRED</strong>'), 'Slot 1 watermark requirement corrupted');

// 4. Master Schools Directory must be intact
const schools = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'master_schools.json'), 'utf8'));
check('Master Schools Count', schools.length === 262, `Expected 262 schools, found ${schools.length}`);

console.log('\n========================================================');
console.log(`📊 GUARD RESULTS: ${failed === 0 ? 'ALL CHECKS PASSED ✅' : `${failed} CHECKS FAILED ❌`}`);
console.log('========================================================\n');

process.exit(failed > 0 ? 1 : 0);
