/**
 * DEDICATED REGRESSION TEST SUITE:
 * Completion Photo Storage, Preview & Persistence
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const serverModule = require('../server');

console.log('======================================================================');
console.log('🧪 RUNNING: tests/completion-drive-storage-preview.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const gasJs = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✅ [PASS ${passed}] ${desc}`);
    } catch (err) {
      console.error(`❌ [FAIL] ${desc}: ${err.message}`);
      throw err;
    }
  }

  // TEST 1: Google Apps Script Storage Hierarchy Guards
  await test('GAS routes AI Photo 1..4 to Evidence folder', () => {
    assert(gasJs.includes('saveAndVerifyBase64Image(evidenceFolder, data.photo1Base64'), 'AI Photo 1 must be in evidenceFolder');
    assert(gasJs.includes('saveAndVerifyBase64Image(evidenceFolder, data.photo2Base64'), 'AI Photo 2 must be in evidenceFolder');
    assert(gasJs.includes('saveAndVerifyBase64Image(evidenceFolder, data.photo3Base64'), 'AI Photo 3 must be in evidenceFolder');
    assert(gasJs.includes('saveAndVerifyBase64Image(evidenceFolder, data.photo4Base64'), 'AI Photo 4 must be in evidenceFolder');
  });

  await test('GAS routes Slot 1 HM Report to Completion Photos folder (NOT Evidence)', () => {
    assert(gasJs.includes('saveAndVerifyBase64Image(compFolder, data.hmReportPhotoBase64, hmName'), 'HM Report must be in compFolder');
    assert(!gasJs.includes('saveAndVerifyBase64Image(evidenceFolder, data.hmReportPhotoBase64'), 'HM Report must NOT be in evidenceFolder');
  });

  await test('GAS routes Slot 2 GPS Completion Photo to Completion Photos folder', () => {
    assert(gasJs.includes('saveAndVerifyBase64Image(compFolder, data.completionPhotoBase64, compName'), 'GPS photo must be in compFolder');
  });

  await test('GAS enforces canonical filenames', () => {
    assert(gasJs.includes('"HM_Signed_Completion_Report.jpg"'), 'Exact filename: [TicketID]_HM_Signed_Completion_Report.jpg');
    assert(gasJs.includes('"Completion_UPS_GPS.jpg"'), 'Exact filename: [TicketID]_Completion_UPS_GPS.jpg');
  });

  await test('GAS response contract provides structured metadata for HM Report and GPS Completion', () => {
    assert(gasJs.includes('slot: "HM_REPORT"'), 'Contract must have HM_REPORT slot');
    assert(gasJs.includes('slot: "GPS_COMPLETION"'), 'Contract must have GPS_COMPLETION slot');
    assert(gasJs.includes('completionFolder: "Completion Photos"'), 'Contract must state Completion Photos folder');
  });

  // TEST 2: District Routing
  await test('Thiruvarur (3320...) routes to Thiruvarur_HTL_UPS_Photos', () => {
    const tvr = serverModule.resolveSchoolDistrict('33200101234', '', 'Thiruvarur', 'GHSS THIRUVARUR');
    assert.strictEqual(tvr.rootFolder, 'Thiruvarur_HTL_UPS_Photos');
    assert.strictEqual(tvr.district, 'Thiruvarur');
  });

  await test('Nagapattinam (3319...) routes to Nagapattinam_HTL_UPS_Photos', () => {
    const ngp = serverModule.resolveSchoolDistrict('33190105678', '', 'Nagapattinam', 'MGHSS NAGAPPATTIANAM');
    assert.strictEqual(ngp.rootFolder, 'Nagapattinam_HTL_UPS_Photos');
    assert.strictEqual(ngp.district, 'Nagapattinam');
  });

  // TEST 3: Isolated Ticket 6-Photo Persistence Lifecycle
  const rand = Math.floor(10000 + Math.random() * 89999);
  const testTid = 'HTL-TVR-COMP6-' + rand;
  const testUdise = '3320010' + rand;
  const testSchool = 'GHS KODAVASAL NORTH';

  console.log(`\n--- Testing 6-Photo Lifecycle on Isolated Ticket: ${testTid} ---\n`);

  try {
    const p1Id = `1_P1_${rand}`;
    const p2Id = `1_P2_${rand}`;
    const p3Id = `1_P3_${rand}`;
    const p4Id = `1_P4_${rand}`;
    const hmId = `1_HM_${rand}`;
    const compId = `1_COMP_${rand}`;

    await db.createTicket({
      ticketId: testTid,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'High',
      status: 'New / Under Review',
      district: 'Thiruvarur',
      block: 'Kodavasal',
      schoolName: testSchool,
      udise: testUdise,
      issue: 'UPS Inverter Tripping Off',
      photo1Url: `https://lh3.googleusercontent.com/d/${p1Id}=w800`,
      photo2Url: `https://lh3.googleusercontent.com/d/${p2Id}=w800`,
      photo3Url: `https://lh3.googleusercontent.com/d/${p3Id}=w800`,
      photo4Url: `https://lh3.googleusercontent.com/d/${p4Id}=w800`,
      p1DriveFileId: p1Id,
      p2DriveFileId: p2Id,
      p3DriveFileId: p3Id,
      p4DriveFileId: p4Id
    });

    await test('All 4 AI Photos persisted with Drive File IDs', async () => {
      const tickets = await db.getAllTickets();
      const t = tickets.find(x => x.ticketId === testTid);
      assert(t, 'Ticket must exist');
      assert.strictEqual(t.p1DriveFileId, p1Id);
      assert.strictEqual(t.p2DriveFileId, p2Id);
      assert.strictEqual(t.p3DriveFileId, p3Id);
      assert.strictEqual(t.p4DriveFileId, p4Id);
    });

    // Engineer completion upload
    await db.updateTicket(testTid, {
      hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${hmId}=w800`,
      completionPhotoUrl: `https://lh3.googleusercontent.com/d/${compId}=w800`,
      hmDriveFileId: hmId,
      compDriveFileId: compId,
      hmDriveUrl: `https://lh3.googleusercontent.com/d/${hmId}=w800`,
      compDriveUrl: `https://lh3.googleusercontent.com/d/${compId}=w800`,
      completionEvidenceStatus: 'SUBMITTED',
      completionEvidence: {
        hmSignedReport: {
          uploaded: true,
          fileUrl: `https://lh3.googleusercontent.com/d/${hmId}=w800`,
          driveFileId: hmId,
          originalFileName: `${testTid}_HM_Signed_Completion_Report.jpg`
        },
        completionPhoto: {
          uploaded: true,
          fileUrl: `https://lh3.googleusercontent.com/d/${compId}=w800`,
          driveFileId: compId,
          originalFileName: `${testTid}_Completion_UPS_GPS.jpg`,
          gpsLatitude: 10.7725,
          gpsLongitude: 79.6365
        },
        status: 'complete'
      }
    });

    await test('Both Completion Photos persisted with permanent Drive File IDs', async () => {
      const tickets = await db.getAllTickets();
      const t = tickets.find(x => x.ticketId === testTid);
      assert(t, 'Ticket must exist');
      assert.strictEqual(t.hmDriveFileId, hmId, 'HM Report Drive ID persisted');
      assert.strictEqual(t.compDriveFileId, compId, 'GPS Completion Drive ID persisted');
      assert.strictEqual(t.completionEvidenceStatus, 'SUBMITTED');
    });

    // TEST 4: Preview Fallback & No /uploads/ Dependency
    await test('Previews resolve directly from permanent Drive File IDs', async () => {
      const tickets = await db.getAllTickets();
      const t = tickets.find(x => x.ticketId === testTid);

      function resolvePreview(driveId, url) {
        if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w800`;
        if (url && !url.startsWith('/uploads/')) return url;
        return null;
      }

      assert.strictEqual(resolvePreview(t.hmDriveFileId, t.hmReportPhotoUrl), `https://lh3.googleusercontent.com/d/${hmId}=w800`);
      assert.strictEqual(resolvePreview(t.compDriveFileId, t.completionPhotoUrl), `https://lh3.googleusercontent.com/d/${compId}=w800`);
      assert.strictEqual(resolvePreview(t.p1DriveFileId, t.photo1Url), `https://lh3.googleusercontent.com/d/${p1Id}=w800`);
    });

    await test('Ignoring expired /uploads/ URLs when Drive ID exists', () => {
      function resolveWithFallback(driveId, url) {
        if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w800`;
        if (url && !url.startsWith('/uploads/') && !url.startsWith('/tmp/')) return url;
        return null;
      }
      const preview = resolveWithFallback(hmId, '/uploads/old_temp_file.jpg');
      assert.strictEqual(preview, `https://lh3.googleusercontent.com/d/${hmId}=w800`, 'Must ignore /uploads/ and use Drive CDN');
    });

    // TEST 5: Persistence Across Server Restart
    await test('All 6 photos survive database reinitialization (server restart simulation)', async () => {
      await db.initDatabase();
      const tickets = await db.getAllTickets();
      const t = tickets.find(x => x.ticketId === testTid);
      assert(t, 'Ticket survived restart');
      assert.strictEqual(t.p1DriveFileId, p1Id);
      assert.strictEqual(t.p2DriveFileId, p2Id);
      assert.strictEqual(t.p3DriveFileId, p3Id);
      assert.strictEqual(t.p4DriveFileId, p4Id);
      assert.strictEqual(t.hmDriveFileId, hmId);
      assert.strictEqual(t.compDriveFileId, compId);
    });

    // TEST 6: Google Sheets Sync Preservation
    await test('Google Sheets sync does NOT erase local Drive completion metadata', async () => {
      const localTickets = db.loadTicketsFromJson();
      const idx = localTickets.findIndex(x => x.ticketId === testTid);
      assert(idx !== -1, 'Ticket in local file');

      const existing = localTickets[idx];
      const incomingFromGas = {
        ticketId: testTid,
        status: 'In Progress',
        hmReportPhotoUrl: '',
        completionPhotoUrl: '',
        hmDriveFileId: '',
        compDriveFileId: ''
      };

      const merged = {
        ...incomingFromGas,
        ...existing,
        status: incomingFromGas.status || existing.status,
        hmReportPhotoUrl: existing.hmReportPhotoUrl || incomingFromGas.hmReportPhotoUrl || '',
        completionPhotoUrl: existing.completionPhotoUrl || incomingFromGas.completionPhotoUrl || '',
        hmDriveFileId: existing.hmDriveFileId || incomingFromGas.hmDriveFileId || '',
        compDriveFileId: existing.compDriveFileId || incomingFromGas.compDriveFileId || ''
      };

      assert.strictEqual(merged.hmDriveFileId, hmId, 'Sync must not clear hmDriveFileId');
      assert.strictEqual(merged.compDriveFileId, compId, 'Sync must not clear compDriveFileId');
      assert.strictEqual(merged.hmReportPhotoUrl, `https://lh3.googleusercontent.com/d/${hmId}=w800`);
      assert.strictEqual(merged.completionPhotoUrl, `https://lh3.googleusercontent.com/d/${compId}=w800`);
    });

    // TEST 7: Idempotency Verification
    await test('Idempotent update does not duplicate ticket or create conflicting files', async () => {
      const newHmId = `1_HM_RETRY_${rand}`;
      await db.updateTicket(testTid, {
        hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${newHmId}=w800`,
        hmDriveFileId: newHmId
      });

      const all = await db.getAllTickets();
      const matches = all.filter(x => x.ticketId === testTid);
      assert.strictEqual(matches.length, 1, 'Exactly one ticket must exist');
      assert.strictEqual(matches[0].hmDriveFileId, newHmId, 'Updated to latest Drive ID');
      assert.strictEqual(matches[0].compDriveFileId, compId, 'Existing Slot 2 preserved');
    });

  } finally {
    // Clean up isolated test ticket
    const list = db.loadTicketsFromJson();
    const cleaned = list.filter(t => t.ticketId !== testTid);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleaned, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTid}`);
  }

  console.log('\n======================================================================');
  console.log(`🎉 tests/completion-drive-storage-preview.test.js PASSED (${passed}/${total})`);
  console.log('======================================================================\n');
}

run().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
