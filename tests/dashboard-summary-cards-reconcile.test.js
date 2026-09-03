const assert = require('assert');
const fs = require('fs');
const http = require('http');

console.log('========================================================');
console.log('🧪 RUNNING DASHBOARD SUMMARY-CARDS RECONCILIATION TEST');
console.log('========================================================\n');

async function run() {
  const db = require('D:/Ai Ticket App - UPS/db.js');
  const server = require('D:/Ai Ticket App - UPS/server.js');

  // 1. Fetch tickets from db
  const tickets = await db.getAllTickets();
  console.log(`--- 1. Database Ticket Integrity ---`);
  console.log(`Total Active Tickets: ${tickets.length}`);

  // Ensure no test tickets exist
  const testTickets = tickets.filter(t => {
    const tid = (t.ticketId || '').toLowerCase();
    const rem = (t.remarks || '').toLowerCase();
    return tid.includes('test') || tid.includes('simulation') || rem.includes('test remarks 12345');
  });
  assert.strictEqual(testTickets.length, 0, `Active tickets must contain 0 test tickets, found ${testTickets.length}`);
  console.log(`✅ Zero test tickets exist in active dataset`);

  // 2. Status Breakdown Calculation
  console.log(`\n--- 2. Mathematical Consistency Check ---`);
  const totalReported = tickets.length;
  const resolvedRemote = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
  const solvedDirect = tickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
  const vendorEsc = tickets.filter(t => t.status === 'Vendor Escalated').length;
  const pendingCount = tickets.filter(t => !t.status || t.status === 'New / Under Review' || t.status === 'In Progress (Remote)').length;

  console.log(`Calls Registered: ${totalReported}`);
  console.log(`Resolved Remotely: ${resolvedRemote}`);
  console.log(`Direct Visit Solved: ${solvedDirect}`);
  console.log(`Vendor Escalated: ${vendorEsc}`);
  console.log(`Under Review / Pending: ${pendingCount}`);

  // Strict Business Rule Assertion:
  // Total registered tickets must equal sum of mutually exclusive categories
  const statusSum = resolvedRemote + solvedDirect + vendorEsc + pendingCount;
  assert.strictEqual(totalReported, statusSum, `Total reported (${totalReported}) must equal sum of statuses (${statusSum})`);
  assert(pendingCount <= totalReported, `Pending (${pendingCount}) cannot exceed total registered (${totalReported})`);
  console.log(`✅ Mathematical reconciliation holds: ${totalReported} === ${resolvedRemote} + ${solvedDirect} + ${vendorEsc} + ${pendingCount}`);

  // 3. SSR HTML Verification
  console.log(`\n--- 3. SSR HTML Card Generation Verification ---`);
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

  assert.strictEqual(ssrReported, totalReported, `SSR kpiReported (${ssrReported}) must match totalReported (${totalReported})`);
  assert.strictEqual(ssrRemote, resolvedRemote, `SSR kpiResolvedRemote (${ssrRemote}) must match resolvedRemote (${resolvedRemote})`);
  assert.strictEqual(ssrDirect, solvedDirect, `SSR kpiSolvedDirect (${ssrDirect}) must match solvedDirect (${solvedDirect})`);
  assert.strictEqual(ssrPending, pendingCount, `SSR kpiPending (${ssrPending}) must match pendingCount (${pendingCount})`);
  assert.strictEqual(ssrVendor, vendorEsc, `SSR kpiVendor (${ssrVendor}) must match vendorEsc (${vendorEsc})`);
  console.log(`✅ SSR rendered cards match database counts identically`);

  testServer.close();

  console.log('\n========================================================');
  console.log('🎉 DASHBOARD SUMMARY-CARDS RECONCILIATION TEST PASSED 100%');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
