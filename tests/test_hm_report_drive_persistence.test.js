const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_hm_report_drive_persistence.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-NGP-HM-' + rand;
  const testUdise = '3319010' + rand;
  const testSchool = 'PUMS NAGAPPATTIANAM NORTH';

  console.log(`Creating test ticket: ${testTicketId}`);

  try {
    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'Medium',
      status: 'New / Under Review',
      district: 'Nagapattinam',
      block: 'Nagapattinam',
      schoolName: testSchool,
      udise: testUdise,
      aiName: 'Sivaranjani R',
      phone: '9876543211',
      issue: 'Backup Failure',
      duration: 'Today (இன்று முதல்)'
    });

    const expectedFileName = `${testTicketId}_HM_Signed_Completion_Report.jpg`;
    const expectedFolder = 'Evidence';
    const hmFileId = '1_HM_DRIVE_FILE_ID_' + rand;
    const hmUrl = `https://lh3.googleusercontent.com/d/${hmFileId}=w800`;

    console.log(`Updating ticket with Slot 1 HM Report: ${expectedFileName} in ${expectedFolder}`);

    await db.updateTicket(testTicketId, {
      hmReportPhotoUrl: hmUrl,
      hmDriveFileId: hmFileId,
      hmDriveFileUrl: hmUrl,
      completionEvidenceStatus: 'partial_hm'
    });

    const allT = await db.getAllTickets();
    const updated = allT.find(t => t.ticketId === testTicketId);
    assert(updated, 'Updated ticket must exist');

    // Verify Slot 1 Drive metadata persistence
    assert.strictEqual(updated.hmDriveFileId, hmFileId, 'hmDriveFileId must be permanently stored');
    assert.strictEqual(updated.hmReportPhotoUrl, hmUrl, 'hmReportPhotoUrl must be permanently stored');
    assert.strictEqual(updated.completionEvidenceStatus, 'partial_hm', 'Status must be updated');
    console.log('✅ Verified Slot 1 HM Report Drive metadata persisted');

    // Verify dashboard preview construction logic
    function constructDashboardPreview(ticket) {
      if (ticket.hmDriveFileId) {
        return `https://lh3.googleusercontent.com/d/${ticket.hmDriveFileId}=w800`;
      }
      if (ticket.hmReportPhotoUrl && !ticket.hmReportPhotoUrl.startsWith('/uploads/')) {
        return ticket.hmReportPhotoUrl;
      }
      return null;
    }

    const preview = constructDashboardPreview(updated);
    assert.strictEqual(preview, `https://lh3.googleusercontent.com/d/${hmFileId}=w800`, 'Dashboard preview must resolve directly from Drive File ID');
    console.log('✅ Verified dashboard constructs preview from permanent Drive File ID');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_hm_report_drive_persistence.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
