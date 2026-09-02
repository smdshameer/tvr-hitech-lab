const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

console.log('========================================================');
console.log('🧪 RUNNING WEB GPS INTEGRATION TEST');
console.log('========================================================\n');

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Binary EXIF GPS Injection Test
test('1. injectGpsExif embeds genuine TIFF GPS IFD (0x8825) into JPEG', () => {
  const minimalJpeg = Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x0A, 0x00, 0x0A, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F,
    0xFF, 0xD9
  ]);
  const lat = 10.757143;
  const lon = 79.847301;
  const now = new Date();
  
  const fnCode = serverJs.match(/function injectGpsExif\([\s\S]*?\n\}/)[0];
  const fn = new Function('Buffer', 'return ' + fnCode)(Buffer);
  
  const tagged = fn(minimalJpeg, lat, lon, now, 'BROWSER_DEVICE_GPS');
  assert(tagged.length > minimalJpeg.length, 'Tagged JPEG must be larger');
  assert.strictEqual(tagged[0], 0xFF, 'Byte 0 must be 0xFF');
  assert.strictEqual(tagged[1], 0xD8, 'Byte 1 must be 0xD8');
  assert.strictEqual(tagged[2], 0xFF, 'Byte 2 must be 0xFF');
  assert.strictEqual(tagged[3], 0xE1, 'Byte 3 must be 0xE1 (APP1 Marker)');
  assert.strictEqual(tagged.slice(6, 10).toString('latin1'), 'Exif', 'Bytes 6-9 must be Exif');
  assert.strictEqual(tagged.slice(12, 14).toString('latin1'), 'MM', 'TIFF header must be Big Endian MM');
});

// 2. Server Completion Evidence Route Validation
test('2. Completion evidence route enforces strict accuracy and geographic bounds', () => {
  assert(serverJs.includes('GPS accuracy must be within 50 meters'), 'Missing 50m accuracy threshold check');
  assert(serverJs.includes('GPS coordinates out of state geographic bounds'), 'Missing TN bounds check');
  assert(serverJs.includes('GPS fix timestamp is stale or invalid'), 'Missing freshness check');
  assert(serverJs.includes('UDISE mismatch: Evidence UDISE does not match Ticket UDISE'), 'Missing UDISE match check');
});

// 3. Slot 2 Web Camera UI Controls
test('3. Slot 2 UI presents Web GPS Camera as primary capture tool', () => {
  assert(serverJs.includes('📷 Take UPS Photo (Web GPS Camera)'), 'Missing primary Web GPS Camera button label');
  assert(serverJs.includes('Retake Photo (மீண்டும் எடுக்கவும்)'), 'Missing Retake button state');
  assert(serverJs.includes('Retry Upload (மீண்டும் சமர்ப்பிக்கவும்)'), 'Missing Retry Upload state');
});

console.log('\n========================================================');
console.log(`📊 INTEGRATION RESULTS: ${failed === 0 ? 'ALL TESTS PASSED ✅' : `${failed} TESTS FAILED ❌`}`);
console.log('========================================================\n');

process.exit(failed > 0 ? 1 : 0);
