const assert = require('assert');
const db = require('../db.js');
const server = require('../server.js');

console.log('🧪 RUNNING: tests/test_date_and_relative_duration.test.js\n');

// 1. Boundary & Exact Relative Duration Tests
const refTimestamp = db.parseAppDate('03/09/2026, 03:30:00 pm');
assert.ok(refTimestamp > 0, 'Reference timestamp must be valid');

// Rule: < 60 seconds = "Just now"
assert.strictEqual(db.formatRelativeTime('03/09/2026, 03:29:45 pm', refTimestamp), 'Just now');
assert.strictEqual(db.formatRelativeTime('03/09/2026, 03:29:01 pm', refTimestamp), 'Just now');
assert.strictEqual(server.formatRelativeTime('03/09/2026, 03:29:45 pm', refTimestamp), 'Just now');

// Rule: 60 seconds to < 60 minutes = "Xm ago"
assert.strictEqual(db.formatRelativeTime('03/09/2026, 03:25:00 pm', refTimestamp), '5m ago');
assert.strictEqual(db.formatRelativeTime('03/09/2026, 02:37:00 pm', refTimestamp), '53m ago');
assert.strictEqual(server.formatRelativeTime('03/09/2026, 02:37:00 pm', refTimestamp), '53m ago');

// Rule: 60 minutes to < 24 hours = "Xh ago"
assert.strictEqual(db.formatRelativeTime('03/09/2026, 01:30:00 pm', refTimestamp), '2h ago');
assert.strictEqual(db.formatRelativeTime('03/09/2026, 12:50:06 pm', refTimestamp), '2h ago');
assert.strictEqual(server.formatRelativeTime('03/09/2026, 01:30:00 pm', refTimestamp), '2h ago');

// Rule: 24 hours to < 48 hours = "1d ago"
assert.strictEqual(db.formatRelativeTime('02/09/2026, 01:30:00 pm', refTimestamp), '1d ago');
assert.strictEqual(server.formatRelativeTime('02/09/2026, 01:30:00 pm', refTimestamp), '1d ago');

// Rule: 48 hours or more = "Xd ago"
assert.strictEqual(db.formatRelativeTime('01/09/2026, 01:30:00 pm', refTimestamp), '2d ago');
assert.strictEqual(server.formatRelativeTime('01/09/2026, 01:30:00 pm', refTimestamp), '2d ago');
assert.strictEqual(db.formatRelativeTime('21/08/2026, 02:00:00 pm', refTimestamp), '13d ago');

// 2. Format parsing support: DD/MM/YYYY and ISO timestamps
const dateDdmmyyyy = '03/09/2026, 12:50:06 pm';
const dateIso = '2026-09-03T07:20:06.000Z';
const dateIsoOffset = '2026-09-03T12:50:06+05:30';

const epochDdmmyyyy = db.parseAppDate(dateDdmmyyyy);
const epochIso = db.parseAppDate(dateIso);
const epochIsoOffset = db.parseAppDate(dateIsoOffset);

assert.strictEqual(epochDdmmyyyy, epochIso, 'DD/MM/YYYY and UTC ISO must resolve to identical epoch ms');
assert.strictEqual(epochDdmmyyyy, epochIsoOffset, 'DD/MM/YYYY and IST ISO must resolve to identical epoch ms');

// 3. Inverted US-locale support (e.g. 09/03/2026 where 9 is September and 3 is day)
const dateInverted = '09/03/2026, 12:50:06 pm';
const epochInverted = db.parseAppDate(dateInverted);
assert.strictEqual(epochDdmmyyyy, epochInverted, '09/03/2026 September tickets must normalize to 3 September 2026');

// 4. Critical Regression: 03/09/2026 must NEVER produce 178d ago
const relFromFixedNow = db.formatRelativeTime(dateDdmmyyyy, refTimestamp);
assert.ok(!relFromFixedNow.includes('178d'), 'Relative duration must NOT be 178d ago');
assert.strictEqual(relFromFixedNow, '2h ago');

// 5. Verification on simulated UTC / Vercel container environment
const originalTz = process.env.TZ;
try {
  process.env.TZ = 'UTC';
  const utcNow = db.parseAppDate('2026-09-03T10:00:00.000Z');
  const relUtc = db.formatRelativeTime('03/09/2026, 12:50:06 pm', utcNow);
  assert.strictEqual(relUtc, '2h ago', 'Relative duration must be 2h ago even when TZ=UTC');
} finally {
  if (originalTz) process.env.TZ = originalTz;
  else delete process.env.TZ;
}

// 6. Verification of Client-side script inside getITSMWorkbenchHtml
const clientHtml = server.getITSMWorkbenchHtml([]);
assert.ok(clientHtml.includes('function parseAppDate(input)'), 'Client script must contain parseAppDate');
assert.ok(clientHtml.includes('function formatRelativeTime(input, fromTime)'), 'Client script must contain formatRelativeTime');
assert.ok(!clientHtml.includes('/^(d{1,2})'), 'Client script must NOT contain corrupted /^(d{1,2})');
assert.ok(!clientHtml.includes('/^d{4}-d{2}-d{2}/'), 'Client script must NOT contain corrupted /^d{4}-');

console.log('✅ ALL DATE AND RELATIVE DURATION TESTS PASSED!\n');
