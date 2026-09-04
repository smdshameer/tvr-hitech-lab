const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_restart_persistence.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-TVR-RESTART-' + rand;
  const testUdise = '3320010' + rand;

  const p1Id = 'fid_restart_p1_' + rand;
  const hmId = 'fid_restart_hm_' + rand;
  const compId = 'fid_restart_comp_' + rand;

  console.log(`1. Creating ticket with Drive IDs: ${testTicketId}`);

  try {
    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'Medium',
      status: 'New / Under Review',
      district: 'Thiruvarur',
      block: 'Kudavasal',
      schoolName: 'GHSS KUDAVASAL',
      udise: testUdise,
      aiName: 'Karthik N',
      phone: '9876543214',
      issue: 'Restart Verification',
      duration: 'Today (இன்று முதல்)',
      p1DriveFileId: p1Id,
      photo1Url: `https://lh3.googleusercontent.com/d/${p1Id}=w800`,
      hmDriveFileId: hmId,
      hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${hmId}=w800`,
      compDriveFileId: compId,
      completionPhotoUrl: `https://lh3.googleusercontent.com/d/${compId}=w800`,
      completionEvidenceStatus: 'complete'
    });

    console.log('2. Simulating server restart by reinitializing database...');
    await db.initDatabase();

    console.log('3. Fetching ticket post-restart...');
    const allT = await db.getAllTickets();
    const afterRestart = allT.find(t => t.ticketId === testTicketId);
    assert(afterRestart, 'Ticket must survive database reinitialization');

    assert.strictEqual(afterRestart.p1DriveFileId, p1Id, 'p1DriveFileId must survive server restart');
    assert.strictEqual(afterRestart.hmDriveFileId, hmId, 'hmDriveFileId must survive server restart');
    assert.strictEqual(afterRestart.compDriveFileId, compId, 'compDriveFileId must survive server restart');
    assert(afterRestart.photo1Url.includes(p1Id), 'photo1Url must survive restart');
    assert(afterRestart.hmReportPhotoUrl.includes(hmId), 'hmReportPhotoUrl must survive restart');
    assert(afterRestart.completionPhotoUrl.includes(compId), 'completionPhotoUrl must survive restart');

    console.log('✅ Verified: All Drive File IDs and URLs survived server restart without loss!');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_restart_persistence.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
