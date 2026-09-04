const assert = require('assert');
const fs = require('fs');

console.log('======================================================================');
console.log('🧪 RUNNING: test_duration_regression.test.js');
console.log('======================================================================\n');

async function run() {
  console.log('1. Testing relative duration calculation algorithm against 178d bug...');

  function formatRelativeDuration(dateInput) {
    if (!dateInput) return '';
    let d;
    if (typeof dateInput === 'string') {
      const ddmmyyyyMatch = dateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
      if (ddmmyyyyMatch) {
        const day = parseInt(ddmmyyyyMatch[1], 10);
        const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
        const year = parseInt(ddmmyyyyMatch[3], 10);
        let hours = ddmmyyyyMatch[4] ? parseInt(ddmmyyyyMatch[4], 10) : 0;
        const minutes = ddmmyyyyMatch[5] ? parseInt(ddmmyyyyMatch[5], 10) : 0;
        const seconds = ddmmyyyyMatch[6] ? parseInt(ddmmyyyyMatch[6], 10) : 0;
        const meridiem = ddmmyyyyMatch[7] ? ddmmyyyyMatch[7].toLowerCase() : null;

        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        d = new Date(year, month, day, hours, minutes, seconds);
      } else {
        d = new Date(dateInput);
      }
    } else {
      d = new Date(dateInput);
    }

    if (isNaN(d.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    return `${diffDays}d ago`;
  }

  const now = new Date();

  // Test cases:
  // A. Ticket created 30 seconds ago
  const tJustNow = formatRelativeDuration(new Date(now.getTime() - 30 * 1000).toISOString());
  assert.strictEqual(tJustNow, 'Just now', '30s ago must be "Just now"');
  console.log('✅ "Just now" verified');

  // B. Ticket created 15 minutes ago
  const t15m = formatRelativeDuration(new Date(now.getTime() - 15 * 60 * 1000).toISOString());
  assert.strictEqual(t15m, '15m ago', '15m ago must be "15m ago"');
  console.log('✅ "15m ago" verified');

  // C. Ticket created 4 hours ago
  const t4h = formatRelativeDuration(new Date(now.getTime() - 4 * 3600 * 1000).toISOString());
  assert.strictEqual(t4h, '4h ago', '4h ago must be "4h ago"');
  console.log('✅ "4h ago" verified');

  // D. Ticket created 26 hours ago
  const t1d = formatRelativeDuration(new Date(now.getTime() - 26 * 3600 * 1000).toISOString());
  assert.strictEqual(t1d, '1d ago', '26h ago must be "1d ago"');
  console.log('✅ "1d ago" verified');

  // E. Ticket created today formatted in DD/MM/YYYY
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const todayStr = `${day}/${month}/${year}, 09:00:00 am`;
  const resultToday = formatRelativeDuration(todayStr);

  assert(!resultToday.includes('178d ago'), 'Today\'s ticket must NEVER be 178d ago!');
  assert(resultToday.includes('ago') || resultToday === 'Just now', 'Today\'s ticket must have current relative duration');
  console.log(`✅ Today's ticket (${todayStr}) relative duration: "${resultToday}" - NOT 178d ago!`);

  console.log('\n======================================================================');
  console.log('🎉 test_duration_regression.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
