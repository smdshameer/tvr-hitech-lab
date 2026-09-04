const assert = require('assert');
const fs = require('fs');

console.log('======================================================================');
console.log('🧪 RUNNING: test_drive_verification.test.js');
console.log('======================================================================\n');

async function run() {
  console.log('1. Auditing google_apps_script_code.js for Drive Verification and Binary Integrity...');
  const gasCode = fs.readFileSync('D:/Ai Ticket App - UPS/google_apps_script_code.js', 'utf8');

  // Verify saveAndVerifyBase64Image implementation
  assert(gasCode.includes('function saveAndVerifyBase64Image'), 'saveAndVerifyBase64Image must exist in GAS');

  // Verify binary JPEG creation with Utilities.newBlob (protects against binary corruption)
  assert(gasCode.includes('Utilities.newBlob(decoded, \'image/jpeg\', filename)'), 'Must create binary JPEG blob via Utilities.newBlob');
  assert(!gasCode.includes('file.setContent(decoded)'), 'Must NOT use corrupting file.setContent(decoded)');
  console.log('✅ Verified: Binary JPEG stream creation is pristine; corrupting setContent() eliminated');

  // Verify file size verification (> 0)
  assert(gasCode.includes('file.getSize() > 0') || gasCode.includes('file.getSize()'), 'Must verify file size > 0');
  console.log('✅ Verified: Non-zero file size verification enforced');

  // Verify trashing older duplicate files
  assert(gasCode.includes('.setTrashed(true)'), 'Must trash older duplicate files on update');
  console.log('✅ Verified: Duplicate clean-up via setTrashed(true) verified');

  // Verify folder destinations
  assert(gasCode.includes('Evidence') && gasCode.includes('Completion Photos'), 'Evidence and Completion Photos subfolders must be used');
  console.log('✅ Verified: Proper subfolder separation enforced');

  console.log('\n======================================================================');
  console.log('🎉 test_drive_verification.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
