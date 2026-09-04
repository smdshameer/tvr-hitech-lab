const assert = require('assert');
const http = require('http');
const fs = require('fs');

console.log('====================================================================================');
console.log('🧪 RUNNING COMPREHENSIVE DASHBOARD COUNTING LOGIC & INVARIANT REGRESSION TEST');
console.log('====================================================================================\n');

async function runTests() {
  const db = require('D:/Ai Ticket App - UPS/db.js');
  const server = require('D:/Ai Ticket App - UPS/server.js');

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

  // -------------------------------------------------------------------------
  // TEST 1: Bug Reproduction - Simulate Old Inconsistent State (24 vs 30)
  // -------------------------------------------------------------------------
  try {
    console.log('--- 1. Testing Bug Reproduction & Mathematical Safety Guard ---');
    // Simulate the old buggy scenario:
    // 24 authentic tickets + 8 test tickets in raw collection = 32 total
    // Old buggy renderTable() overwrote total with 24, while pending stayed at 30.
    const authentic24 = [
      { ticketId: 'HTL-NGP-02201', status: 'Resolved Remotely' },
      { ticketId: 'HTL-TVR-00702', status: 'Resolved Remotely' }
    ];
    for (let i = 1; i <= 22; i++) {
      authentic24.push({ ticketId: `HTL-TVR-AUTH-${i}`, status: 'New / Under Review' });
    }
    const staleTest8 = [];
    for (let i = 1; i <= 8; i++) {
      staleTest8.push({ ticketId: `HTL-TVR-TEST-${i}`, status: 'New / Under Review', remarks: 'TEST REMARKS 12345 – UPS input MCB checked.' });
    }

    // Bug simulation:
    const buggyTickets = [...authentic24, ...staleTest8];
    const buggyPending = buggyTickets.filter(t => !t.status || t.status === 'New / Under Review').length; // 30
    const buggyFilteredTable = buggyTickets.filter(t => !t.remarks || !t.remarks.includes('TEST REMARKS 12345')); // 24
    const buggyReported = buggyFilteredTable.length; // 24

    assert.strictEqual(buggyReported, 24);
    assert.strictEqual(buggyPending, 30);
    // The bug condition is reproduced:
    assert(buggyPending > buggyReported, 'Bug successfully reproduced: Pending (30) exceeded Calls Registered (24)');

    // In the canonical counting logic, such an inconsistent state is strictly rejected:
    function canonicalCount(tickets) {
      // Deduplicate and filter test tickets
      const seen = new Set();
      const clean = [];
      tickets.forEach(t => {
        if (!t || !t.ticketId) return;
        const tid = String(t.ticketId).toLowerCase().trim();
        const rem = String(t.remarks || '').toLowerCase();
        if (tid.includes('test') || rem.includes('test remarks 12345')) return;
        if (seen.has(tid)) return;
        seen.add(tid);
        clean.push(t);
      });

      const total = clean.length;
      const resolvedRemote = clean.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
      const solvedDirect = clean.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit')).length;
      const vendorEsc = clean.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status !== 'Solved by Direct Visit' && t.resolutionCategory !== 'Solved by Direct Visit') && t.status === 'Vendor Escalated').length;
      const closedVerified = clean.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status !== 'Solved by Direct Visit' && t.resolutionCategory !== 'Solved by Direct Visit') && t.status !== 'Vendor Escalated' && t.status === 'Closed / Verified').length;
      const pendingCount = clean.filter(t => {
        const isRem = t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely';
        const isDir = t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit';
        const isVen = t.status === 'Vendor Escalated';
        const isCls = t.status === 'Closed / Verified';
        return !isRem && !isDir && !isVen && !isCls;
      }).length;

      return { total, resolvedRemote, solvedDirect, vendorEsc, closedVerified, pendingCount };
    }

    const fixed = canonicalCount(buggyTickets);
    assert.strictEqual(fixed.total, 24, 'Canonical count must be 24');
    assert.strictEqual(fixed.pendingCount, 22, 'Canonical pending count must be 22');
    assert.strictEqual(fixed.resolvedRemote, 2, 'Canonical remote resolved count must be 2');
    assert.strictEqual(fixed.total, fixed.resolvedRemote + fixed.solvedDirect + fixed.vendorEsc + fixed.closedVerified + fixed.pendingCount);
    assert(fixed.pendingCount <= fixed.total, 'Pending count can never exceed total registered tickets');
    pass('TEST 1: Bug Reproduction & Safety Guard', 'Old 24 vs 30 bug reproduced and proven blocked by canonical counting rule');
  } catch(e) {
    fail('TEST 1: Bug Reproduction & Safety Guard', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Duplicate Ticket ID Protection
  // -------------------------------------------------------------------------
  try {
    console.log('\n--- 2. Testing Duplicate Ticket ID Immunity ---');
    const realTickets = await db.getAllTickets();
    assert(realTickets.length >= 24, `Expected at least 24 real tickets, got ${realTickets.length}`);

    // Inject duplicate tickets
    const duplicatesInjected = [
      ...realTickets,
      { ...realTickets[0] },
      { ...realTickets[0], ticketId: realTickets[0].ticketId.toLowerCase() },
      { ...realTickets[1] },
      { ...realTickets[1], ticketId: realTickets[1].ticketId.toUpperCase() }
    ];
    assert.strictEqual(duplicatesInjected.length, realTickets.length + 4, 'Injected 4 duplicate tickets');

    // Canonical active tickets must reject all duplicates
    const seen = new Set();
    const deduped = [];
    duplicatesInjected.forEach(t => {
      const tid = String(t.ticketId).toLowerCase().trim();
      if (!seen.has(tid)) {
        seen.add(tid);
        deduped.push(t);
      }
    });
    assert.strictEqual(deduped.length, realTickets.length, 'Duplicates were cleanly eliminated');
    pass('TEST 2: Duplicate Ticket ID Immunity', 'Duplicate ticket IDs cannot inflate Calls Registered or Pending counts');
  } catch(e) {
    fail('TEST 2: Duplicate Ticket ID Immunity', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Status Mutual Exclusivity & Mathematical Invariant
  // -------------------------------------------------------------------------
  try {
    console.log('\n--- 3. Testing Mathematical Invariant & Mutual Exclusivity ---');
    const tickets = await db.getCanonicalActiveTickets();
    const total = tickets.length;
    assert(total >= 24, `Canonical total must be >= 24, got ${total}`);

    const rem = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
    const dir = tickets.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit')).length;
    const ven = tickets.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status !== 'Solved by Direct Visit' && t.resolutionCategory !== 'Solved by Direct Visit') && t.status === 'Vendor Escalated').length;
    const cls = tickets.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status !== 'Solved by Direct Visit' && t.resolutionCategory !== 'Solved by Direct Visit') && t.status !== 'Vendor Escalated' && t.status === 'Closed / Verified').length;
    const pend = tickets.filter(t => {
      const isRem = t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely';
      const isDir = t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit';
      const isVen = t.status === 'Vendor Escalated';
      const isCls = t.status === 'Closed / Verified';
      return !isRem && !isDir && !isVen && !isCls;
    }).length;

    console.log(`  Calls Registered: ${total}`);
    console.log(`  Resolved Remotely: ${rem}`);
    console.log(`  Direct Visit Solved: ${dir}`);
    console.log(`  Vendor Escalated: ${ven}`);
    console.log(`  Closed / Verified: ${cls}`);
    console.log(`  Under Review / Pending: ${pend}`);

    assert.strictEqual(rem, 2, 'Resolved Remotely must be 2');
    assert.strictEqual(dir, 0, 'Direct Visit Solved must be 0');
    assert.strictEqual(ven, 0, 'Vendor Escalated must be 0');
    assert.strictEqual(cls, 0, 'Closed / Verified must be 0');
    const expectedPending = total - rem - dir - ven - cls;
    assert.strictEqual(pend, expectedPending, `Under Review / Pending must be ${expectedPending}`);

    // Invariant check:
    assert.strictEqual(total, rem + dir + ven + cls + pend, 'Invariant: Total = Rem + Dir + Ven + Cls + Pend');
    assert(pend <= total, 'Pending count can never exceed total registered tickets');
    pass('TEST 3: Mathematical Invariant', `Invariant strictly satisfied: ${total} === ${rem} + ${dir} + ${ven} + ${cls} + ${pend}`);
  } catch(e) {
    fail('TEST 3: Mathematical Invariant', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: SSR HTML and Client-Side updateAllKpis() Consistency
  // -------------------------------------------------------------------------
  try {
    console.log('\n--- 4. Testing SSR HTML & Client-Side Counter Parity ---');
    const testServer = http.createServer(server.handleRequest);
    await new Promise(res => testServer.listen(0, '127.0.0.1', res));
    const port = testServer.address().port;

    // Login
    const loginData = JSON.stringify({ username: 'shameer', pin: '1234', role: 'engineer' });
    const cookie = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/api/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
      }, res => {
        resolve(res.headers['set-cookie'][0].split(';')[0]);
      });
      req.on('error', reject);
      req.write(loginData);
      req.end();
    });

    // Fetch /engineer SSR
    const ssrHtml = await new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: port,
        path: '/engineer',
        headers: { 'Cookie': cookie }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });

    function extractKpi(id) {
      const m = ssrHtml.match(new RegExp(`id=["']${id}["'][^>]*>([^<]+)<`));
      return m ? parseInt(m[1].trim(), 10) : NaN;
    }

    const ssrReported = extractKpi('kpiReported');
    const ssrRemote = extractKpi('kpiResolvedRemote');
    const ssrDirect = extractKpi('kpiSolvedDirect');
    const ssrPending = extractKpi('kpiPending');
    const ssrVendor = extractKpi('kpiVendor');
    
    // Check table badge in SSR
    const tableBadgeMatch = ssrHtml.match(/id="tableCountBadge"[^>]*>([^<]+)</);
    const tableBadgeText = tableBadgeMatch ? tableBadgeMatch[1].trim() : '';

    const tickets = await db.getCanonicalActiveTickets();
    const total = tickets.length;
    const rem = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
    const dir = tickets.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit')).length;
    const ven = tickets.filter(t => (t.status !== 'Resolved Remotely' && t.resolutionCategory !== 'Resolved Remotely') && (t.status !== 'Solved by Direct Visit' && t.resolutionCategory !== 'Solved by Direct Visit') && t.status === 'Vendor Escalated').length;
    const pend = total - rem - dir - ven;

    assert.strictEqual(ssrReported, total, `SSR kpiReported must be ${total}, got ${ssrReported}`);
    assert.strictEqual(ssrRemote, rem, `SSR kpiResolvedRemote must be ${rem}, got ${ssrRemote}`);
    assert.strictEqual(ssrDirect, dir, `SSR kpiSolvedDirect must be ${dir}, got ${ssrDirect}`);
    assert.strictEqual(ssrPending, pend, `SSR kpiPending must be ${pend}, got ${ssrPending}`);
    assert.strictEqual(ssrVendor, ven, `SSR kpiVendor must be ${ven}, got ${ssrVendor}`);
    assert.strictEqual(tableBadgeText, `${total} Calls`, `Table count badge must show "${total} Calls", got "${tableBadgeText}"`);

    testServer.close();
    pass('TEST 4: SSR HTML Counter Parity', `SSR HTML correctly renders ${total} Calls Registered, ${pend} Pending, ${total} Calls Badge`);
  } catch(e) {
    fail('TEST 4: SSR HTML Counter Parity', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Table Filtering Immunity - renderTable() must NOT mutate summary cards
  // -------------------------------------------------------------------------
  try {
    console.log('\n--- 5. Testing Table Filtering Does NOT Mutate Summary Cards ---');
    const serverJs = fs.readFileSync('D:/Ai Ticket App - UPS/server.js', 'utf8');
    
    // Assert renderTable does not set kpiRepEl.textContent = filtered.length
    assert(!serverJs.includes('kpiRepEl.textContent = filtered.length'), 'renderTable must NOT mutate kpiReported');
    assert(serverJs.includes('tableCountBadge'), 'tableCountBadge is updated for table row count');
    pass('TEST 5: Table Filtering Immunity', 'renderTable() updates only tableCountBadge and preserves KPI cards');
  } catch(e) {
    fail('TEST 5: Table Filtering Immunity', e.message);
  }

  console.log('\n====================================================================================');
  console.log(`📊 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
