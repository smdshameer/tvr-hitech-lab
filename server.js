const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// ========================================================
// 1. ENVIRONMENT CONFIGURATION & PRODUCTION STARTUP GUARD
// ========================================================
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

const REQUIRED_ENV_VARS = ['ENGINEER_PIN', 'LEADERSHIP_PIN', 'RESET_PASSWORD', 'SESSION_SECRET'];
const missingVars = REQUIRED_ENV_VARS.filter(k => !process.env[k]);

if (isProd && missingVars.length > 0) {
  console.error('\n========================================================');
  console.error(' [FATAL ERROR] PRODUCTION STARTUP REFUSED');
  console.error(' Missing required production environment variables:');
  missingVars.forEach(v => console.error('  - ' + v));
  console.error(' Please configure these in your Render Environment Dashboard.');
  console.error('========================================================\n');
  process.exit(1);
}

if (!isProd && missingVars.length > 0) {
  console.warn('\n========================================================');
  console.warn(' [DEV WARNING] Running with DEV-ONLY INSECURE FALLBACKS:');
  missingVars.forEach(v => console.warn('  - ' + v + ' -> DEV-ONLY-INSECURE-' + v + '-12345678'));
  console.warn(' Set real environment variables before deploying to production.');
  console.warn('========================================================\n');
}

const ENGINEER_PIN = process.env.ENGINEER_PIN || 'DEV-ONLY-INSECURE-ENGINEER_PIN-12345678';
const LEADERSHIP_PIN = process.env.LEADERSHIP_PIN || 'DEV-ONLY-INSECURE-LEADERSHIP_PIN-12345678';
const RESET_PASSWORD = process.env.RESET_PASSWORD || 'DEV-ONLY-INSECURE-RESET_PASSWORD-12345678';
const SESSION_SECRET = process.env.SESSION_SECRET || 'DEV-ONLY-INSECURE-SESSION_SECRET-12345678';

// Validate credential strength on startup
function validateSecretStrength(name, val) {
  if (val.length < 8) {
    console.warn(`[SECURITY WARNING] ${name} is shorter than 8 characters (${val.length} chars). Consider using a stronger secret.`);
  }
  if (/^\d+$/.test(val)) {
    console.warn(`[SECURITY WARNING] ${name} is purely numeric. Consider combining letters, digits, and symbols.`);
  }
}
validateSecretStrength('ENGINEER_PIN', ENGINEER_PIN);
validateSecretStrength('LEADERSHIP_PIN', LEADERSHIP_PIN);
validateSecretStrength('RESET_PASSWORD', RESET_PASSWORD);

// ========================================================
// 2. DATA DIRECTORY & PERSISTENCE NOTE
// ========================================================
// NOTE ON DATA PERSISTENCE:
// By default, the app stores JSON/CSV files on local container disk in './data'.
// On Render free-tier, local disk resets whenever the service rebuilds or restarts.
// For enterprise data durability, attach a Render Persistent Disk mounted to './data'
// or migrate the storage engine to SQLite/PostgreSQL.
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'htl_itsm_tickets.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_HTL_Service_Desk_Master.csv');
const SCHOOLS_FILE = path.join(DATA_DIR, 'master_schools_182.json');

// Canonical Priority Normalizer
function normalizePriority(val, issueText) {
  const v = (val || '').trim().toLowerCase();
  const issue = (issueText || '').toLowerCase();

  if (v.includes('crit') || issue.includes('dead') || issue.includes('not power') || issue.includes('lab off')) {
    return 'Critical';
  }
  if (v.includes('high') || issue.includes('no battery') || issue.includes('no backup') || issue.includes('trip') || issue.includes('swollen') || issue.includes('smell')) {
    return 'High';
  }
  if (v.includes('low') || issue.includes('minor') || issue.includes('display only')) {
    return 'Low';
  }
  return 'Medium';
}

function loadTickets() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return []; }
  }
  return [];
}

let masterSchools = [];
if (fs.existsSync(SCHOOLS_FILE)) {
  try { masterSchools = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8')); } catch(e) { masterSchools = []; }
}

function saveTickets(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');

  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Teacher Name', 'AI Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Activity Log History'
  ];

  const rows = list.map(t => [
    `"${t.ticketId || ''}"`,
    `"${t.createdAt || ''}"`,
    `"${normalizePriority(t.priority, t.issue)}"`,
    `"${t.status || 'New / Under Review'}"`,
    `"${t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'))}"`,
    `"${t.district || 'Thiruvarur'}"`,
    `"${t.block || ''}"`,
    `"${(t.schoolName || '').replace(/"/g, '""')}"`,
    `"${t.udise || ''}"`,
    `"${(t.aiName || '').replace(/"/g, '""')}"`,
    `"${t.phone || ''}"`,
    `"${(t.issue || '').replace(/"/g, '""')}"`,
    `"${t.duration || ''}"`,
    `"${t.serialNo || ''}"`,
    `"${t.resolutionType || ''}"`,
    `"${t.vendorName || ''}"`,
    `"${t.vendorTicketNo || ''}"`,
    `"${(t.partsRequired || '').replace(/"/g, '""')}"`,
    `"${(t.resolutionNotes || '').replace(/"/g, '""')}"`,
    `"${t.resolvedAt || ''}"`,
    `"${t.photo1 || 'No Photo'}"`,
    `"${t.photo2 || 'No Photo'}"`,
    `"${t.photo3 || 'No Photo'}"`,
    `"${(t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join(' | ').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  fs.writeFileSync(CSV_FILE, csvContent, 'utf8');

  try {
    fs.writeFileSync('C:/Users/acer/Downloads/Thiruvarur_HTL_Service_Desk_Master.csv', csvContent, 'utf8');
  } catch(e){}
}

// Retroactive Startup Migration: Sanitize priority and status values
(function migrateExistingData() {
  try {
    const tickets = loadTickets();
    let changed = false;
    tickets.forEach(t => {
      const canonicalPrio = normalizePriority(t.priority, t.issue);
      if (t.priority !== canonicalPrio) {
        t.priority = canonicalPrio;
        changed = true;
      }
      if (t.status === 'Open / Triage' || !t.status) {
        t.status = 'New / Under Review';
        changed = true;
      }
    });
    if (changed) {
      saveTickets(tickets);
      console.log('✅ Retroactive Data Migration: Normalized priorities and statuses across tickets DB & CSV.');
    }
  } catch(e) {
    console.error('Migration error:', e.message);
  }
})();

// ========================================================
// 3. SECURITY, SESSION & RATE-LIMITING ENGINE
// ========================================================
// CSRF NOTE: SameSite=Lax provides baseline CSRF protection for this app's threat model.
// Add explicit CSRF tokens if state-changing routes are called cross-origin in the future.

function signToken(payloadObj) {
  const jsonStr = JSON.stringify(payloadObj);
  const b64Data = Buffer.from(jsonStr, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(b64Data).digest('base64url');
  return b64Data + '.' + signature;
}

function verifyToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;
  const [b64Data, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64Data).digest('base64url');
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    try {
      const payload = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp > Date.now()) {
        return payload;
      }
    } catch(e) { return null; }
  }
  return null;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function getAuthenticatedSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.htl_session;
  return verifyToken(token);
}

function setSessionCookie(res, userPayload) {
  const token = signToken({
    ...userPayload,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  res.setHeader('Set-Cookie', `htl_session=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=86400`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'htl_session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

// In-Memory Rate Limiting (Max 5 failed attempts per 15 min per IP)
const rateLimitStore = new Map();

function checkRateLimit(ip, action) {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }

  if (record.count >= 5) {
    const remainingSecs = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, remainingSecs };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip, action) {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  rateLimitStore.set(key, record);
}

function recordSuccessfulAttempt(ip, action) {
  rateLimitStore.delete(`${action}:${ip}`);
}

function logAudit(event) {
  const entry = {
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isoTime: new Date().toISOString(),
    ...event
  };
  try {
    let list = [];
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      try { list = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch(e) { list = []; }
    }
    list.unshift(entry);
    if (list.length > 500) list = list.slice(0, 500); // keep last 500 events
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {
    console.error('Audit log write error:', e.message);
  }
}

// Photo Magic Bytes & Size Validation
function validateAndExtractPhoto(base64Str, photoNum) {
  if (!base64Str || typeof base64Str !== 'string') {
    return { valid: false, error: `Photo ${photoNum} is missing or empty.` };
  }

  let rawBase64 = base64Str;
  const match = base64Str.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (match) {
    rawBase64 = match[2];
  }

  let buf;
  try {
    buf = Buffer.from(rawBase64, 'base64');
  } catch(e) {
    return { valid: false, error: `Photo ${photoNum} has invalid base64 encoding.` };
  }

  // 5MB Limit
  if (buf.length > 5 * 1024 * 1024) {
    return { valid: false, error: `Photo ${photoNum} exceeds 5MB size limit (Received ${(buf.length / (1024*1024)).toFixed(2)}MB).` };
  }

  if (buf.length < 50) {
    return { valid: false, error: `Photo ${photoNum} file is too small or corrupt.` };
  }

  // Magic Bytes Check
  // JPEG: FF D8 FF
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  // WebP: RIFF ... WEBP
  const isWebp = buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return { valid: false, error: `Photo ${photoNum} has invalid image signature (Only genuine JPEG and PNG images are accepted).` };
  }

  const ext = isPng ? '.png' : (isWebp ? '.webp' : '.jpg');
  return { valid: true, buffer: buf, ext: ext };
}

// ========================================================
// 4. HTTP REQUEST ROUTER & CONTROLLER
// ========================================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve Uploaded Photos
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) {
      const ext = path.extname(filename).toLowerCase();
      res.writeHead(200, { 'Content-Type': ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg') });
      fs.createReadStream(filepath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Image not found');
    return;
  }

  // 1. API: Login with Rate Limiting and Audit Logging
  if (pathname === '/api/login' && req.method === 'POST') {
    const rl = checkRateLimit(clientIp, 'LOGIN');
    if (!rl.allowed) {
      logAudit({ action: 'LOGIN_RATE_LIMITED', ip: clientIp, status: 'BLOCKED' });
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Too many failed attempts. Security lock active for ${rl.remainingSecs} seconds.`
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password, role } = JSON.parse(body || '{}');
        const u = (username || '').trim().toLowerCase();
        const p = (password || '').trim();

        // Field Engineer Login
        if ((role === 'engineer' || !role) && (u === 'shameer' || u === 'engineer' || u === 'mohamed') && p === ENGINEER_PIN) {
          recordSuccessfulAttempt(clientIp, 'LOGIN');
          logAudit({ action: 'LOGIN_SUCCESS', ip: clientIp, user: 'Mohamed Shameer', role: 'Field Engineer' });
          setSessionCookie(res, { username: 'shameer', role: 'engineer', displayName: 'Mohamed Shameer' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/engineer', user: 'Mohamed Shameer', role: 'Field Engineer' }));
          return;
        }

        // Reporting Head Login
        if ((role === 'head' || !role) && (u === 'head' || u === 'admin' || u === 'deo') && p === LEADERSHIP_PIN) {
          recordSuccessfulAttempt(clientIp, 'LOGIN');
          logAudit({ action: 'LOGIN_SUCCESS', ip: clientIp, user: 'Executive Reporting Head', role: 'District Authority' });
          setSessionCookie(res, { username: 'head', role: 'head', displayName: 'Executive Reporting Head' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/head', user: 'Executive Reporting Head', role: 'District Authority' }));
          return;
        }

        // Invalid Credentials
        recordFailedAttempt(clientIp, 'LOGIN');
        logAudit({ action: 'LOGIN_FAILED', ip: clientIp, username: u, role: role, status: 'INVALID_CREDENTIALS' });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid Username or Security PIN.' }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed request payload.' }));
      }
    });
    return;
  }

  // Logout Handler
  if (pathname === '/logout' || pathname === '/api/logout') {
    const session = getAuthenticatedSession(req);
    if (session) logAudit({ action: 'LOGOUT', ip: clientIp, user: session.displayName || session.username });
    clearSessionCookie(res);
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  // 2. API: Create Ticket (Teacher) with Strict Photo Validation & Duplicate Check
  if (pathname === '/api/tickets' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const tickets = loadTickets();

        // 1. Strict Server-Side Photo Presence & Magic Byte Check
        const p1Res = validateAndExtractPhoto(data.photo1Base64, 1);
        if (!p1Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: p1Res.error }));
          return;
        }

        const p2Res = validateAndExtractPhoto(data.photo2Base64, 2);
        if (!p2Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: p2Res.error }));
          return;
        }

        const p3Res = validateAndExtractPhoto(data.photo3Base64, 3);
        if (!p3Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: p3Res.error }));
          return;
        }

        // 2. Duplicate Active Ticket Prevention (Same UDISE)
        const cleanUdise = String(data.udise || '').replace(/\D/g, '');
        if (cleanUdise && cleanUdise.length >= 6) {
          const existingOpen = tickets.find(t => {
            const tUdise = String(t.udise || '').replace(/\D/g, '');
            const isOpen = t.status === 'New / Under Review' || t.status === 'Open / Triage' || t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled';
            return tUdise === cleanUdise && isOpen;
          });

          if (existingOpen) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: `இந்த பள்ளிக்கு ஏற்கனவே திறந்த நிலையில் உள்ள புகார் உள்ளது (Existing Open Ticket: ${existingOpen.ticketId}). தயவுசெய்து 'Track Status' மூலம் நிலையை அறியவும்.`,
              existingTicketId: existingOpen.ticketId
            }));
            return;
          }
        }

        // 3. Save Validated Photos to Disk
        const ts = Date.now();
        const cleanSchool = (data.schoolName || 'school').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
        const p1Name = `UPS_F_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p1Res.ext}`;
        const p2Name = `UPS_O_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p2Res.ext}`;
        const p3Name = `UPS_B_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p3Res.ext}`;

        fs.writeFileSync(path.join(UPLOADS_DIR, p1Name), p1Res.buffer);
        fs.writeFileSync(path.join(UPLOADS_DIR, p2Name), p2Res.buffer);
        fs.writeFileSync(path.join(UPLOADS_DIR, p3Name), p3Res.buffer);

        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const ticketId = 'HTL-TVR-' + (data.udise ? data.udise.slice(-5) : String(tickets.length + 1).padStart(4, '0'));
        const canonicalPriority = normalizePriority(data.priority, data.issue);

        const newTicket = {
          ticketId: ticketId,
          createdAt: dateStr,
          createdDate: dateStr,
          schoolId: data.schoolId || '',
          schoolName: data.schoolName || '',
          udise: data.udise || '',
          district: 'Thiruvarur',
          block: data.block || '',
          aiName: data.aiName || '',
          phone: data.phone || '',
          issue: data.issue || 'UPS Technical Glitch',
          duration: data.duration || 'Today',
          serialNo: data.serialNo || '',
          priority: canonicalPriority,
          status: 'New / Under Review',
          resolutionCategory: 'Pending',
          resolutionType: '',
          vendorName: '',
          vendorTicketNo: '',
          partsRequired: '',
          resolutionNotes: '',
          resolvedAt: '',
          photo1: p1Name,
          photo1Url: `/uploads/${p1Name}`,
          photo2: p2Name,
          photo2Url: `/uploads/${p2Name}`,
          photo3: p3Name,
          photo3Url: `/uploads/${p3Name}`,
          remarks: data.remarks || '',
          timeline: [
            { time: dateStr, action: 'Ticket Logged by School AI', note: `புகார் பதிவு செய்யப்பட்டு களப் பொறியாளர் பார்வைக்கு அனுப்பப்பட்டது. (Priority: ${canonicalPriority})` }
          ]
        };

        tickets.unshift(newTicket);
        saveTickets(tickets);
        logAudit({ action: 'TICKET_CREATED', ip: clientIp, ticketId: ticketId, school: data.schoolName, udise: data.udise });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ticketId: ticketId, message: 'Ticket logged successfully!' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. API: Update Ticket Status (Engineer - Protected)
  // CSRF NOTE: SameSite=Lax provides baseline CSRF protection for this app's threat model.
  if (pathname === '/api/tickets/update' && req.method === 'POST') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required. Please login.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const tickets = loadTickets();
        const ticket = tickets.find(t => t.ticketId === data.ticketId);

        if (ticket) {
          const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          const oldStatus = ticket.status;

          ticket.status = data.status || ticket.status;
          ticket.priority = normalizePriority(data.priority, ticket.issue);
          ticket.resolutionCategory = data.resolutionCategory || (
            data.status === 'Resolved Remotely' ? 'Resolved Remotely' : 
            (data.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : ticket.resolutionCategory)
          );
          ticket.vendorName = data.vendorName || ticket.vendorName;
          ticket.vendorTicketNo = data.vendorTicketNo || ticket.vendorTicketNo;
          ticket.resolutionNotes = data.resolutionNotes || ticket.resolutionNotes;
          if (data.photo1Url !== undefined) ticket.photo1Url = data.photo1Url;
          if (data.photo2Url !== undefined) ticket.photo2Url = data.photo2Url;
          if (data.photo3Url !== undefined) ticket.photo3Url = data.photo3Url;

          if (ticket.status === 'Resolved Remotely' || ticket.status === 'Solved by Direct Visit' || ticket.status === 'Closed / Verified') {
            ticket.resolvedAt = dateStr;
          }

          if (!ticket.timeline) ticket.timeline = [];
          ticket.timeline.unshift({
            time: dateStr,
            action: data.status !== oldStatus ? `Status updated: ${data.status}` : 'Details Updated',
            note: data.resolutionNotes || `Updated by Field Engineer Mohamed Shameer (${ticket.resolutionCategory})`
          });

          saveTickets(tickets);
          logAudit({ action: 'TICKET_UPDATED', ip: clientIp, user: session.displayName, ticketId: data.ticketId, status: ticket.status });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Ticket updated successfully.' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ticket not found.' }));
        }
      } catch(err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. API: Delete Single Ticket (Protected)
  // CSRF NOTE: SameSite=Lax provides baseline CSRF protection for this app's threat model.
  if (pathname === '/api/tickets/delete' && req.method === 'POST') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { ticketId } = JSON.parse(body || '{}');
        let tickets = loadTickets();
        tickets = tickets.filter(t => t.ticketId !== ticketId);
        saveTickets(tickets);
        logAudit({ action: 'TICKET_DELETED', ip: clientIp, user: session.displayName, ticketId: ticketId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Ticket ${ticketId} deleted successfully.` }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid Request payload.' }));
      }
    });
    return;
  }

  // 5. API: Password-Protected Reset All Data with Rate-Limiting & Audit Log
  // CSRF NOTE: SameSite=Lax provides baseline CSRF protection for this app's threat model.
  if (pathname === '/api/reset-all' && req.method === 'POST') {
    const rl = checkRateLimit(clientIp, 'RESET');
    if (!rl.allowed) {
      logAudit({ action: 'RESET_RATE_LIMITED', ip: clientIp, status: 'BLOCKED' });
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Too many failed reset attempts. Security lockout active for ${rl.remainingSecs} seconds.`
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        const p = (password || '').trim();
        const session = getAuthenticatedSession(req);
        const userIdentifier = session ? session.displayName : 'Anonymous / PIN Entry';

        if (p === RESET_PASSWORD) {
          recordSuccessfulAttempt(clientIp, 'RESET');
          saveTickets([]);
          logAudit({ action: 'FULL_DATA_RESET_SUCCESS', ip: clientIp, user: userIdentifier, status: 'SUCCESS' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'All incident data has been completely reset.' }));
        } else {
          recordFailedAttempt(clientIp, 'RESET');
          logAudit({ action: 'FULL_DATA_RESET_DENIED', ip: clientIp, user: userIdentifier, status: 'INCORRECT_PASSWORD' });
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect Protection Password! Reset Denied.' }));
        }
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid Request payload.' }));
      }
    });
    return;
  }

  // 6. API: Data & Analytics (Scoped by Authentication & Search Privacy)
  if (pathname === '/api/data' && req.method === 'GET') {
    const tickets = loadTickets();
    const session = getAuthenticatedSession(req);
    const totalSchools = masterSchools.length || 183;
    const totalReported = tickets.length;
    const resolvedRemotelyCount = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
    const solvedDirectVisitCount = tickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
    const vendorCount = tickets.filter(t => t.status === 'Vendor Escalated').length;
    const inProgressCount = tickets.filter(t => t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled').length;
    const openCount = tickets.filter(t => t.status === 'New / Under Review').length;

    const blockStats = {};
    masterSchools.forEach(s => {
      if (!blockStats[s.block]) blockStats[s.block] = { total: 0, reported: 0, resolvedRemote: 0, solvedDirect: 0, vendor: 0 };
      blockStats[s.block].total++;
    });
    tickets.forEach(t => {
      const b = t.block || 'Other';
      if (!blockStats[b]) blockStats[b] = { total: 0, reported: 0, resolvedRemote: 0, solvedDirect: 0, vendor: 0 };
      blockStats[b].reported++;
      if (t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely') blockStats[b].resolvedRemote++;
      if (t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit') blockStats[b].solvedDirect++;
      if (t.status === 'Vendor Escalated') blockStats[b].vendor++;
    });

    // If request has track query (Public School Search):
    const trackQ = (parsedUrl.query.track || parsedUrl.query.q || '').trim().toLowerCase();
    const cleanTrackQ = trackQ.replace(/\D/g, '');

    let ticketsResponse = [];
    if (session) {
      // Authenticated engineer/head gets full list (with optional pagination)
      const page = parseInt(parsedUrl.query.page, 10) || 1;
      const limit = parseInt(parsedUrl.query.limit, 10) || 0;
      if (limit > 0) {
        const start = (page - 1) * limit;
        ticketsResponse = tickets.slice(start, start + limit);
      } else {
        ticketsResponse = tickets;
      }
    } else if (trackQ) {
      // Unauthenticated search: Return ONLY matched tickets for that school
      ticketsResponse = tickets.filter(t => {
        const tId = (t.ticketId || '').toLowerCase();
        const tUdise = String(t.udise || '').replace(/\D/g, '');
        const tSchool = (t.schoolName || '').toLowerCase();
        if (tId === trackQ || tId.includes(trackQ)) return true;
        if (cleanTrackQ && cleanTrackQ.length >= 4 && tUdise.includes(cleanTrackQ)) return true;
        if (tSchool.includes(trackQ)) return true;
        return false;
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalSchools,
      totalReported,
      resolvedRemotelyCount,
      solvedDirectVisitCount,
      totalResolved: resolvedRemotelyCount + solvedDirectVisitCount,
      vendorCount,
      inProgressCount,
      openCount,
      blockStats,
      tickets: ticketsResponse,
      masterSchools: masterSchools
    }));
    return;
  }

  // 7. Download Master CSV (Protected)
  if (pathname === '/download-excel' || pathname === '/export') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(302, { Location: '/login?redirect=/download-excel' });
      res.end();
      return;
    }
    const tickets = loadTickets();
    saveTickets(tickets);
    if (fs.existsSync(CSV_FILE)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Thiruvarur_HTL_Service_Desk_Master.csv"'
      });
      fs.createReadStream(CSV_FILE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No tickets logged yet.');
    }
    return;
  }

  // ========================================================
  // 5. VIEW ROUTING & AUTHENTICATION GUARDS
  // ========================================================
  if (pathname === '/login') {
    const session = getAuthenticatedSession(req);
    if (session) {
      res.writeHead(302, { Location: session.role === 'head' ? '/head' : '/engineer' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLoginHtml());
    return;
  }

  if (pathname === '/engineer' || pathname === '/dashboard') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(302, { Location: '/login?redirect=/engineer' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMWorkbenchHtml());
    return;
  }

  if (pathname === '/head' || pathname === '/report' || pathname === '/admin') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(302, { Location: '/login?redirect=/head' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMExecutiveHtml());
    return;
  }

  // Default: Teacher Incident Portal (Public)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getTeacherPortalHtml());
});

// ========================================================
// 6. WORKING-HOURS SELF-PING KEEP-ALIVE
// ========================================================
// NOTE: This in-process self-ping prevents an active Render instance from sleeping
// during working hours (8:00 AM - 6:00 PM IST). Note that an in-process timer cannot
// wake up an already-asleep instance; pair with an external pinger (e.g. UptimeRobot)
// for complete cold-start coverage.
setInterval(() => {
  try {
    const now = new Date();
    // Convert to IST
    const istHours = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
    if (istHours >= 8 && istHours < 18) {
      const pingUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000/';
      http.get(pingUrl, () => {
        // silent ping
      }).on('error', () => {});
    }
  } catch(e){}
}, 10 * 60 * 1000); // every 10 minutes

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 TVR Hi-Tech Lab Service Desk running on port ${PORT}`);
});

function getLoginHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff & Engineer Login - Hi-Tech Lab Service Desk</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .login-card {
      background: white; border-radius: 18px; padding: 36px 28px; width: 420px; max-width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; text-align: center;
    }
    .logo-badge { display: inline-block; background: #eff6ff; color: #1d4ed8; font-weight: 800; font-size: 11.5px; padding: 4px 12px; border-radius: 999px; margin-bottom: 12px; }
    h1 { font-size: 21px; font-weight: 800; color: #1e3a8a; margin-bottom: 6px; }
    p { font-size: 13px; color: #64748b; margin-bottom: 24px; }
    
    .form-group { margin-bottom: 16px; text-align: left; }
    label { display: block; font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 6px; }
    input, select {
      width: 100%; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px;
    }
    input:focus, select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
    
    .btn-login {
      width: 100%; background: #1d4ed8; color: white; border: none; padding: 13px; border-radius: 10px;
      font-size: 14.5px; font-weight: 700; cursor: pointer; margin-top: 10px; transition: all 0.15s;
    }
    .btn-login:hover { background: #1e40af; }
    .back-link { display: block; margin-top: 18px; font-size: 12.5px; color: #64748b; text-decoration: none; font-weight: 600; }
    .back-link:hover { color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="login-card">
    <span class="logo-badge">ICT Service Desk • Thiruvarur</span>
    <h1>Official Staff Login 🔐</h1>
    <p>Field Engineer & Executive Officer Access</p>

    <form id="loginForm">
      <div class="form-group">
        <label>Select Role (பதவி)</label>
        <select id="roleSelect">
          <option value="engineer">🛠️ Field Engineer (Mohamed Shameer)</option>
          <option value="head">📊 Reporting Head / DEO / Leadership</option>
        </select>
      </div>

      <div class="form-group">
        <label>Username / User ID</label>
        <input type="text" id="username" placeholder="e.g. shameer"  required>
      </div>

      <div class="form-group">
        <label>Password / PIN</label>
        <input type="password" id="password" placeholder="Enter PIN"  required>
      </div>

      <button type="submit" class="btn-login" id="btnLogin">Sign In to Command Center</button>
    </form>

    <a href="/" class="back-link">← Return to School Complaint Form</a>
  </div>

  <script>
    document.getElementById('roleSelect').addEventListener('change', function() {
      if (this.value === 'head') {
        document.getElementById('username').value = 'head';
      } else {
        document.getElementById('username').value = 'shameer';
      }
    });

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('btnLogin');
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            role: document.getElementById('roleSelect').value
          })
        });
        const d = await res.json();
        if (d.success) {
          window.location.href = d.redirect;
        } else {
          alert('Login failed: ' + d.error);
          btn.disabled = false;
          btn.textContent = 'Sign In to Command Center';
        }
      } catch(err) {
        alert('Login error');
        btn.disabled = false;
        btn.textContent = 'Sign In to Command Center';
      }
    });
  </script>
</body>
</html>`;
}

function getTeacherPortalHtml() {
  return `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Hi-Tech Lab Service Desk - Thiruvarur District</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Tamil:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1d4ed8;
      --primary-hover: #1e40af;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', 'Noto Sans Tamil', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 14px; line-height: 1.5; }
    .container { max-width: 680px; margin: 0 auto; }

    .header-card {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: white; padding: 22px 18px; border-radius: 16px; margin-bottom: 16px;
      box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.25);
    }
    .badge {
      display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 4px 12px;
      border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;
    }
    .header-card h1 { font-size: 19px; font-weight: 800; margin-bottom: 4px; }
    .header-card p { font-size: 13px; opacity: 0.92; }

    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab-btn {
      flex: 1; padding: 12px; background: white; border: 1.5px solid var(--border); border-radius: 10px;
      font-weight: 700; font-size: 13px; color: var(--text-muted); cursor: pointer; text-align: center;
      transition: all 0.2s ease;
    }
    .tab-btn.active { background: #eff6ff; border-color: var(--primary); color: var(--primary); }

    .card {
      background: var(--card); border: 1px solid var(--border); border-radius: 16px;
      padding: 18px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04); margin-bottom: 16px;
    }
    .section-title { font-size: 13.5px; font-weight: 800; color: #1e3a8a; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13.5px; font-weight: 700; margin-bottom: 6px; color: var(--text); }
    .form-label .sub-label { display: block; font-size: 12px; font-weight: 500; color: var(--text-muted); margin-top: 1px; }
    .form-label .req { color: #dc2626; }
    
    .form-control, .form-select, .form-textarea {
      width: 100%; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: 14px; background: #fff; transition: all 0.2s;
    }
    .form-control:focus, .form-select:focus, .form-textarea:focus {
      outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .auto-fill-grid {
      background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px;
      margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;
    }
    .auto-item span { display: block; color: var(--text-muted); font-size: 11px; font-weight: 600; }
    .auto-item strong { color: var(--text); font-weight: 700; font-size: 12.5px; }

    .radio-option {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1.5px solid var(--border);
      border-radius: 10px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
    }
    .radio-option:hover { background: #f8fafc; border-color: #cbd5e1; }
    .radio-option input { margin-top: 3px; accent-color: var(--primary); }
    .radio-option strong { font-size: 13px; display: block; color: var(--text); }
    .radio-option span { font-size: 11.5px; color: var(--text-muted); display: block; margin-top: 1px; }

    .checklist-box {
      background: #fefce8; border: 1px solid #fef08a; border-radius: 12px; padding: 14px; margin-bottom: 16px;
    }
    .checklist-title { font-size: 13px; font-weight: 700; color: #854d0e; margin-bottom: 8px; }
    .check-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #713f12; margin-bottom: 6px; }

    .btn-submit {
      width: 100%; background: var(--primary); color: white; border: none; padding: 15px;
      border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); transition: all 0.2s;
    }
    .btn-submit:hover { background: var(--primary-hover); transform: translateY(-1px); }

    .success-card {
      display: none; background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 16px;
      padding: 28px 18px; text-align: center; color: #166534;
    }
    .ticket-badge {
      display: inline-block; background: #16a34a; color: white; padding: 6px 16px;
      border-radius: 999px; font-size: 15px; font-weight: 800; margin: 12px 0; letter-spacing: 0.5px;
    }
    .school-search-wrap { position: relative; margin-bottom: 10px; }
    .search-input-group { position: relative; display: flex; align-items: center; width: 100%; }
    .school-search-input {
      width: 100%; padding: 13px 148px 13px 14px; border: 2.5px solid #2563eb; border-radius: 12px;
      font-size: 14px; font-weight: 600; color: #0f172a; background: #f8fafc;
      box-shadow: 0 4px 12px rgba(37,99,235,0.08); outline: none; transition: all 0.2s ease;
      box-sizing: border-box;
    }
    .school-search-input:focus {
      background: white; border-color: #1d4ed8; box-shadow: 0 0 0 4px rgba(37,99,235,0.2);
    }
    .btn-other-school-edge {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      background: #eff6ff; color: #1d4ed8; border: 1.5px solid #93c5fd; border-radius: 8px;
      padding: 7px 11px; font-size: 12px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; gap: 5px; white-space: nowrap; transition: all 0.2s ease;
      z-index: 5;
    }
    .btn-other-school-edge:hover {
      background: #2563eb; color: #ffffff; border-color: #1d4ed8;
      box-shadow: 0 2px 8px rgba(37,99,235,0.25); transform: translateY(-50%) scale(1.02);
    }
    .btn-other-school-edge .other-icon { font-size: 13px; line-height: 1; }
    @media (max-width: 480px) {
      .school-search-input { padding-right: 125px; font-size: 13px; }
      .btn-other-school-edge { padding: 6px 8px; font-size: 11px; }
    }
    .school-suggest-box {
      display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 1000;
      background: white; border: 2px solid #2563eb; border-radius: 14px;
      max-height: 280px; overflow-y: auto; box-shadow: 0 16px 36px rgba(15,23,42,0.22);
    }
    .suggest-item {
      padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; text-align: left;
      transition: background 0.15s ease;
    }
    .suggest-item:hover, .suggest-item:active { background: #eff6ff; }
    .suggest-title { color: #1e3a8a; font-size: 14px; font-weight: 800; }
    .suggest-meta { font-size: 12px; color: #475569; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 8px; }
    .suggest-ai { font-size: 11.5px; color: #16a34a; font-weight: 700; margin-top: 3px; }

    /* Executive-Grade Photo Upload UI */
    .photo-upload-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 12px;
    }
    @media (max-width: 768px) {
      .photo-upload-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }
    }
    .photo-upload-box {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
      transition: all 0.2s ease;
      position: relative;
    }
    .photo-upload-box:hover {
      border-color: #2563eb;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.1);
      transform: translateY(-2px);
    }
    .photo-header-area {
      text-align: center;
      margin-bottom: 12px;
    }
    .photo-badge-num {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .photo-title-text {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.35;
      min-height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .photo-sub-text {
      display: block;
      font-size: 11.5px;
      color: #64748b;
      font-weight: 600;
      margin-top: 3px;
    }
    .photo-drop-zone {
      background: #f8fafc;
      border: 1.5px dashed #cbd5e1;
      border-radius: 12px;
      padding: 14px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .photo-upload-box:hover .photo-drop-zone {
      background: #f0f7ff;
      border-color: #93c5fd;
    }
    .photo-icon-circle {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #ffffff;
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      margin-bottom: 10px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
      transition: transform 0.2s ease;
    }
    .photo-upload-box:hover .photo-icon-circle {
      transform: scale(1.08);
    }
    .file-input {
      display: none !important;
    }
    .photo-btn-group {
      display: flex;
      flex-direction: column;
      gap: 7px;
      width: 100%;
    }
    .btn-camera-snap {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
      color: white;
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(37,99,235,0.22);
      transition: all 0.2s ease;
      border: none;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    }
    .btn-camera-snap:hover {
      background: #1e40af;
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(37,99,235,0.3);
    }
    .btn-gallery-pick {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #ffffff;
      color: #334155;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    }
    .btn-gallery-pick:hover {
      background: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
      transform: translateY(-1px);
    }
    .photo-preview-wrap {
      position: relative;
      margin-top: 4px;
      display: none;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .photo-preview-img {
      width: 100%;
      height: 155px;
      object-fit: cover;
      border-radius: 10px;
      border: 2.5px solid #10b981;
      box-shadow: 0 6px 16px rgba(16,185,129,0.18);
    }
    .photo-success-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #10b981;
      color: white;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }
    .btn-retake {
      margin-top: 8px;
      background: #ffffff;
      color: #475569;
      border: 1.5px solid #cbd5e1;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .btn-retake:hover {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
      transform: scale(1.02);
    }

    /* Custom School Box Card */
    .custom-school-card {
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
      border: 2px solid #bfdbfe;
      border-radius: 14px;
      padding: 18px 16px;
      margin-bottom: 16px;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.06);
    }
    .custom-school-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px dashed #cbd5e1;
    }
    .custom-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
    }
    .btn-back-search {
      background: #ffffff;
      color: #2563eb;
      border: 1.5px solid #bfdbfe;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    }
    .btn-back-search:hover {
      background: #eff6ff;
      border-color: #2563eb;
      transform: translateX(-2px);
    }
    .custom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 600px) {
      .custom-grid {
        grid-template-columns: 1fr;
      }
    }

    .verified-school-card {
      display: none; background: #ecfdf5; border: 2px solid #10b981; border-radius: 14px;
      padding: 16px 18px; margin-bottom: 14px; position: relative;
    }
    .verified-school-card .badge-ver {
      display: inline-block; background: #10b981; color: white; font-size: 11px; font-weight: 800;
      padding: 3px 10px; border-radius: 999px; margin-bottom: 6px;
    }
    .verified-school-name { font-size: 16px; font-weight: 800; color: #065f46; margin-bottom: 6px; }
    .verified-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px; color: #047857; margin-bottom: 10px; }
    .btn-reselect {
      background: white; color: #065f46; border: 1.5px solid #10b981; padding: 6px 12px;
      border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <span class="badge">Hi-Tech Lab ITSM Service Desk</span>
      <h1>UPS Incident & Complaint Center</h1>
      <p>திருவாரூர் மாவட்ட Hi-Tech Lab பழுதுபதிவு மற்றும் சேவை மையம் (183 பள்ளிகள்)</p>
    </div>

    <div class="tabs">
      <div class="tab-btn active" id="tabLog" onclick="switchTab('log')">📝 புதிய புகார் பதிவு (Log Incident)</div>
      <div class="tab-btn" id="tabTrack" onclick="switchTab('track')">🔍 புகார் நிலை அறிதல் (Track Status)</div>
    </div>

    <div class="card" id="formContainer">
      <form id="incidentForm">
        <div class="section-title">1. பள்ளி & AI பொறுப்பாளர் விவரங்கள் (School Details)</div>
        
        <div class="form-group">
          <label class="form-label">பள்ளியைத் தேர்ந்தெடுக்கவும் (Search & Select School) <span class="req">*</span></label>
          <div class="school-search-wrap" id="searchWrap">
            <div class="search-input-group">
              <input type="text" id="schoolSearchInput" class="school-search-input" placeholder="🔍 எ.கா: 33201000507 அல்லது பள்ளியின் பெயர் / வட்டாரம்..." autocomplete="off">
              <button type="button" onclick="openOtherSchool()" class="btn-other-school-edge" title="பள்ளி பட்டியலில் இல்லையா? புதிய பள்ளியைப் பதிவு செய்ய கிளிக் செய்யவும்">
                <span class="other-icon">➕</span>
                <span>மற்ற பள்ளி</span>
              </button>
            </div>
            <div id="schoolSuggestionsBox" class="school-suggest-box"></div>
          </div>

          <div id="verifiedSchoolCard" class="verified-school-card">
            <span class="badge-ver">✅ பள்ளி தேர்வு செய்யப்பட்டது (School Selected)</span>
            <div class="verified-school-name" id="verSchoolName">-</div>
            <div class="verified-grid">
              <div>📍 வட்டாரம்: <strong id="verBlock">-</strong></div>
              <div>🔢 UDISE: <strong id="verUdise">-</strong></div>
              <div>👤 AI பொறுப்பாளர்: <strong id="verAiName">-</strong></div>
              <div>📞 தொடர்பு எண்: <strong id="verPhone">-</strong></div>
            </div>
            <button type="button" onclick="resetSchoolSelection()" class="btn-reselect">🔄 வேறு பள்ளியைத் தேர்வு செய்ய (Change School)</button>
          </div>

          <select id="schoolSelect" style="display:none;">
            <option value="">-- None --</option>
            ${masterSchools.map(s => `<option value="${s.id}">${s.schoolName}</option>`).join('')}
            <option value="OTHER">OTHER</option>
          </select>
        </div>

        <div id="customSchoolBox" class="custom-school-card" style="display:none;">
          <div class="custom-school-header">
            <div class="custom-badge">
              <span>➕</span>
              <span>புதிய / மற்ற பள்ளி விவரங்கள் (Other School)</span>
            </div>
            <button type="button" onclick="resetSchoolSelection()" class="btn-back-search">
              <span>←</span>
              <span>பள்ளி தேடலுக்குத் திரும்பு</span>
            </button>
          </div>

          <div class="form-group">
            <label class="form-label">பள்ளியின் முழுப் பெயர் (School Name) <span class="req">*</span></label>
            <input type="text" id="custSchool" class="form-control" placeholder="எ.கா: GHS / PUMS / GHSS பள்ளியின் முழுப் பெயர்">
          </div>

          <div class="custom-grid">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">UDISE எண் (UDISE Code) <span class="req">*</span></label>
              <input type="text" id="custUdise" class="form-control" placeholder="11-இலக்க UDISE எண்" maxlength="11">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">வட்டாரம் (Block Name) <span class="req">*</span></label>
              <select id="custBlock" class="form-select">
                <option value="">-- வட்டாரத்தைத் தேர்ந்தெடுக்கவும் --</option>
                <option value="Koradachery">Koradachery (கொரடாச்சேரி)</option>
                <option value="Kottur">Kottur (கோட்டூர்)</option>
                <option value="Kudavasal">Kudavasal (குடவாசல்)</option>
                <option value="Mannargudi">Mannargudi (மன்னார்குடி)</option>
                <option value="Muthupet">Muthupet (முத்துப்பேட்டை)</option>
                <option value="Nannilam">Nannilam (நன்னிலம்)</option>
                <option value="Needamangalam">Needamangalam (நீடாமங்கலம்)</option>
                <option value="Thirumakkottai">Thirumakkottai (திருமக்கோட்டை)</option>
                <option value="Thiruthuraipoondi">Thiruthuraipoondi (திருத்துறைப்பூண்டி)</option>
                <option value="Thiruvarur">Thiruvarur (திருவாரூர்)</option>
                <option value="Other">Other / பிற வட்டாரம்</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">AI பொறுப்பாளர் பெயர் (AI Instructor Name) <span class="req">*</span></label>
          <input type="text" id="aiName" class="form-control" placeholder="Enter full name" required>
        </div>

        <div class="form-group">
          <label class="form-label">AI தொடர்பு எண் (Mobile / WhatsApp Number) <span class="req">*</span></label>
          <input type="tel" id="aiPhone" class="form-control" placeholder="10-digit mobile number" pattern="[0-9]{10}" required>
        </div>

        <div class="section-title" style="margin-top: 24px;">2. UPS பழுது & தொழில்நுட்ப நிலை (Technical Diagnosis)</div>
        
        <div class="checklist-box">
          <div class="checklist-title">💡 விரைவு சுய சரிபார்ப்பு (Quick Pre-Checks before submitting):</div>
          <div class="checklist-items">
            <label class="check-item">
              <input type="checkbox" id="chkInputPower">
              <span>Main Input Power / Phase Selector MCB ஆன் செய்யப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkUpsSwitch">
              <span>UPS Front Power Push Button இயக்கப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkBatteryBreaker">
              <span>பின்புற பேட்டரி பிரேக்கர் (DC Circuit Breaker) 'ON' நிலையில் உள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkEbTrip">
              <span>பள்ளி வளாக மின் இணைப்பு அல்லது மெயின் பியூஸ் ட்ரிப் ஆகாமல் உள்ளதா?</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">UPS-ல் ஏற்பட்டுள்ள முதன்மைப் பிரச்சனை (Primary Fault) <span class="req">*</span></label>
          <div class="radio-card">
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="Total Dead / No Power / Lab Off" required>
              <span>🔴 <strong>Total Dead / No Power:</strong> UPS ஆன் ஆகவில்லை, ஆய்வகம் முழுவதும் இயங்கவில்லை.</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="No Battery Backup / Trips Immediately">
              <span>🟠 <strong>No Backup / Trips Immediately:</strong> EB கரண்ட் நின்றவுடன் ஆய்வகம் உடனடியாக அணைந்துவிடுகிறது.</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="Continuous Beep Sound / Error Warning Light">
              <span>🟡 <strong>Continuous Beep Sound / Error Light:</strong> UPS-லிருந்து தொடர்ந்து அலாரம்/பீப் சத்தம் கேட்கிறது.</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="Isolation Transformer / MCB Tripping">
              <span>⚡ <strong>Isolation Transformer / MCB Tripping:</strong> பிரதான சுவிட்ச் அல்லது MCB தானாக ட்ரிப் ஆகிறது.</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="Battery Swollen / Acid Leakage / Burning Smell">
              <span>⚠️ <strong>Battery Swollen / Burning Smell:</strong> பேட்டரி வீக்கம் / புகை அல்லது துர்நாற்றம்.</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="upsStatus" value="Other Technical Glitch">
              <span>⚙️ <strong>Other Technical Glitch:</strong> பிற தொழில்நுட்பக் கோளாறு.</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">பழுது நீடிக்கும் காலம் (How long has this issue persisted?) <span class="req">*</span></label>
          <select id="duration" class="form-select" required>
            <option value="Today (இன்று முதல்)">Today (இன்று முதல்)</option>
            <option value="1-3 Days (1-3 நாட்கள்)">1-3 Days (1-3 நாட்கள்)</option>
            <option value="1 Week (1 வாரம்)">1 Week (1 வாரம்)</option>
            <option value="2 Weeks (2 வாரங்கள்)">2 Weeks (2 வாரங்கள்)</option>
            <option value="1 Month (1 மாதம்)">1 Month (1 மாதம்)</option>
            <option value="3 Months (3 மாதங்கள்)">3 Months (3 மாதங்கள்)</option>
            <option value="6 Months (6 மாதங்கள்)">6 Months (6 மாதங்கள்)</option>
            <option value="More than 6 Months (6 மாதங்களுக்கு மேல்)">More than 6 Months (6 மாதங்களுக்கு மேல்)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">UPS Serial Number (Optional / தெரிந்தால் பதிவு செய்யவும்)</label>
          <input type="text" id="serialNo" class="form-control" placeholder="e.g. EM-10KVA-2021-XXXX">
        </div>

        <div class="section-title" style="margin-top: 24px;">3. UPS ஆய்வகப் புகைப்படங்கள் (Visual Verification - 3 Photos) <span class="req">*</span></div>
        <p style="font-size: 12.5px; color: #dc2626; font-weight: 700; margin-bottom: 12px;">⚠️ கவனத்திற்கு: பொறியாளர் விரைவாகப் பழுதை உறுதிசெய்து சரிசெய்ய 3 புகைப்படங்களையும் இணைப்பது கட்டாயமாகும் (All 3 Photos are Mandatory).</p>

        <div class="photo-upload-grid">
          <!-- Photo 1 -->
          <div class="photo-upload-box" id="photoBox1">
            <div class="photo-header-area">
              <span class="photo-badge-num">📷 Photo 1</span>
              <div class="photo-title-text">UPS Display&nbsp;<span class="req">*</span></div>
              <span class="photo-sub-text">UPS டிஸ்ப்ளே நிலை</span>
            </div>

            <div id="btnGroup1" class="photo-drop-zone">
              <div class="photo-icon-circle">📸</div>
              <div class="photo-btn-group">
                <!-- Live Camera Input -->
                <input type="file" id="photoCam1" accept="image/*" capture="environment" class="file-input">
                <label for="photoCam1" class="btn-camera-snap">
                  <span>📷 Take Live Photo (கேமரா)</span>
                </label>

                <!-- Gallery / File Upload Input -->
                <input type="file" id="photoFile1" accept="image/*" class="file-input">
                <label for="photoFile1" class="btn-gallery-pick">
                  <span>📁 Choose from Gallery (கேலரி)</span>
                </label>
              </div>
            </div>

            <div id="previewWrap1" class="photo-preview-wrap">
              <img id="preview1" class="photo-preview-img" alt="UPS Display Preview">
              <span class="photo-success-badge">✅ இணைக்கப்பட்டது</span>
              <button type="button" onclick="retakePhoto(1)" class="btn-retake">🔄 மாற்ற / Retake</button>
            </div>
          </div>

          <!-- Photo 2 -->
          <div class="photo-upload-box" id="photoBox2">
            <div class="photo-header-area">
              <span class="photo-badge-num">🏢 Photo 2</span>
              <div class="photo-title-text">Overall UPS Setup Photo&nbsp;<span class="req">*</span></div>
              <span class="photo-sub-text">முழுமையான UPS அமைப்பு</span>
            </div>

            <div id="btnGroup2" class="photo-drop-zone">
              <div class="photo-icon-circle">🏫</div>
              <div class="photo-btn-group">
                <input type="file" id="photoCam2" accept="image/*" capture="environment" class="file-input">
                <label for="photoCam2" class="btn-camera-snap">
                  <span>📷 Take Live Photo (கேமரா)</span>
                </label>

                <input type="file" id="photoFile2" accept="image/*" class="file-input">
                <label for="photoFile2" class="btn-gallery-pick">
                  <span>📁 Choose from Gallery (கேலரி)</span>
                </label>
              </div>
            </div>

            <div id="previewWrap2" class="photo-preview-wrap">
              <img id="preview2" class="photo-preview-img" alt="Overall UPS Setup Preview">
              <span class="photo-success-badge">✅ இணைக்கப்பட்டது</span>
              <button type="button" onclick="retakePhoto(2)" class="btn-retake">🔄 மாற்ற / Retake</button>
            </div>
          </div>

          <!-- Photo 3 -->
          <div class="photo-upload-box" id="photoBox3">
            <div class="photo-header-area">
              <span class="photo-badge-num">⚡ Photo 3</span>
              <div class="photo-title-text">Battery Single MCB Photo&nbsp;<span class="req">*</span></div>
              <span class="photo-sub-text">பேட்டரி சிங்கிள் MCB</span>
            </div>

            <div id="btnGroup3" class="photo-drop-zone">
              <div class="photo-icon-circle">🔋</div>
              <div class="photo-btn-group">
                <input type="file" id="photoCam3" accept="image/*" capture="environment" class="file-input">
                <label for="photoCam3" class="btn-camera-snap">
                  <span>📷 Take Live Photo (கேமரா)</span>
                </label>

                <input type="file" id="photoFile3" accept="image/*" class="file-input">
                <label for="photoFile3" class="btn-gallery-pick">
                  <span>📁 Choose from Gallery (கேலரி)</span>
                </label>
              </div>
            </div>

            <div id="previewWrap3" class="photo-preview-wrap">
              <img id="preview3" class="photo-preview-img" alt="Battery Single MCB Preview">
              <span class="photo-success-badge">✅ இணைக்கப்பட்டது</span>
              <button type="button" onclick="retakePhoto(3)" class="btn-retake">🔄 மாற்ற / Retake</button>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">கூடுதல் தகவல்கள் / குறிப்புகள் (Additional Remarks)</label>
          <textarea id="remarks" class="form-control" rows="2" placeholder="ஏதேனும் கூடுதல் தகவல்கள் இருந்தால் குறிப்பிடவும்..."></textarea>
        </div>

        <button type="submit" id="btnSubmit" class="btn-submit">🚀 புகாரைப் பதிவு செய்க (Submit Incident)</button>
      </form>
    </div>

    <!-- Track Ticket Container (Private Search-Only) -->
    <div class="card" id="trackContainer" style="display:none;">
      <div class="section-title">🔍 உங்கள் புகாரின் நிலையைக் கண்டறியவும் (Track Ticket Status)</div>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">உங்கள் 11-இலக்க <strong>UDISE எண்</strong> அல்லது <strong>டிக்கெட் எண்ணை (எ.கா: HTL-TVR-05301)</strong> உள்ளிட்டுத் தேடவும்.</p>

      <div class="form-group">
        <label class="form-label">UDISE எண் / டிக்கெட் எண் / பள்ளிப் பெயர்: <span class="req">*</span></label>
        <div style="display:flex; gap:10px;">
          <input type="text" id="trackInput" class="form-control" placeholder="🔍 எ.கா: 33201000507 அல்லது HTL-TVR..." onkeydown="if(event.key==='Enter'){event.preventDefault();trackTicket();}">
          <button type="button" id="btnTrackSearch" onclick="trackTicket()" class="btn-submit" style="width:auto; padding:0 22px; white-space:nowrap; margin-top:0;">🔍 தேடுக</button>
        </div>
      </div>

      <!-- Live Detailed Ticket Card -->
      <div id="trackResultBox" style="display:none; margin-top:16px; animation: fadeIn 0.3s ease;">
        <div style="background:#f8fafc; border:2px solid #93c5fd; padding:18px; border-radius:14px; box-shadow:0 4px 12px rgba(37,99,235,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
            <div>
              <span class="ticket-badge" id="trackTicketBadge" style="margin:0 0 6px 0; font-size:14px; padding:4px 14px; background:#1e40af;">HTL-TVR-XXXX</span>
              <h3 id="trackSchoolName" style="font-size:16px; font-weight:800; color:#1e3a8a; margin:6px 0 2px 0;">-</h3>
              <div id="trackMeta" style="font-size:12.5px; color:#475569;">-</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; font-weight:700; color:#64748b; margin-bottom:4px;">தற்போதைய நிலை (Status)</div>
              <span id="trackStatusBadge" style="display:inline-block; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:800;">-</span>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; font-size:12.5px;">
            <div style="background:#ffffff; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0;">
              <span style="color:#64748b; font-weight:600; font-size:11.5px; display:block;">⚠️ பதிவு செய்யப்பட்ட பழுது:</span>
              <div id="trackIssue" style="font-weight:700; color:#0f172a; margin-top:3px;">-</div>
            </div>
            <div style="background:#ffffff; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0;">
              <span style="color:#64748b; font-weight:600; font-size:11.5px; display:block;">⏱️ பழுது நீடிக்கும் காலம்:</span>
              <div id="trackDuration" style="font-weight:700; color:#0f172a; margin-top:3px;">-</div>
            </div>
            <div style="background:#ffffff; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0;">
              <span style="color:#64748b; font-weight:600; font-size:11.5px; display:block;">👨‍🔧 களப் பொறியாளர் (Field Engineer):</span>
              <div style="font-weight:700; color:#1e3a8a; margin-top:3px;"><a href="tel:9042489993" style="color:#1e3a8a; text-decoration:none;">Mohamed Shameer • 9042489993</a></div>
            </div>
            <div style="background:#ffffff; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0;">
              <span style="color:#64748b; font-weight:600; font-size:11.5px; display:block;">🛠️ பொறியாளர் குறிப்புகள்:</span>
              <div id="trackNotes" style="font-weight:700; color:#15803d; margin-top:3px;">-</div>
            </div>
          </div>

          <!-- Progress Timeline -->
          <div style="margin-top:14px; border-top:1px solid #e2e8f0; padding-top:12px;">
            <strong style="color:#1e3a8a; font-size:13px; display:block; margin-bottom:10px;">📋 நடவடிக்கைக் காலவரிசை (Action Timeline):</strong>
            <div id="trackTimeline" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>
        </div>
      </div>

      <!-- Initial Search Placeholder -->
      <div id="trackPlaceholder" style="text-align:center; padding:35px 20px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; margin-top:16px;">
        <div style="font-size:36px; margin-bottom:8px;">🔍</div>
        <strong style="color:#1e3a8a; font-size:14.5px; display:block;">உங்கள் பள்ளியின் புகார் நிலையை அறிய மேலே தேடவும்</strong>
        <span style="color:#64748b; font-size:12.5px; margin-top:4px; display:block;">உங்கள் 11-இலக்க UDISE எண் (எ.கா: <strong>33201000507</strong>) அல்லது டிக்கெட் எண்ணை உள்ளிட்டு <strong>'தேடுக'</strong> பொத்தானை அழுத்தவும்.</span>
      </div>
    </div>

    <!-- Success Container -->
    <div class="success-card" id="successBox">
      <span style="font-size: 48px;">✅</span>
      <h2 style="margin-top: 8px;">டிக்கெட் வெற்றிகரமாகப் பதிவு செய்யப்பட்டது!</h2>
      <div class="ticket-badge" id="dispTicketId">HTL-TVR-XXXX</div>
      <p style="margin-top: 6px; font-size: 14px;">உங்கள் புகாருக்குரிய டிக்கெட் எண் உருவாக்கப்பட்டு களப் பொறியாளர் (Mohamed Shameer) கட்டுப்பாட்டு அறைக்கு அனுப்பப்பட்டுள்ளது.</p>
      <button type="button" onclick="location.reload()" class="btn-submit" style="width: auto; margin: 20px auto 0 auto; padding: 10px 24px;">
        🔄 மற்றொரு புகார் பதிவு செய்க
      </button>
    </div>
  </div>

  <script>
    const schoolsData = ${JSON.stringify(masterSchools)};
    const select = document.getElementById('schoolSelect');
    const searchInput = document.getElementById('schoolSearchInput');
    const suggestBox = document.getElementById('schoolSuggestionsBox');
    const searchWrap = document.getElementById('searchWrap');
    const verCard = document.getElementById('verifiedSchoolCard');
    const customBox = document.getElementById('customSchoolBox');

    let base64Photo1 = '';
    let base64Photo2 = '';
    let base64Photo3 = '';

    function switchTab(tab) {
      if (tab === 'log') {
        document.getElementById('tabLog').classList.add('active');
        document.getElementById('tabTrack').classList.remove('active');
        document.getElementById('formContainer').style.display = 'block';
        document.getElementById('trackContainer').style.display = 'none';
        document.getElementById('successBox').style.display = 'none';
      } else {
        document.getElementById('tabTrack').classList.add('active');
        document.getElementById('tabLog').classList.remove('active');
        document.getElementById('formContainer').style.display = 'none';
        document.getElementById('trackContainer').style.display = 'block';
        document.getElementById('successBox').style.display = 'none';
        setTimeout(function() {
          const inp = document.getElementById('trackInput');
          if (inp) inp.focus();
        }, 50);
      }
    }
    window.switchTab = switchTab;

    function findBestMatch(val) {
      const q = (val || '').trim().toLowerCase();
      if (!q) return null;
      const digits = q.replace(/\D/g, '');

      // 1. Exact UDISE (e.g. 33201000507)
      if (digits.length >= 6) {
        const byUdise = schoolsData.find(s => String(s.udise || '').replace(/\D/g, '') === digits);
        if (byUdise) return byUdise;
      }

      // 2. Partial UDISE match
      if (digits.length >= 4) {
        const byUdisePart = schoolsData.find(s => String(s.udise || '').replace(/\D/g, '').includes(digits));
        if (byUdisePart) return byUdisePart;
      }

      // 3. Exact School Name match
      const byName = schoolsData.find(s => (s.schoolName || '').toLowerCase() === q);
      if (byName) return byName;

      // 4. Word-by-word match
      const words = q.split(/\s+/).filter(Boolean);
      const byWords = schoolsData.find(s => {
        const n = (s.schoolName || '').toLowerCase();
        const b = (s.block || '').toLowerCase();
        return words.every(w => n.includes(w) || b.includes(w));
      });
      return byWords || null;
    }

    function filterSchools(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) return [];

      const digits = q.replace(/\D/g, '');
      const terms = q.split(/\s+/).filter(Boolean);

      return schoolsData.filter(function(s) {
        const u = String(s.udise || '').replace(/\D/g, '');
        const name = (s.schoolName || '').toLowerCase();
        const block = (s.block || '').toLowerCase();
        const ai = (s.aiName || '').toLowerCase();

        if (digits.length >= 2 && u.includes(digits)) {
          return true;
        }

        return terms.every(function(term) {
          return name.includes(term) || block.includes(term) || ai.includes(term) || u.includes(term);
        });
      });
    }

    function renderSuggestions(matches) {
      if (matches.length === 0) {
        suggestBox.innerHTML = '<div style="padding:14px; color:#64748b; font-size:13px; text-align:center;">❌ பள்ளி கிடைக்கவில்லை (No Matching School Found).<br><small style="color:#94a3b8;">UDISE எண் அல்லது பள்ளியின் பெயரைச் சரிபார்க்கவும்</small></div>';
        suggestBox.style.display = 'block';
        return;
      }

      suggestBox.innerHTML = matches.slice(0, 30).map(function(s) {
        return '<div class="suggest-item" data-id="' + s.id + '">' +
          '<div class="suggest-title">🏫 ' + s.schoolName + '</div>' +
          '<div class="suggest-meta"><span>📍 ' + s.block + ' Block</span><span>🔢 UDISE: <strong style="color:#2563eb;">' + s.udise + '</strong></span></div>' +
          '<div class="suggest-ai">👤 AI: ' + (s.aiName || 'Not Assigned') + ' • 📞 ' + (s.aiPhone || '-') + '</div>' +
        '</div>';
      }).join('');
      suggestBox.style.display = 'block';
    }

    suggestBox.addEventListener('pointerdown', function(e) {
      const item = e.target.closest('.suggest-item');
      if (item && item.dataset && item.dataset.id) {
        chooseSchool(item.dataset.id);
      }
    });

    suggestBox.addEventListener('click', function(e) {
      const item = e.target.closest('.suggest-item');
      if (item && item.dataset && item.dataset.id) {
        chooseSchool(item.dataset.id);
      }
    });

    function handleSearchInput() {
      const q = searchInput.value.trim();
      if (!q) {
        suggestBox.style.display = 'none';
        return;
      }

      const best = findBestMatch(q);
      const digits = q.replace(/\D/g, '');

      // Instant auto-select when 11-digit UDISE is typed/pasted
      if (digits.length === 11 && best) {
        chooseSchool(best.id);
        return;
      }

      const matches = filterSchools(q);
      renderSuggestions(matches);
    }

    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('change', handleSearchInput);
    searchInput.addEventListener('keyup', handleSearchInput);
    searchInput.addEventListener('paste', function() {
      setTimeout(handleSearchInput, 50);
    });

    searchInput.addEventListener('focus', function() {
      if (this.value.trim().length > 0) {
        const matches = filterSchools(this.value.trim());
        renderSuggestions(matches);
      }
    });

    function chooseSchool(id) {
      select.value = id;
      suggestBox.style.display = 'none';
      const item = schoolsData.find(function(s) { return s.id === id; });
      if (item) {
        document.getElementById('verSchoolName').textContent = item.schoolName;
        document.getElementById('verBlock').textContent = item.block;
        document.getElementById('verUdise').textContent = item.udise;
        document.getElementById('verAiName').textContent = item.aiName || '-';
        document.getElementById('verPhone').textContent = item.aiPhone || '-';

        verCard.style.display = 'block';
        searchWrap.style.display = 'none';
        if (customBox) customBox.style.display = 'none';

        if (item.aiName && item.aiName !== 'Not Found') document.getElementById('aiName').value = item.aiName;
        if (item.aiPhone && item.aiPhone !== 'Not Found') document.getElementById('aiPhone').value = item.aiPhone;
      }
    }

    function openOtherSchool() {
      select.value = 'OTHER';
      if (customBox) customBox.style.display = 'block';
      verCard.style.display = 'none';
      searchWrap.style.display = 'none';
      document.getElementById('custSchool').required = true;
      document.getElementById('custUdise').required = true;
      document.getElementById('custBlock').required = true;
    }

    function resetSchoolSelection() {
      select.value = '';
      verCard.style.display = 'none';
      if (customBox) customBox.style.display = 'none';
      document.getElementById('custSchool').required = false;
      document.getElementById('custUdise').required = false;
      document.getElementById('custBlock').required = false;
      searchWrap.style.display = 'block';
      searchInput.value = '';
      suggestBox.style.display = 'none';
      setTimeout(function() { searchInput.focus(); }, 50);
    }

    document.addEventListener('click', function(e) {
      if (!searchInput.contains(e.target) && !suggestBox.contains(e.target)) {
        suggestBox.style.display = 'none';
      }
    });

    select.addEventListener('change', function() {
      if (this.value === 'OTHER') {
        openOtherSchool();
      } else if (this.value) {
        chooseSchool(this.value);
      }
    });

    function setupPhotoInputs(index, callback) {
      const cam = document.getElementById('photoCam' + index);
      const file = document.getElementById('photoFile' + index);
      const preview = document.getElementById('preview' + index);
      const wrap = document.getElementById('previewWrap' + index);
      const btnGroup = document.getElementById('btnGroup' + index);

      function processFile(f) {
        if (!f) return;
        const img = new Image();
        const reader = new FileReader();
        reader.onload = function(ev) {
          img.src = ev.target.result;
          img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 1000;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            preview.src = dataUrl;
            wrap.style.display = 'block';
            btnGroup.style.display = 'none';
            callback(dataUrl);
          };
        };
        reader.readAsDataURL(f);
      }

      if (cam) cam.addEventListener('change', function(e) { processFile(e.target.files[0]); });
      if (file) file.addEventListener('change', function(e) { processFile(e.target.files[0]); });
    }

    function retakePhoto(index) {
      const cam = document.getElementById('photoCam' + index);
      const file = document.getElementById('photoFile' + index);
      if (cam) cam.value = '';
      if (file) file.value = '';
      document.getElementById('previewWrap' + index).style.display = 'none';
      document.getElementById('btnGroup' + index).style.display = 'flex';
      if (index === 1) base64Photo1 = '';
      else if (index === 2) base64Photo2 = '';
      else if (index === 3) base64Photo3 = '';
    }

    setupPhotoInputs(1, data => { base64Photo1 = data; });
    setupPhotoInputs(2, data => { base64Photo2 = data; });
    setupPhotoInputs(3, data => { base64Photo3 = data; });

    document.getElementById('incidentForm').addEventListener('submit', async function(e) {
      e.preventDefault();

      if (!select.value && searchInput.value.trim()) {
        const matches = filterSchools(searchInput.value.trim());
        if (matches.length > 0) {
          chooseSchool(matches[0].id);
        }
      }

      if (!select.value) {
        alert('தயவுசெய்து உங்கள் பள்ளியைத் தேர்ந்தெடுக்கவும் (Please select your school).');
        searchInput.focus();
        return;
      }

      if (!base64Photo1) {
        alert('⚠️ புகைப்படம் 1 கட்டாயம்! தயவுசெய்து "1. UPS Display (UPS டிஸ்ப்ளே நிலை)" புகைப்படத்தை கேமரா மூலம் படம் பிடித்து அல்லது கேலரியில் இருந்து பதிவேற்றவும்.');
        document.getElementById('photoBox1').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (!base64Photo2) {
        alert('⚠️ புகைப்படம் 2 கட்டாயம்! தயவுசெய்து "2. Overall UPS Setup Photo (முழுமையான UPS அமைப்பு)" புகைப்படத்தை கேமரா மூலம் படம் பிடித்து அல்லது கேலரியில் இருந்து பதிவேற்றவும்.');
        document.getElementById('photoBox2').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (!base64Photo3) {
        alert('⚠️ புகைப்படம் 3 கட்டாயம்! தயவுசெய்து "3. Battery Single MCB Photo (பேட்டரி சிங்கிள் MCB)" புகைப்படத்தை கேமரா மூலம் படம் பிடித்து அல்லது கேலரியில் இருந்து பதிவேற்றவும்.');
        document.getElementById('photoBox3').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const btn = document.getElementById('btnSubmit');
      btn.disabled = true;
      btn.textContent = 'டிக்கெட் பதிவாகிறது...';

      let schoolName = '';
      let udise = '';
      let block = '';

      if (select.value === 'OTHER') {
        schoolName = document.getElementById('custSchool').value;
        udise = document.getElementById('custUdise').value;
        block = document.getElementById('custBlock').value;
      } else {
        const schoolObj = schoolsData.find(s => s.id === select.value) || {};
        schoolName = schoolObj.schoolName || '';
        udise = schoolObj.udise || '';
        block = schoolObj.block || '';
      }

      const payload = {
        schoolId: select.value,
        schoolName: schoolName,
        udise: udise,
        block: block,
        aiName: document.getElementById('aiName').value,
        phone: document.getElementById('aiPhone').value,
        issue: document.querySelector('input[name="upsStatus"]:checked')?.value || '',
        duration: document.getElementById('duration').value,
        serialNo: document.getElementById('serialNo').value,
        photo1Base64: base64Photo1,
        photo2Base64: base64Photo2,
        photo3Base64: base64Photo3,
        remarks: document.getElementById('remarks').value
      };

      try {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          document.getElementById('dispTicketId').textContent = result.ticketId;
          document.getElementById('formContainer').style.display = 'none';
          document.getElementById('successBox').style.display = 'block';
        } else {
          alert('Error: ' + result.error);
          btn.disabled = false;
          btn.textContent = 'Log Service Ticket';
        }
      } catch (err) {
        alert('Submission failed. Please check internet connection.');
        btn.disabled = false;
        btn.textContent = 'Log Service Ticket';
      }
    });

    async function trackTicket() {
      const inputEl = document.getElementById('trackInput');
      const q = (inputEl ? inputEl.value : '').trim().toLowerCase();
      if (!q) {
        alert('தயவுசெய்து உங்கள் பள்ளியின் 11-இலக்க UDISE எண் அல்லது டிக்கெட் எண்ணை உள்ளிடவும்.');
        if (inputEl) inputEl.focus();
        return;
      }

      const box = document.getElementById('trackResultBox');
      const placeholder = document.getElementById('trackPlaceholder');
      const btn = document.getElementById('btnTrackSearch');

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'தேடுகிறது...';
      }

      try {
        const res = await fetch('/api/data?v=' + Date.now());
        const data = await res.json();
        const cleanQ = q.replace(/\D/g, '');

        const ticket = (data.tickets || []).find(function(t) {
          const tId = (t.ticketId || '').toLowerCase();
          const tUdise = String(t.udise || '').replace(/\D/g, '');
          const tSchool = (t.schoolName || '').toLowerCase();
          const tAi = (t.aiName || '').toLowerCase();
          const tPhone = String(t.phone || '').replace(/\D/g, '');

          if (tId === q || tId.includes(q)) return true;
          if (cleanQ && cleanQ.length >= 4 && tUdise.includes(cleanQ)) return true;
          if (tSchool.includes(q)) return true;
          if (tAi.includes(q)) return true;
          if (cleanQ && cleanQ.length >= 6 && tPhone.includes(cleanQ)) return true;
          return false;
        });

        if (!ticket) {
          alert('மன்னிக்கவும்! "' + q + '" என்ற விவரத்திற்குரிய புகார் எதுவும் கிடைக்கவில்லை. தயவுசெய்து டிக்கெட் எண் (எ.கா: HTL-TVR-05301) அல்லது 11-இலக்க UDISE எண்ணைச் சரிபார்த்து மீண்டும் தேடவும்.');
          if (box) box.style.display = 'none';
          if (placeholder) placeholder.style.display = 'block';
          return;
        }

        document.getElementById('trackTicketBadge').textContent = ticket.ticketId || 'TICKET';
        document.getElementById('trackSchoolName').textContent = ticket.schoolName || '-';
        document.getElementById('trackMeta').textContent = (ticket.block || '') + ' Block • UDISE: ' + (ticket.udise || '-') + ' • AI: ' + (ticket.aiName || '-') + ' (' + (ticket.phone || '-') + ')';

        document.getElementById('trackIssue').textContent = ticket.issue || 'UPS Technical Glitch';
        document.getElementById('trackDuration').textContent = ticket.duration || 'Reported';
        document.getElementById('trackNotes').textContent = ticket.resolutionNotes || (ticket.status === 'New / Under Review' ? 'பொறியாளர் பரிசீலனையில் உள்ளது (Awaiting Engineer Inspection)' : 'பணிகள் நடைபெற்று வருகின்றன');

        const badge = document.getElementById('trackStatusBadge');
        const st = ticket.status || 'New / Under Review';
        badge.textContent = st;

        if (st.includes('Resolved') || st.includes('Solved') || st.includes('Closed')) {
          badge.style.background = '#dcfce7'; badge.style.color = '#15803d'; badge.style.border = '1px solid #86efac';
        } else if (st.includes('Vendor')) {
          badge.style.background = '#fee2e2'; badge.style.color = '#b91c1c'; badge.style.border = '1px solid #fca5a5';
        } else if (st.includes('Progress') || st.includes('Visit Scheduled')) {
          badge.style.background = '#dbeafe'; badge.style.color = '#1e40af'; badge.style.border = '1px solid #93c5fd';
        } else {
          badge.style.background = '#fef3c7'; badge.style.color = '#b45309'; badge.style.border = '1px solid #fde68a';
        }

        const tl = document.getElementById('trackTimeline');
        const timelineList = ticket.timeline && ticket.timeline.length > 0 ? ticket.timeline : [
          { action: 'Ticket Logged by School AI', time: ticket.createdDate || ticket.createdAt || 'Recently', note: 'புகார் வெற்றிகரமாகப் பதிவு செய்யப்பட்டு களப் பொறியாளருக்கு அனுப்பப்பட்டது.' }
        ];

        tl.innerHTML = timelineList.map(function(e) {
          return '<div style="background:#ffffff; border-left:3px solid #2563eb; padding:8px 12px; border-radius:6px; margin-bottom:4px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">' +
            '<div style="font-size:12px; font-weight:700; color:#1e3a8a;">' + (e.action || 'Update') + ' <span style="color:#64748b; font-size:11px; font-weight:normal;">• ' + (e.time || '') + '</span></div>' +
            '<p style="color:#334155; font-size:11.5px; margin:3px 0 0 0;">' + (e.note || '') + '</p>' +
          '</div>';
        }).join('');

        if (placeholder) placeholder.style.display = 'none';
        if (box) {
          box.style.display = 'block';
          box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (e) {
        alert('டிக்கெட் விவரங்களை எடுப்பதில் பிழை ஏற்பட்டது. இணைய இணைப்பைச் சரிபார்க்கவும்.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '🔍 தேடுக';
        }
      }
    }
    window.trackTicket = trackTicket;

    const tLogEl = document.getElementById('tabLog');
    const tTrackEl = document.getElementById('tabTrack');
    const btnTrackSearchEl = document.getElementById('btnTrackSearch');

    if (tLogEl) tLogEl.addEventListener('click', function() { switchTab('log'); });
    if (tTrackEl) tTrackEl.addEventListener('click', function() { switchTab('track'); });
    if (btnTrackSearchEl) btnTrackSearchEl.addEventListener('click', trackTicket);
  </script>
</body>
</html>`;
}

function getITSMWorkbenchHtml() {
  return `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ITSM Field Engineer Workbench - Mohamed Shameer</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Tamil:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1d4ed8;
      --primary-hover: #1e40af;
      --bg: #f1f5f9;
      --card: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --info: #0284c7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', 'Noto Sans Tamil', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 18px; line-height: 1.5; }
    .container { max-width: 1480px; margin: 0 auto; }
    
    /* Top Header */
    .header {
      background: white; border: 1px solid var(--border); border-radius: 16px; padding: 18px 22px;
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04); flex-wrap: wrap; gap: 14px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-icon {
      width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: white; display: flex; align-items: center; justify-content: center; font-size: 22px;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);
    }
    .header-title h1 { font-size: 20px; font-weight: 800; color: #1e3a8a; }
    .header-sub { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .header-sub strong { color: #1e3a8a; }
    
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      padding: 9px 15px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 12.5px;
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; transition: all 0.15s ease;
    }
    .btn-green { background: #16a34a; color: white; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.2); }
    .btn-green:hover { background: #15803d; transform: translateY(-1px); }
    .btn-blue { background: #2563eb; color: white; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2); }
    .btn-blue:hover { background: #1d4ed8; transform: translateY(-1px); }
    .btn-reset { background: #ffffff; color: #dc2626; border: 1.5px solid #fca5a5; }
    .btn-reset:hover { background: #fef2f2; border-color: #dc2626; }
    .btn-logout { background: #ffffff; color: #475569; border: 1.5px solid #cbd5e1; }
    .btn-logout:hover { background: #f1f5f9; color: #0f172a; }
    
    /* KPI Metrics Cards */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .kpi-card {
      background: white; padding: 18px; border-radius: 14px; border: 1px solid var(--border);
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03); transition: all 0.2s ease;
    }
    .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06); }
    .kpi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .kpi-card span { font-size: 11.5px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-card h3 { font-size: 28px; font-weight: 800; line-height: 1.1; }

    /* Filter & Search Bar */
    .filter-bar {
      background: white; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--border);
      margin-bottom: 18px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);
    }
    .filter-search-wrap { flex: 1; min-width: 260px; position: relative; }
    .filter-search-input {
      width: 100%; padding: 10px 14px 10px 36px; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: 13.5px; outline: none; transition: all 0.2s ease;
    }
    .filter-search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
    .filter-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--text-muted); }
    .filter-select {
      padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 10px; font-size: 13px;
      font-weight: 600; background: #fff; outline: none; cursor: pointer;
    }
    .filter-select:focus { border-color: var(--primary); }

    /* Table */
    .table-card {
      background: white; border-radius: 16px; border: 1px solid var(--border);
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04); overflow: hidden;
    }
    .table-responsive { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    thead th {
      background: #f8fafc; padding: 14px 16px; font-weight: 800; color: #475569;
      border-bottom: 1.5px solid var(--border); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    tbody td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tbody tr:hover { background: #f8fafc; }

    /* Photo Thumbnails */
    .thumb-grid { display: flex; gap: 6px; }
    .thumb-img {
      width: 48px; height: 48px; object-fit: cover; border-radius: 8px; cursor: pointer;
      border: 1.5px solid #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: all 0.15s ease;
    }
    .thumb-img:hover { transform: scale(1.12); border-color: var(--primary); box-shadow: 0 4px 10px rgba(37,99,235,0.2); }
    .thumb-placeholder {
      width: 48px; height: 48px; border-radius: 8px; background: #f1f5f9; border: 1px dashed #cbd5e1;
      display: flex; align-items: center; justify-content: center; font-size: 16px; color: #94a3b8;
    }

    /* Badges */
    .badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; display: inline-block; }
    .badge-remote { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-direct { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .badge-vendor { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-open { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }

    .prio-pill { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; display: inline-block; margin-top: 4px; }
    .prio-crit { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .prio-high { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
    .prio-med { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
    .prio-low { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

    /* Action Buttons in Table */
    .action-col { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
    .btn-table-action {
      padding: 6px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center; gap: 5px;
      cursor: pointer; border: none; text-decoration: none; transition: all 0.15s ease;
    }
    .btn-table-manage { background: #2563eb; color: white; }
    .btn-table-manage:hover { background: #1d4ed8; }
    .btn-table-wa { background: #25d366; color: white; }
    .btn-table-wa:hover { background: #20ba5a; }
    .btn-table-slip { background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; }
    .btn-table-slip:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }

    /* ======================================================== */
    /* MODERN MODAL SYSTEM WITH STICKY HEADER, CLOSE & FOOTER   */
    /* ======================================================== */
    .modal-overlay {
      display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      align-items: center; justify-content: center; padding: 16px;
      animation: fadeInOverlay 0.2s ease;
    }
    @keyframes fadeInOverlay {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .modal-container {
      background: #ffffff; border-radius: 18px; width: 680px; max-width: 96vw; max-height: 90vh;
      display: flex; flex-direction: column; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border); overflow: hidden; animation: popUpModal 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes popUpModal {
      from { transform: scale(0.94); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    /* Modal Sticky Header */
    .modal-header {
      background: #ffffff; padding: 18px 22px; border-bottom: 1.5px solid var(--border);
      display: flex; justify-content: space-between; align-items: flex-start; position: sticky; top: 0; z-index: 10;
    }
    .modal-header-info h2 { font-size: 17.5px; font-weight: 800; color: #1e3a8a; }
    .modal-header-badge {
      display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800;
      padding: 2px 8px; border-radius: 999px; margin-bottom: 4px; border: 1px solid #bfdbfe;
    }
    .modal-header-sub { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }

    .btn-close-modal-x {
      background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; border-radius: 10px;
      width: 34px; height: 34px; font-size: 16px; font-weight: 800; display: flex;
      align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .btn-close-modal-x:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; transform: rotate(90deg); }

    /* Modal Scrollable Body */
    .modal-body {
      padding: 20px 22px; overflow-y: auto; flex: 1;
    }

    /* Modal Sticky Footer */
    .modal-footer {
      background: #f8fafc; padding: 14px 22px; border-top: 1.5px solid var(--border);
      display: flex; justify-content: space-between; align-items: center; position: sticky; bottom: 0; z-index: 10;
      flex-wrap: wrap; gap: 10px;
    }
    .modal-footer-right { display: flex; gap: 10px; }

    .modal-label { display: block; font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 6px; }

    /* Category Choice Grid */
    .cat-choice-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;
    }
    .cat-option-btn {
      padding: 12px 14px; border: 2px solid var(--border); border-radius: 12px; background: #fff;
      cursor: pointer; text-align: center; font-weight: 700; font-size: 13px; transition: all 0.15s ease;
    }
    .cat-option-btn:hover { border-color: #93c5fd; background: #f8fafc; }
    .cat-option-btn.active-remote { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
    .cat-option-btn.active-direct { border-color: #2563eb; background: #eff6ff; color: #1e40af; }
    .cat-sub { font-size: 11px; display: block; font-weight: 500; color: var(--text-muted); margin-top: 3px; }

    /* Modal 3-Photo Upload Area */
    .modal-photos-box {
      background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 14px; padding: 14px; margin-bottom: 16px;
    }
    .modal-photos-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;
    }
    .modal-photos-title { font-size: 12.5px; font-weight: 800; color: #1e293b; }
    .btn-ask-photos-wa {
      background: #25d366; color: white; border: none; padding: 5px 10px; border-radius: 8px;
      font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
      transition: all 0.15s ease;
    }
    .btn-ask-photos-wa:hover { background: #20ba5a; transform: translateY(-1px); }

    .modal-photo-3grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .modal-photo-card {
      background: white; border: 1.5px solid var(--border); border-radius: 10px; padding: 8px; text-align: center;
      transition: all 0.15s ease;
    }
    .modal-photo-card:hover { border-color: #93c5fd; }
    .modal-photo-label { font-size: 11px; font-weight: 800; color: #334155; margin-bottom: 6px; display: block; }
    .modal-photo-preview-wrap {
      height: 75px; background: #f1f5f9; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: center; margin-bottom: 6px; cursor: pointer; position: relative;
    }
    .modal-photo-preview-img { width: 100%; height: 100%; object-fit: cover; }
    .modal-photo-empty { font-size: 10.5px; color: #94a3b8; font-weight: 600; }
    .btn-choose-file {
      background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 10.5px; font-weight: 700;
      padding: 4px 8px; border-radius: 6px; cursor: pointer; display: block; margin-bottom: 4px;
    }
    .btn-choose-file:hover { background: #2563eb; color: white; }
    .btn-clear-photo {
      background: none; border: none; color: #ef4444; font-size: 10px; font-weight: 700; cursor: pointer;
    }

    /* Form Controls */
    .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .modal-select, .modal-input, .modal-textarea {
      width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: 13.5px; background: #ffffff; outline: none; transition: all 0.2s ease;
    }
    .modal-select:focus, .modal-input:focus, .modal-textarea:focus {
      border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
    }

    /* Quick Notes Pills */
    .quick-notes-box {
      background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
    }
    .quick-notes-title { font-size: 11.5px; font-weight: 700; color: #64748b; margin-bottom: 6px; display: block; }
    .quick-pill {
      background: #ffffff; border: 1.5px solid #cbd5e1; padding: 4px 9px; border-radius: 6px;
      font-size: 11px; font-weight: 700; color: #334155; cursor: pointer; margin: 2px;
      display: inline-block; transition: all 0.15s ease;
    }
    .quick-pill:hover { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; }

    /* Lightbox Modal */
    .lightbox-modal {
      display: none; position: fixed; z-index: 3000; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(6px); align-items: center; justify-content: center;
      padding: 20px; cursor: zoom-out;
    }
    .lightbox-card {
      background: white; border-radius: 16px; padding: 16px; max-width: 90vw; max-height: 90vh;
      display: flex; flex-direction: column; align-items: center; cursor: default;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .lightbox-header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .lightbox-img { max-width: 85vw; max-height: 75vh; width: auto; height: auto; object-fit: contain; border-radius: 10px; }

    @media (max-width: 768px) {
      body { padding: 10px; }
      .header { padding: 14px; }
      .header-title h1 { font-size: 17px; }
      .form-row-2 { grid-template-columns: 1fr; }
      .cat-choice-grid { grid-template-columns: 1fr; }
      .modal-photo-3grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Header -->
    <div class="header">
      <div class="header-left">
        <div class="header-icon">🛠️</div>
        <div class="header-title">
          <h1>Field Engineer Resolution Command Center</h1>
          <div class="header-sub">Logged in as: <strong>Mohamed Shameer (9042489993)</strong> • Thiruvarur District ITSM Hub (183 Schools)</div>
        </div>
      </div>
      <div class="actions">
        <button type="button" onclick="openResetModal()" class="btn btn-reset">🔄 Reset All</button>
        <a href="/head" class="btn btn-blue">📊 Executive Report</a>
        <a href="/download-excel" class="btn btn-green">📥 Export Master CSV</a>
        <a href="/login" class="btn btn-logout">🔒 Switch / Logout</a>
      </div>
    </div>

    <!-- KPI Metrics -->
    <div class="kpi-grid">
      <div class="kpi-card" style="border-left: 4px solid #2563eb;">
        <div class="kpi-top">
          <span>TOTAL SCHOOLS</span>
          <span style="font-size: 16px;">🏫</span>
        </div>
        <h3 id="kpiTotal" style="color: #0f172a;">183</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
        <div class="kpi-top">
          <span>REPORTED INCIDENTS</span>
          <span style="font-size: 16px;">📋</span>
        </div>
        <h3 id="kpiReported" style="color: #2563eb;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #16a34a;">
        <div class="kpi-top">
          <span>1. RESOLVED REMOTELY</span>
          <span style="font-size: 16px;">🟢</span>
        </div>
        <h3 id="kpiResolvedRemote" style="color: #16a34a;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #4f46e5;">
        <div class="kpi-top">
          <span>2. SOLVED BY DIRECT VISIT</span>
          <span style="font-size: 16px;">🔵</span>
        </div>
        <h3 id="kpiSolvedDirect" style="color: #4f46e5;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #dc2626;">
        <div class="kpi-top">
          <span>VENDOR ESCALATIONS</span>
          <span style="font-size: 16px;">🔴</span>
        </div>
        <h3 id="kpiVendor" style="color: #dc2626;">0</h3>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="filter-bar">
      <div class="filter-search-wrap">
        <span class="filter-search-icon">🔍</span>
        <input type="search" id="searchInput" name="htl_search_filter_box" class="filter-search-input" placeholder="Search Ticket ID, School Name, UDISE, AI Name, Issue..." oninput="renderTable()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      <select id="blockFilter" class="filter-select" onchange="renderTable()">
        <option value="">All Blocks (அனைத்து வட்டாரங்கள்)</option>
        <option value="Koradachery">Koradachery (கொரடாச்சேரி)</option>
        <option value="Kottur">Kottur (கோட்டூர்)</option>
        <option value="Kudavasal">Kudavasal (குடவாசல்)</option>
        <option value="Mannargudi">Mannargudi (மன்னார்குடி)</option>
        <option value="Muthupet">Muthupet (முத்துப்பேட்டை)</option>
        <option value="Nannilam">Nannilam (நன்னிலம்)</option>
        <option value="Needamangalam">Needamangalam (நீடாமங்கலம்)</option>
        <option value="Thirumakkottai">Thirumakkottai (திருமக்கோட்டை)</option>
        <option value="Thiruthuraipoondi">Thiruthuraipoondi (திருத்துறைப்பூண்டி)</option>
        <option value="Thiruvarur">Thiruvarur (திருவாரூர்)</option>
      </select>
      <select id="categoryFilter" class="filter-select" onchange="renderTable()">
        <option value="">All Resolution Categories</option>
        <option value="Resolved Remotely">🟢 1. Resolved Remotely (Phone/WhatsApp)</option>
        <option value="Solved by Direct Visit">🔵 2. Solved by Direct Visit (Physical Visit)</option>
        <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Needed)</option>
        <option value="Pending">🟡 புதிய புகார் / பரிசீலனை (New / Under Review)</option>
      </select>
    </div>

    <!-- Incident Tickets Table -->
    <div class="table-card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>3 Visual Photos</th>
              <th>School & Block</th>
              <th>AI Incharge</th>
              <th>Reported Issue & Priority</th>
              <th>Resolution Status</th>
              <th>Engineer Action Notes</th>
              <th style="text-align: center;">Action Workflow</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            <tr><td colspan="8" style="text-align:center; padding: 40px; color: #94a3b8;">Loading tickets...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- ACTION MODAL (MANAGE TICKET, SET RESOLUTION, EDIT PHOTOS) -->
  <!-- ======================================================== -->
  <div id="actionModal" class="modal-overlay" onclick="handleBackdropClick(event, 'actionModal')">
    <div class="modal-container" onclick="event.stopPropagation()">
      <!-- Sticky Modal Header -->
      <div class="modal-header">
        <div class="modal-header-info">
          <span class="modal-header-badge" id="modalTicketBadge">HTL-TVR-XXXX</span>
          <h2 id="modalTicketTitle">Manage Incident & Set Resolution</h2>
          <div class="modal-header-sub" id="modalTicketSub">School Name • Block Name</div>
        </div>
        <button type="button" class="btn-close-modal-x" onclick="closeActionModal()" title="Close Modal (மூடு / Esc)">✕</button>
      </div>

      <!-- Scrollable Modal Body -->
      <div class="modal-body">
        <!-- 1. Resolution Category Selection -->
        <label class="modal-label">1. முதன்மைத் தீர்வு முறை (Select Resolution Category): <span style="color:#dc2626;">*</span></label>
        <div class="cat-choice-grid">
          <div class="cat-option-btn" id="btnCatRemote" onclick="selectCategory('Resolved Remotely')">
            🟢 1. Resolved Remotely
            <span class="cat-sub">(தொலைபேசி / WhatsApp வழிகாட்டுதல் மூலம்)</span>
          </div>
          <div class="cat-option-btn" id="btnCatDirect" onclick="selectCategory('Solved by Direct Visit')">
            🔵 2. Solved by Direct Visit
            <span class="cat-sub">(நேரடிப் பள்ளி கள ஆய்வு மூலம்)</span>
          </div>
        </div>

        <!-- 2. Photo Upload & Replace Section -->
        <div class="modal-photos-box">
          <div class="modal-photos-header">
            <span class="modal-photos-title">📸 3 ஆய்வகப் புகைப்படங்கள் (Inspection Photos):</span>
            <button type="button" onclick="requestPhotosViaWhatsApp()" class="btn-ask-photos-wa">
              <span>📲</span>
              <span>Ask Photos on WhatsApp</span>
            </button>
          </div>

          <div class="modal-photo-3grid">
            <!-- Photo 1 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">1. UPS Display</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(1)">
                <img id="editPreview1" class="modal-photo-preview-img" style="display:none;" alt="UPS Display">
                <span id="noImg1" class="modal-photo-empty">📷 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile1" accept="image/*" style="display:none;" onchange="handlePhotoUpload(1, event)">
              </label>
              <button type="button" onclick="clearPhoto(1)" class="btn-clear-photo">✕ Clear</button>
            </div>

            <!-- Photo 2 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">2. Overall UPS Setup</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(2)">
                <img id="editPreview2" class="modal-photo-preview-img" style="display:none;" alt="Overall UPS">
                <span id="noImg2" class="modal-photo-empty">🏫 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile2" accept="image/*" style="display:none;" onchange="handlePhotoUpload(2, event)">
              </label>
              <button type="button" onclick="clearPhoto(2)" class="btn-clear-photo">✕ Clear</button>
            </div>

            <!-- Photo 3 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">3. Battery Single MCB</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(3)">
                <img id="editPreview3" class="modal-photo-preview-img" style="display:none;" alt="Battery Single MCB">
                <span id="noImg3" class="modal-photo-empty">🔋 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile3" accept="image/*" style="display:none;" onchange="handlePhotoUpload(3, event)">
              </label>
              <button type="button" onclick="clearPhoto(3)" class="btn-clear-photo">✕ Clear</button>
            </div>
          </div>
        </div>

        <!-- 3. Lifecycle Status & Priority -->
        <div class="form-row-2">
          <div>
            <label class="modal-label">Lifecycle Status:</label>
            <select id="modalStatus" class="modal-select">
              <option value="New / Under Review">🟡 புதிய புகார் / பரிசீலனை (New / Under Review)</option>
              <option value="In Progress (Remote)">🔵 In Progress (Remote Guidance)</option>
              <option value="Resolved Remotely">🟢 Resolved Remotely</option>
              <option value="Solved by Direct Visit">🔵 Solved by Direct Visit</option>
              <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Required)</option>
              <option value="Closed / Verified">✅ Closed & Verified</option>
            </select>
          </div>
          <div>
            <label class="modal-label">Priority Level:</label>
            <select id="modalPriority" class="modal-select">
              <option value="Critical (Lab Down)">🔴 Critical (Lab Down)</option>
              <option value="High (Power Risk)">🟠 High (Power Risk)</option>
              <option value="Medium">🟡 Medium (Warning)</option>
              <option value="Low">🟢 Low (Minor)</option>
            </select>
          </div>
        </div>

        <!-- Quick Notes Bar -->
        <div class="quick-notes-box">
          <span class="quick-notes-title">⚡ விரைவுக் குறிப்புகள் (Quick Resolution Notes):</span>
          <span class="quick-pill" onclick="applyQuickFix('Guided AI to reset backside MCB breaker; UPS started normally on load.', 'Resolved Remotely')">Remote: Backside MCB Reset</span>
          <span class="quick-pill" onclick="applyQuickFix('Switched Wall Circuit Breaker to ON; lab power active.', 'Resolved Remotely')">Remote: Circuit Breaker ON</span>
          <span class="quick-pill" onclick="applyQuickFix('Visited school on-site. Replaced 15A input fuse and tightened loose battery terminal lug.', 'Solved by Direct Visit')">Direct Visit: Fuse & Lug Fix</span>
          <span class="quick-pill" onclick="applyQuickFix('Visited school on-site. Replaced faulty MCB and re-calibrated inverter output voltage.', 'Solved by Direct Visit')">Direct Visit: MCB Replacement</span>
          <span class="quick-pill" onclick="applyQuickFix('Inverter PCB blown / Battery dead. On-site vendor technician required.', 'Vendor Escalated')">Vendor Escalation</span>
        </div>

        <!-- Vendor Escalation Section -->
        <div id="vendorBox" style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:12px; margin-bottom:14px; display:none;">
          <span style="font-size: 12.5px; font-weight: 800; color:#b91c1c; display:block; margin-bottom:8px;">🚨 Vendor Escalation Details:</span>
          <div class="form-row-2" style="margin-bottom:8px;">
            <input type="text" id="modalVendorName" class="modal-input" placeholder="Vendor Company (e.g. AVO / Delta)">
            <input type="text" id="modalVendorTicket" class="modal-input" placeholder="Vendor Call Log #">
          </div>
          <input type="text" id="modalParts" class="modal-input" placeholder="Spare Parts Required (e.g. Inverter PCB, 12V 42Ah Battery)">
        </div>

        <!-- Engineer Action Notes -->
        <label class="modal-label">பொறியாளர் தீர்வு மற்றும் செயல்பாட்டுக் குறிப்புகள் (Action Notes):</label>
        <textarea id="modalNotes" class="modal-textarea" rows="3" placeholder="Explain what action was taken (Remote phone guidance vs On-site physical fix)..."></textarea>
      </div>

      <!-- Sticky Modal Footer -->
      <div class="modal-footer">
        <button type="button" onclick="deleteCurrentTicket()" class="btn" style="background:#fee2e2; color:#b91c1c; border:1.5px solid #fca5a5; font-size:12px;">
          🗑️ Delete Ticket
        </button>
        <div class="modal-footer-right">
          <button type="button" onclick="closeActionModal()" class="btn btn-logout" style="padding:10px 18px;">
            ✕ Cancel / Close (மூடு)
          </button>
          <button type="button" id="btnSaveResolution" onclick="saveTicketUpdate()" class="btn btn-green" style="padding:10px 20px;">
            💾 Save & Update Ticket
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Image Lightbox Modal -->
  <div id="imgModal" class="lightbox-modal" onclick="closeImgModal()">
    <div class="lightbox-card" onclick="event.stopPropagation()">
      <div class="lightbox-header">
        <span style="font-size:14px; font-weight:800; color:#1e293b;">📸 UPS Visual Inspection Photo</span>
        <button type="button" onclick="closeImgModal()" class="btn-close-modal-x" style="width:30px; height:30px; font-size:14px;">✕</button>
      </div>
      <img id="modalImg" class="lightbox-img" alt="Zoomed inspection photo">
      <span style="margin-top:8px; font-size:12px; color:#64748b;">(Click anywhere outside or ✕ Close to return)</span>
    </div>
  </div>

  <!-- Reset Password Protection Modal -->
  <div id="resetModal" class="modal-overlay" onclick="handleBackdropClick(event, 'resetModal')">
    <div class="modal-container" style="width: 480px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div>
          <span class="modal-header-badge" style="background:#fee2e2; color:#dc2626; border-color:#fca5a5;">SECURITY CHECK</span>
          <h2 style="color: #b91c1c; margin-top:2px;">⚠️ Confirm Full Data Reset</h2>
        </div>
        <button type="button" class="btn-close-modal-x" onclick="closeResetModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px; color:#475569; margin-bottom:14px; line-height:1.5;">
          This action will <strong>permanently erase all logged incident tickets and history</strong> to start completely clean for all 183 schools.
        </p>
        <label class="modal-label">Enter Master Protection Password (பாதுகாப்பு கடவுச்சொல்):</label>
        <input type="password" id="resetPasswordInput" class="modal-input" placeholder="Enter Protection Password" onkeydown="if(event.key==='Enter'){executeSecureReset();}">
      </div>
      <div class="modal-footer" style="justify-content: flex-end;">
        <button type="button" onclick="closeResetModal()" class="btn btn-logout">Cancel</button>
        <button type="button" onclick="executeSecureReset()" class="btn btn-reset" style="background:#dc2626; color:white;">Confirm & Reset All</button>
      </div>
    </div>
  </div>

  <script>
    let allTickets = [];
    let currentEditingTicketId = null;
    let selectedCategory = 'Pending';
    let editPhoto1 = '';
    let editPhoto2 = '';
    let editPhoto3 = '';

    // Keyboard navigation (Esc key closes modals)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeActionModal();
        closeImgModal();
        closeResetModal();
      }
    });

    function handleBackdropClick(e, modalId) {
      if (e.target.id === modalId) {
        if (modalId === 'actionModal') closeActionModal();
        else if (modalId === 'resetModal') closeResetModal();
      }
    }

    function selectCategory(cat) {
      selectedCategory = cat;
      const bRem = document.getElementById('btnCatRemote');
      const bDir = document.getElementById('btnCatDirect');
      bRem.classList.remove('active-remote');
      bDir.classList.remove('active-direct');

      if (cat === 'Resolved Remotely') {
        bRem.classList.add('active-remote');
        document.getElementById('modalStatus').value = 'Resolved Remotely';
      } else if (cat === 'Solved by Direct Visit') {
        bDir.classList.add('active-direct');
        document.getElementById('modalStatus').value = 'Solved by Direct Visit';
      }
    }

    document.getElementById('modalStatus').addEventListener('change', function() {
      document.getElementById('vendorBox').style.display = (this.value === 'Vendor Escalated') ? 'block' : 'none';
      if (this.value === 'Resolved Remotely') selectCategory('Resolved Remotely');
      else if (this.value === 'Solved by Direct Visit') selectCategory('Solved by Direct Visit');
    });

    async function loadData() {
      const tbody = document.getElementById('tableBody');
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 9000);
      try {
        const res = await fetch('/api/data?v=' + Date.now(), { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 401) {
          window.location.href = '/login?redirect=/engineer';
          return;
        }
        const data = await res.json();
        allTickets = data.tickets || [];

        document.getElementById('kpiTotal').textContent = data.totalSchools || 183;
        document.getElementById('kpiReported').textContent = data.totalReported || 0;
        document.getElementById('kpiResolvedRemote').textContent = data.resolvedRemotelyCount || 0;
        document.getElementById('kpiSolvedDirect').textContent = data.solvedDirectVisitCount || 0;
        document.getElementById('kpiVendor').textContent = data.vendorCount || 0;

        renderTable();
      } catch (e) {
        clearTimeout(timeoutId);
        console.error('Data load error:', e);
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 35px 20px; color: #dc2626;">' +
            '<div style="font-size:26px; margin-bottom:6px;">⚠️</div>' +
            '<strong style="font-size:14px; display:block;">தகவல்களைப் பெறுவதில் தாமதம் / இணைப்புப் பிழை ஏற்பட்டது</strong>' +
            '<span style="font-size:12px; color:#64748b; margin-top:3px; display:block;">Network Timeout (>9s) or Connection Error.</span>' +
            '<button type="button" onclick="loadData()" class="btn btn-blue" style="margin-top:12px; padding:7px 16px;">🔄 மீண்டும் முயற்சிக்கவும் (Retry)</button>' +
          '</td></tr>';
        }
      }
    }

    function renderTable() {
      const search = (document.getElementById('searchInput').value || '').trim().toLowerCase();
      const block = (document.getElementById('blockFilter').value || '').trim().toLowerCase();
      const cat = (document.getElementById('categoryFilter').value || '').trim();

      const filtered = allTickets.filter(function(t) {
        const matchSearch = !search || 
          (t.schoolName || '').toLowerCase().includes(search) || 
          String(t.udise || '').includes(search) || 
          (t.aiName || '').toLowerCase().includes(search) ||
          (t.ticketId || '').toLowerCase().includes(search) ||
          (t.issue || '').toLowerCase().includes(search);

        const matchBlock = !block || (t.block || '').toLowerCase().includes(block);
        const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
        const matchCat = !cat || tCat === cat;

        return matchSearch && matchBlock && matchCat;
      });

      const tbody = document.getElementById('tableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: #64748b; font-size:14px;">🔍 No matching tickets found.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(function(t) {
        const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
        
        let badgeHtml = '<span class="badge badge-open">🟡 புதிய புகார் / பரிசீலனை (New / Under Review)</span>';
        if (tCat === 'Resolved Remotely') badgeHtml = '<span class="badge badge-remote">🟢 Resolved Remotely</span>';
        else if (tCat === 'Solved by Direct Visit') badgeHtml = '<span class="badge badge-direct">🔵 Solved by Direct Visit</span>';
        else if (t.status === 'Vendor Escalated') badgeHtml = '<span class="badge badge-vendor">🔴 Vendor Escalated</span>';

        let prioClass = 'prio-med';
        const p = t.priority || 'Medium';
        if (p.includes('Critical')) prioClass = 'prio-crit';
        else if (p.includes('High')) prioClass = 'prio-high';
        else if (p.includes('Low')) prioClass = 'prio-low';

        const waText = encodeURIComponent('வணக்கம் ' + (t.aiName || '') + ' ஆசிரியர் அவர்களுக்கு, நான் முகமது ஷமீர் (Field Engineer, Hi-Tech Lab). உங்கள் பள்ளியின் ' + (t.ticketId || '') + ' புகார் தொடர்பாக தொடர்பு கொள்கிறேன்.');
        const cleanPhone = String(t.phone || '').replace(/\D/g, '');
        const waLink = 'https://wa.me/91' + cleanPhone + '?text=' + waText;

        return '<tr>' +
          '<td>' +
            '<strong style="color:#1e3a8a; font-size:13.5px;">' + t.ticketId + '</strong>' +
            '<div style="color:#64748b; font-size:11.5px; margin-top:2px;">' + (t.createdDate || t.createdAt || '-') + '</div>' +
          '</td>' +
          '<td>' +
            '<div class="thumb-grid">' +
              (t.photo1Url ? '<img src="' + t.photo1Url + '" class="thumb-img" onclick="showImgModal(this.src)" title="1. UPS Display">' : '<div class="thumb-placeholder" title="No Photo 1">📷</div>') +
              (t.photo2Url ? '<img src="' + t.photo2Url + '" class="thumb-img" onclick="showImgModal(this.src)" title="2. Overall UPS">' : '<div class="thumb-placeholder" title="No Photo 2">🏫</div>') +
              (t.photo3Url ? '<img src="' + t.photo3Url + '" class="thumb-img" onclick="showImgModal(this.src)" title="3. Battery MCB">' : '<div class="thumb-placeholder" title="No Photo 3">🔋</div>') +
            '</div>' +
          '</td>' +
          '<td>' +
            '<strong style="color:#0f172a; font-size:13.5px;">' + t.schoolName + '</strong>' +
            '<div style="color:#64748b; font-size:12px; margin-top:2px;">' + t.block + ' Block • <strong style="color:#2563eb;">' + t.udise + '</strong></div>' +
          '</td>' +
          '<td>' +
            '<div style="font-weight:700; color:#0f172a;">' + (t.aiName || '-') + '</div>' +
            '<a href="tel:' + cleanPhone + '" style="color:#2563eb; font-weight:700; font-size:12px; text-decoration:none;">📞 ' + (t.phone || '-') + '</a>' +
          '</td>' +
          '<td>' +
            '<div style="font-weight:700; color:#1e3a8a; font-size:12.5px;">' + t.issue + '</div>' +
            '<span class="prio-pill ' + prioClass + '">' + p + '</span>' +
          '</td>' +
          '<td>' + badgeHtml + '</td>' +
          '<td>' +
            '<div style="font-size:12px; max-width:240px;">' +
              (t.resolutionNotes ? '<div><strong>Notes:</strong> ' + t.resolutionNotes + '</div>' : '') +
              (t.vendorName ? '<div style="color:#b91c1c; margin-top:2px;"><strong>Vendor:</strong> ' + t.vendorName + ' (' + (t.vendorTicketNo || 'Pending #') + ')</div>' : '') +
              (!t.resolutionNotes && !t.vendorName ? '<span style="color:#94a3b8; font-style:italic;">Pending engineer review</span>' : '') +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div class="action-col">' +
              '<button type="button" data-tid="' + t.ticketId + '" onclick="openActionModal(this.dataset.tid)" class="btn-table-action btn-table-manage">⚙️ Manage & Fix</button>' +
              '<a href="' + waLink + '" target="_blank" class="btn-table-action btn-table-wa">💬 WhatsApp AI</a>' +
              '<button type="button" data-tid="' + t.ticketId + '" onclick="printServiceSlip(this.dataset.tid)" class="btn-table-action btn-table-slip">📄 Service Slip</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function showImgModal(src) {
      if (!src) return;
      document.getElementById('modalImg').src = src;
      document.getElementById('imgModal').style.display = 'flex';
    }

    function closeImgModal() {
      document.getElementById('imgModal').style.display = 'none';
      document.getElementById('modalImg').src = '';
    }

    function viewPhotoInModal(index) {
      const val = (index === 1) ? editPhoto1 : ((index === 2) ? editPhoto2 : editPhoto3);
      if (val && val.length > 50) {
        showImgModal(val);
      }
    }

    function updatePhotoPreviews() {
      for (let i = 1; i <= 3; i++) {
        const val = (i === 1) ? editPhoto1 : ((i === 2) ? editPhoto2 : editPhoto3);
        const img = document.getElementById('editPreview' + i);
        const noImg = document.getElementById('noImg' + i);
        if (val && val.length > 50) {
          img.src = val;
          img.style.display = 'block';
          noImg.style.display = 'none';
        } else {
          img.src = '';
          img.style.display = 'none';
          noImg.style.display = 'block';
        }
      }
    }

    function handlePhotoUpload(index, event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxDim = 1000;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);

          if (index === 1) editPhoto1 = compressed;
          else if (index === 2) editPhoto2 = compressed;
          else if (index === 3) editPhoto3 = compressed;

          updatePhotoPreviews();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function clearPhoto(index) {
      if (index === 1) editPhoto1 = '';
      else if (index === 2) editPhoto2 = '';
      else if (index === 3) editPhoto3 = '';
      updatePhotoPreviews();
    }

    function requestPhotosViaWhatsApp() {
      if (!currentEditingTicketId) return;
      const t = allTickets.find(i => i.ticketId === currentEditingTicketId);
      if (!t) return;

      const nl = String.fromCharCode(10);
      const text = 'வணக்கம் ' + (t.aiName || '') + ' ஆசிரியர் அவர்களுக்கு, நான் முகமது ஷமீர் (Field Engineer, Hi-Tech Lab).' + nl + nl +
        t.schoolName + ' பள்ளியின் Hi-Tech Lab UPS பழுது நீக்கப் பணிகளுக்காக, கீழ்க்கண்ட 3 புகைப்படங்களை இந்த வாட்ஸ்அப் எண்ணிற்கு அனுப்பி உதவவும்:' + nl +
        '1. UPS Display (UPS டிஸ்ப்ளே நிலை)' + nl +
        '2. Overall UPS Setup Photo (முழுமையான UPS அமைப்பு)' + nl +
        '3. Battery Single MCB Photo (பேட்டரி சிங்கிள் MCB)' + nl + nl +
        'நன்றி!';
      const msg = encodeURIComponent(text);
      const cleanPhone = String(t.phone || '').replace(/\D/g, '');
      window.open('https://wa.me/91' + cleanPhone + '?text=' + msg, '_blank');
    }

    function openActionModal(ticketId) {
      currentEditingTicketId = ticketId;
      const t = allTickets.find(i => i.ticketId === ticketId);
      if (t) {
        document.getElementById('modalTicketBadge').textContent = t.ticketId || 'TICKET';
        document.getElementById('modalTicketTitle').textContent = 'Manage Incident: ' + (t.ticketId || '');
        document.getElementById('modalTicketSub').textContent = (t.schoolName || '') + ' • ' + (t.block || '') + ' Block (UDISE: ' + (t.udise || '') + ')';
        
        document.getElementById('modalStatus').value = t.status || 'New / Under Review';
        document.getElementById('modalPriority').value = t.priority || 'Medium';
        document.getElementById('modalVendorName').value = t.vendorName || '';
        document.getElementById('modalVendorTicket').value = t.vendorTicketNo || '';
        document.getElementById('modalParts').value = t.partsRequired || '';
        document.getElementById('modalNotes').value = t.resolutionNotes || '';
        document.getElementById('vendorBox').style.display = (t.status === 'Vendor Escalated') ? 'block' : 'none';

        editPhoto1 = t.photo1Url || '';
        editPhoto2 = t.photo2Url || '';
        editPhoto3 = t.photo3Url || '';
        updatePhotoPreviews();

        const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
        selectCategory(tCat);

        document.getElementById('actionModal').style.display = 'flex';
      }
    }

    function closeActionModal() {
      document.getElementById('actionModal').style.display = 'none';
      currentEditingTicketId = null;
    }

    function applyQuickFix(text, cat) {
      document.getElementById('modalNotes').value = text;
      selectCategory(cat);
      if (cat === 'Vendor Escalated') {
        document.getElementById('modalStatus').value = 'Vendor Escalated';
        document.getElementById('vendorBox').style.display = 'block';
      }
    }

    async function saveTicketUpdate() {
      if (!currentEditingTicketId) return;

      const btn = document.getElementById('btnSaveResolution');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'சேமிக்கப்படுகிறது...';
      }

      const payload = {
        ticketId: currentEditingTicketId,
        status: document.getElementById('modalStatus').value,
        priority: document.getElementById('modalPriority').value,
        resolutionCategory: selectedCategory,
        vendorName: document.getElementById('modalVendorName').value,
        vendorTicketNo: document.getElementById('modalVendorTicket').value,
        partsRequired: document.getElementById('modalParts').value,
        resolutionNotes: document.getElementById('modalNotes').value,
        photo1Url: editPhoto1,
        photo2Url: editPhoto2,
        photo3Url: editPhoto3
      };

      try {
        const res = await fetch('/api/tickets/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          closeActionModal();
          loadData();
        } else {
          alert('Error: ' + result.error);
        }
      } catch(e) {
        alert('Update failed. Please check internet connection.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '💾 Save & Update Ticket';
        }
      }
    }

    function printServiceSlip(ticketId) {
      const t = allTickets.find(i => i.ticketId === ticketId);
      if (!t) return;

      const w = window.open('', '_blank');
      w.document.write('<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
          '<title>Field Service Slip - ' + t.ticketId + '</title>' +
          '<style>' +
            'body { font-family: Segoe UI, Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.5; }' +
            '.header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; }' +
            '.header h1 { font-size: 20px; color: #1e3a8a; margin: 0 0 4px 0; }' +
            '.header h2 { font-size: 15px; color: #475569; margin: 0; }' +
            '.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }' +
            '.field { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; }' +
            '.field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }' +
            '.field-val { font-size: 13.5px; font-weight: 600; color: #0f172a; margin-top: 2px; }' +
            '.photo-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 16px 0; }' +
            '.photo-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; text-align: center; background: #fafafa; }' +
            '.photo-card img { width: 100%; height: 130px; object-fit: cover; border-radius: 4px; }' +
            '.photo-label { font-size: 11px; font-weight: 700; color: #475569; margin-top: 4px; }' +
            '.sig-box { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 20px; }' +
            '.sig-line { border-top: 1.5px dashed #64748b; text-align: center; padding-top: 8px; font-size: 12px; font-weight: 700; }' +
            '@media print { .no-print { display: none; } }' +
          '</style>' +
        '</head>' +
        '<body>' +
          '<div class="no-print" style="margin-bottom: 16px; text-align: right;">' +
            '<button onclick="window.print()" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer;">🖨️ Print Service Slip</button>' +
          '</div>' +
          '<div class="header">' +
            '<h1>DIRECTORATE OF SCHOOL EDUCATION • GOVERNMENT OF TAMIL NADU</h1>' +
            '<h2>Hi-Tech Lab UPS Maintenance & Incident Resolution Service Slip (Thiruvarur District)</h2>' +
          '</div>' +
          '<div class="grid">' +
            '<div class="field"><div class="field-label">Ticket ID</div><div class="field-val">' + t.ticketId + '</div></div>' +
            '<div class="field"><div class="field-label">Logged Date & Time</div><div class="field-val">' + (t.createdDate || t.createdAt || '-') + '</div></div>' +
            '<div class="field"><div class="field-label">School Name</div><div class="field-val">' + t.schoolName + '</div></div>' +
            '<div class="field"><div class="field-label">Block & UDISE</div><div class="field-val">' + t.block + ' • ' + t.udise + '</div></div>' +
            '<div class="field"><div class="field-label">AI Incharge Name</div><div class="field-val">' + (t.aiName || '-') + '</div></div>' +
            '<div class="field"><div class="field-label">Contact Number</div><div class="field-val">' + (t.phone || '-') + '</div></div>' +
            '<div class="field"><div class="field-label">Reported Issue</div><div class="field-val">' + t.issue + '</div></div>' +
            '<div class="field"><div class="field-label">Resolution Status</div><div class="field-val">' + t.status + ' (' + (t.resolutionCategory || 'Standard') + ')</div></div>' +
          '</div>' +
          '<div class="field" style="margin-bottom: 16px;">' +
            '<div class="field-label">Engineer Diagnosis & Action Notes:</div>' +
            '<div class="field-val" style="font-weight: normal; margin-top: 4px;">' + (t.resolutionNotes || 'Guided AI Teacher to inspect breaker/isolation switches and perform safe restart.') + '</div>' +
          '</div>' +
          '<div class="field-label" style="margin-bottom: 6px;">Visual Inspection Photos:</div>' +
          '<div class="photo-grid">' +
            '<div class="photo-card">' +
              (t.photo1Url ? '<img src="' + t.photo1Url + '">' : '<div style="height:130px; display:flex; align-items:center; justify-content:center; color:#94a3b8;">No Image</div>') +
              '<div class="photo-label">1. UPS Display</div>' +
            '</div>' +
            '<div class="photo-card">' +
              (t.photo2Url ? '<img src="' + t.photo2Url + '">' : '<div style="height:130px; display:flex; align-items:center; justify-content:center; color:#94a3b8;">No Image</div>') +
              '<div class="photo-label">2. Overall UPS Setup</div>' +
            '</div>' +
            '<div class="photo-card">' +
              (t.photo3Url ? '<img src="' + t.photo3Url + '">' : '<div style="height:130px; display:flex; align-items:center; justify-content:center; color:#94a3b8;">No Image</div>') +
              '<div class="photo-label">3. Battery Single MCB</div>' +
            '</div>' +
          '</div>' +
          '<div class="sig-box">' +
            '<div class="sig-line">' +
              'Signature of School AI Incharge / Headmaster<br>' +
              '<small style="font-weight:normal; color:#64748b;">(' + (t.aiName || 'AI Incharge') + ')</small>' +
            '</div>' +
            '<div class="sig-line">' +
              'Signature of Field Engineer<br>' +
              '<small style="font-weight:normal; color:#64748b;">(Mohamed Shameer • 9042489993)</small>' +
            '</div>' +
          '</div>' +
        '</body>' +
        '</html>');
      w.document.close();
    }

    async function deleteCurrentTicket() {
      if (!currentEditingTicketId) return;
      if (!confirm('Are you sure you want to permanently delete ticket ' + currentEditingTicketId + '?')) return;

      try {
        const res = await fetch('/api/tickets/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: currentEditingTicketId, password: '1234' })
        });
        const d = await res.json();
        if (d.success) {
          closeActionModal();
          loadData();
        } else {
          alert('Delete failed: ' + d.error);
        }
      } catch(e) {
        alert('Delete request failed.');
      }
    }

    function openResetModal() {
      document.getElementById('resetPasswordInput').value = '';
      document.getElementById('resetModal').style.display = 'flex';
      setTimeout(function() {
        document.getElementById('resetPasswordInput').focus();
      }, 50);
    }

    function closeResetModal() {
      document.getElementById('resetModal').style.display = 'none';
    }

    async function executeSecureReset() {
      const pwd = document.getElementById('resetPasswordInput').value.trim();
      if (!pwd) {
        alert('Please enter the Master Protection Password.');
        return;
      }
      try {
        const res = await fetch('/api/reset-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const d = await res.json();
        if (d.success) {
          alert('✅ All data has been cleanly reset to 0 tickets!');
          closeResetModal();
          loadData();
        } else {
          alert('❌ ' + d.error);
        }
      } catch(e) {
        alert('Reset request failed.');
      }
    }

    loadData();
    setInterval(loadData, 5000);
    // Clear accidental browser password autofill from search box
    setTimeout(function() {
      const si = document.getElementById('searchInput');
      if (si && (si.value.toLowerCase() === 'shameer' || si.value.toLowerCase() === 'engineer' || si.value.toLowerCase() === 'head' || si.value.toLowerCase() === 'admin')) {
        si.value = '';
        renderTable();
      }
    }, 150);
  </script>
</body>
</html>`;
}

function getITSMExecutiveHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Reporting Portal - Thiruvarur District Hi-Tech Labs</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: #f8fafc; color: #0f172a; padding: 24px; line-height: 1.5; }
    .container { max-width: 1400px; margin: 0 auto; }
    
    .header-banner {
      background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px;
      margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);
    }
    .header-banner h1 { font-size: 24px; font-weight: 800; color: #1e3a8a; }
    .header-banner p { font-size: 14px; color: #64748b; margin-top: 4px; }
    
    .actions { display: flex; gap: 10px; }
    .btn {
      padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px;
      display: inline-flex; align-items: center; gap: 8px; cursor: pointer; border: none;
    }
    .btn-excel { background: #16a34a; color: white; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.2); }
    .btn-excel:hover { background: #15803d; }
    .btn-print { background: #1e293b; color: white; }
    .btn-print:hover { background: #0f172a; }
    .btn-reset { background: #dc2626; color: white; }
    .btn-reset:hover { background: #b91c1c; }

    .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: white; padding: 20px; border-radius: 14px; border: 1px solid #e2e8f0; }
    .kpi-card span { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .kpi-card h3 { font-size: 28px; font-weight: 800; margin-top: 4px; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1.6fr; gap: 20px; margin-bottom: 24px; }
    .card { background: white; border-radius: 14px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .card-title { font-size: 16px; font-weight: 800; margin-bottom: 16px; color: #1e3a8a; }

    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #f8fafc; padding: 12px 14px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:hover { background: #f8fafc; }

    .thumb-img { width: 44px; height: 44px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #cbd5e1; margin-right: 3px; }

    /* Modal */
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; }
    .action-modal { background: white; padding: 24px; border-radius: 16px; width: 480px; max-width: 95%; }
    .action-modal h2 { font-size: 18px; font-weight: 800; margin-bottom: 14px; color: #1e3a8a; }
    .action-modal input { width: 100%; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13.5px; margin-bottom: 12px; }

    @media print {
      body { padding: 0; background: white; }
      .actions, .btn { display: none !important; }
      .header-banner { border: none; box-shadow: none; padding: 0; margin-bottom: 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-banner">
      <div>
        <h1>Executive Service Desk & Resolution Action Center</h1>
        <p>Tamil Nadu School ICT Project • Thiruvarur District (All 183 Hi-Tech Lab Schools)</p>
      </div>
      <div class="actions">
        <button onclick="openResetModal()" class="btn btn-reset">🔄 Reset All Data</button>
        <button onclick="window.print()" class="btn btn-print">🖨️ Print Executive Report</button>
        <a href="/download-excel" class="btn btn-excel">📥 Export Master Excel (.CSV)</a>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card">
        <span>TOTAL SCHOOLS</span>
        <h3 id="headTotal">183</h3>
      </div>
      <div class="kpi-card">
        <span>TOTAL REPORTED</span>
        <h3 id="headReported" style="color: #2563eb;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #16a34a;">
        <span>1. RESOLVED REMOTELY</span>
        <h3 id="headResolvedRemote" style="color: #16a34a;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #4f46e5;">
        <span>2. SOLVED BY DIRECT VISIT</span>
        <h3 id="headSolvedDirect" style="color: #4f46e5;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #dc2626;">
        <span>VENDOR ESCALATIONS</span>
        <h3 id="headVendor" style="color: #dc2626;">0</h3>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">📍 10 Blocks Resolution Matrix</div>
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Total</th>
              <th>Reported</th>
              <th>Resolved Remote</th>
              <th>Solved Direct</th>
              <th>Vendor</th>
            </tr>
          </thead>
          <tbody id="blockTableBody">
            <tr><td colspan="6" style="text-align:center; padding: 20px; color:#94a3b8;">Loading blocks...</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">🚨 Actionable Hardware / Vendor Replacement Escalations</div>
        <table>
          <thead>
            <tr>
              <th>Ticket & Photos</th>
              <th>School & Block</th>
              <th>Fault & Serial No</th>
              <th>Vendor & Call #</th>
              <th>Parts Required</th>
            </tr>
          </thead>
          <tbody id="vendorTableBody">
            <tr><td colspan="5" style="text-align:center; padding: 20px; color:#94a3b8;">No pending vendor escalations.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Reset Password Protection Modal -->
  <div id="resetModal" class="modal">
    <div class="action-modal">
      <h2 style="color: #b91c1c; display:flex; align-items:center; gap:8px;">⚠️ Confirm Full Data Reset</h2>
      <p style="font-size:13px; color:#475569; margin-bottom:14px;">This action will <strong>permanently erase all logged incident tickets and history</strong> to start completely clean for all 183 schools.</p>
      
      <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">Enter Master Security Protection Password (பாதுகாப்பு கடவுச்சொல்):</label>
      <input type="password" id="resetPasswordInput" placeholder="Enter Protection Password" style="margin-bottom:14px;">
      
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button onclick="closeResetModal()" class="btn" style="background:#e2e8f0; color:#475569;">Cancel</button>
        <button onclick="executeSecureReset()" class="btn btn-reset">Confirm & Reset All</button>
      </div>
    </div>
  </div>

  <script>
    async function loadData() {
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 9000);
      try {
        const res = await fetch('/api/data');
        const data = await res.json();

        document.getElementById('headTotal').textContent = data.totalSchools;
        document.getElementById('headReported').textContent = data.totalReported;
        document.getElementById('headResolvedRemote').textContent = data.resolvedRemotelyCount;
        document.getElementById('headSolvedDirect').textContent = data.solvedDirectVisitCount;
        document.getElementById('headVendor').textContent = data.vendorCount;

        const blockBody = document.getElementById('blockTableBody');
        const blocks = data.blockStats || {};
        blockBody.innerHTML = Object.keys(blocks).map(function(b) {
          return '<tr>' +
            '<td><strong>' + b + '</strong></td>' +
            '<td>' + blocks[b].total + '</td>' +
            '<td><strong>' + blocks[b].reported + '</strong></td>' +
            '<td><span style="color:#16a34a; font-weight:700;">' + blocks[b].resolvedRemote + '</span></td>' +
            '<td><span style="color:#4f46e5; font-weight:700;">' + blocks[b].solvedDirect + '</span></td>' +
            '<td><span style="color:#dc2626; font-weight:700;">' + blocks[b].vendor + '</span></td>' +
          '</tr>';
        }).join('');

        const vendorBody = document.getElementById('vendorTableBody');
        const vendorList = (data.tickets || []).filter(t => t.status === 'Vendor Escalated');
        if (vendorList.length === 0) {
          vendorBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#64748b;">No issues currently flagged for physical vendor replacement.</td></tr>';
          return;
        }

        vendorBody.innerHTML = vendorList.map(function(t) {
          return '<tr>' +
            '<td>' +
              '<strong>' + t.ticketId + '</strong><br>' +
              '<div style="display:flex; margin-top:4px;">' +
                (t.photo1Url ? '<img src="' + t.photo1Url + '" class="thumb-img" onclick="window.open(this.src)" title="Front Display">' : '') +
                (t.photo2Url ? '<img src="' + t.photo2Url + '" class="thumb-img" onclick="window.open(this.src)" title="Overall UPS">' : '') +
                (t.photo3Url ? '<img src="' + t.photo3Url + '" class="thumb-img" onclick="window.open(this.src)" title="Battery/MCB">' : '') +
              '</div>' +
            '</td>' +
            '<td><strong>' + t.schoolName + '</strong><br><small style="color:#64748b;">' + t.block + ' • ' + t.udise + '</small></td>' +
            '<td><span style="font-weight:600; color:#dc2626;">' + t.issue + '</span><br><small>S/N: ' + (t.serialNo || 'N/A') + '</small></td>' +
            '<td><strong>' + (t.vendorName || 'AVO / Vendor') + '</strong><br><small>Call #: ' + (t.vendorTicketNo || 'Pending') + '</small></td>' +
            '<td><small style="color:#b91c1c; font-weight:700;">' + (t.partsRequired || 'On-site Inspection Required') + '</small></td>' +
          '</tr>';
        }).join('');

      } catch(e) {
        console.error(e);
      }
    }

    function openResetModal() {
      document.getElementById('resetPasswordInput').value = '';
      document.getElementById('resetModal').style.display = 'flex';
    }

    function closeResetModal() {
      document.getElementById('resetModal').style.display = 'none';
    }

    async function executeSecureReset() {
      const pwd = document.getElementById('resetPasswordInput').value.trim();
      if (!pwd) {
        alert('Please enter the Master Protection Password.');
        return;
      }
      try {
        const res = await fetch('/api/reset-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const d = await res.json();
        if (d.success) {
          alert('✅ All data has been cleanly reset to 0 tickets!');
          closeResetModal();
          loadData();
        } else {
          alert('❌ ' + d.error);
        }
      } catch(e) {
        alert('Reset request failed.');
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}
