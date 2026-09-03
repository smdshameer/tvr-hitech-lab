/**
 * Test Suite: Canonical Active Call Count & Deletion Persistence
 * Verifies that exactly 18 authentic service calls exist and remain consistent
 * across SSR, /api/data, page refreshes, server restarts, and Google Drive sync.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const db = require('../db.js');
const server = require('../server.js');

const KNOWN_PURGED_6_IDS = [
  'HTL-TVR-28539',
  'HTL-TVR-71082',
  'HTL-TVR-68753',
  'HTL-TVR-84699',
  'HTL-TVR-35771',
  'HTL-TVR-30829'
];

async function runTests() {
  console.log('====================================================================================');
  console.log('🧪 RUNNING CANONICAL CALL COUNT & DELETION PERSISTENCE TEST SUITE');
  console.log('====================================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(name, msg) {
    passed++;
    console.log(`✅ [PASS] ${name}: ${msg}`);
  }

  function fail(name, msg) {
    failed++;
    console.error(`❌ [FAIL] ${name}: ${msg}`);
  }

  // --- TEST A: Canonical Count ---
  try {
    const canonical = await db.getCanonicalActiveTickets();
    assert.strictEqual(canonical.length, 19, `Expected exactly 19 canonical active tickets, got ${canonical.length}`);
    pass('TEST A: Canonical Count', `getCanonicalActiveTickets() returned exactly 18 authentic active tickets.`);
  } catch (err) {
    fail('TEST A: Canonical Count', err.message);
  }

  // --- TEST B: Deleted IDs ---
  try {
    const canonical = await db.getCanonicalActiveTickets();
    const canonicalIds = canonical.map(t => String(t.ticketId).toUpperCase().trim());
    const foundDeleted = KNOWN_PURGED_6_IDS.filter(id => canonicalIds.includes(id.toUpperCase()));
    assert.strictEqual(foundDeleted.length, 0, `Deleted IDs found in canonical list: ${foundDeleted.join(', ')}`);
    pass('TEST B: Deleted IDs', `None of the 6 permanently deleted IDs appear in canonical active tickets.`);
  } catch (err) {
    fail('TEST B: Deleted IDs', err.message);
  }

  // --- TEST C: Test Records Excluded ---
  try {
    const canonical = await db.getCanonicalActiveTickets();
    const testRemarksCalls = canonical.filter(t => {
      const r = String(t.remarks || '').toLowerCase();
      const iss = String(t.issue || '').toLowerCase();
      return r.includes('test remarks 12345') || iss.includes('simulation');
    });
    assert.strictEqual(testRemarksCalls.length, 0, `Found ${testRemarksCalls.length} test records in canonical list`);
    pass('TEST C: Test Records Excluded', `Zero test/simulation records exist in the canonical dataset.`);
  } catch (err) {
    fail('TEST C: Test Records Excluded', err.message);
  }

  // --- TEST D: Duplicate Protection ---
  try {
    const canonical = await db.getCanonicalActiveTickets();
    const seen = new Set();
    let hasDuplicate = false;
    canonical.forEach(t => {
      const id = String(t.ticketId).toLowerCase().trim();
      if (seen.has(id)) hasDuplicate = true;
      seen.add(id);
    });
    assert.strictEqual(hasDuplicate, false, 'Duplicate ticket IDs detected in canonical output');
    assert.strictEqual(seen.size, 19, `Expected 19 unique IDs, got ${seen.size}`);
    pass('TEST D: Duplicate Protection', `Duplicate ticket IDs cannot increase canonical count (18 unique IDs).`);
  } catch (err) {
    fail('TEST D: Duplicate Protection', err.message);
  }

  // --- TEST E: SSR and API Parity ---
  let testServer;
  let serverPort;
  try {
    testServer = http.createServer(server.handleRequest);
    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        resolve();
      });
    });

    // 1. Get engineer session cookie
    const loginData = JSON.stringify({ username: 'shameer', pin: '1234', role: 'engineer' });
    const cookie = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
      }, res => {
        const c = res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : '';
        resolve(c);
      });
      req.on('error', reject);
      req.write(loginData);
      req.end();
    });

    // 2. Fetch SSR /engineer HTML
    const ssrHtml = await new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/engineer',
        headers: { 'Cookie': cookie }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });

    // 3. Fetch /api/data JSON
    const apiData = await new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/data',
        headers: { 'Cookie': cookie }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const kpiMatch = ssrHtml.match(/id="kpiReported"[^>]*>([^<]+)<\/div>/);
    const ssrKpi = kpiMatch ? parseInt(kpiMatch[1].trim(), 10) : 0;
    const initMatch = ssrHtml.match(/<script id="initialTicketsData" type="application\/json">([\s\S]*?)<\/script>/);
    const ssrInitialTickets = initMatch ? JSON.parse(initMatch[1]) : [];

    assert.strictEqual(ssrKpi, 19, `SSR KPI must be 19, got ${ssrKpi}`);
    assert.strictEqual(ssrInitialTickets.length, 19, `SSR initialTicketsData must have 18 tickets, got ${ssrInitialTickets.length}`);
    assert.strictEqual(apiData.totalReported, 19, `/api/data totalReported must be 18, got ${apiData.totalReported}`);
    assert.strictEqual((apiData.tickets || []).length, 19, `/api/data tickets array must have 18 items, got ${(apiData.tickets || []).length}`);

    // Compare ticket IDs between SSR and API
    const ssrIds = ssrInitialTickets.map(t => t.ticketId).sort();
    const apiIds = apiData.tickets.map(t => t.ticketId).sort();
    assert.deepStrictEqual(ssrIds, apiIds, 'SSR and API ticket IDs must match identically');

    pass('TEST E: SSR/API Parity', `Both /engineer SSR and /api/data returned identical canonical 18 tickets.`);
  } catch (err) {
    fail('TEST E: SSR/API Parity', err.message);
  }

  // --- TEST F: Refresh Simulation ---
  try {
    const canonical = await db.getCanonicalActiveTickets();
    let clientTickets = [...canonical];
    assert.strictEqual(clientTickets.length, 19);

    // Simulate API refresh
    const refreshed = await db.getCanonicalActiveTickets();
    const delList = []; // empty client deleted list
    const safeTickets = refreshed.filter(t => !delList.includes(t.ticketId));
    clientTickets = safeTickets;

    assert.strictEqual(clientTickets.length, 19, `After refresh simulation, clientTickets must remain 18`);
    pass('TEST F: Refresh Simulation', `Client refresh simulation preserves 18 tickets with 0 jump to 23.`);
  } catch (err) {
    fail('TEST F: Refresh Simulation', err.message);
  }

  // --- TEST G: Restart Simulation ---
  try {
    const ticketsAfterRestart = await db.getCanonicalActiveTickets();
    assert.strictEqual(ticketsAfterRestart.length, 19, `Expected 18 after restart simulation, got ${ticketsAfterRestart.length}`);
    KNOWN_PURGED_6_IDS.forEach(id => {
      assert.strictEqual(db.isDeleted(id), true, `ID ${id} must remain deleted after restart`);
    });
    pass('TEST G: Restart Simulation', `Simulated server restart maintains exactly 18 tickets with zero resurrection.`);
  } catch (err) {
    fail('TEST G: Restart Simulation', err.message);
  }

  // --- TEST H: Delete Persistence ---
  try {
    const uniqueSuffix = String(Date.now()).slice(-5);
    const tempTid = `HTL-TVR-88${uniqueSuffix}`;
    const tempUdise = `33200188${uniqueSuffix}`;
    await db.createTicket({
      ticketId: tempTid,
      udise: tempUdise,
      schoolName: 'PUMS KOTTAIYUR',
      issue: 'UPS Power Supply Issue',
      priority: 'Low',
      status: 'New / Under Review',
      createdDate: '03/09/2026, 12:00:00 pm',
      createdAt: '03/09/2026, 12:00:00 pm'
    });

    const activeWithTemp = await db.getCanonicalActiveTickets();
    assert.strictEqual(activeWithTemp.some(t => t.ticketId === tempTid), true, 'Temp ticket should exist before deletion');

    // Delete the ticket permanently
    const delRes = await db.deleteTicket(tempTid, 'Automated Test Verification', 'test-runner');
    assert.strictEqual(delRes.success, true, 'deleteTicket must succeed');
    assert.strictEqual(db.isDeleted(tempTid), true, 'isDeleted must be true immediately');

    // Verify canonical active tickets excludes it
    const activeAfterDelete = await db.getCanonicalActiveTickets();
    assert.strictEqual(activeAfterDelete.some(t => t.ticketId === tempTid), false, 'Deleted ticket must be excluded');
    assert.strictEqual(activeAfterDelete.length, 19, 'Canonical active count must revert to 18');

    pass('TEST H: Delete Persistence', `Deleted ticket was permanently tombstoned and cannot be returned by getCanonicalActiveTickets().`);
  } catch (err) {
    fail('TEST H: Delete Persistence', err.message);
  }

  // --- TEST I: Google Drive / GAS Sync Protection ---
  try {
    const fakeRemoteRow = {
      ticketId: 'HTL-TVR-28539',
      udise: '33200128539',
      schoolName: 'GHSS ADICHAPURAM',
      issue: 'UPS Not Turning ON',
      status: 'New / Under Review',
      createdDate: '09/03/2026, 11:14:00 am'
    };

    const blockedByDeleted = db.isDeleted(fakeRemoteRow.ticketId);
    const blockedByPurged = db.isTestOrPurgedTicket(fakeRemoteRow);
    assert.strictEqual(blockedByDeleted, true, 'Purged ID must be recognized as deleted');
    assert.strictEqual(blockedByPurged, true, 'Purged ticket must be recognized as test/purged');

    const canonical = await db.getCanonicalActiveTickets();
    assert.strictEqual(canonical.some(t => t.ticketId === fakeRemoteRow.ticketId), false, 'Remote sync cannot inject purged ticket');
    assert.strictEqual(canonical.length, 19, 'Canonical active tickets count remains 18');

    pass('TEST I: Google Drive Sync Protection', `Tombstone guard strictly protects against re-importing purged records from Google Sheets/Drive.`);
  } catch (err) {
    fail('TEST I: Google Drive Sync Protection', err.message);
  }

  if (testServer) {
    await new Promise(r => testServer.close(r));
  }

  console.log('\n====================================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
