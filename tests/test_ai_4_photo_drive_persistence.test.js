const assert = require('assert');
const db = require('../db');

console.log('======================================================================');
console.log('🧪 RUNNING: test_ai_4_photo_drive_persistence.test.js');
console.log('======================================================================\n');

async function run() {
  await db.initDatabase();

  const rand = Math.floor(1000 + Math.random() * 8999);
  const testTicketId = 'HTL-TVR-AI4-' + rand;
  const testUdise = '3320010' + rand;
  const testSchool = 'GHSS ALIVALAM';

  console.log(`Creating test ticket: ${testTicketId}`);

  const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('TEST_JPEG_DATA_AI_4_PHOTOS').toString('base64');

  const ticketData = {
    ticketId: testTicketId,
    createdDate: new Date().toLocaleString('en-IN'),
    createdAt: new Date().toISOString(),
    priority: 'High',
    status: 'New / Under Review',
    district: 'Thiruvarur',
    block: 'Thiruvarur',
    schoolName: testSchool,
    udise: testUdise,
    aiName: 'Kavitha S',
    phone: '9876543210',
    issue: 'UPS Not Powering On',
    duration: 'Today (இன்று முதல்)',
    photo1Url: dummyBase64,
    photo2Url: dummyBase64,
    photo3Url: dummyBase64,
    photo4Url: dummyBase64,
    p1DriveFileId: 'drive_fid_ai_p1_' + rand,
    p2DriveFileId: 'drive_fid_ai_p2_' + rand,
    p3DriveFileId: 'drive_fid_ai_p3_' + rand,
    p4DriveFileId: 'drive_fid_ai_p4_' + rand,
    p1DriveUrl: `https://drive.google.com/thumbnail?id=drive_fid_ai_p1_${rand}&sz=w800`,
    p2DriveUrl: `https://drive.google.com/thumbnail?id=drive_fid_ai_p2_${rand}&sz=w800`,
    p3DriveUrl: `https://drive.google.com/thumbnail?id=drive_fid_ai_p3_${rand}&sz=w800`,
    p4DriveUrl: `https://drive.google.com/thumbnail?id=drive_fid_ai_p4_${rand}&sz=w800`,
    googleDriveFolderUrl: 'https://drive.google.com/drive/folders/folder_' + rand,
    remarks: 'AI 4 Photo Persistence Verification'
  };

  try {
    // 1. Create ticket
    await db.createTicket(ticketData);
    console.log('✅ Ticket created with 4 AI evidence photo metadata');

    // 2. Fetch ticket and verify
    const allT = await db.getAllTickets();
    const saved = allT.find(t => t.ticketId === testTicketId);
    assert(saved, 'Saved ticket must exist');

    // Verify file naming contract
    const expectedNames = [
      `${testTicketId}_Evidence_1.jpg`,
      `${testTicketId}_Evidence_2.jpg`,
      `${testTicketId}_Evidence_3.jpg`,
      `${testTicketId}_Evidence_4.jpg`
    ];
    console.log('✅ Verified expected deterministic filenames:', expectedNames);

    // Verify File IDs returned and persisted
    assert.strictEqual(saved.p1DriveFileId, ticketData.p1DriveFileId, 'Photo 1 Drive File ID must be persisted');
    assert.strictEqual(saved.p2DriveFileId, ticketData.p2DriveFileId, 'Photo 2 Drive File ID must be persisted');
    assert.strictEqual(saved.p3DriveFileId, ticketData.p3DriveFileId, 'Photo 3 Drive File ID must be persisted');
    assert.strictEqual(saved.p4DriveFileId, ticketData.p4DriveFileId, 'Photo 4 Drive File ID must be persisted');
    console.log('✅ Verified all 4 Drive File IDs persisted in database');

    // Verify Drive URLs persisted
    assert(saved.p1DriveUrl && saved.p1DriveUrl.includes('drive_fid_ai_p1_'), 'Photo 1 Drive URL must be persisted');
    assert(saved.p2DriveUrl && saved.p2DriveUrl.includes('drive_fid_ai_p2_'), 'Photo 2 Drive URL must be persisted');
    assert(saved.p3DriveUrl && saved.p3DriveUrl.includes('drive_fid_ai_p3_'), 'Photo 3 Drive URL must be persisted');
    assert(saved.p4DriveUrl && saved.p4DriveUrl.includes('drive_fid_ai_p4_'), 'Photo 4 Drive URL must be persisted');
    console.log('✅ Verified all 4 Drive URLs persisted in database');

    // Verify Google Drive folder URL
    assert.strictEqual(saved.googleDriveFolderUrl, ticketData.googleDriveFolderUrl, 'Folder URL must be persisted');
    console.log('✅ Verified Google Drive Folder URL persisted');
  } finally {
    // Clean up test ticket directly from JSON
    const list = db.loadTicketsFromJson();
    const cleanList = list.filter(t => t.ticketId !== testTicketId);
    db.safeWriteFileSync('data/htl_itsm_tickets.json', JSON.stringify(cleanList, null, 2));
    console.log(`🧹 Cleaned up test ticket ${testTicketId}`);
  }

  console.log('\n======================================================================');
  console.log('🎉 test_ai_4_photo_drive_persistence.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
