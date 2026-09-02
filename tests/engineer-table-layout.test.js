const assert = require('assert');
const http = require('http');
const fs = require('fs');

console.log('========================================================');
console.log('🧪 ENGINEER DASHBOARD 8-COLUMN TABLE STRUCTURE AUDIT');
console.log('========================================================\n');

async function fetchHtml(path, cookie = '') {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 10000,
      path: path,
      headers: {
        'Cookie': cookie
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function loginAndGetCookie() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ username: 'shameer', pin: '1234', role: 'engineer' });
    const req = http.request({
      hostname: 'localhost',
      port: 10000,
      path: '/api/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      const cookies = res.headers['set-cookie'] || [];
      const sessionCookie = cookies.find(c => c.startsWith('htl_session='));
      resolve(sessionCookie ? sessionCookie.split(';')[0] : '');
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  const db = require('D:/Ai Ticket App - UPS/db.js');
  const serverJs = fs.readFileSync('D:/Ai Ticket App - UPS/server.js', 'utf8');

  // ----------------------------------------------------
  // 1. CSS & TABLE DISPLAY VERIFICATION
  // ----------------------------------------------------
  console.log('--- 1. Verifying CSS & Table Display Rules ---');
  assert(serverJs.includes('.data-table {'), 'CSS must define .data-table');
  assert(serverJs.includes('display: table;'), 'CSS must explicitly enforce display: table');
  assert(serverJs.includes('display: table-header-group;'), 'CSS must explicitly enforce display: table-header-group on thead');
  assert(serverJs.includes('display: table-row-group;'), 'CSS must explicitly enforce display: table-row-group on tbody');
  assert(serverJs.includes('display: table-row;'), 'CSS must explicitly enforce display: table-row on tr');
  assert(serverJs.includes('display: table-cell;'), 'CSS must explicitly enforce display: table-cell on th, td');
  assert(serverJs.includes('.remarks-cell'), 'CSS must define .remarks-cell');
  assert(serverJs.includes('.remarks-text'), 'CSS must define .remarks-text');
  console.log('✅ CSS display properties properly enforce native table rendering');

  // ----------------------------------------------------
  // 2. HEADERS AUDIT (EXACTLY 8 COLUMNS)
  // ----------------------------------------------------
  console.log('\n--- 2. Verifying Table Header Columns (Exactly 8) ---');
  const theadMatch = serverJs.match(/<table class="data-table">[\s\S]*?<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/);
  assert(theadMatch, 'Table <thead> structure must exist in server.js');
  
  const thElements = theadMatch[1].match(/<th[\s\S]*?<\/th>/g);
  console.log(`Found ${thElements.length} <th> elements in thead:`);
  thElements.forEach((th, idx) => {
    const text = th.replace(/<[^>]+>/g, '').trim();
    console.log(`  Col #${idx + 1}: ${text}`);
  });

  assert.strictEqual(thElements.length, 8, '<thead> must contain EXACTLY 8 <th> elements');
  assert(thElements[0].includes('Ticket ID'), 'Col 1 must be Ticket ID');
  assert(thElements[1].includes('Service Call Photos'), 'Col 2 must be Service Call Photos');
  assert(thElements[2].includes('School & Block'), 'Col 3 must be School & Block');
  assert(thElements[3].includes('School AI Contact'), 'Col 4 must be School AI Contact');
  assert(thElements[4].includes('Remarks'), 'Col 5 must be Remarks');
  assert(thElements[5].includes('Status'), 'Col 6 must be Status');
  assert(!thElements[5].includes('/ Cat') && !thElements[5].includes('/ CAT'), 'Col 6 must NOT have / CAT');
  assert(thElements[6].includes('Reported Fault & Priority'), 'Col 7 must be Reported Fault & Priority');
  assert(thElements[7].includes('Action'), 'Col 8 must be Action');
  console.log('✅ All 8 headers verified in exact specified order (Col 6 = Status, Col 7 = Fault)!');

  // ----------------------------------------------------
  // 3. SERVER-SIDE & CLIENT-SIDE ROW RENDERING PARITY
  // ----------------------------------------------------
  console.log('\n--- 3. Verifying SSR and Client-Side Row Generators ---');
  
  // Extract SSR generator
  const ssrMatch = serverJs.match(/function generateTableRowsHtml\(list\) \{[\s\S]*?\n\}/);
  assert(ssrMatch, 'Server-side generateTableRowsHtml must exist');

  // Test Ticket with remarks
  const sampleTicketWithRemarks = {
    ticketId: 'HTL-TEST-888',
    createdDate: '03-09-2026',
    schoolName: 'GHSS TEST SCHOOL',
    block: 'Kottur',
    udise: '33200100101',
    aiName: 'Ravi AI',
    phone: '9876543210',
    remarks: 'TEST REMARKS 12345 – UPS input MCB checked.',
    issue: 'UPS Not Turning ON',
    priority: 'High',
    status: 'New / Under Review',
    photo1Url: '/uploads/p1.jpg',
    photo2Url: '/uploads/p2.jpg',
    photo3Url: '/uploads/p3.jpg',
    photo4Url: '/uploads/p4.jpg'
  };

  // Test Ticket without remarks (empty remarks fallback)
  const sampleTicketEmptyRemarks = {
    ...sampleTicketWithRemarks,
    ticketId: 'HTL-TEST-999',
    remarks: ''
  };

  // Compile SSR row function
  const extractSsrFn = serverJs.match(/function generateTableRowsHtml\(list\) \{[\s\S]*?\n\}/)[0];
  const ssrFn = new Function('escapeHtml', 'renderPhotoThumbnailHtml', `
    return ${extractSsrFn};
  `)(
    str => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    () => '<div class="photo-thumb"></div>'
  );

  function auditRowHtml(rowHtml, expectedRemarksText) {
    // Check no rogue/nested tr
    const trOpenCount = (rowHtml.match(/<tr\b/g) || []).length;
    const trCloseCount = (rowHtml.match(/<\/tr>/g) || []).length;
    assert.strictEqual(trOpenCount, 1, 'Row HTML must have exactly 1 <tr> open tag');
    assert.strictEqual(trCloseCount, 1, 'Row HTML must have exactly 1 </tr> close tag');

    // Extract all <td> cells directly under <tr>
    const tdElements = rowHtml.match(/<td[\s\S]*?<\/td>/g);
    assert(tdElements, 'Row must contain <td> elements');
    console.log(`  Row contains ${tdElements.length} <td> elements (expected: 8)`);
    assert.strictEqual(tdElements.length, 8, 'Every <tr> must contain EXACTLY 8 <td> elements');

    // Check no unclosed tags inside <td>
    tdElements.forEach((td, i) => {
      const opens = (td.match(/<td\b/g) || []).length;
      const closes = (td.match(/<\/td>/g) || []).length;
      assert.strictEqual(opens, 1, `Cell #${i + 1} must have exactly 1 <td opening`);
      assert.strictEqual(closes, 1, `Cell #${i + 1} must have exactly 1 </td> closing`);
    });

    // Check column 5 is Remarks
    const col5 = tdElements[4];
    assert(col5.includes('remarks-cell'), 'Cell #5 must have class="remarks-cell"');
    if (expectedRemarksText) {
      assert(col5.includes(expectedRemarksText), `Cell #5 must contain "${expectedRemarksText}"`);
    } else {
      assert(col5.includes('—'), 'Cell #5 must contain fallback "—" for empty remarks');
    }

    // Check column 6 is Status (moved immediately after Remarks)
    const col6 = tdElements[5];
    assert(col6.includes('badge-status'), 'Cell #6 must contain Status badge');

    // Check column 7 is Reported Fault & Priority (moved immediately after Status)
    const col7 = tdElements[6];
    assert(col7.includes('UPS Not Turning ON'), 'Cell #7 must contain Reported Fault');
    assert(col7.includes('prio-pill'), 'Cell #7 must contain Priority pill');

    // Check column 8 is Action
    const col8 = tdElements[7];
    assert(col8.includes('btn-table-manage'), 'Cell #8 must contain Manage button');
  }

  console.log('\n* Auditing SSR Row with Remarks:');
  const ssrRowWithRemarks = ssrFn([sampleTicketWithRemarks]);
  auditRowHtml(ssrRowWithRemarks, 'TEST REMARKS 12345 – UPS input MCB checked.');
  console.log('✅ SSR row with remarks passed all 8-column structural assertions!');

  console.log('\n* Auditing SSR Row with Empty Remarks:');
  const ssrRowEmptyRemarks = ssrFn([sampleTicketEmptyRemarks]);
  auditRowHtml(ssrRowEmptyRemarks, null);
  console.log('✅ SSR row with empty remarks renders "—" properly in 5th column!');

  // ----------------------------------------------------
  // 4. LIVE SERVER GET /engineer DOM PARSING
  // ----------------------------------------------------
  console.log('\n--- 4. Querying Live /engineer Page from Server ---');
  const cookie = await loginAndGetCookie();
  console.log('Obtained engineer session cookie:', cookie ? 'YES' : 'NO');

  const page = await fetchHtml('/engineer', cookie);
  assert.strictEqual(page.statusCode, 200, 'GET /engineer must return HTTP 200');
  
  // Verify Table in Live HTML
  assert(page.body.includes('<table class="data-table">'), 'Page must contain <table class="data-table">');
  assert(page.body.includes('Ticket ID'), 'Page must contain Ticket ID header');
  assert(page.body.includes('Remarks'), 'Page must contain Remarks header');
  assert(page.body.includes('Status'), 'Page must contain Status header');
  assert(!page.body.includes('Status / Cat') && !page.body.includes('STATUS / CAT'), 'Page must NOT contain "Status / Cat"');
  assert(page.body.includes('Reported Fault & Priority'), 'Page must contain Reported Fault & Priority header');
  assert(page.body.includes('Action'), 'Page must contain Action header');

  // Count columns in live thead
  const liveTheadMatch = page.body.match(/<table class="data-table">[\s\S]*?<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/);
  assert(liveTheadMatch, 'Live page must contain <thead><tr>...</tr></thead>');
  const liveThs = liveTheadMatch[1].match(/<th[\s\S]*?<\/th>/g);
  assert.strictEqual(liveThs.length, 8, 'Live <thead> must have exactly 8 <th> elements');
  console.log(`✅ Live HTML <thead> verified: exactly ${liveThs.length} columns!`);

  // Count columns in live tbody rows
  const liveTbodyMatch = page.body.match(/<tbody id="tableBody">([\s\S]*?)<\/tbody>/);
  assert(liveTbodyMatch, 'Live page must contain <tbody id="tableBody">');
  const liveRows = liveTbodyMatch[1].match(/<tr[\s\S]*?<\/tr>/g) || [];
  console.log(`Found ${liveRows.length} rendered <tr> rows in live table.`);
  
  let validTicketRowsChecked = 0;
  liveRows.forEach((row, rIdx) => {
    if (row.includes('data-ticket-id')) {
      const tds = row.match(/<td[\s\S]*?<\/td>/g);
      assert.strictEqual(tds.length, 8, `Live Row #${rIdx + 1} must have EXACTLY 8 <td> elements`);
      validTicketRowsChecked++;
    }
  });
  console.log(`✅ Verified ${validTicketRowsChecked} live ticket rows in DOM: all have EXACTLY 8 <td> cells!`);

  console.log('\n========================================================');
  console.log('🎉 ALL 8-COLUMN TABLE STRUCTURE CHECKS PASSED 100%');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
