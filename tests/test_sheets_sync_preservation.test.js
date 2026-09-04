const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_sheets_sync_preservation.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-NGP-SYNC-' + rand;
  const testUdise = '3319010' + rand;

  const hmId = 'fid_sheets_hm_' + rand;
  const compId = 'fid_sheets_comp_' + rand;
  const hmUrl = `https://lh3.googleusercontent.com/d/${hmId}=w800`;
  const compUrl = `https://lh3.googleusercontent.com/d/${compId}=w800`;

  console.log(`1. Creating local ticket with complete Drive completion metadata: ${testTicketId}`);

  try {
    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'Low',
      status: 'New / Under Review',
      district: 'Nagapattinam',
      block: 'Thirumarugal',
      schoolName: 'GHSS THIRUMARUGAL',
      udise: testUdise,
      aiName: 'Semmalar P',
      phone: '9876543215',
      issue: 'Sheets Sync Protection',
      duration: 'Today (இன்று முதல்)',
      hmDriveFileId: hmId,
      compDriveFileId: compId,
      hmReportPhotoUrl: hmUrl,
      completionPhotoUrl: compUrl,
      completionEvidenceStatus: 'complete'
    });

    console.log('2. Simulating incoming Google Sheets row with BLANK completion fields (Columns 20-24 empty)...');
    const incomingGasRow = {
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      priority: 'Low',
      status: 'New / Under Review',
      resolutionCategory: 'Pending',
      district: 'Nagapattinam',
      block: 'Thirumarugal',
      schoolName: 'GHSS THIRUMARUGAL',
      udise: testUdise,
      aiName: 'Semmalar P',
      phone: '9876543215',
      issue: 'Sheets Sync Protection',
      duration: 'Today (இன்று முதல்)',
      serialNo: '',
      resolutionType: '',
      vendorName: '',
      vendorTicketNo: '',
      partsRequired: '',
      resolutionNotes: '',
      resolvedAt: '',
      photo1Url: '',
      photo2Url: '',
      photo3Url: '',
      photo4Url: '',
      hmReportPhotoUrl: '',
      completionPhotoUrl: '',
      hmDriveFileId: '',
      compDriveFileId: '',
      completionEvidenceStatus: ''
    };

    await db.syncGasTickets([incomingGasRow]);

    console.log('3. Verifying local Drive metadata was NOT erased by incoming blank columns...');
    const allT = await db.getAllTickets();
    const afterSync = allT.find(t => t.ticketId === testTicketId);
    assert(afterSync, 'Ticket must still exist');

    assert.strictEqual(afterSync.hmDriveFileId, hmId, 'hmDriveFileId must NOT be overwritten with empty string');
    assert.strictEqual(afterSync.compDriveFileId, compId, 'compDriveFileId must NOT be overwritten with empty string');
    assert.strictEqual(afterSync.hmReportPhotoUrl, hmUrl, 'hmReportPhotoUrl must NOT be cleared');
    assert.strictEqual(afterSync.completionPhotoUrl, compUrl, 'completionPhotoUrl must NOT be cleared');
    assert.strictEqual(afterSync.completionEvidenceStatus, 'complete', 'completionEvidenceStatus must remain complete');

    console.log('✅ Verified: Google Sheets synchronization strictly preserved local Drive metadata!');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_sheets_sync_preservation.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
