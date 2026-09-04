const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_all_photo_slots_persistence.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-NGP-ALL6-' + rand;
  const testUdise = '3319010' + rand;
  const testSchool = 'PUMS VEDARANYAM WEST';

  console.log(`Creating ticket for full 6-photo lifecycle: ${testTicketId}`);

  try {
    // 1. AI Teacher creates ticket with 4 Evidence Photos
    const p1Id = 'fid_ai_p1_' + rand;
    const p2Id = 'fid_ai_p2_' + rand;
    const p3Id = 'fid_ai_p3_' + rand;
    const p4Id = 'fid_ai_p4_' + rand;

    await db.createTicket({
      ticketId: testTicketId,
      createdDate: new Date().toLocaleString('en-IN'),
      createdAt: new Date().toISOString(),
      priority: 'High',
      status: 'New / Under Review',
      district: 'Nagapattinam',
      block: 'Vedaranyam',
      schoolName: testSchool,
      udise: testUdise,
      aiName: 'Malathy S',
      phone: '9876543213',
      issue: 'Complete Evidence Audit',
      duration: 'Today (இன்று முதல்)',
      p1DriveFileId: p1Id,
      p2DriveFileId: p2Id,
      p3DriveFileId: p3Id,
      p4DriveFileId: p4Id,
      p1DriveUrl: `https://lh3.googleusercontent.com/d/${p1Id}=w800`,
      p2DriveUrl: `https://lh3.googleusercontent.com/d/${p2Id}=w800`,
      p3DriveUrl: `https://lh3.googleusercontent.com/d/${p3Id}=w800`,
      p4DriveUrl: `https://lh3.googleusercontent.com/d/${p4Id}=w800`,
      photo1Url: `https://lh3.googleusercontent.com/d/${p1Id}=w800`,
      photo2Url: `https://lh3.googleusercontent.com/d/${p2Id}=w800`,
      photo3Url: `https://lh3.googleusercontent.com/d/${p3Id}=w800`,
      photo4Url: `https://lh3.googleusercontent.com/d/${p4Id}=w800`
    });

    // 2. Engineer uploads Slot 1 HM Report
    const hmId = 'fid_hm_slot1_' + rand;
    await db.updateTicket(testTicketId, {
      hmDriveFileId: hmId,
      hmReportPhotoUrl: `https://lh3.googleusercontent.com/d/${hmId}=w800`,
      completionEvidenceStatus: 'partial_hm'
    });

    // 3. Engineer uploads Slot 2 GPS Completion Photo
    const compId = 'fid_comp_slot2_' + rand;
    await db.updateTicket(testTicketId, {
      compDriveFileId: compId,
      completionPhotoUrl: `https://lh3.googleusercontent.com/d/${compId}=w800`,
      completionEvidenceStatus: 'complete'
    });

    // 4. Verify all 6 photos co-exist and survived
    const allT = await db.getAllTickets();
    const finalTicket = allT.find(t => t.ticketId === testTicketId);
    assert(finalTicket, 'Final ticket must exist');

    assert.strictEqual(finalTicket.p1DriveFileId, p1Id, 'Photo 1 File ID must survive');
    assert.strictEqual(finalTicket.p2DriveFileId, p2Id, 'Photo 2 File ID must survive');
    assert.strictEqual(finalTicket.p3DriveFileId, p3Id, 'Photo 3 File ID must survive');
    assert.strictEqual(finalTicket.p4DriveFileId, p4Id, 'Photo 4 File ID must survive');
    assert.strictEqual(finalTicket.hmDriveFileId, hmId, 'HM Report File ID must survive');
    assert.strictEqual(finalTicket.compDriveFileId, compId, 'GPS Completion File ID must survive');

    assert(finalTicket.photo1Url.includes(p1Id), 'Photo 1 URL must survive');
    assert(finalTicket.photo2Url.includes(p2Id), 'Photo 2 URL must survive');
    assert(finalTicket.photo3Url.includes(p3Id), 'Photo 3 URL must survive');
    assert(finalTicket.photo4Url.includes(p4Id), 'Photo 4 URL must survive');
    assert(finalTicket.hmReportPhotoUrl.includes(hmId), 'HM Report URL must survive');
    assert(finalTicket.completionPhotoUrl.includes(compId), 'Completion URL must survive');

    console.log('✅ All 6 photos co-exist simultaneously with permanent Drive File IDs and URLs!');
  } finally {
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_all_photo_slots_persistence.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
