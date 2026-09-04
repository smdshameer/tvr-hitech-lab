const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_completion_photo_drive_persistence.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-TVR-COMP-' + rand;
  const testUdise = '3320010' + rand;
  const testSchool = 'PUMS VALANGAIMAN';

  console.log(`Creating test ticket: ${testTicketId}`);

  try {
    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'Critical',
      status: 'New / Under Review',
      district: 'Thiruvarur',
      block: 'Valangaiman',
      schoolName: testSchool,
      udise: testUdise,
      aiName: 'Ramesh K',
      phone: '9876543212',
      issue: 'Battery Tripping',
      duration: 'Today (இன்று முதல்)'
    });

    const expectedFileName = `${testTicketId}_Completion_UPS_GPS.jpg`;
    const expectedFolder = 'Completion Photos';
    const compFileId = '1_COMP_DRIVE_FILE_ID_' + rand;
    const compUrl = `https://lh3.googleusercontent.com/d/${compFileId}=w800`;

    console.log(`Updating ticket with Slot 2 GPS Completion Photo: ${expectedFileName} in ${expectedFolder}`);

    await db.updateTicket(testTicketId, {
      completionPhotoUrl: compUrl,
      compDriveFileId: compFileId,
      compDriveFileUrl: compUrl,
      gpsLatitude: 10.7654,
      gpsLongitude: 79.6321,
      gpsAccuracy: 8.5,
      gpsTimestamp: new Date().toISOString(),
      completionEvidenceStatus: 'complete'
    });

    const allT = await db.getAllTickets();
    const updated = allT.find(t => t.ticketId === testTicketId);
    assert(updated, 'Updated ticket must exist');

    // Verify Slot 2 Drive metadata persistence
    assert.strictEqual(updated.compDriveFileId, compFileId, 'compDriveFileId must be permanently stored');
    assert.strictEqual(updated.completionPhotoUrl, compUrl, 'completionPhotoUrl must be permanently stored');
    assert.strictEqual(updated.gpsLatitude, 10.7654, 'GPS latitude must be persisted');
    assert.strictEqual(updated.gpsLongitude, 79.6321, 'GPS longitude must be persisted');
    assert.strictEqual(updated.completionEvidenceStatus, 'complete', 'Completion evidence status must be complete');
    console.log('✅ Verified Slot 2 Completion GPS Drive and location metadata persisted');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_completion_photo_drive_persistence.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
