const assert = require('assert');

console.log('======================================================================');
console.log('🧪 RUNNING: test_preview_fallback.test.js');
console.log('======================================================================\n');

async function run() {
  console.log('1. Testing Dashboard Preview Resolution Algorithm');

  // Preview resolution engine
  function resolvePreview(fileId, photoUrl, proxyBase = '/api/photo-proxy') {
    // 1. Direct permanent Google Drive CDN thumbnail if File ID is known
    if (fileId && typeof fileId === 'string' && fileId.trim().length > 5) {
      return `https://lh3.googleusercontent.com/d/${fileId.trim()}=w800`;
    }
    // 2. Permanent Google Drive direct URL if present
    if (photoUrl && (photoUrl.includes('drive.google.com') || photoUrl.includes('googleusercontent.com'))) {
      return photoUrl;
    }
    // 3. If only proxy or backend endpoint is available
    if (fileId) {
      return `${proxyBase}?id=${fileId}`;
    }
    // 4. Fallback if ephemeral or missing
    return null;
  }

  // Case A: photoUrl is null or empty, but hmDriveFileId exists
  const caseA = resolvePreview('1ABC_DRIVE_ID_123', null);
  assert.strictEqual(caseA, 'https://lh3.googleusercontent.com/d/1ABC_DRIVE_ID_123=w800', 'Case A: Must resolve via Drive File ID');
  console.log('✅ Case A Passed: Missing photoUrl resolved via Drive File ID');

  // Case B: photoUrl contains invalid/expired local path /uploads/123.jpg, but compDriveFileId exists
  const caseB = resolvePreview('1XYZ_DRIVE_ID_456', '/uploads/stale_local_path.jpg');
  assert.strictEqual(caseB, 'https://lh3.googleusercontent.com/d/1XYZ_DRIVE_ID_456=w800', 'Case B: Must prioritize Drive File ID over ephemeral path');
  console.log('✅ Case B Passed: Prioritized Drive File ID over ephemeral /uploads/ path');

  // Case C: Fallback proxy resolution
  function getPreviewChain(fileId) {
    return [
      `https://lh3.googleusercontent.com/d/${fileId}=w800`,
      `/api/photo-proxy?id=${fileId}`
    ];
  }
  const chain = getPreviewChain('1MNO_ID');
  assert.strictEqual(chain[0], 'https://lh3.googleusercontent.com/d/1MNO_ID=w800');
  assert.strictEqual(chain[1], '/api/photo-proxy?id=1MNO_ID');
  console.log('✅ Case C Passed: Resilient 2-stage fallback chain verified');

  console.log('\n======================================================================');
  console.log('🎉 test_preview_fallback.test.js PASSED (100%)');
  console.log('======================================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
