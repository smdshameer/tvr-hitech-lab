const assert = require('assert');
const path = require('path');
const db = require(path.resolve('D:/Ai Ticket App - UPS/db.js'));
const server = require(path.resolve('D:/Ai Ticket App - UPS/server.js'));

async function runDateTests() {
  console.log('====================================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE DATE HANDLING & RELATIVE TIME TEST SUITE');
  console.log('====================================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // TEST A: Input "03/09/2026" must mean 3 September 2026, NOT 9 March 2026
  test('Test A: Input "03/09/2026" strictly parses as 3 September 2026', () => {
    const ts = db.parseAppDate('03/09/2026');
    const formatted = db.formatAppDate('03/09/2026');
    const istMs = ts + (5 * 60 + 30) * 60 * 1000;
    const d = new Date(istMs);
    assert.strictEqual(d.getUTCDate(), 3, 'Day must be 3, not 9');
    assert.strictEqual(d.getUTCMonth() + 1, 9, 'Month must be 9 (September), not 3 (March)');
    assert.strictEqual(d.getUTCFullYear(), 2026, 'Year must be 2026');
    assert(formatted.startsWith('03/09/2026'), `Formatted string must start with 03/09/2026, got: ${formatted}`);
  });

  // TEST B: Input "03/09/2026, 12:50:06 pm" strictly parses as 3 September 2026
  test('Test B: Input "03/09/2026, 12:50:06 pm" strictly parses as 3 September 2026 at 12:50:06 PM', () => {
    const ts = db.parseAppDate('03/09/2026, 12:50:06 pm');
    const formatted = db.formatAppDate('03/09/2026, 12:50:06 pm');
    const istMs = ts + (5 * 60 + 30) * 60 * 1000;
    const d = new Date(istMs);
    assert.strictEqual(d.getUTCDate(), 3, 'Day must be 3');
    assert.strictEqual(d.getUTCMonth() + 1, 9, 'Month must be 9 (September)');
    assert.strictEqual(d.getUTCHours(), 12, 'Hour must be 12');
    assert.strictEqual(d.getUTCMinutes(), 50, 'Minute must be 50');
    assert.strictEqual(d.getUTCSeconds(), 6, 'Second must be 6');
    assert.strictEqual(formatted, '03/09/2026, 12:50:06 pm', `Must format as 03/09/2026, 12:50:06 pm, got ${formatted}`);
  });

  // TEST C: A ticket created today must calculate 0 days ago / just now
  test('Test C: Ticket created today calculates "Just now" or minutes ago, NOT days ago', () => {
    const baseTime = db.parseAppDate('03/09/2026, 12:50:06 pm');
    const rel20s = db.formatRelativeTime('03/09/2026, 12:50:06 pm', baseTime + 20 * 1000);
    assert.strictEqual(rel20s, 'Just now', `20s diff must be "Just now", got ${rel20s}`);
    
    const rel5m = db.formatRelativeTime('03/09/2026, 12:50:06 pm', baseTime + 5 * 60 * 1000);
    assert.strictEqual(rel5m, '5m ago', `5m diff must be "5m ago", got ${rel5m}`);

    const rel2h = db.formatRelativeTime('03/09/2026, 12:50:06 pm', baseTime + 2 * 3600 * 1000);
    assert.strictEqual(rel2h, '2h ago', `2h diff must be "2h ago", got ${rel2h}`);
  });

  // TEST D: A ticket created yesterday must calculate 1 day ago
  test('Test D: Ticket created yesterday calculates "1d ago"', () => {
    const todayTime = db.parseAppDate('03/09/2026, 12:50:06 pm');
    const yesterdayDate = '02/09/2026, 12:50:06 pm';
    const rel = db.formatRelativeTime(yesterdayDate, todayTime);
    assert.strictEqual(rel, '1d ago', `Yesterday diff must be "1d ago", got ${rel}`);
  });

  // TEST E: An existing historical ticket retains its correct original date
  test('Test E: Historical ticket (21/8/2026, 10:34:32 am) retains exact date and calculates ~13d ago', () => {
    const histStr = '21/8/2026, 10:34:32 am';
    const formatted = db.formatAppDate(histStr);
    assert.strictEqual(formatted, '21/08/2026, 10:34:32 am', `Must format as 21/08/2026, 10:34:32 am, got: ${formatted}`);
    const todayTime = db.parseAppDate('03/09/2026, 12:50:06 pm');
    const rel = db.formatRelativeTime(histStr, todayTime);
    assert.strictEqual(rel, '13d ago', `Historical ticket must be 13d ago from today, got: ${rel}`);
  });

  // TEST F: ISO timestamps must continue working correctly
  test('Test F: ISO 8601 timestamps parse accurately to matching IST format and relative age', () => {
    const isoString = '2026-09-03T07:20:06.000Z'; // 12:50:06 PM IST
    const formatted = db.formatAppDate(isoString);
    assert.strictEqual(formatted, '03/09/2026, 12:50:06 pm', `ISO string must format to 03/09/2026, 12:50:06 pm, got ${formatted}`);
    const todayTime = db.parseAppDate('03/09/2026, 12:50:26 pm');
    const rel = db.formatRelativeTime(isoString, todayTime);
    assert.strictEqual(rel, 'Just now', `20s after ISO must be Just now, got ${rel}`);
  });

  // TEST G: Sorting by newest/oldest strictly works
  test('Test G: Ticket list sorts chronologically from newest to oldest', () => {
    const tickets = [
      { ticketId: 'T1', createdDate: '21/8/2026, 10:34:32 am' },
      { ticketId: 'T2', createdDate: '03/09/2026, 12:50:06 pm' },
      { ticketId: 'T3', createdDate: '01/09/2026, 12:02:11 pm' },
      { ticketId: 'T4', createdDate: '02/09/2026, 04:20:18 pm' }
    ];

    tickets.sort((a, b) => db.parseAppDate(b.createdDate) - db.parseAppDate(a.createdDate));
    const sortedIds = tickets.map(t => t.ticketId);
    assert.deepStrictEqual(sortedIds, ['T2', 'T4', 'T3', 'T1'], `Order must be newest to oldest, got: ${sortedIds.join(', ')}`);
  });

  // TEST H: Specific Live Bug Ticket HTL-TVR-00702 Test
  await testAsync('Test H: Specific Live Bug Ticket HTL-TVR-00702 resolves to September 3, 2026 and NOT 178d ago', async () => {
    const canonicalTickets = await db.getCanonicalActiveTickets();
    const t = canonicalTickets.find(x => x.ticketId === 'HTL-TVR-00702');
    assert(t, 'HTL-TVR-00702 must exist in canonical active tickets');
    
    const formatted = db.formatAppDate(t.createdDate || t.createdAt);
    assert(formatted.startsWith('03/09/2026'), `HTL-TVR-00702 must display as 03/09/2026, got: ${formatted}`);
    
    const relTime = db.formatRelativeTime(t.createdDate || t.createdAt);
    assert(!relTime.includes('178d'), `Relative time must NOT contain 178d! Got: ${relTime}`);
    assert(!relTime.includes('d ago'), `Ticket created today must not have 'd ago'! Got: ${relTime}`);
    console.log(`   -> HTL-TVR-00702 Display: "${formatted}" | Relative Time: "${relTime}"`);
  });

  // TEST I: Parity across API response, SSR markup, and Database
  await testAsync('Test I: Timestamp consistency across API, SSR, and database representation', async () => {
    const canonicalTickets = await db.getCanonicalActiveTickets();
    const t = canonicalTickets.find(x => x.ticketId === 'HTL-TVR-00702');
    const dbFormatted = db.formatAppDate(t.createdDate || t.createdAt);

    // Test SSR markup generation
    const ssrHtml = server.getITSMWorkbenchHtml([t]);
    assert(ssrHtml.includes(dbFormatted), `SSR HTML must include formatted date "${dbFormatted}"`);
    assert(!ssrHtml.includes('178d ago'), 'SSR HTML must NOT contain "178d ago"');
  });

  // TEST J: Inverted US-locale legacy format (09/03/2026) is safely normalized
  test('Test J: Inverted US-locale September string (09/03/2026, 12:50:06 pm) resolves to September 3, 2026', () => {
    const invertedStr = '09/03/2026, 12:50:06 pm';
    const formatted = db.formatAppDate(invertedStr);
    assert.strictEqual(formatted, '03/09/2026, 12:50:06 pm', `Inverted 09/03/2026 must format to 03/09/2026, got: ${formatted}`);
    const rel = db.formatRelativeTime(invertedStr, db.parseAppDate('03/09/2026, 12:52:00 pm'));
    assert.strictEqual(rel, '1m ago', `Relative time for inverted string must be 1m ago, got: ${rel}`);
  });

  console.log('\n====================================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDateTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
