const DUMMY_TEST_IDS = new Set(["HTL-TVR-99999", "TEST-PING-001"]);

// ========================================================
// GOOGLE SHEETS / DRIVE CLOUD DATABASE ENGINE
// ========================================================
const GOOGLE_APPS_SCRIPT_ENDPOINT = process.env.GOOGLE_APPS_SCRIPT_ENDPOINT || 'https://script.google.com/macros/s/AKfycbxAxg_pWmpqz9C6WloGqW7a_v27bCsUC4QYlLCnJtBVY8B3JKtUu8eTYEupTlftJJY5/exec';

function fetchGasApi(url, method = 'GET', payload = null) {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: method,
        timeout: 10000,
        headers: { 'User-Agent': 'HTL-Database-Engine/2.0' }
      };
      if (payload) {
        const bodyStr = JSON.stringify(payload);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }
      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchGasApi(res.headers.location, method, payload));
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (payload) req.write(JSON.stringify(payload));
      req.end();
    } catch(e) {
      resolve(null);
    }
  });
}

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');

const os = require('os');
const isServerless = true; // Always enable serverless safe mode
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'tvr_data');
const DATA_DIR = TMP_DATA_DIR;
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BUNDLED_DB_FILE = path.join(BUNDLED_DATA_DIR, 'htl_itsm_tickets.json');
const DB_FILE = path.join(DATA_DIR, 'htl_itsm_tickets.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_HTL_Service_Desk_Master.csv');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');
const SCHOOLS_FILE = path.join(BUNDLED_DATA_DIR, 'master_schools_182.json');

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
try { if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}

let inMemoryTickets = null;
let deletedTicketIds = new Set();

function safeWriteFileSync(filePath, data, encoding = 'utf8') {
  try {
    // If the path is anywhere near __dirname or /var/task, redirect to tmpdir
    let target = filePath;
    if (filePath.includes('/var/task') || filePath.includes('\var\task') || filePath.startsWith(__dirname)) {
      target = path.join(os.tmpdir(), path.basename(filePath));
    }
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, data, encoding);
  } catch (err) {
    try {
      const tmpPath = path.join(os.tmpdir(), path.basename(filePath));
      fs.writeFileSync(tmpPath, data, encoding);
    } catch (e) {}
  }
}

let masterSchools = [];
try {
  masterSchools = require('./data/master_schools_182.json');
} catch(e) {
  if (fs.existsSync(SCHOOLS_FILE)) {
    try { masterSchools = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8')); } catch(err) { masterSchools = []; }
  }
}

function normalizePriority(val, issueText) {
  const v = (val || '').trim().toLowerCase();
  const issue = (issueText || '').toLowerCase();
  if (v.includes('crit') || issue.includes('dead') || issue.includes('not power') || issue.includes('lab off')) return 'Critical';
  if (v.includes('high') || issue.includes('no battery') || issue.includes('no backup') || issue.includes('trip') || issue.includes('swollen') || issue.includes('smell')) return 'High';
  if (v.includes('low') || issue.includes('minor') || issue.includes('display only')) return 'Low';
  return 'Medium';
}

let pool = null;
let usePostgres = false;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    usePostgres = true;
    console.log('🐘 PostgreSQL / Neon connection pool initialized with DATABASE_URL (SSL Enabled).');
  } catch (err) {
    console.error('❌ Failed to initialize PostgreSQL/Neon pool:', err.message);
    usePostgres = false;
  }
} else {
  console.log('ℹ️ DATABASE_URL not set. Running in local JSON persistence mode.');
}

function isTestOrPurgedTicket(t) {
  if (!t || !t.ticketId) return true;
  const tid = String(t.ticketId).trim();
  const name = String(t.schoolName || '').toLowerCase();
  if (tid === 'HTL-TVR-99999' || tid === 'TEST-PING-001' || name.includes('test school for verification')) return true;
  return false;
}

function loadTicketsFromJson() {
  let list = [];
  if (fs.existsSync(DB_FILE)) {
    try {
      const b = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (Array.isArray(b) && b.length > 0) list = b;
    } catch(e) {}
  }
  if (list.length === 0 && fs.existsSync(BUNDLED_DB_FILE)) {
    try {
      const b = JSON.parse(fs.readFileSync(BUNDLED_DB_FILE, 'utf8'));
      if (Array.isArray(b) && b.length > 0) list = b;
    } catch(e) {}
  }
  if (list.length === 0) {
    try {
      const bundled = JSON.parse(JSON.stringify(require('./data/htl_itsm_tickets.json')));
      if (Array.isArray(bundled)) list = bundled;
    } catch(e) {}
  }

  return list.filter(t => !isTestOrPurgedTicket(t) && !deletedTicketIds.has(String(t.ticketId).trim()));
}

// Synchronous version for Google Sheets sync (serverless-safe: reads from DB_FILE directly)
function getAllTicketsSync() {
  return loadTicketsFromJson().filter(t => t && t.ticketId && !PERMANENT_PURGED_IDS.has(String(t.ticketId).trim()));
}

function saveTicketsToJson(list) {
  safeWriteFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Photo 4 (Isolation Transformer)', 'Activity Log History'
  ];
  const rows = list.map(t => [
    '"' + (t.ticketId || '') + '"',
    '"' + (t.createdAt || '') + '"',
    '"' + normalizePriority(t.priority, t.issue) + '"',
    '"' + (t.status || 'New / Under Review') + '"',
    '"' + (t.resolutionCategory || 'Pending') + '"',
    '"' + (t.district || 'Thiruvarur') + '"',
    '"' + (t.block || '') + '"',
    '"' + (t.schoolName || '').replace(/"/g, '""') + '"',
    '"' + (t.udise || '') + '"',
    '"' + (t.aiName || '').replace(/"/g, '""') + '"',
    '"' + (t.phone || '') + '"',
    '"' + (t.issue || '').replace(/"/g, '""') + '"',
    '"' + (t.duration || '') + '"',
    '"' + (t.serialNo || '') + '"',
    '"' + (t.resolutionType || '') + '"',
    '"' + (t.vendorName || '') + '"',
    '"' + (t.vendorTicketNo || '') + '"',
    '"' + (t.partsRequired || '').replace(/"/g, '""') + '"',
    '"' + (t.resolutionNotes || '').replace(/"/g, '""') + '"',
    '"' + (t.resolvedAt || '') + '"',
    '"' + (t.photo1 || 'No Photo') + '"',
    '"' + (t.photo2 || 'No Photo') + '"',
    '"' + (t.photo3 || 'No Photo') + '"',
    '"' + (t.photo4 || 'No Photo') + '"',
    '"' + (t.photo4 || 'No Photo') + '"',
    '"' + (t.timeline || []).map(e => '[' + e.time + '] ' + e.action + ': ' + e.note).join(' | ').replace(/"/g, '""') + '"'
  ]);
  const csvContent = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  safeWriteFileSync(CSV_FILE, csvContent, 'utf8');
  // Removed hardcoded developer path — CSV is saved to DATA_DIR only
}

function mapRowToTicket(r) {
  return {
    ticketId: r.ticket_id,
    createdAt: r.created_date || (r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''),
    createdDate: r.created_date || '',
    priority: r.priority,
    status: r.status,
    resolutionCategory: r.resolution_category,
    district: r.district || 'Thiruvarur',
    block: r.block || '',
    schoolId: r.school_id || '',
    schoolName: r.school_name || '',
    udise: r.udise_code || '',
    aiName: r.ai_instructor_name || '',
    phone: r.ai_instructor_mobile || '',
    issue: r.reported_issue || '',
    duration: r.duration || '',
    serialNo: r.ups_serial_number || '',
    resolutionType: r.resolution_type || '',
    vendorName: r.vendor_name || '',
    vendorTicketNo: r.vendor_ticket_no || '',
    partsRequired: r.parts_required || '',
    resolutionNotes: r.resolution_notes || '',
    resolvedAt: r.resolved_at || '',
    photo1Url: r.photo1_data || '',
    photo2Url: r.photo2_data || '',
    photo3Url: r.photo3_data || '',
    photo4Url: r.photo4_data || '',
    googleDriveFolderUrl: r.drive_folder_url || '',
    remarks: r.remarks || '',
    timeline: r.activity_log || []
  };
}

async function initDatabase() {
  if (!usePostgres || !pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_date TEXT,
        priority TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
        status TEXT NOT NULL DEFAULT 'New / Under Review',
        resolution_category TEXT DEFAULT 'Pending',
        district TEXT DEFAULT 'Thiruvarur',
        block TEXT,
        school_id TEXT,
        school_name TEXT NOT NULL,
        udise_code TEXT,
        ai_instructor_name TEXT,
        ai_instructor_mobile TEXT,
        reported_issue TEXT,
        duration TEXT,
        ups_serial_number TEXT,
        resolution_type TEXT,
        vendor_name TEXT,
        vendor_ticket_no TEXT,
        parts_required TEXT,
        resolution_notes TEXT,
        resolved_at TEXT,
        photo1_data TEXT,
        photo2_data TEXT,
        photo3_data TEXT,
        photo4_data TEXT,
        remarks TEXT,
        activity_log JSONB DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_udise ON tickets(udise_code);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS photo4_data TEXT;
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        formatted_time TEXT,
        ip TEXT,
        action TEXT NOT NULL,
        username TEXT,
        role TEXT,
        ticket_id TEXT,
        outcome TEXT,
        details JSONB
      );
      CREATE TABLE IF NOT EXISTS tickets_backup_history (
        backup_id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT,
        initiated_by TEXT,
        ticket_count INT,
        backup_data JSONB
      );
    `);
    console.log('✅ PostgreSQL Schema & Indexes verified.');
    const countRes = await pool.query('SELECT count(*) FROM tickets');
    const rowCount = parseInt(countRes.rows[0].count, 10);
    if (rowCount === 0 && fs.existsSync(DB_FILE)) {
      console.log('🚀 Migrating existing JSON tickets to PostgreSQL...');
      const tickets = loadTicketsFromJson();
      let migratedCount = 0;
      for (const t of tickets) {
        const canonicalPrio = normalizePriority(t.priority, t.issue);
        await pool.query(`
          INSERT INTO tickets (
            ticket_id, created_date, priority, status, resolution_category,
            district, block, school_id, school_name, udise_code,
            ai_instructor_name, ai_instructor_mobile, reported_issue,
            duration, ups_serial_number, resolution_type, vendor_name,
            vendor_ticket_no, parts_required, resolution_notes,
            resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
          ON CONFLICT (ticket_id) DO NOTHING
        `, [
          t.ticketId,
          t.createdDate || t.createdAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          canonicalPrio,
          t.status || 'New / Under Review',
          t.resolutionCategory || 'Pending',
          t.district || 'Thiruvarur',
          t.block || '',
          t.schoolId || '',
          t.schoolName || '',
          t.udise || '',
          t.aiName || '',
          t.phone || '',
          t.issue || '',
          t.duration || 'Today',
          t.serialNo || '',
          t.resolutionType || '',
          t.vendorName || '',
          t.vendorTicketNo || '',
          t.partsRequired || '',
          t.resolutionNotes || '',
          t.resolvedAt || '',
          t.photo1Url || '',
          t.photo2Url || '',
          t.photo3Url || '',
          t.photo4Url || '',
          t.remarks || '',
          JSON.stringify(t.timeline || [])
        ]);
        migratedCount++;
      }
      console.log(`🎉 Successfully migrated ${migratedCount} tickets into PostgreSQL!`);
    }
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

let lastGasSyncTime = 0;
let gasSyncPromise = null;

async function syncGasTickets() {
  if (Date.now() - lastGasSyncTime < 2000) return; // 2s cache
  if (gasSyncPromise) return gasSyncPromise;

  gasSyncPromise = (async () => {
    try {
      if (!GOOGLE_APPS_SCRIPT_ENDPOINT) return;
      const resp = await fetchGasApi(GOOGLE_APPS_SCRIPT_ENDPOINT);
      const remoteTickets = (resp && resp.tickets) ? resp.tickets : (Array.isArray(resp) ? resp : null);
      if (Array.isArray(remoteTickets) && remoteTickets.length > 0) {
        let localTickets = loadTicketsFromJson();
        let added = 0;
        
        // Process in chronological order
        remoteTickets.forEach(rt => {
          if (!rt || !rt.ticketId || isTestOrPurgedTicket(rt)) return;
          const rtTime = String(rt.createdDate || rt.createdAt || '').trim();
          const rtId = String(rt.ticketId || '').trim();
          
          // Match by ID AND timestamp, or by ID if only 1 ticket with that ID exists
          const exists = localTickets.find(lt => {
            const ltId = String(lt.ticketId || '').trim();
            const ltTime = String(lt.createdDate || lt.createdAt || '').trim();
            return (ltId === rtId && ltTime === rtTime) || (ltId === rtId && !ltTime && !rtTime);
          });

          if (!exists) {
            let assignedId = rtId;
            if (localTickets.some(lt => String(lt.ticketId).trim() === assignedId)) {
              let suf = 2;
              while (localTickets.some(lt => String(lt.ticketId).trim() === `${rtId}-${suf}`)) {
                suf++;
              }
              assignedId = `${rtId}-${suf}`;
              rt.ticketId = assignedId;
            }
            localTickets.unshift(rt);
            added++;
          }
        });
        if (added > 0) {
          saveTicketsToJson(localTickets);
          console.log('🔄 [CLOUD SYNC] Merged ' + added + ' new tickets from Google Sheets into local cache!');
        }
      }
      lastGasSyncTime = Date.now();
    } catch (e) {
      console.warn('Gas sync warning:', e.message);
    } finally {
      gasSyncPromise = null;
    }
  })();

  return gasSyncPromise;
}

async function getAllTickets() {
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      return res.rows.map(mapRowToTicket);
    } catch (e) {
      console.error('Postgres query error, falling back to JSON:', e.message);
    }
  }

  // Always run fast cloud sync
  try {
    await Promise.race([
      syncGasTickets(),
      new Promise(res => setTimeout(res, 2500))
    ]);
  } catch(e) {}

  return loadTicketsFromJson();
}

async function checkOpenTicketByUdise(cleanUdise) {
  if (!cleanUdise || cleanUdise.length < 6) return null;
  if (usePostgres && pool) {
    try {
      const res = await pool.query(`
        SELECT * FROM tickets 
        WHERE udise_code = $1 
          AND status IN ('New / Under Review', 'Open / Triage', 'In Progress (Remote)', 'Field Visit Scheduled')
        LIMIT 1
      `, [cleanUdise]);
      if (res.rows.length > 0) return mapRowToTicket(res.rows[0]);
      return null;
    } catch (e) {
      console.error('Postgres checkOpenTicket error:', e.message);
    }
  }
  const list = loadTicketsFromJson();
  return list.find(t => {
    const tUdise = String(t.udise || '').replace(/\D/g, '');
    const isOpen = t.status === 'New / Under Review' || t.status === 'Open / Triage' || t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled';
    return tUdise === cleanUdise && isOpen;
  }) || null;
}

async function createTicket(ticketData) {
  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO tickets (
          ticket_id, created_date, priority, status, resolution_category,
          district, block, school_id, school_name, udise_code,
          ai_instructor_name, ai_instructor_mobile, reported_issue,
          duration, ups_serial_number, resolution_type, vendor_name,
          vendor_ticket_no, parts_required, resolution_notes,
          resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      `, [
        ticketData.ticketId,
        ticketData.createdAt,
        ticketData.priority,
        ticketData.status,
        ticketData.resolutionCategory,
        ticketData.district,
        ticketData.block,
        ticketData.schoolId,
        ticketData.schoolName,
        ticketData.udise,
        ticketData.aiName,
        ticketData.phone,
        ticketData.issue,
        ticketData.duration,
        ticketData.serialNo,
        ticketData.resolutionType,
        ticketData.vendorName,
        ticketData.vendorTicketNo,
        ticketData.partsRequired,
        ticketData.resolutionNotes,
        ticketData.resolvedAt,
        ticketData.photo1Url,
        ticketData.photo2Url,
        ticketData.photo3Url,
        ticketData.photo4Url,
        ticketData.remarks,
        JSON.stringify(ticketData.timeline || [])
      ]);
    } catch (e) {
      console.error('Postgres insert ticket error:', e.message);
    }
  }
  const list = loadTicketsFromJson();
  list.unshift(ticketData);
  saveTicketsToJson(list);
}

async function updateTicket(ticketId, updateData) {
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticketId]);
      if (res.rows.length > 0) {
        const existing = res.rows[0];
        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const oldStatus = existing.status;
        const newStatus = updateData.status || existing.status;
        const newPriority = normalizePriority(updateData.priority, existing.reported_issue);
        const newResolutionCat = updateData.resolutionCategory || (
          newStatus === 'Resolved Remotely' ? 'Resolved Remotely' :
          (newStatus === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : existing.resolution_category)
        );
        const newVendor = updateData.vendorName !== undefined ? updateData.vendorName : existing.vendor_name;
        const newVendorTicket = updateData.vendorTicketNo !== undefined ? updateData.vendorTicketNo : existing.vendor_ticket_no;
        const newParts = updateData.partsRequired !== undefined ? updateData.partsRequired : existing.parts_required;
        const newNotes = updateData.resolutionNotes !== undefined ? updateData.resolutionNotes : existing.resolution_notes;
        const newPhoto1 = updateData.photo1Url !== undefined ? updateData.photo1Url : existing.photo1_data;
        const newPhoto2 = updateData.photo2Url !== undefined ? updateData.photo2Url : existing.photo2_data;
        const newPhoto3 = updateData.photo3Url !== undefined ? updateData.photo3Url : existing.photo3_data;
        const newPhoto4 = updateData.photo4Url !== undefined ? updateData.photo4Url : existing.photo4_data;
        let resolvedAt = existing.resolved_at;
        if (newStatus === 'Resolved Remotely' || newStatus === 'Solved by Direct Visit' || newStatus === 'Closed / Verified') {
          resolvedAt = dateStr;
        }
        let timeline = existing.activity_log || [];
        timeline.unshift({
          time: dateStr,
          action: newStatus !== oldStatus ? 'Status updated: ' + newStatus : 'Details Updated',
          note: newNotes || 'Updated by Field Engineer (' + newResolutionCat + ')'
        });
        await pool.query(`
          UPDATE tickets SET
            status = $1, priority = $2, resolution_category = $3,
            vendor_name = $4, vendor_ticket_no = $5, parts_required = $6,
            resolution_notes = $7, photo1_data = $8, photo2_data = $9,
            photo3_data = $10, photo4_data = $11, resolved_at = $12, activity_log = $13
          WHERE ticket_id = $14
        `, [
          newStatus, newPriority, newResolutionCat, newVendor, newVendorTicket,
          newParts, newNotes, newPhoto1, newPhoto2, newPhoto3, newPhoto4, resolvedAt,
          JSON.stringify(timeline), ticketId
        ]);
      }
    } catch (e) {
      console.error('Postgres update error:', e.message);
    }
  }
  const list = loadTicketsFromJson();
  const ticket = list.find(t => t.ticketId === ticketId);
  if (ticket) {
    const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const oldStatus = ticket.status;
    ticket.status = updateData.status || ticket.status;
    ticket.priority = normalizePriority(updateData.priority, ticket.issue);
    ticket.resolutionCategory = updateData.resolutionCategory || (
      ticket.status === 'Resolved Remotely' ? 'Resolved Remotely' : 
      (ticket.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : ticket.resolutionCategory)
    );
    ticket.vendorName = updateData.vendorName !== undefined ? updateData.vendorName : ticket.vendorName;
    ticket.vendorTicketNo = updateData.vendorTicketNo !== undefined ? updateData.vendorTicketNo : ticket.vendorTicketNo;
    ticket.partsRequired = updateData.partsRequired !== undefined ? updateData.partsRequired : ticket.partsRequired;
    ticket.resolutionNotes = updateData.resolutionNotes !== undefined ? updateData.resolutionNotes : ticket.resolutionNotes;
    if (updateData.photo1Url !== undefined) ticket.photo1Url = updateData.photo1Url;
    if (updateData.photo2Url !== undefined) ticket.photo2Url = updateData.photo2Url;
    if (updateData.photo3Url !== undefined) ticket.photo3Url = updateData.photo3Url;
    if (updateData.photo4Url !== undefined) ticket.photo4Url = updateData.photo4Url;
    if (updateData.googleDriveFolderUrl !== undefined) ticket.googleDriveFolderUrl = updateData.googleDriveFolderUrl;
    if (ticket.status === 'Resolved Remotely' || ticket.status === 'Solved by Direct Visit' || ticket.status === 'Closed / Verified') {
      ticket.resolvedAt = dateStr;
    }
    if (!ticket.timeline) ticket.timeline = [];
    ticket.timeline.unshift({
      time: dateStr,
      action: updateData.status !== oldStatus ? 'Status updated: ' + updateData.status : 'Details Updated',
      note: updateData.resolutionNotes || 'Updated by Field Engineer (' + ticket.resolutionCategory + ')'
    });
    saveTicketsToJson(list);
  }
  return { success: true };
}

async function deleteTicket(ticketId) {
  if (!ticketId) return { success: false, error: 'Ticket ID is required' };
  const cleanId = String(ticketId).trim();
  deletedTicketIds.add(cleanId);
  if (usePostgres && pool) {
    try {
      await pool.query('DELETE FROM tickets WHERE ticket_id = $1', [cleanId]);
    } catch (e) {
      console.error('Postgres delete error:', e.message);
    }
  }
  let list = loadTicketsFromJson();
  list = list.filter(t => String(t.ticketId).trim() !== cleanId);
  saveTicketsToJson(list);
  return { success: true };
}

async function resetAllTickets(userIdentifier, clientIp) {
  deletedTicketIds.clear();
  const currentTickets = await getAllTickets();
  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO tickets_backup_history (reason, initiated_by, ticket_count, backup_data)
        VALUES ($1, $2, $3, $4)
      `, [
        'FULL_DATA_RESET',
        userIdentifier,
        currentTickets.length,
        JSON.stringify(currentTickets)
      ]);
      await pool.query('DELETE FROM tickets');
    } catch (e) {
      console.error('Postgres resetAll error:', e.message);
    }
  }
  try {
    const ts = Date.now();
    const backupFile = path.join(BACKUPS_DIR, 'reset_backup_' + ts + '.json');
    safeWriteFileSync(backupFile, JSON.stringify(currentTickets, null, 2), 'utf8');
  } catch(e){}
  saveTicketsToJson([]);
  return { success: true };
}

async function logAudit(event) {
  const entry = {
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isoTime: new Date().toISOString(),
    ...event
  };
  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO audit_log (formatted_time, ip, action, username, role, ticket_id, outcome, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        entry.timestamp,
        event.ip || '',
        event.action || '',
        event.user || event.username || '',
        event.role || '',
        event.ticketId || '',
        event.status || event.outcome || '',
        JSON.stringify(event)
      ]);
    } catch (e) {
      console.error('Postgres audit log write error:', e.message);
    }
  }
  try {
    let list = [];
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      try { list = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch(e) { list = []; }
    }
    list.unshift(entry);
    if (list.length > 500) list = list.slice(0, 500);
    safeWriteFileSync(AUDIT_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}
}

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d;

  const m = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{1,2}):?(\d{1,2})?\s*(am|pm)?/i);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - 1;
    let year = parseInt(m[3], 10);
    let hour = parseInt(m[4], 10);
    let min = parseInt(m[5], 10);
    let sec = m[6] ? parseInt(m[6], 10) : 0;
    let ampm = (m[7] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const parsed = new Date(year, month, day, hour, min, sec);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return val;
}

async function generateExcelExport() {
  const tickets = await getAllTickets();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TVR Hi-Tech Lab ITSM';
  workbook.lastModifiedBy = 'TVR Hi-Tech Lab ITSM';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 1. MASTER TICKETS SHEET
  const ws = workbook.addWorksheet('Master Tickets', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const columns = [
    { header: 'Ticket ID', key: 'ticketId', width: 16 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Resolution Category', key: 'resolutionCategory', width: 14 },
    { header: 'District', key: 'district', width: 14 },
    { header: 'Block', key: 'block', width: 14 },
    { header: 'School Name', key: 'schoolName', width: 30 },
    { header: 'UDISE Code', key: 'udise', width: 14 },
    { header: 'AI Instructor Name', key: 'aiName', width: 22 },
    { header: 'AI Instructor Mobile Number', key: 'phone', width: 16 },
    { header: 'Reported UPS Issue', key: 'issue', width: 35 },
    { header: 'Duration', key: 'duration', width: 18 },
    { header: 'UPS Serial Number', key: 'serialNo', width: 20 },
    { header: 'Resolution Type', key: 'resolutionType', width: 20 },
    { header: 'Vendor Name', key: 'vendorName', width: 20 },
    { header: 'Vendor Ticket No', key: 'vendorTicketNo', width: 20 },
    { header: 'Parts Required', key: 'partsRequired', width: 20 },
    { header: 'Resolution Notes', key: 'resolutionNotes', width: 35 },
    { header: 'Resolved At', key: 'resolvedAt', width: 20 },
    { header: 'Photo 1 (Front Panel)', key: 'photo1', width: 25, hidden: true },
    { header: 'Photo 2 (Overall UPS)', key: 'photo2', width: 25, hidden: true },
    { header: 'Photo 3 (Battery/MCB)', key: 'photo3', width: 25, hidden: true },
    { header: 'Photo 4 (Isolation Transformer)', key: 'photo4', width: 25, hidden: true },
    { header: 'Google Drive Folder', key: 'driveFolder', width: 35, hidden: true },
    { header: 'Activity Log History', key: 'timeline', width: 45, hidden: true }
  ];

  ws.columns = columns;

  // Header Styling
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.border = {
    top: { style: 'medium', color: { argb: 'FF1E3A8A' } },
    bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
    left: { style: 'thin', color: { argb: 'FF3B82F6' } },
    right: { style: 'thin', color: { argb: 'FF3B82F6' } }
  };

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  tickets.forEach((t, idx) => {
    const rawCreated = parseExcelDate(t.createdAt);
    const rawResolved = parseExcelDate(t.resolvedAt);
    const timelineStr = (t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join('\n');

    const row = ws.addRow({
      ticketId: t.ticketId || '',
      createdAt: rawCreated,
      priority: normalizePriority(t.priority, t.issue),
      status: t.status || 'New / Under Review',
      resolutionCategory: t.resolutionCategory || 'Pending',
      district: t.district || 'Thiruvarur',
      block: t.block || '',
      schoolName: t.schoolName || '',
      udise: String(t.udise || ''),
      aiName: t.aiName || '',
      phone: String(t.phone || ''),
      issue: t.issue || '',
      duration: t.duration || '',
      serialNo: t.serialNo || '',
      resolutionType: t.resolutionType || '',
      vendorName: t.vendorName || '',
      vendorTicketNo: t.vendorTicketNo || '',
      partsRequired: t.partsRequired || '',
      resolutionNotes: t.resolutionNotes || '',
      resolvedAt: rawResolved,
      photo1: t.photo1 || 'No Photo',
      photo2: t.photo2 || 'No Photo',
      photo3: t.photo3 || 'No Photo',
      photo4: t.photo4 || 'No Photo',
      driveFolder: t.googleDriveFolderUrl || 'Pending Sync',
      timeline: timelineStr
    });

    row.height = 24;

    const isEven = idx % 2 === 0;
    const rowFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' }
    };

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = rowFill;
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };

      const colKey = columns[colNumber - 1]?.key;

      if (colKey === 'createdAt' || colKey === 'resolvedAt') {
        if (cell.value instanceof Date) {
          cell.numFmt = 'dd/mm/yyyy hh:mm AM/PM';
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'udise' || colKey === 'phone') {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colKey === 'ticketId' || colKey === 'priority' || colKey === 'status' || colKey === 'resolutionCategory' || colKey === 'district' || colKey === 'block') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'issue' || colKey === 'resolutionNotes' || colKey === 'timeline') {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      // Highlight Priority
      if (colKey === 'priority') {
        const val = String(cell.value || '').toLowerCase();
        if (val.includes('critical')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        else if (val.includes('high')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFEA580C' } };
        else if (val.includes('medium')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } };
        else if (val.includes('low')) cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF16A34A' } };
      }

      // Highlight Status
      if (colKey === 'status') {
        const st = String(cell.value || '');
        if (st.includes('Resolved') || st.includes('Solved')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        } else if (st.includes('Vendor')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
        } else if (st.includes('Progress') || st.includes('Visit')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
        }
      }
    });
  });

  // 2. DETAIL SHEET: "Photo & Activity Detail"
  const wsDetail = workbook.addWorksheet('Photo & Activity Detail', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const detailCols = [
    { header: 'Ticket ID', key: 'ticketId', width: 16 },
    { header: 'School Name', key: 'schoolName', width: 30 },
    { header: 'UDISE Code', key: 'udise', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Photo 1 (Front Panel)', key: 'photo1', width: 28 },
    { header: 'Photo 2 (Overall UPS)', key: 'photo2', width: 28 },
    { header: 'Photo 3 (Battery/MCB)', key: 'photo3', width: 28 },
    { header: 'Photo 4 (Isolation Transformer)', key: 'photo4', width: 28 },
    { header: 'Activity Log History', key: 'timeline', width: 55 }
  ];

  wsDetail.columns = detailCols;

  const dHeader = wsDetail.getRow(1);
  dHeader.height = 28;
  dHeader.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  dHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal Green
  dHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  dHeader.border = {
    top: { style: 'medium', color: { argb: 'FF0F766E' } },
    bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
    left: { style: 'thin', color: { argb: 'FF14B8A6' } },
    right: { style: 'thin', color: { argb: 'FF14B8A6' } }
  };

  wsDetail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: detailCols.length }
  };

  tickets.forEach((t, idx) => {
    const timelineStr = (t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join('\n');
    const dRow = wsDetail.addRow({
      ticketId: t.ticketId || '',
      schoolName: t.schoolName || '',
      udise: String(t.udise || ''),
      status: t.status || 'New / Under Review',
      photo1: t.photo1 || 'No Photo',
      photo2: t.photo2 || 'No Photo',
      photo3: t.photo3 || 'No Photo',
      photo4: t.photo4 || 'No Photo',
      timeline: timelineStr
    });

    dRow.height = timelineStr.includes('\n') ? 55 : 28;
    const isEven = idx % 2 === 0;

    dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDFA' }
      };
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };

      const colKey = detailCols[colNumber - 1]?.key;
      if (colKey === 'ticketId' || colKey === 'udise' || colKey === 'status') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'timeline') {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  return await workbook.xlsx.writeBuffer();
}

async function generateCsvExport() {
  const list = await getAllTickets();
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Photo 4 (Isolation Transformer)', 'Activity Log History'
  ];
  const rows = list.map(t => [
    '"' + (t.ticketId || '') + '"',
    '"' + (t.createdAt || '') + '"',
    '"' + normalizePriority(t.priority, t.issue) + '"',
    '"' + (t.status || 'New / Under Review') + '"',
    '"' + (t.resolutionCategory || 'Pending') + '"',
    '"' + (t.district || 'Thiruvarur') + '"',
    '"' + (t.block || '') + '"',
    '"' + (t.schoolName || '').replace(/"/g, '""') + '"',
    '"' + (t.udise || '') + '"',
    '"' + (t.aiName || '').replace(/"/g, '""') + '"',
    '"' + (t.phone || '') + '"',
    '"' + (t.issue || '').replace(/"/g, '""') + '"',
    '"' + (t.duration || '') + '"',
    '"' + (t.serialNo || '') + '"',
    '"' + (t.resolutionType || '') + '"',
    '"' + (t.vendorName || '') + '"',
    '"' + (t.vendorTicketNo || '') + '"',
    '"' + (t.partsRequired || '').replace(/"/g, '""') + '"',
    '"' + (t.resolutionNotes || '').replace(/"/g, '""') + '"',
    '"' + (t.resolvedAt || '') + '"',
    '"' + (t.photo1 || 'No Photo') + '"',
    '"' + (t.photo2 || 'No Photo') + '"',
    '"' + (t.photo3 || 'No Photo') + '"',
    '"' + (t.timeline || []).map(e => '[' + e.time + '] ' + e.action + ': ' + e.note).join(' | ').replace(/"/g, '""') + '"'
  ]);
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

function getDatabaseType() {
  if (!usePostgres || !process.env.DATABASE_URL) return 'local-json';
  if (process.env.DATABASE_URL.includes('neon.tech')) return 'neon';
  return 'render-postgres';
}


function registerOrUpdateSchool(info) {
  if (!info || !info.udise) return;
  const cleanUdise = String(info.udise).trim();
  const cleanSchool = String(info.schoolName || '').trim();
  const cleanBlock = String(info.block || '').trim() || 'Other';
  const cleanAi = String(info.aiName || '').trim();
  const cleanPhone = String(info.phone || '').trim();
  const cleanDistrict = String(info.district || 'Thiruvarur').trim();

  if (!cleanUdise || cleanUdise.length < 6 || !cleanSchool) return;

  let existing = masterSchools.find(s => String(s.udise || '').trim() === cleanUdise);
  let updated = false;

  if (existing) {
    if (cleanAi && existing.aiName !== cleanAi) {
      existing.aiName = cleanAi;
      updated = true;
    }
    if (cleanPhone && existing.aiPhone !== cleanPhone) {
      existing.aiPhone = cleanPhone;
      updated = true;
    }
    if (cleanSchool && existing.schoolName !== cleanSchool.toUpperCase()) {
      existing.schoolName = cleanSchool.toUpperCase();
      updated = true;
    }
    if (cleanBlock && (!existing.block || existing.block === 'Other')) {
      existing.block = cleanBlock;
      updated = true;
    }
  } else {
    const newSchoolEntry = {
      id: `TVR-EXT-${cleanUdise.slice(-5)}`,
      slNo: masterSchools.length + 1,
      empId: '',
      district: cleanDistrict,
      block: cleanBlock,
      udise: cleanUdise,
      schoolName: cleanSchool.toUpperCase(),
      category: cleanSchool.toUpperCase().includes('HSS') ? 'HSS' : (cleanSchool.toUpperCase().includes('GHS') ? 'GHS' : (cleanSchool.toUpperCase().includes('PUMS') || cleanSchool.toUpperCase().includes('GMS') ? 'MS' : 'School')),
      aiPhone: cleanPhone,
      aiName: cleanAi
    };
    masterSchools.push(newSchoolEntry);
    updated = true;
    console.log(`✨ [NEW SCHOOL DISCOVERED & SAVED] ${newSchoolEntry.schoolName} (${newSchoolEntry.udise}) added to master directory!`);
  }

  if (updated) {
    try {
      safeWriteFileSync(SCHOOLS_FILE, JSON.stringify(masterSchools, null, 2), 'utf8');
      
      const dirFile = path.join(__dirname, 'Hi-Tech_Lab_Warriors_Thiruvarur_Directory.json');
      if (fs.existsSync(dirFile)) {
        let dirList = JSON.parse(fs.readFileSync(dirFile, 'utf8'));
        let dirItem = dirList.find(d => String(d.udise || '').trim() === cleanUdise);
        if (dirItem) {
          if (cleanAi) dirItem.name = cleanAi;
          if (cleanPhone) dirItem.phone = '+91' + cleanPhone.replace(/\D/g, '');
          if (cleanSchool) dirItem.school = cleanSchool.toUpperCase();
          if (cleanBlock) dirItem.block = cleanBlock;
          dirItem.displayName = `HTL TVR - ${dirItem.name || 'AI'} (${dirItem.school}, ${dirItem.block})`;
        } else {
          dirList.push({
            sno: String(dirList.length + 1),
            empId: '',
            name: cleanAi || 'AI Instructor',
            school: cleanSchool.toUpperCase(),
            block: cleanBlock,
            district: cleanDistrict,
            udise: cleanUdise,
            phone: '+91' + cleanPhone.replace(/\D/g, ''),
            displayName: `HTL TVR - ${cleanAi || 'AI'} (${cleanSchool.toUpperCase()}, ${cleanBlock})`
          });
        }
        safeWriteFileSync(dirFile, JSON.stringify(dirList, null, 2), 'utf8');
      }
    } catch(err) {
      console.error('Error saving updated school directory:', err.message);
    }
  }
}


async function getAuditLogs() {
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500');
      return res.rows;
    } catch(e){}
  }
  if (fs.existsSync(AUDIT_LOG_FILE)) {
    try { return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch(e){}
  }
  return [];
}

async function createBackup(reason = 'MANUAL_BACKUP', initiatedBy = 'system') {
  const tickets = await getAllTickets();
  const ts = Date.now();
  const backupFile = path.join(BACKUPS_DIR, 'backup_' + ts + '.json');
  safeWriteFileSync(backupFile, JSON.stringify(tickets, null, 2), 'utf8');
  return { success: true, count: tickets.length, file: backupFile };
}

module.exports = {
  safeWriteFileSync,
  initDatabase,
  getAllTickets,
  getAllTicketsSync,
  checkOpenTicketByUdise,
  createTicket,
  updateTicket,
  deleteTicket,
  resetAllTickets,
  logAudit,
  getAuditLogs,
  createBackup,
  generateCsvExport,
  generateExcelExport,
  normalizePriority,
  masterSchools,
  registerOrUpdateSchool,
  getDatabaseType
};
