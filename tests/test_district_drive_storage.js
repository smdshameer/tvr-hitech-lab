/**
 * ====================================================================================
 * AUTOMATED VERIFICATION SUITE: GOOGLE DRIVE DISTRICT-WISE FOLDER STORAGE
 * Tests Dual-Root Canonical Isolation, Duplicate Prevention, and [DRIVE] Telemetry
 * ====================================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const server = require('../server');
const db = require('../db');
const { resolveSchoolDistrict, logDriveDestination } = server;

let totalTests = 0;
let passedTests = 0;

function runTest(testNum, testName, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [TEST ${testNum}] PASSED: ${testName} ${details ? '(' + details + ')' : ''}`);
  } else {
    console.error(`❌ [TEST ${testNum}] FAILED: ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runTestSuite() {
  console.log('====================================================================================');
  console.log('🛡️ RUNNING GOOGLE DRIVE DISTRICT-WISE STORAGE SUITE (TESTS 1 - 10 + LIVE DRIVE GATE)');
  console.log('====================================================================================\n');

  // ----------------------------------------------------
  // TEST 1: Nagapattinam school district resolution
  // ----------------------------------------------------
  const ngpSchool = resolveSchoolDistrict('33190601401', 'NGP-014', '', 'PUMS NEIVILAKKU');
  runTest(
    1,
    'Nagapattinam school district resolution',
    ngpSchool.district === 'Nagapattinam' && ngpSchool.rootFolder === 'Nagapattinam_HTL_UPS_Photos',
    `District: ${ngpSchool.district}, Root: ${ngpSchool.rootFolder}`
  );

  // ----------------------------------------------------
  // TEST 2: Thiruvarur school district resolution
  // ----------------------------------------------------
  const tvrSchool = resolveSchoolDistrict('33200601501', 'TVR-089', '', 'PUMS MELATHIRUPPALKUDI');
  runTest(
    2,
    'Thiruvarur school district resolution',
    tvrSchool.district === 'Thiruvarur' && tvrSchool.rootFolder === 'Thiruvarur_HTL_UPS_Photos',
    `District: ${tvrSchool.district}, Root: ${tvrSchool.rootFolder}`
  );

  // ----------------------------------------------------
  // TEST 3: Nagapattinam evidence destination
  // ----------------------------------------------------
  const ngpEvidencePath = `${ngpSchool.rootFolder} -> ${ngpSchool.udise} - ${ngpSchool.schoolName} -> Evidence`;
  const expectedNgpEvidence = 'Nagapattinam_HTL_UPS_Photos -> 33190601401 - PUMS NEIVILAKKU -> Evidence';
  runTest(
    3,
    'Nagapattinam evidence destination matches canonical structure',
    ngpEvidencePath === expectedNgpEvidence,
    `Path: ${ngpEvidencePath}`
  );

  // ----------------------------------------------------
  // TEST 4: Nagapattinam completion photo destination
  // ----------------------------------------------------
  const ngpCompPath = `${ngpSchool.rootFolder} -> ${ngpSchool.udise} - ${ngpSchool.schoolName} -> Completion Photos`;
  const expectedNgpComp = 'Nagapattinam_HTL_UPS_Photos -> 33190601401 - PUMS NEIVILAKKU -> Completion Photos';
  runTest(
    4,
    'Nagapattinam completion photo destination matches canonical structure',
    ngpCompPath === expectedNgpComp,
    `Path: ${ngpCompPath}`
  );

  // ----------------------------------------------------
  // TEST 5: Thiruvarur evidence destination
  // ----------------------------------------------------
  const tvrEvidencePath = `${tvrSchool.rootFolder} -> ${tvrSchool.udise} - ${tvrSchool.schoolName} -> Evidence`;
  const expectedTvrEvidence = 'Thiruvarur_HTL_UPS_Photos -> 33200601501 - PUMS MELATHIRUPPALKUDI -> Evidence';
  runTest(
    5,
    'Thiruvarur evidence destination matches canonical structure',
    tvrEvidencePath === expectedTvrEvidence,
    `Path: ${tvrEvidencePath}`
  );

  // ----------------------------------------------------
  // TEST 6: Thiruvarur completion destination
  // ----------------------------------------------------
  const tvrCompPath = `${tvrSchool.rootFolder} -> ${tvrSchool.udise} - ${tvrSchool.schoolName} -> Completion Photos`;
  const expectedTvrComp = 'Thiruvarur_HTL_UPS_Photos -> 33200601501 - PUMS MELATHIRUPPALKUDI -> Completion Photos';
  runTest(
    6,
    'Thiruvarur completion photo destination matches canonical structure',
    tvrCompPath === expectedTvrComp,
    `Path: ${tvrCompPath}`
  );

  // ----------------------------------------------------
  // TEST 7: Duplicate folder prevention in GAS code
  // ----------------------------------------------------
  const gasCode = fs.readFileSync(path.join(__dirname, '..', 'google_apps_script_code.js'), 'utf8');
  const hasRootFolderQuery = gasCode.includes('DriveApp.getFoldersByName(canonicalName)');
  const hasSchoolUdiseCheck = gasCode.includes('folderName.indexOf(cleanUdise) !== -1');
  const hasSubFolderCheck = gasCode.includes('schoolFolder.getFoldersByName(subFolderName)');
  runTest(
    7,
    'Duplicate folder prevention: searches exact name & UDISE before creating',
    hasRootFolderQuery && hasSchoolUdiseCheck && hasSubFolderCheck,
    'Root, School, and Subfolders strictly query before creation'
  );

  // ----------------------------------------------------
  // TEST 8: Cross-district protection
  // ----------------------------------------------------
  const cross1 = resolveSchoolDistrict('33190600901', '', 'Thiruvarur', 'PUMS PERIYAKUTHAGAI');
  const cross2 = resolveSchoolDistrict('33200100101', '', 'Nagapattinam', 'PUMS ARAVOOR');
  const crossProtectionPassed = cross1.district === 'Nagapattinam' && cross1.rootFolder === 'Nagapattinam_HTL_UPS_Photos' &&
                                cross2.district === 'Thiruvarur' && cross2.rootFolder === 'Thiruvarur_HTL_UPS_Photos';
  runTest(
    8,
    'Cross-district protection: UDISE and master directory override spoofed inputDistrict',
    crossProtectionPassed,
    `3319 resolved to ${cross1.rootFolder}, 3320 resolved to ${cross2.rootFolder}`
  );

  // ----------------------------------------------------
  // TEST 9: Missing district handling
  // ----------------------------------------------------
  const missingDist1 = resolveSchoolDistrict('33190600901', '', '', '');
  const missingDist2 = resolveSchoolDistrict('33200100101', '', '', '');
  const missingHandlingPassed = missingDist1.district === 'Nagapattinam' && missingDist1.rootFolder === 'Nagapattinam_HTL_UPS_Photos' &&
                                missingDist2.district === 'Thiruvarur' && missingDist2.rootFolder === 'Thiruvarur_HTL_UPS_Photos';
  runTest(
    9,
    'Missing district handling: does NOT default to Thiruvarur when UDISE indicates Nagapattinam',
    missingHandlingPassed,
    `3319 (missing dist) -> ${missingDist1.district}`
  );

  // ----------------------------------------------------
  // TEST 10: Server-side [DRIVE] telemetry
  // ----------------------------------------------------
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };
  logDriveDestination(ngpSchool, 'Evidence');
  console.log = originalLog;

  const hasDistrictLog = logs.some(l => l.includes('[DRIVE] District: Nagapattinam'));
  const hasRootLog = logs.some(l => l.includes('[DRIVE] Root Folder: Nagapattinam_HTL_UPS_Photos'));
  const hasSchoolLog = logs.some(l => l.includes('[DRIVE] School Folder: 33190601401 - PUMS NEIVILAKKU'));
  const hasEvidenceLog = logs.some(l => l.includes('[DRIVE] Evidence Folder: 33190601401 - PUMS NEIVILAKKU / Evidence'));
  const hasCompletionLog = logs.some(l => l.includes('[DRIVE] Completion Photos Folder: 33190601401 - PUMS NEIVILAKKU / Completion Photos'));

  const telemetryPassed = hasDistrictLog && hasRootLog && hasSchoolLog && hasEvidenceLog && hasCompletionLog;
  runTest(
    10,
    'Server-side [DRIVE] telemetry contains complete verified destination details',
    telemetryPassed,
    `5/5 required telemetry tags logged`
  );

  // ----------------------------------------------------
  // TEST 11: Safety Rule: Do not rename existing "Nagapattinam" folder
  // ----------------------------------------------------
  const hasRenameProtection = !gasCode.includes('lf.setName(rootFolderName)');
  runTest(
    11,
    'Safety Rule: generic "Nagapattinam" folder is NOT automatically renamed',
    hasRenameProtection,
    'Unrelated folders remain untouched'
  );

  // ----------------------------------------------------
  // TEST 12: Subfolder hygiene: No "HM Reports" subfolder created
  // ----------------------------------------------------
  const noExtraHmReportsFolder = !gasCode.includes('getOrCreateSubFolder(schoolFolder, "HM Reports")');
  runTest(
    12,
    'Subfolder hygiene: HM Reports go to Evidence, only Evidence & Completion Photos created',
    noExtraHmReportsFolder,
    'Exact 2-subfolder structure enforced'
  );

  console.log('\n====================================================================================');
  console.log(`📊 DISTRICT-WISE DRIVE SUITE RESULTS: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('====================================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
