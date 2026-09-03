const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function httpRequest(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

let serverProcess = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (d) => {
      // console.log('[Server stdout]:', d.toString());
    });
    serverProcess.stderr.on('data', (d) => {
      // console.error('[Server stderr]:', d.toString());
    });

    serverProcess.on('error', reject);

    // Poll until server responds
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await httpRequest('GET', '/login');
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve();
        }
      } catch (e) {
        if (attempts > 30) {
          clearInterval(interval);
          reject(new Error('Server failed to start within timeout.'));
        }
      }
    }, 500);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess.on('exit', () => {
        serverProcess = null;
        resolve();
      });
      setTimeout(() => {
        serverProcess = null;
        resolve();
      }, 1000);
    } else {
      resolve();
    }
  });
}

async function runPermanentDeleteVerification() {
  console.log('===============================================================');
  console.log('🛡️  STARTING PERMANENT DELETE & ANTI-RESURRECTION AUDIT');
  console.log('===============================================================');

  try {
    console.log('\n[1/7] Launching server instance...');
    await startServer();
    console.log('✅ Server running on', BASE_URL);

    // 1. Initial page load to get CSRF token
    const cookieMap = {};
    const loginPageRes = await httpRequest('GET', '/login');
    const pageCookies = loginPageRes.headers['set-cookie'] || [];
    pageCookies.forEach(c => {
      const parts = c.split(';')[0].split('=');
      cookieMap[parts[0].trim()] = parts.slice(1).join('=');
    });

    // 2. Authenticate as Field Engineer
    console.log('\n[2/7] Authenticating as Field Engineer...');
    let cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
    const loginRes = await httpRequest('POST', '/api/login', { Cookie: cookieHeader }, {
      username: 'engineer',
      pin: process.env.ENGINEER_PIN || '1234',
      role: 'engineer'
    });
    assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
    const setCookie = loginRes.headers['set-cookie'] || [];
    setCookie.forEach(c => {
      const parts = c.split(';')[0].split('=');
      cookieMap[parts[0].trim()] = parts.slice(1).join('=');
    });
    cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
    const csrfToken = cookieMap['csrf_token'];
    console.log('✅ Authenticated successfully with CSRF token:', csrfToken);

    // -------------------------------------------------------------
    // SCENARIO A: Create a test service call
    // -------------------------------------------------------------
    console.log('\n[SCENARIO A] Creating a test service call...');
    const uniqueSuffix = Date.now().toString().slice(-4);
    const targetTicketId = 'HTL-TVR-05301-DELTEST-' + uniqueSuffix;
    const testUdise = '332001' + uniqueSuffix;
    const validJpeg = 'data:image/jpeg;base64,' + Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]),
      Buffer.alloc(100, 0xaa),
      Buffer.from([0xff, 0xd9])
    ]).toString('base64');

    const createRes = await httpRequest('POST', '/api/tickets', {
      Cookie: cookieHeader,
      'X-CSRF-Token': csrfToken
    }, {
      ticketId: targetTicketId,
      schoolId: 'TVR-999',
      schoolName: 'PUMS AUDIT SCHOOL',
      udise: testUdise,
      block: 'Koradachery',
      district: 'Thiruvarur',
      aiName: 'Kothaibharathi Tamilmani',
      phone: '9042489993',
      issue: 'Permanent Delete Test Fault',
      duration: 'Today',
      priority: 'Critical',
      status: 'New / Under Review',
      resolutionCategory: 'Pending',
      remarks: 'Automated Ticket for Permanent Delete Audit',
      photo1Base64: validJpeg,
      photo2Base64: validJpeg,
      photo3Base64: validJpeg,
      photo4Base64: validJpeg
    });
    assert.strictEqual(createRes.statusCode, 200, 'Ticket creation must succeed');
    const createJson = JSON.parse(createRes.data);
    const finalId = createJson.ticketId || targetTicketId;
    console.log(`✅ Created test service call: ${finalId}`);

    // -------------------------------------------------------------
    // SCENARIO B: Confirm it appears in /engineer
    // -------------------------------------------------------------
    console.log('\n[SCENARIO B] Confirming ticket appears in /engineer...');
    const engineerRes1 = await httpRequest('GET', '/engineer', { Cookie: cookieHeader });
    assert.strictEqual(engineerRes1.statusCode, 200, 'GET /engineer should return 200');
    assert(engineerRes1.data.includes(finalId), `Ticket ${finalId} MUST appear in /engineer`);
    console.log(`✅ Confirmed: ${finalId} appears in /engineer`);

    // -------------------------------------------------------------
    // SCENARIO C: Delete it via Engineer Dashboard API
    // -------------------------------------------------------------
    console.log('\n[SCENARIO C] Deleting ticket via POST /api/tickets/delete...');
    const deleteRes = await httpRequest('POST', '/api/tickets/delete', {
      Cookie: cookieHeader,
      'X-CSRF-Token': csrfToken
    }, {
      ticketId: finalId
    });
    assert.strictEqual(deleteRes.statusCode, 200, 'Delete endpoint must return 200');
    const deleteJson = JSON.parse(deleteRes.data);
    assert.strictEqual(deleteJson.success, true, 'Delete response must have success: true');
    console.log(`✅ Delete endpoint confirmed success:`, deleteJson);

    // -------------------------------------------------------------
    // SCENARIO D: Query backend/API directly and confirm it no longer exists
    // -------------------------------------------------------------
    console.log('\n[SCENARIO D] Querying GET /api/data directly...');
    const apiDataRes1 = await httpRequest('GET', '/api/data', { Cookie: cookieHeader });
    assert.strictEqual(apiDataRes1.statusCode, 200, 'GET /api/data must return 200');
    const apiJson1 = JSON.parse(apiDataRes1.data);
    const foundInApi1 = apiJson1.tickets.some(t => String(t.ticketId).trim() === finalId);
    assert.strictEqual(foundInApi1, false, `Deleted ticket ${finalId} must NOT exist in /api/data response`);
    console.log(`✅ Confirmed: ${finalId} does NOT exist in backend /api/data`);

    // -------------------------------------------------------------
    // SCENARIO E: Refresh /engineer and confirm it is gone
    // -------------------------------------------------------------
    console.log('\n[SCENARIO E] Refreshing GET /engineer...');
    const engineerRes2 = await httpRequest('GET', '/engineer', { Cookie: cookieHeader });
    assert.strictEqual(engineerRes2.statusCode, 200, 'GET /engineer must return 200');
    assert(!engineerRes2.data.includes(finalId), `Deleted ticket ${finalId} must NOT appear in refreshed /engineer`);
    console.log(`✅ Confirmed: ${finalId} is completely gone from refreshed /engineer`);

    // -------------------------------------------------------------
    // SCENARIO F: Restart the server
    // -------------------------------------------------------------
    console.log('\n[SCENARIO F] Restarting the server...');
    await stopServer();
    console.log('... Server stopped.');
    await delay(1000);
    console.log('... Restarting fresh server process...');
    await startServer();
    console.log('✅ Server restarted successfully.');

    // -------------------------------------------------------------
    // SCENARIO G: Refresh /engineer again and confirm it is STILL gone
    // -------------------------------------------------------------
    console.log('\n[SCENARIO G] Refreshing /engineer after full server restart...');
    const engineerRes3 = await httpRequest('GET', '/engineer', { Cookie: cookieHeader });
    assert.strictEqual(engineerRes3.statusCode, 200, 'GET /engineer must return 200');
    assert(!engineerRes3.data.includes(finalId), `Deleted ticket ${finalId} must STILL be gone after server restart`);
    
    // Also verify /api/data after restart
    const apiDataRes2 = await httpRequest('GET', '/api/data', { Cookie: cookieHeader });
    const apiJson2 = JSON.parse(apiDataRes2.data);
    const foundInApi2 = apiJson2.tickets.some(t => String(t.ticketId).trim() === finalId);
    assert.strictEqual(foundInApi2, false, `Deleted ticket ${finalId} must STILL be gone from /api/data after restart`);
    console.log(`✅ Confirmed: ${finalId} is STILL gone after server restart!`);

    // -------------------------------------------------------------
    // SCENARIO H: Run sync/initialization process and confirm it does NOT return
    // -------------------------------------------------------------
    console.log('\n[SCENARIO H] Running cloud sync & database re-initialization guard...');
    const db = require('../db');
    
    // Attempt to manually trigger load & sync
    const ticketsSync = db.loadTicketsFromJson();
    assert(!ticketsSync.some(t => String(t.ticketId).trim() === finalId), 'Ticket must not be loaded from JSON');
    
    const allTicketsAfterSync = await db.getAllTickets();
    assert(!allTicketsAfterSync.some(t => String(t.ticketId).trim() === finalId), 'Ticket must not be resurrected by getAllTickets/syncGasTickets');
    
    // Ensure tombstone persists on disk
    const diskDeleted = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/htl_deleted_ids.json'), 'utf8'));
    assert(diskDeleted.includes(finalId), `Tombstone ${finalId} must be permanently stored in data/htl_deleted_ids.json`);
    console.log(`✅ Confirmed: ${finalId} was NOT resurrected by sync/initialization and is tombstoned on disk.`);

    console.log('\n===============================================================');
    console.log('🎉 ALL SCENARIOS A THROUGH H PASSED WITH 100% SUCCESS!');
    console.log('===============================================================');
  } finally {
    await stopServer();
  }
}

runPermanentDeleteVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
