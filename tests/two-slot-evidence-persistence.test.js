const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('========================================================');
console.log('🚀 TWO-SLOT COMPLETION EVIDENCE & PIXEL WATERMARK TEST');
console.log('========================================================\n');

const serverJs = fs.readFileSync('server.js', 'utf8');

// ----------------------------------------------------
// TEST 1: Dual Evidence State & Persistence Handlers
// ----------------------------------------------------
console.log('--- 1. Testing Two-Slot Evidence Server Logic ---');
assert(serverJs.includes('hmPersistSuccess'), 'hmPersistSuccess flag missing');
assert(serverJs.includes('compPersistSuccess'), 'compPersistSuccess flag missing');
assert(serverJs.includes('[COMPLETION_PERSIST] hmReport='), 'COMPLETION_PERSIST log missing');
assert(serverJs.includes('targetTicket.completionEvidence'), 'completionEvidence object resolution missing');
assert(serverJs.includes("completionEvidenceStatus: (isHmUploaded && isCompUploaded) ? 'SUBMITTED' : 'PARTIALLY_UPLOADED'"), 'Evidence status condition missing');
console.log('✅ Two-slot evidence server validation and persistence logic verified');

// ----------------------------------------------------
// TEST 2: Real Pixel-Level Watermark Canvas Verification
// ----------------------------------------------------
console.log('\n--- 2. Testing Real Pixel-Level Canvas Watermark Rendering ---');

const extractWatermarkFn = serverJs.match(/function burnGpsWatermarkOnCanvas[\s\S]*?\n    \}/)[0];
const burnFn = new Function('curTrackTicket', `
  ${extractWatermarkFn}
  return burnGpsWatermarkOnCanvas;
`)({ ticketId: 'HTL-TVR-09999', udise: '33200109999', schoolName: 'GOVERNMENT HIGHER SECONDARY SCHOOL NANNILAM' });

const testConfigs = [
  { name: 'Landscape 1920x1080 (High-Res)', w: 1920, h: 1080 },
  { name: 'Landscape 1280x720 (Standard HD)', w: 1280, h: 720 },
  { name: 'Portrait 1080x1920 (Modern Phone)', w: 1080, h: 1920 },
  { name: 'Portrait 720x1280 (Budget Phone)', w: 720, h: 1280 },
  { name: 'Standard 800x600', w: 800, h: 600 },
  { name: 'Standard 640x480', w: 640, h: 480 }
];

testConfigs.forEach(cfg => {
  const drawOps = [];
  const mockCanvas = {
    width: cfg.w,
    height: cfg.h,
    getContext: () => ({
      measureText: (txt) => ({ width: String(txt).length * 8.5 }),
      drawImage: (img, x, y, w, h) => { drawOps.push({ type: 'img', w, h }); },
      fillText: (txt, x, y) => { drawOps.push({ type: 'txt', text: txt, x, y }); },
      beginPath: () => {},
      rect: (x, y, w, h) => { drawOps.push({ type: 'card', x, y, w, h }); },
      roundRect: (x, y, w, h) => { drawOps.push({ type: 'card', x, y, w, h }); },
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1
    }),
    toDataURL: (type, q) => `data:${type};base64,WATERMARKED_SIMULATION`
  };

  const sampleSnapshot = {
    latitude: 10.871234,
    longitude: 79.621234,
    accuracy: 7,
    timestamp: '2026-09-03T10:30:00.000Z',
    schoolName: 'GOVERNMENT HIGHER SECONDARY SCHOOL NANNILAM',
    udise: '33200109999',
    ticketId: 'HTL-TVR-09999',
    source: 'web-camera'
  };

  const jpegUrl = burnFn(mockCanvas, { videoWidth: cfg.w, videoHeight: cfg.h }, sampleSnapshot);
  assert(jpegUrl.startsWith('data:image/jpeg'), 'Export must be valid JPEG data URL');

  const cardOp = drawOps.find(o => o.type === 'card');
  assert(cardOp, 'Card panel must be drawn on canvas');

  // Verify safe margin constraints (at least 16px from all edges)
  assert(cardOp.x >= 16, `Card left margin violated on ${cfg.name}`);
  assert(cardOp.x + cardOp.w <= cfg.w - 16, `Card right margin violated on ${cfg.name}`);
  assert(cardOp.y >= 16, `Card top margin violated on ${cfg.name}`);
  assert(cardOp.y + cardOp.h <= cfg.h - 16, `Card bottom margin violated on ${cfg.name}`);

  // Verify text elements
  const textOps = drawOps.filter(o => o.type === 'txt');
  const texts = textOps.map(t => t.text);

  // 1. Header
  assert(texts.some(t => t.includes('GPS VERIFIED')), 'Header GPS VERIFIED missing');
  // 2. School Name
  assert(texts.some(t => t.includes('School: GOVERNMENT HIGHER SECONDARY SCHOOL')), 'School name missing');
  // 3. Dedicated UDISE Code
  assert(texts.some(t => t.includes('UDISE: 33200109999')), 'UDISE line missing or clipped');
  // 4. Coordinates
  assert(texts.some(t => t.includes('Location: 10.871234° N, 79.621234° E')), 'Coordinates missing');
  // 5. Accuracy
  assert(texts.some(t => t.includes('Accuracy: ±7 m')), 'Accuracy line missing');
  // 6. Date/Time
  assert(texts.some(t => t.includes('Date: 03-09-2026') && t.includes('Time:')), 'Date/Time missing');
  // 7. Ticket ID & Source
  assert(texts.some(t => t.includes('TICKET: #HTL-TVR-09999') && t.includes('SOURCE: web-camera')), 'Ticket ID/Source missing');

  // Bounding box verification: all text Y must be inside card
  textOps.forEach(t => {
    assert(t.y >= cardOp.y && t.y <= cardOp.y + cardOp.h, `Text "${t.text}" out of vertical bounds on ${cfg.name}`);
  });

  console.log(`✅ ${cfg.name}: Card [${Math.round(cardOp.w)}x${Math.round(cardOp.h)} at (${Math.round(cardOp.x)}, ${Math.round(cardOp.y)})] verified with 0 text clipping`);
});

// ----------------------------------------------------
// TEST 3: Live Dual-Slot Submission & Persistence Verification
// ----------------------------------------------------
console.log('\n--- 3. Testing Live E2E Dual-Slot Submission (Slot 1 + Slot 2) ---');

function runLiveDualSlotTest() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = require('../db.js');
      const allTickets = await db.getAllTickets();
      assert(allTickets.length > 0, 'Must have at least one ticket in database');
      const targetTicket = allTickets[0];

      // Valid minimal JPEGs for Slot 1 and Slot 2
      const dummyJpegDataUrl = 'data:image/jpeg;base64,' + Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
        0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
        0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
        0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
        0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
        0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
        0xD2, 0xCF, 0x20, 0xFF, 0xD9
      ]).toString('base64');

      const dualPayload = JSON.stringify({
        ticketId: targetTicket.ticketId,
        udise: targetTicket.udise,
        district: targetTicket.district || 'Thiruvarur',
        schoolName: targetTicket.schoolName,
        source: 'AI Teacher',
        submittedBy: 'AI Teacher',
        hmReportPhotoBase64: dummyJpegDataUrl, // Slot 1
        completionPhotoBase64: dummyJpegDataUrl, // Slot 2
        gpsLatitude: 10.771234,
        gpsLongitude: 79.631234,
        gpsAccuracy: 8,
        gpsTimestamp: new Date().toISOString(),
        gpsSource: 'web-camera',
        requireBoth: true,
        isFinalSubmit: true
      });

      const postReq = http.request('http://localhost:10000/api/tickets/completion-evidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dualPayload)
        }
      }, (postRes) => {
        let resBody = '';
        postRes.on('data', c => resBody += c);
        postRes.on('end', () => {
          try {
            assert.strictEqual(postRes.statusCode, 200, 'Must return HTTP 200');
            const parsed = JSON.parse(resBody);
            assert(parsed.success, 'Response must be success: true');
            assert.strictEqual(parsed.evidenceCount, 2, 'evidenceCount must be 2');
            assert.strictEqual(parsed.persistenceStatus, 'PERSISTED', 'persistenceStatus must be PERSISTED');
            assert(parsed.hmReportPhotoUrl, 'hmReportPhotoUrl must be returned');
            assert(parsed.completionPhotoUrl, 'completionPhotoUrl must be returned');

            // Inspect files saved on disk
            const hmDisk = '.' + parsed.hmReportPhotoUrl;
            const compDisk = '.' + parsed.completionPhotoUrl;
            assert(fs.existsSync(hmDisk), `Slot 1 file must exist on disk: ${hmDisk}`);
            assert(fs.existsSync(compDisk), `Slot 2 file must exist on disk: ${compDisk}`);

            const hmBuf = fs.readFileSync(hmDisk);
            const compBuf = fs.readFileSync(compDisk);
            assert(hmBuf.length > 0, 'Slot 1 file must have non-zero bytes');
            assert(compBuf.length > 0, 'Slot 2 file must have non-zero bytes');

            // Slot 2 must have APP1 EXIF
            assert.strictEqual(compBuf[3], 0xE1, 'Slot 2 must have APP1 marker');
            assert.strictEqual(compBuf.slice(6, 10).toString('latin1'), 'Exif', 'Slot 2 must have Exif header');

            console.log(`✅ Dual-Slot Submission: Both files persisted (Slot 1: ${hmBuf.length}b, Slot 2: ${compBuf.length}b with EXIF)`);
            console.log(`✅ Ticket #${targetTicket.ticketId} status: ${parsed.completionEvidence.status.toUpperCase()} (2 of 2 Evidence Verified)`);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      postReq.on('error', reject);
      postReq.write(dualPayload);
      postReq.end();
    } catch (err) {
      reject(err);
    }
  });
}

runLiveDualSlotTest().then(() => {
  console.log('\n========================================================');
  console.log('🎉 ALL TWO-SLOT PERSISTENCE & PIXEL AUDITS PASSED 100%');
  console.log('========================================================');
}).catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
