const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_idempotent_upload.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-TVR-IDEMP-' + rand;
  const testUdise = '3320010' + rand;

  console.log(`1. Creating ticket: ${testTicketId}`);

  try {
    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'Medium',
      status: 'New / Under Review',
      district: 'Thiruvarur',
      block: 'Needamangalam',
      schoolName: 'GHSS NEEDAMANGALAM',
      udise: testUdise,
      aiName: 'Praveen S',
      phone: '9876543216',
      issue: 'Idempotency Verification',
      duration: 'Today (இன்று முதல்)'
    });

    // Upload 1: First upload of Slot 1 HM report
    const initialFid = 'fid_hm_initial_' + rand;
    console.log(`2. First upload for Slot 1: ${initialFid}`);
    await db.updateTicket(testTicketId, {
      hmDriveFileId: initialFid,
      hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${initialFid}=w800`,
      completionEvidenceStatus: 'partial_hm'
    });

    const all1 = await db.getAllTickets();
    const t1 = all1.find(t => t.ticketId === testTicketId);
    assert.strictEqual(t1.hmDriveFileId, initialFid);

    // Upload 2: Retry/Re-upload same Slot 1
    const updatedFid = 'fid_hm_updated_' + (rand + 10);
    console.log(`3. Retrying upload for Slot 1: ${updatedFid}`);
    await db.updateTicket(testTicketId, {
      hmDriveFileId: updatedFid,
      hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${updatedFid}=w800`,
      completionEvidenceStatus: 'partial_hm'
    });

    const all2 = await db.getAllTickets();
    const t2 = all2.find(t => t.ticketId === testTicketId);
    assert.strictEqual(t2.hmDriveFileId, updatedFid, 'Database must cleanly update to the newer Drive File ID');

    // Verify tickets count did not duplicate
    const allMatching = (await db.getAllTickets()).filter(t => t.ticketId === testTicketId);
    assert.strictEqual(allMatching.length, 1, 'Only one canonical ticket record must exist, no duplicate entries created');
    console.log('✅ Verified: Retried upload updated existing record cleanly with no duplicate tickets');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_idempotent_upload.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
