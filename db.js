const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'htl_itsm_tickets.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_HTL_Service_Desk_Master.csv');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');
const SCHOOLS_FILE = path.join(DATA_DIR, 'master_schools_182.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

let masterSchools = [];
if (fs.existsSync(SCHOOLS_FILE)) {
  try { masterSchools = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8')); } catch(e) { masterSchools = []; }
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

function loadTicketsFromJson() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return []; }
  }
  return [];
}

function saveTicketsToJson(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Activity Log History'
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
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
  try { fs.writeFileSync('C:/Users/acer/Downloads/Thiruvarur_HTL_Service_Desk_Master.csv', csvContent, 'utf8'); } catch(e){}
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
        remarks TEXT,
        activity_log JSONB DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_udise ON tickets(udise_code);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
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
            resolved_at, photo1_data, photo2_data, photo3_data, remarks, activity_log
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
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

async function getAllTickets() {
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      return res.rows.map(mapRowToTicket);
    } catch (e) {
      console.error('Postgres query error, falling back to JSON:', e.message);
    }
  }
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
          resolved_at, photo1_data, photo2_data, photo3_data, remarks, activity_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
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
            photo3_data = $10, resolved_at = $11, activity_log = $12
          WHERE ticket_id = $13
        `, [
          newStatus, newPriority, newResolutionCat, newVendor, newVendorTicket,
          newParts, newNotes, newPhoto1, newPhoto2, newPhoto3, resolvedAt,
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
  if (usePostgres && pool) {
    try {
      await pool.query('DELETE FROM tickets WHERE ticket_id = $1', [ticketId]);
    } catch (e) {
      console.error('Postgres delete error:', e.message);
    }
  }
  let list = loadTicketsFromJson();
  list = list.filter(t => t.ticketId !== ticketId);
  saveTicketsToJson(list);
  return { success: true };
}

async function resetAllTickets(userIdentifier, clientIp) {
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
    fs.writeFileSync(backupFile, JSON.stringify(currentTickets, null, 2), 'utf8');
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
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}
}

async function generateCsvExport() {
  const list = await getAllTickets();
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Activity Log History'
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

module.exports = {
  initDatabase,
  getAllTickets,
  checkOpenTicketByUdise,
  createTicket,
  updateTicket,
  deleteTicket,
  resetAllTickets,
  logAudit,
  generateCsvExport,
  normalizePriority,
  masterSchools
};