const assert = require('assert');
const http = require('http');
const fs = require('fs');

console.log('========================================================');
console.log('🧪 REMARKS DATA FLOW & ENGINEER DASHBOARD VERIFICATION');
console.log('========================================================\n');

// Valid minimal 1x1 dummy JPEG base64
const dummyJpegBase64 = 'data:image/jpeg;base64,' + Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
  0xD2, 0xCF, 0x20, 0xFF, 0xD9
]).toString('base64');

async function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  const db = require('D:/Ai Ticket App - UPS/db.js');
  const serverJs = fs.readFileSync('D:/Ai Ticket App - UPS/server.js', 'utf8');

  // ----------------------------------------------------
  // TEST 1: Code Structure & Table Column Definition
  // ----------------------------------------------------
  console.log('--- 1. Testing Code Structure & Headers ---');
  assert(serverJs.includes('<th>Remarks</th>'), 'Table header must have <th>Remarks</th>');
  assert(serverJs.includes('.data-table th:nth-child(5)'), 'CSS must define 5th column as Remarks');
  assert(serverJs.includes('escRemarks'), 'generateTableRowsHtml must define escRemarks');
  console.log('✅ Table header, CSS styles, and row generator syntax verified');

  // ----------------------------------------------------
  // TEST 2: Submit New Service Call with User\'s Exact Unique Test Remarks
  // ----------------------------------------------------
  const uniqueTestRemarks = 'TEST REMARKS 12345 – UPS input MCB checked.';
  console.log(`\n--- 2. Registering Service Call with Remarks: "${uniqueTestRemarks}" ---`);

  // Target a school with no open ticket so it creates a fresh ticket
  const testUdise = '332001' + Math.floor(10000 + Math.random() * 89999);
  const payload = JSON.stringify({
    schoolName: 'GHSS ADICHAPURAM',
    udise: testUdise,
    block: 'Kottur',
    district: 'Thiruvarur',
    schoolCategory: 'General',
    aiName: 'Karthik AI',
    phone: '9876543210',
    aiPhone: '9876543210',
    issue: 'UPS Not Turning ON',
    duration: 'Today',
    serialNo: 'UPS-SN-998811',
    photo1Base64: dummyJpegBase64,
    photo2Base64: dummyJpegBase64,
    photo3Base64: dummyJpegBase64,
    photo4Base64: dummyJpegBase64,
    remarks: uniqueTestRemarks
  });

  const postRes = await makeRequest({
    hostname: 'localhost',
    port: 10000,
    path: '/api/tickets',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  assert.strictEqual(postRes.statusCode, 200, 'Ticket submission must return HTTP 200');
  const postJson = JSON.parse(postRes.body);
  assert(postJson.success, 'Ticket submission must be success: true');
  const createdTicketId = postJson.ticketId;
  console.log(`✅ Service Call successfully registered! Ticket ID: #${createdTicketId}`);

  // ----------------------------------------------------
  // TEST 3 & 4: API & Database Record Persistence
  // ----------------------------------------------------
  console.log('\n--- 3 & 4. Verifying /api/data API Flow & Ticket Persistence ---');
  const apiRes = await makeRequest({
    hostname: 'localhost',
    port: 10000,
    path: `/api/data?track=${testUdise}`,
    method: 'GET'
  });
  assert.strictEqual(apiRes.statusCode, 200, '/api/data must return HTTP 200');
  const apiJson = JSON.parse(apiRes.body);
  const createdTicket = (apiJson.tickets || []).find(t => t.ticketId === createdTicketId);
  assert(createdTicket, `Ticket #${createdTicketId} must be returned by /api/data`);
  assert.strictEqual(createdTicket.remarks, uniqueTestRemarks, 'Remarks must match exact submitted text');
  console.log(`✅ Persisted ticket verified: remarks="${createdTicket.remarks}"`);

  // ----------------------------------------------------
  // TEST 5: Engineer Dashboard Table Rendering & Column Integrity
  // ----------------------------------------------------
  console.log('\n--- 5. Verifying Engineer Dashboard REMARKS Column Output ---');
  
  // Test both server-side and client-side table row generators
  const extractSsrFn = serverJs.match(/function generateTableRowsHtml\(list\) \{[\s\S]*?\n\}/)[0];
  const ssrFn = new Function('escapeHtml', 'renderPhotoThumbnailHtml', `
    return ${extractSsrFn};
  `)(
    str => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    () => '<div class="photo-thumb"></div>'
  );

  const rowHtml = ssrFn([createdTicket]);

  // Assert REMARKS column exists and contains exact text
  assert(rowHtml.includes(uniqueTestRemarks), 'Rendered table row HTML must contain exact unique Remarks text');
  // Assert Remarks is distinct from Reported Fault
  assert(rowHtml.includes('UPS Not Turning ON'), 'Row must also contain Reported Fault');
  assert(rowHtml.includes('Karthik AI'), 'Row must contain School AI Contact');
  
  // Verify column sequence: School AI Contact -> REMARKS -> Reported Fault & Priority
  const posAiContact = rowHtml.indexOf('Karthik AI');
  const posRemarks = rowHtml.indexOf(uniqueTestRemarks);
  const posFault = rowHtml.indexOf('UPS Not Turning ON');

  assert(posAiContact < posRemarks, 'School AI Contact must appear before REMARKS');
  assert(posRemarks < posFault, 'REMARKS must appear before Reported Fault & Priority');
  console.log(`✅ Verified Column Ordering: [School AI Contact] -> [REMARKS: "${uniqueTestRemarks}"] -> [Reported Fault & Priority]`);

  // ----------------------------------------------------
  // TEST 6: Tamil + English Remarks Preservation & Empty Remarks Fallback
  // ----------------------------------------------------
  console.log('\n--- 6. Verifying Tamil + English Remarks & Empty Fallback ---');
  const tamilRemarks = 'UPS ஆன் ஆகவில்லை. Input MCB breaker checked but no output.';
  const tamilTicket = { ...createdTicket, ticketId: 'HTL-TEST-TAMIL', remarks: tamilRemarks };
  const tamilRowHtml = ssrFn([tamilTicket]);
  assert(tamilRowHtml.includes(tamilRemarks), 'Bilingual Tamil + English remarks must be preserved exactly without modification');
  console.log('✅ Tamil + English remarks preserved identically');

  const emptyTicket = { ...createdTicket, ticketId: 'HTL-TEST-EMPTY', remarks: '' };
  const emptyRowHtml = ssrFn([emptyTicket]);
  assert(emptyRowHtml.includes('>—<') || emptyRowHtml.includes('—'), 'Empty remarks on older tickets must display "—"');
  console.log('✅ Empty remarks fallback correctly displays "—"');

  // ----------------------------------------------------
  // TEST 7: Excel Export Verification
  // ----------------------------------------------------
  console.log('\n--- 7. Verifying Master Excel Export Contains Remarks ---');
  const excelBuf = await db.generateExcelExport();
  assert(excelBuf && excelBuf.length > 0, 'Excel buffer must be non-empty');
  
  // Inspect ExcelJS workbook to ensure Remarks column exists
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const ws = wb.getWorksheet('Master Tickets');
  assert(ws, 'Master Tickets worksheet must exist');
  
  const headers = [];
  ws.getRow(1).eachCell(cell => headers.push(cell.value));
  assert(headers.includes('Remarks / Description'), 'Excel export must include "Remarks / Description" column');
  
  // Find column index of Remarks
  const remarksColIdx = headers.indexOf('Remarks / Description') + 1;
  let foundRemarksInExcel = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const cellVal = row.getCell(remarksColIdx).value;
      if (cellVal === uniqueTestRemarks) {
        foundRemarksInExcel = true;
      }
    }
  });
  assert(foundRemarksInExcel, `Excel export rows must contain exact remarks: "${uniqueTestRemarks}"`);
  console.log(`✅ Excel export contains "Remarks / Description" column (Col #${remarksColIdx}) with exact text: "${uniqueTestRemarks}"`);

  // Clean up test ticket
  await db.deleteTicket(createdTicketId);
  console.log(`\n🧹 Cleaned up temporary test ticket #${createdTicketId}`);

  console.log('\n========================================================');
  console.log('🎉 ALL REMARKS DATA FLOW & ENGINEER DASHBOARD TESTS PASSED 100%');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
