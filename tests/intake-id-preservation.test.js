// Hermetic BEFORE any require: isolates ALL disk writes to os.tmpdir().
process.env.VERCEL = '1';

/**
 * INTAKE ID-PRESERVATION SUITE (caller -> persistence regression).
 * Proves the REAL syncTicketToGoogleDrive -> db.updateTicket path never lets an
 * empty GAS-reported ID wipe an already-persisted genuine Drive ID.
 *
 * - R1: GAS success:true with EMPTY per-file IDs (05303-class) on a ticket
 *       that already holds 4 genuine IDs -> result fails honestly AND all 4
 *       stored IDs remain byte-identical (no '' overwrite, no phantoms).
 * - R2: GAS reports genuine new IDs for previously-empty slots -> new slots
 *       adopt the new IDs while pre-existing IDs are preserved.
 * - R3: Partial GAS IDs on an ID-less ticket -> reported slots persist,
 *       missing slots stay '' (no phantom IDs invented).
 * Hermetic GAS stub + tmpdir isolation. Zero production writes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DATA = path.join(os.tmpdir(), 'tvr_data');
const TMP_UP = path.join(os.tmpdir(), 'tvr_uploads');
for (const d of [TMP_DATA, TMP_UP]) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
}
// Snapshot/restore repo data files (dual-write hardening mirrors some writes
// to bundled data even in hermetic mode).
const REPO_SNAP = {};
for (const f of ['data/htl_itsm_tickets.json', 'data/master_schools_182.json', 'Hi-Tech_Lab_Warriors_Thiruvarur_Directory.json', 'data/audit_log.json', 'data/htl_deleted_ids.json', 'data/htl_tombstones.json']) {
  try { REPO_SNAP[f] = fs.readFileSync(path.join('D:/Ai Ticket App - UPS', f)); } catch (e) { REPO_SNAP[f] = null; }
}
function restoreRepo() {
  for (const f of Object.keys(REPO_SNAP)) {
    try {
      const p = path.join('D:/Ai Ticket App - UPS', f);
      if (REPO_SNAP[f] === null) { try { fs.rmSync(p, { force: true }); } catch (e) {} }
      else fs.writeFileSync(p, REPO_SNAP[f]);
    } catch (e) {}
  }
}

const server = require('../server.js');
const db = require('../db.js');

let passed = 0;
let failed = 0;
function record(desc, ok, details = '') {
  if (ok) { passed++; console.log(`✅ [PASS] ${desc} ${details ? '(' + details + ')' : ''}`); }
  else { failed++; console.error(`❌ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`); }
}

// Controllable GAS stub: createIds per ticket, inspect echoes reported IDs.
const stubModes = { createIds: {}, inspectIds: {} };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url || '');
  if (!u.includes('script.google.com')) throw new Error('unexpected outbound ' + u.slice(0, 60));
  await new Promise((r) => setTimeout(r, 3));
  let body = {};
  try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
  if (!opts || opts.method === 'GET' || !body.action) return { ok: true, json: async () => ({ tickets: [] }) };
  const tid = String(body.ticketId || '');
  if (body.action === 'inspect_drive_structure') {
    const ids = stubModes.inspectIds[tid] || [];
    const files = [1, 2, 3, 4]
      .filter((i) => ids[i - 1])
      .map((i) => ({ fileId: ids[i - 1], fileName: `${tid}_Evidence_${i}.jpg`, fileSize: 100, isTrashed: false }));
    return {
      ok: true, json: async () => ({
        success: true, ticketId: tid, district: body.district || 'Thiruvarur',
        schoolFolder: (body.udise ? body.udise + ' - stub' : 'school'), evidenceFolder: 'Evidence',
        schoolFolderUrl: 'https://drive.google.com/drive/folders/stubfolder',
        evidenceFiles: files, evidenceTotal: files.length,
        ticketEvidenceCount: files.length,
      }),
    };
  }
  const ids = stubModes.createIds[tid] || ['', '', '', ''];
  const urlFor = (id) => (id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : '');
  return {
    ok: true, json: async () => ({
      success: true, ticketId: tid, folderUrl: 'https://drive.google.com/drive/folders/stubfolder',
      p1DriveFileId: ids[0], p2DriveFileId: ids[1], p3DriveFileId: ids[2], p4DriveFileId: ids[3],
      p1Url: urlFor(ids[0]), p2Url: urlFor(ids[1]), p3Url: urlFor(ids[2]), p4Url: urlFor(ids[3]),
    }),
  };
};

const PIXEL = 'data:image/jpeg;base64,' + Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
  0xD2, 0xCF, 0x20, 0xFF, 0xD9
]).toString('base64');

const RUN5 = String(Date.now() % 100000).padStart(5, '0');
const TID = (s) => `HTL-TVR-${RUN5.slice(-2)}${s}`;
const UD = (s) => `332${RUN5}${s}`;

async function seedTicket(tid, udise, ids) {
  await db.createTicket({
    ticketId: tid, udise, district: 'Thiruvarur', schoolName: 'GHSS IDP', block: 'Kottur',
    aiName: 'Scale AI', phone: '9876543210', issue: 'UPS Not Turning ON', duration: 'Today',
    serialNo: 'SN-1', priority: 'High', remarks: 'ID preservation fixture', status: 'New / Under Review',
    photo1Url: PIXEL, photo2Url: PIXEL, photo3Url: PIXEL, photo4Url: PIXEL,
    p1DriveFileId: ids[0] || '', p2DriveFileId: ids[1] || '', p3DriveFileId: ids[2] || '', p4DriveFileId: ids[3] || '',
  });
  const all = await db.getAllTickets();
  return all.find((t) => String(t.ticketId) === tid);
}
const raw4 = () => ({ photo1Base64: PIXEL, photo2Base64: PIXEL, photo3Base64: PIXEL, photo4Base64: PIXEL });
async function rowOf(tid) {
  return (await db.getAllTickets()).find((t) => String(t.ticketId) === tid);
}

async function main() {
  console.log('========================================================');
  console.log('🛡️  RUNNING INTAKE ID-PRESERVATION SUITE (hermetic)');
  console.log('========================================================\n');

  // R1: 4 genuine IDs persisted; GAS omits all IDs -> honest failure, IDs intact.
  const T1 = TID('01'), GENUINE = ['gid-1', 'gid-2', 'gid-3', 'gid-4'];
  stubModes.createIds[T1] = ['', '', '', ''];
  stubModes.inspectIds[T1] = [];
  const t1 = await seedTicket(T1, UD('011'), GENUINE);
  const r1 = await server.syncTicketToGoogleDrive(t1, raw4());
  const row1 = await rowOf(T1);
  const kept1 = [row1.p1DriveFileId, row1.p2DriveFileId, row1.p3DriveFileId, row1.p4DriveFileId];
  record('R1a. empty GAS IDs fail honestly (no false confirm)', r1.success === false, `success=${r1.success}`);
  record('R1b. all 4 pre-existing IDs preserved via caller->persistence path',
    kept1.every((v, i) => v === GENUINE[i]), kept1.join(','));

  // R2: p1/p2 genuine, p3/p4 empty; GAS reports 4 genuine new IDs, inspect confirms.
  const T2 = TID('02'), NEW34 = ['gid-1', 'gid-2', 'gid-3-new', 'gid-4-new'];
  stubModes.createIds[T2] = NEW34;
  stubModes.inspectIds[T2] = NEW34;
  const t2 = await seedTicket(T2, UD('012'), ['gid-1', 'gid-2', '', '']);
  const r2 = await server.syncTicketToGoogleDrive(t2, raw4());
  const row2 = await rowOf(T2);
  const kept2 = [row2.p1DriveFileId, row2.p2DriveFileId, row2.p3DriveFileId, row2.p4DriveFileId];
  record('R2a. full genuine IDs confirm', r2.success === true, `success=${r2.success}`);
  record('R2b. pre-existing slots kept, genuinely-new slots adopted',
    kept2.every((v, i) => v === NEW34[i]), kept2.join(','));

  // R3: no pre-existing IDs; GAS reports only p1/p2 -> partial persists, no phantoms.
  const T3 = TID('03'), PART = ['gid-p1', 'gid-p2', '', ''];
  stubModes.createIds[T3] = PART;
  stubModes.inspectIds[T3] = [];
  const t3 = await seedTicket(T3, UD('013'), ['', '', '', '']);
  const r3 = await server.syncTicketToGoogleDrive(t3, raw4());
  const row3 = await rowOf(T3);
  const kept3 = [row3.p1DriveFileId, row3.p2DriveFileId, row3.p3DriveFileId, row3.p4DriveFileId];
  record('R3a. partial IDs fail honestly', r3.success === false, `success=${r3.success}`);
  record('R3b. reported slots persist, missing slots stay empty (no phantoms)',
    kept3[0] === 'gid-p1' && kept3[1] === 'gid-p2' && kept3[2] === '' && kept3[3] === '', kept3.join(','));

  console.log('\n========================================================');
  console.log(`📊 ID-PRESERVATION RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================');
  globalThis.fetch = realFetch;
  try { fs.rmSync(TMP_DATA, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(TMP_UP, { recursive: true, force: true }); } catch (e) {}
  restoreRepo();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Fatal Suite Error:', e); globalThis.fetch = realFetch; try { restoreRepo(); } catch (err) {} process.exit(1); });
