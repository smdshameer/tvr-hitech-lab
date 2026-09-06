'use strict';
/**
 * production-gate.js — fail-closed opt-in gate for production-mutating tests.
 *
 * Normal `npm test` MUST NEVER write to production (Drive, Sheets, tickets).
 * Any test path that POSTs to a live server (which forwards to the production
 * Google Apps Script endpoint) must consult this gate FIRST:
 *
 *   const gate = require('./production-gate.js');   // tests/ dir
 *   if (!gate.productionTestsEnabled()) {
 *     // record SKIP, do NOT perform the live POST
 *   } else {
 *     gate.assertLiveAllowed('<ticket-id>');        // backstop, throws when off
 *     // ... live POST ...
 *   }
 *
 * Enabling: PRODUCTION_TESTS=1 (exact string). Anything else — unset, empty,
 * 'true', 'yes' — means DISABLED. The gate fails closed by design.
 * Explicit opt-in runner: `npm run test:live` (sets the variable, spawns the
 * live suites cross-platform). NEVER enable by default. NEVER commit it.
 *
 * This file must never contain secrets, cookies, tokens, or credentials.
 */

function productionTestsEnabled() {
  return process.env.PRODUCTION_TESTS === '1';
}

// Synthetic/test ticket-ID patterns that must never reach production
// unless the gate is explicitly enabled.
const SYNTHETIC_PATTERNS = [
  /HTL-TVR-99999/i,
  /HTL-TVR-09999/i,
  /HTL-TVR-0951/i,
  /HTL-NGP-\d{5}/,
  /HTL-TEST/i,
  /TVR-TEST/i,
  /33200399999/,
  /AUTOMATED AUDIT LAB/i,
];

function looksSynthetic(ticketId, schoolName) {
  const hay = String(ticketId || '') + ' ' + String(schoolName || '');
  return SYNTHETIC_PATTERNS.some((re) => re.test(hay));
}

// Backstop: throws when a live production-mutating call is attempted
// without the explicit gate. Call immediately before any live POST.
function assertLiveAllowed(label) {
  if (!productionTestsEnabled()) {
    throw new Error(
      'BLOCKED: production-mutating test "' + label + '" requires PRODUCTION_TESTS=1. ' +
      'Run `npm run test:live` to opt in explicitly. Refusing to touch production.'
    );
  }
}

// Combined guard for synthetic IDs: throws when a synthetic-looking ticket
// would be submitted without the gate, even if the caller forgot the check.
function assertSyntheticSafe(ticketId, schoolName) {
  if (!productionTestsEnabled() && looksSynthetic(ticketId, schoolName)) {
    throw new Error(
      'BLOCKED: synthetic ticket "' + ticketId + '" must not reach production ' +
      'without PRODUCTION_TESTS=1. Refusing to submit.'
    );
  }
}

function skipMessage(label) {
  return '⏭️ SKIP ' + label + ' — production-mutating path disabled ' +
    '(set PRODUCTION_TESTS=1 via `npm run test:live` to opt in; no Drive/Sheets writes made)';
}

module.exports = {
  productionTestsEnabled,
  assertLiveAllowed,
  assertSyntheticSafe,
  looksSynthetic,
  skipMessage,
};
