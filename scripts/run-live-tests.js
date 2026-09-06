#!/usr/bin/env node
/**
 * run-live-tests.js — EXPLICIT OPT-IN runner for production-mutating tests.
 *
 * Sets PRODUCTION_TESTS=1 and spawns the live suites. Cross-platform
 * (no shell-specific `VAR=1` prefix, no new dependencies).
 *
 * WARNING: the spawned suites POST to a local server that forwards to the
 * PRODUCTION Google Apps Script endpoint — real Drive folders/files and
 * Sheets rows are created. Run deliberately, never in CI-by-default.
 * Orphan artifacts must be purged manually by the owner. NEVER delete
 * anything automatically. This runner creates no probes by itself; the
 * suites create their own synthetic tickets (HTL-TVR-99999-*, HTL-NGP-*).
 *
 * This file must never contain secrets, cookies, tokens, or credentials.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITES = [
  'test_comprehensive_e2e.js',
  'tests/remarks-data-flow.test.js',
  'tests/two-slot-evidence-persistence.test.js',
  'tests/complete-evidence-persistence-lifecycle.test.js',
  'tests/hm-report-google-drive-persistence.test.js',
];

console.log('=== LIVE INTEGRATION TESTS (explicit opt-in) ===');
console.log('PRODUCTION_TESTS=1 — suites WILL write to production Drive/Sheets.');
console.log('Suites: ' + SUITES.join(', '));

let failed = 0;
for (const s of SUITES) {
  console.log('\n--- ' + s + ' ---');
  const r = spawnSync(process.execPath, [path.join(ROOT, s)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PRODUCTION_TESTS: '1' },
    timeout: 600000,
  });
  if (r.status !== 0) {
    failed++;
    console.error(`LIVE SUITE FAILED: ${s} (exit ${r.status})`);
  }
}
console.log(failed ? `\nLIVE RESULT: FAIL (${failed} suite(s))` : '\nLIVE RESULT: PASS');
console.log('Reminder: purge synthetic-ticket Drive/Sheets artifacts manually. No auto-cleanup was performed.');
process.exit(failed ? 1 : 0);
