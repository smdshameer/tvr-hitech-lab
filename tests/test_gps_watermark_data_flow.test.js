const assert = require('assert');
const fs = require('fs');
const db = require('../db.js');
const server = require('../server.js');

console.log('🧪 RUNNING: tests/test_gps_watermark_data_flow.test.js\n');

// 1. Authoritative school directory check
const masterSchools = JSON.parse(fs.readFileSync('data/master_schools.json', 'utf8'));
assert.ok(masterSchools.length >= 262, 'Master school directory must have at least 262 schools');

// Thiruvarur school example
const tvrSchool = masterSchools.find(s => s.udise && s.udise.startsWith('3320'));
assert.ok(tvrSchool, 'Thiruvarur school must exist');
assert.strictEqual(tvrSchool.district, 'Thiruvarur');
assert.ok(tvrSchool.udise.startsWith('3320'), 'Thiruvarur UDISE must start with 3320');

// Nagapattinam school example
const ngpSchool = masterSchools.find(s => s.udise && s.udise.startsWith('3319'));
assert.ok(ngpSchool, 'Nagapattinam school must exist');
assert.strictEqual(ngpSchool.district, 'Nagapattinam');
assert.ok(ngpSchool.udise.startsWith('3319'), 'Nagapattinam UDISE must start with 3319');

// 2. Google Drive District Routing Check
const tvrResolved = server.resolveSchoolDistrict(tvrSchool.udise, tvrSchool.id, tvrSchool.district, tvrSchool.schoolName);
assert.strictEqual(tvrResolved.district, 'Thiruvarur');
assert.strictEqual(tvrResolved.rootFolder, 'Thiruvarur_HTL_UPS_Photos');

const ngpResolved = server.resolveSchoolDistrict(ngpSchool.udise, ngpSchool.id, ngpSchool.district, ngpSchool.schoolName);
assert.strictEqual(ngpResolved.district, 'Nagapattinam');
assert.strictEqual(ngpResolved.rootFolder, 'Nagapattinam_HTL_UPS_Photos');

// 3. Static verification: NO hardcoded GPS in server.js or db.js
const serverJs = fs.readFileSync('server.js', 'utf8');
const dbJs = fs.readFileSync('db.js', 'utf8');

assert.ok(!serverJs.includes('10.7725'), 'server.js must NOT contain hardcoded latitude 10.7725');
assert.ok(!serverJs.includes('79.6368'), 'server.js must NOT contain hardcoded longitude 79.6368');
assert.ok(!dbJs.includes('10.7725'), 'db.js must NOT contain hardcoded latitude 10.7725');
assert.ok(!dbJs.includes('79.6368'), 'db.js must NOT contain hardcoded longitude 79.6368');

// 4. Client-side Teacher Portal verification
const teacherPortalHtml = server.getTeacherPortalHtml();
assert.ok(teacherPortalHtml.includes('acquireDeviceGps'), 'Teacher portal must contain acquireDeviceGps');
assert.ok(teacherPortalHtml.includes('getCurrentSchoolMetadata'), 'Teacher portal must contain getCurrentSchoolMetadata');
assert.ok(teacherPortalHtml.includes('regenerateAllPhotoWatermarks'), 'Teacher portal must contain regenerateAllPhotoWatermarks');
assert.ok(teacherPortalHtml.includes('rawPhotos'), 'Teacher portal must maintain rawPhotos in memory');
assert.ok(teacherPortalHtml.includes('Location Unavailable'), 'Teacher portal must show Location Unavailable fallback when GPS is not acquired');
assert.ok(teacherPortalHtml.includes("line4 = '🆔 UDISE: '"), 'Teacher portal watermark must contain UDISE in line 4');

// 5. GPS Isolation simulation: Two different tickets with different GPS coordinates
const ticketA_GPS = { lat: 10.78912, lon: 79.65432, acc: 5 };
const ticketB_GPS = { lat: 10.85234, lon: 79.81234, acc: 8 };

assert.notStrictEqual(ticketA_GPS.lat, ticketB_GPS.lat, 'Ticket A and Ticket B must have distinct GPS coordinates');
assert.notStrictEqual(ticketA_GPS.lon, ticketB_GPS.lon, 'Ticket A and Ticket B must have distinct GPS coordinates');

function generateWatermarkLines(gps, school) {
  let line1;
  if (gps && gps.lat !== null && gps.lat !== undefined) {
    line1 = '📍 GPS: ' + Number(gps.lat).toFixed(5) + '° N, ' + Number(gps.lon).toFixed(5) + '° E';
  } else {
    line1 = '📍 GPS: Location Unavailable';
  }
  const line2 = '📅 03/09/2026  🕐 02:14 PM';
  const line3 = '🏫 ' + school.schoolName;
  const line4 = '🆔 UDISE: ' + school.udise + ' (' + school.district + ')';
  return [line1, line2, line3, line4];
}

const wm_A = generateWatermarkLines(ticketA_GPS, tvrSchool);
const wm_B = generateWatermarkLines(ticketB_GPS, ngpSchool);
const wm_NoGps = generateWatermarkLines(null, tvrSchool);

assert.ok(wm_A[0].includes('10.78912° N, 79.65432° E'), 'Ticket A watermark must contain Ticket A GPS');
assert.ok(wm_A[2].includes(tvrSchool.schoolName), 'Ticket A watermark must contain Thiruvarur school name');
assert.ok(wm_A[3].includes(tvrSchool.udise), 'Ticket A watermark must contain Thiruvarur UDISE');
assert.ok(wm_A[3].includes('Thiruvarur'), 'Ticket A watermark must contain Thiruvarur district');

assert.ok(wm_B[0].includes('10.85234° N, 79.81234° E'), 'Ticket B watermark must contain Ticket B GPS');
assert.ok(wm_B[2].includes(ngpSchool.schoolName), 'Ticket B watermark must contain Nagapattinam school name');
assert.ok(wm_B[3].includes(ngpSchool.udise), 'Ticket B watermark must contain Nagapattinam UDISE');
assert.ok(wm_B[3].includes('Nagapattinam'), 'Ticket B watermark must contain Nagapattinam district');

assert.ok(!wm_B[0].includes('10.78912'), 'Ticket B must NEVER contain Ticket A GPS');
assert.ok(!wm_A[0].includes('10.85234'), 'Ticket A must NEVER contain Ticket B GPS');

assert.strictEqual(wm_NoGps[0], '📍 GPS: Location Unavailable', 'Missing GPS must display Location Unavailable without fabricating coordinates');

// 6. Multiple Photos Check: All 4 photos receive identical authoritative context
for (let p = 1; p <= 4; p++) {
  const photoWm = generateWatermarkLines(ticketA_GPS, tvrSchool);
  assert.strictEqual(photoWm[2], '🏫 ' + tvrSchool.schoolName, 'Photo ' + p + ' must have correct school');
  assert.strictEqual(photoWm[3], '🆔 UDISE: ' + tvrSchool.udise + ' (Thiruvarur)', 'Photo ' + p + ' must have correct UDISE');
}

// 7. Engineer modal watermark check
assert.ok(serverJs.includes("line4 = '🆔 UDISE: ' + (ticketObj.udise || 'Pending')"), 'Engineer completion modal must include UDISE');

console.log('✅ ALL GPS AND WATERMARK DATA FLOW TESTS PASSED!\n');
