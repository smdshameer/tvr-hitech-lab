const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'htl_itsm_tickets.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_HTL_Service_Desk_Master.csv');
const SCHOOLS_FILE = path.join(DATA_DIR, 'master_schools_182.json');

// Initialize / Load Tickets DB
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
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Battery/MCB)', 'Activity Log History'
  ];

  const rows = list.map(t => [
    `"${t.ticketId || ''}"`,
    `"${t.createdAt || ''}"`,
    `"${t.priority || 'Medium'}"`,
    `"${t.status || 'Open / Triage'}"`,
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
    `"${(t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join(' | ').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  fs.writeFileSync(CSV_FILE, csvContent, 'utf8');

  try {
    fs.writeFileSync('C:/Users/acer/Downloads/Thiruvarur_HTL_Service_Desk_Master.csv', csvContent, 'utf8');
  } catch(e){}
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

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
      res.writeHead(200, { 'Content-Type': ext === '.png' ? 'image/png' : 'image/jpeg' });
      fs.createReadStream(filepath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Image not found');
    return;
  }

  // API: Authentication Login
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password, role } = JSON.parse(body);
        const u = (username || '').trim().toLowerCase();
        const p = (password || '').trim();

        // Engineer Creds: shameer / 1234 or shameer / engineer
        if ((role === 'engineer' || !role) && (u === 'shameer' || u === 'engineer' || u === 'mohamed') && (p === '1234' || p === 'shameer' || p === 'tvr@123')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/engineer', user: 'Mohamed Shameer', role: 'Field Engineer' }));
          return;
        }

        // Head / Admin Creds: head / 1234 or admin / 1234
        if ((role === 'head' || !role) && (u === 'head' || u === 'admin' || u === 'deo') && (p === '1234' || p === 'admin' || p === 'deo@123')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/head', user: 'Executive Reporting Head', role: 'District Authority' }));
          return;
        }

        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid Username or Password' }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Malformed request' }));
      }
    });
    return;
  }

  // 1. API: Create Ticket
  if (pathname === '/api/tickets' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const tickets = loadTickets();

        let p1Name = '';
        let p2Name = '';
        const ts = Date.now();
        const cleanSchool = (data.schoolName || 'school').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);

        if (data.photo1Base64) {
          const m = data.photo1Base64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (m) {
            p1Name = `UPS_F_${data.udise || 'TVR'}_${cleanSchool}_${ts}.jpg`;
            fs.writeFileSync(path.join(UPLOADS_DIR, p1Name), Buffer.from(m[2], 'base64'));
          }
        }

        if (data.photo2Base64) {
          const m = data.photo2Base64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (m) {
            p2Name = `UPS_B_${data.udise || 'TVR'}_${cleanSchool}_${ts}.jpg`;
            fs.writeFileSync(path.join(UPLOADS_DIR, p2Name), Buffer.from(m[2], 'base64'));
          }
        }

        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const ticketId = 'HTL-TVR-' + (data.udise ? data.udise.slice(-5) : String(tickets.length + 1).padStart(4, '0'));

        let priority = 'Medium';
        if (data.issue && (data.issue.includes('Dead') || data.issue.includes('Not Powering ON'))) priority = 'Critical (Lab Down)';
        else if (data.issue && data.issue.includes('No Battery Backup')) priority = 'High (Power Risk)';
        else if (data.issue && data.issue.includes('Tripping')) priority = 'High (Electrical)';

        const newTicket = {
          ticketId: ticketId,
          createdAt: dateStr,
          schoolId: data.schoolId || '',
          schoolName: data.schoolName || '',
          udise: data.udise || '',
          district: 'Thiruvarur',
          block: data.block || '',
          aiName: data.aiName || '',
          phone: data.phone || '',
          issue: data.issue || '',
          duration: data.duration || '',
          serialNo: data.serialNo || '',
          priority: priority,
          status: 'Open / Triage',
          resolutionCategory: 'Pending',
          resolutionType: '',
          vendorName: '',
          vendorTicketNo: '',
          partsRequired: '',
          resolutionNotes: '',
          resolvedAt: '',
          photo1: p1Name,
          photo1Url: p1Name ? `/uploads/${p1Name}` : '',
          photo2: p2Name,
          photo2Url: p2Name ? `/uploads/${p2Name}` : '',
          remarks: data.remarks || '',
          timeline: [
            { time: dateStr, action: 'Ticket Logged', note: `Issue reported by AI ${data.aiName}. Priority set to ${priority}.` }
          ]
        };

        tickets.unshift(newTicket);
        saveTickets(tickets);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ticketId: ticketId, message: 'Ticket logged successfully!' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. API: Update Ticket Status
  if (pathname === '/api/tickets/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const tickets = loadTickets();
        const ticket = tickets.find(t => t.ticketId === data.ticketId);

        if (ticket) {
          const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          const oldStatus = ticket.status;

          ticket.status = data.status || ticket.status;
          ticket.priority = data.priority || ticket.priority;
          ticket.resolutionCategory = data.resolutionCategory || (
            data.status === 'Resolved Remotely' ? 'Resolved Remotely' : 
            (data.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : ticket.resolutionCategory)
          );
          ticket.vendorName = data.vendorName || ticket.vendorName;
          ticket.vendorTicketNo = data.vendorTicketNo || ticket.vendorTicketNo;
          ticket.partsRequired = data.partsRequired || ticket.partsRequired;
          ticket.resolutionNotes = data.resolutionNotes || ticket.resolutionNotes;

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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Ticket updated in ITSM engine' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ticket not found' }));
        }
      } catch(err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. API: Data & Analytics
  if (pathname === '/api/data' && req.method === 'GET') {
    const tickets = loadTickets();
    const totalSchools = masterSchools.length || 183;
    const totalReported = tickets.length;
    const resolvedRemotelyCount = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
    const solvedDirectVisitCount = tickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
    const vendorCount = tickets.filter(t => t.status === 'Vendor Escalated').length;
    const inProgressCount = tickets.filter(t => t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled').length;
    const openCount = tickets.filter(t => t.status === 'Open / Triage').length;

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
      tickets,
      masterSchools
    }));
    return;
  }

  // 4. Download Excel CSV
  if (pathname === '/download-excel' || pathname === '/export') {
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

  // Views Routing
  if (pathname === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLoginHtml());
    return;
  }

  if (pathname === '/engineer' || pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMWorkbenchHtml());
    return;
  }

  if (pathname === '/head' || pathname === '/report' || pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMExecutiveHtml());
    return;
  }

  // Default: Teacher Portal with Login Button
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getTeacherPortalHtml());
});

// ==========================================
// LOGIN VIEW HTML
// ==========================================
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
        <input type="text" id="username" placeholder="e.g. shameer" value="shameer" required>
      </div>

      <div class="form-group">
        <label>Password / PIN</label>
        <input type="password" id="password" placeholder="Enter PIN" value="1234" required>
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

// Teacher Portal HTML with Login Link
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
    .container { max-width: 650px; margin: 0 auto; }
    
    .nav-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; font-size: 12.5px; }
    .nav-bar a { color: var(--primary); text-decoration: none; font-weight: 700; }
    .btn-login-nav { background: #1e293b; color: white !important; padding: 4px 10px; border-radius: 6px; }

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

    .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .photo-dropzone {
      border: 2px dashed #93c5fd; background: #eff6ff; border-radius: 12px; padding: 14px 10px;
      text-align: center; cursor: pointer; transition: all 0.2s;
    }
    .photo-dropzone:hover { background: #dbeafe; }
    .preview-img { width: 100%; max-height: 140px; object-fit: cover; border-radius: 8px; margin-top: 8px; display: none; }

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

    .track-result { background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-top: 16px; display: none; }
    .timeline-item { padding: 10px 0 10px 18px; border-left: 2px solid var(--primary); position: relative; font-size: 13px; }
    .timeline-item::before { content: ''; width: 8px; height: 8px; background: var(--primary); border-radius: 50%; position: absolute; left: -5px; top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-bar">
      <span style="font-weight:700; color:#64748b;">ICT Service Desk • Thiruvarur</span>
      <div>
        <a href="/login" class="btn-login-nav">🔐 Staff & Engineer Login</a>
      </div>
    </div>

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
          <label class="form-label">
            பள்ளியின் பெயரைத் தேர்ந்தெடுக்கவும் (Select School) <span class="req">*</span>
            <span class="sub-label">பட்டியலில் உள்ள 183 பள்ளிகளில் உங்கள் பள்ளியைத் தேர்வு செய்யவும்</span>
          </label>
          <select id="schoolSelect" class="form-select" required>
            <option value="">-- Choose School (183 Schools across 10 Blocks) --</option>
            ${masterSchools.map(s => `<option value="${s.id}">${s.block} • ${s.schoolName} (${s.udise})</option>`).join('')}
            <option value="OTHER">➕ [+ மற்ற பள்ளி / Other School]</option>
          </select>

          <div class="auto-fill-grid" id="autoBox" style="display:none;">
            <div class="auto-item">
              <span>UDISE CODE (குறியீடு)</span>
              <strong id="dispUdise">-</strong>
            </div>
            <div class="auto-item">
              <span>BLOCK (வட்டாரம்)</span>
              <strong id="dispBlock">-</strong>
            </div>
            <div class="auto-item">
              <span>AI INSTRUCTOR (பொறுப்பாளர்)</span>
              <strong id="dispAi">-</strong>
            </div>
            <div class="auto-item">
              <span>MOBILE NO (தொடர்பு எண்)</span>
              <strong id="dispPhone">-</strong>
            </div>
          </div>
        </div>

        <div id="customSchoolBox" style="display:none;">
          <div class="form-group">
            <label class="form-label">பள்ளியின் பெயர் (School Name) <span class="req">*</span></label>
            <input type="text" id="custSchool" class="form-control" placeholder="Enter Full School Name">
          </div>
          <div class="form-group">
            <label class="form-label">UDISE எண் (UDISE Code) <span class="req">*</span></label>
            <input type="text" id="custUdise" class="form-control" placeholder="11-digit UDISE">
          </div>
          <div class="form-group">
            <label class="form-label">வட்டாரம் (Block Name) <span class="req">*</span></label>
            <input type="text" id="custBlock" class="form-control" placeholder="e.g. Mannargudi, Nannilam...">
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

        <div class="section-title" style="margin-top: 22px;">2. UPS பழுது & தொழில்நுட்ப நிலை (Technical Diagnosis)</div>
        
        <div class="checklist-box">
          <div class="checklist-title">💡 விரைவு சுய சரிபார்ப்பு (Quick Pre-Checks before submitting):</div>
          <label class="check-item"><input type="checkbox"> EB மெயின் பவர் சப்ளை லேபிற்கு வருகிறதா? (EB Main Power Supply Active)</label>
          <label class="check-item"><input type="checkbox"> UPS-ன் மேற்பகுதியில் உள்ள Main Input MCB Breaker ஆன் செய்யப்பட்டுள்ளதா? (Top Input MCB ON)</label>
          <label class="check-item"><input type="checkbox"> பேட்டரி ரேக்கின் (Battery Bank) பின்புற DC MCB Breaker ஆன் நிலையில் உள்ளதா? (Battery MCB ON)</label>
          <label class="check-item"><input type="checkbox"> UPS முன்புறமுள்ள Power ON பொத்தானை 3 விநாடிகள் அழுத்திப் பிடித்தீர்களா? (Hold Front ON button 3s)</label>
          <label class="check-item"><input type="checkbox"> சுவரில் உள்ள Circuit Breaker சரியாக ஆன் செய்யப்பட்டுள்ளதா? (Wall Circuit Breaker ON)</label>
        </div>

        <div class="form-group">
          <label class="form-label">
            தற்போதைய UPS பிரச்சனை என்ன? (Exact UPS Issue) <span class="req">*</span>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="UPS Not Powering ON / Completely Dead" required>
            <div>
              <strong>UPS ஆன் ஆகவில்லை / முற்றிலும் பவர் இல்லை (Dead / Not Powering ON)</strong>
              <span>எந்த விளக்கும் எரியவில்லை, பவர் சப்ளை வரவில்லை. [High Severity]</span>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="No Battery Backup / Trips Immediately">
            <div>
              <strong>பேக்கப் நிற்கவில்லை / மின்சாரம் நின்றதும் ஆஃப் ஆகிறது (No Battery Backup)</strong>
              <span>EB பவர் போனதும் அடுத்த வினாடியே லேப் ஆஃப் ஆகிவிடுகிறது.</span>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Continuous Beep Sound / Error Warning Light">
            <div>
              <strong>தொடர் பீப் சத்தம் / எச்சரிக்கை விளக்கு (Continuous Beep / Warning Light)</strong>
              <span>சிவப்பு / ஆரஞ்சு விளக்கு எரிந்து கொண்டு தொடர் அலாரம் அடிக்கிறது.</span>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="UPS Not Charging / Low Voltage Input">
            <div>
              <strong>சார்ஜ் ஏறவில்லை / பேட்டரி சார்ஜ் நிற்கவில்லை (Not Charging / Low Voltage)</strong>
              <span>பேட்டரி வோல்டேஜ் குறைவாக உள்ளது அல்லது சார்ஜ் ஆகவில்லை.</span>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Isolation Transformer / MCB Tripping">
            <div>
              <strong>MCB ட்ரிப் ஆகிறது / டிரான்ஸ்பார்மர் பிரச்சனை (MCB Tripping / Transformer)</strong>
              <span>UPS-ஐ ஆன் செய்ததும் மெயின் MCB ட்ரிப் ஆகிறது.</span>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Already Repaired / Working Fine Now">
            <div>
              <strong>தற்போது பழுது சரிசெய்யப்பட்டு சரியாக இயங்குகிறது (Working Fine Now)</strong>
              <span>எந்தப் பிரச்சனையும் இல்லை, நல்ல நிலையில் உள்ளது.</span>
            </div>
          </label>
        </div>

        <div class="section-title" style="margin-top: 22px;">3. புகைப்படங்கள் அப்லோட் (Upload Visual Evidence)</div>

        <div class="photo-grid">
          <div class="form-group">
            <label class="form-label" style="font-size:12.5px;">1. UPS முன்புற டிஸ்ப்ளே படம் <span class="req">*</span></label>
            <div class="photo-dropzone" onclick="document.getElementById('photoInput1').click()">
              <span style="font-size: 26px;">📷</span>
              <p style="font-size: 12px; font-weight: 700; color: #1e40af; margin-top: 2px;">Front Display Photo</p>
              <input type="file" id="photoInput1" accept="image/*" capture="environment" style="display: none;" required>
              <img id="preview1" class="preview-img" alt="Front Preview">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" style="font-size:12.5px;">2. பேட்டரி / MCB படம் (Optional)</label>
            <div class="photo-dropzone" onclick="document.getElementById('photoInput2').click()">
              <span style="font-size: 26px;">🔋</span>
              <p style="font-size: 12px; font-weight: 700; color: #1e40af; margin-top: 2px;">Battery / MCB Photo</p>
              <input type="file" id="photoInput2" accept="image/*" capture="environment" style="display: none;">
              <img id="preview2" class="preview-img" alt="Battery Preview">
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label">பிரச்சனை எத்தனை நாட்களாக உள்ளது? (Issue Duration) <span class="req">*</span></label>
          <select id="duration" class="form-select" required>
            <option value="">-- Select Duration --</option>
            <option value="Less than 1 week">1 வாரத்திற்குள் (Less than 1 week)</option>
            <option value="1 - 3 weeks">1 முதல் 3 வாரங்கள் (1 - 3 weeks)</option>
            <option value="More than 1 month">1 மாதத்திற்கும் மேலாக (More than 1 month)</option>
            <option value="Since Installation / Long Pending">நிறுவிய நாளிலிருந்தே (Since Installation)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">UPS Serial Number (தெரிந்தால் மட்டும் - Optional)</label>
          <input type="text" id="serialNo" class="form-control" placeholder="UPS ஸ்டிக்கரில் உள்ள Serial No">
        </div>

        <div class="form-group">
          <label class="form-label">கூடுதல் விவரங்கள் (Additional Remarks - Optional)</label>
          <textarea id="remarks" class="form-textarea" rows="2" placeholder="கூடுதல் விவரங்கள் ஏதேனும் இருந்தால் குறிப்பிடவும்..."></textarea>
        </div>

        <button type="submit" class="btn-submit" id="btnSubmit">புகாரைப் பதிவு செய்யவும் (Log Service Ticket)</button>
      </form>
    </div>

    <div class="card" id="trackContainer" style="display:none;">
      <div class="section-title">🔍 புகார் நிலை அறிதல் (Live Ticket Tracker)</div>
      <div class="form-group">
        <label class="form-label">Ticket ID அல்லது UDISE எண்ணை உள்ளிடவும்:</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="trackInput" class="form-control" placeholder="e.g. HTL-TVR-05301 அல்லது 33200305301">
          <button onclick="trackTicket()" class="btn-submit" style="width: auto; padding: 0 20px;">தேடு</button>
        </div>
      </div>

      <div id="trackResultBox" class="track-result">
        <h3 id="trackSchoolName" style="font-size: 16px; font-weight:800; color:#1e3a8a;"></h3>
        <p id="trackMeta" style="font-size: 12.5px; color:#64748b; margin-top:2px;"></p>
        
        <div style="margin: 14px 0;">
          <span id="trackStatusBadge" style="padding: 4px 12px; border-radius: 999px; font-weight:800; font-size:12px;"></span>
          <span id="trackCategoryBadge" style="padding: 4px 12px; border-radius: 999px; font-weight:800; font-size:12px; margin-left:6px; background:#e0e7ff; color:#3730a3;"></span>
        </div>

        <div style="background:white; border-radius:10px; padding:12px; border:1px solid #e2e8f0; margin-top:12px;">
          <h4 style="font-size: 13px; font-weight:700; color:#334155; margin-bottom:8px;">🛠️ செயல்பாட்டு வரலாறு (Audit Timeline):</h4>
          <div id="trackTimeline"></div>
        </div>
      </div>
    </div>

    <div class="success-card" id="successBox">
      <span style="font-size: 48px;">✅</span>
      <h2 style="margin-top: 8px;">டிக்கெட் வெற்றிகரமாகப் பதிவு செய்யப்பட்டது!</h2>
      <div class="ticket-badge" id="dispTicketId">HTL-TVR-XXXX</div>
      <p style="margin-top: 6px; font-size: 14px;">உங்கள் புகாருக்குரிய டிக்கெட் எண் உருவாக்கப்பட்டு களப் பொறியாளர் (Mohamed Shameer) கட்டுப்பாட்டு அறைக்கு அனுப்பப்பட்டுள்ளது.</p>
      <p style="margin-top: 8px; font-size: 13px; color:#15803d; font-weight:600;">பொறியாளர் உங்கள் புகைப்படத்தை ஆய்வு செய்து தொலைபேசி வழியே வழிகாட்டியோ (Resolved Remotely) அல்லது நேரடிப் பயணம் மேற்கொண்டோ (Solved by Direct Visit) தீர்வு காண்பார்.</p>
    </div>
  </div>

  <script>
    const schoolsData = ${JSON.stringify(masterSchools)};
    const select = document.getElementById('schoolSelect');
    const autoBox = document.getElementById('autoBox');
    const customBox = document.getElementById('customSchoolBox');
    let base64Photo1 = '';
    let base64Photo2 = '';

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
      }
    }

    select.addEventListener('change', function() {
      if (this.value === 'OTHER') {
        customBox.style.display = 'block';
        autoBox.style.display = 'none';
        document.getElementById('custSchool').required = true;
        document.getElementById('custUdise').required = true;
        document.getElementById('custBlock').required = true;
        return;
      }
      customBox.style.display = 'none';
      document.getElementById('custSchool').required = false;
      document.getElementById('custUdise').required = false;
      document.getElementById('custBlock').required = false;

      const item = schoolsData.find(s => s.id === this.value);
      if (item) {
        document.getElementById('dispUdise').textContent = item.udise;
        document.getElementById('dispBlock').textContent = item.block;
        document.getElementById('dispAi').textContent = item.aiName;
        document.getElementById('dispPhone').textContent = item.aiPhone;
        autoBox.style.display = 'grid';
        if (item.aiName && item.aiName !== 'Not Found') document.getElementById('aiName').value = item.aiName;
        if (item.aiPhone && item.aiPhone !== 'Not Found') document.getElementById('aiPhone').value = item.aiPhone;
      } else {
        autoBox.style.display = 'none';
      }
    });

    function handleImageUpload(inputEl, previewEl, callback) {
      inputEl.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          const img = new Image();
          const reader = new FileReader();
          reader.onload = function(ev) {
            img.src = ev.target.result;
            img.onload = function() {
              const canvas = document.createElement('canvas');
              const maxDim = 1200;
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
              previewEl.src = dataUrl;
              previewEl.style.display = 'block';
              callback(dataUrl);
            };
          };
          reader.readAsDataURL(file);
        }
      });
    }

    handleImageUpload(document.getElementById('photoInput1'), document.getElementById('preview1'), data => { base64Photo1 = data; });
    handleImageUpload(document.getElementById('photoInput2'), document.getElementById('preview2'), data => { base64Photo2 = data; });

    document.getElementById('incidentForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!base64Photo1) {
        alert('தயவுசெய்து UPS முன்புற டிஸ்ப்ளே புகைப்படத்தைப் படம் பிடித்து அப்லோட் செய்யவும்.');
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
      const q = document.getElementById('trackInput').value.trim().toLowerCase();
      if (!q) return;

      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        const ticket = (data.tickets || []).find(t => 
          (t.ticketId || '').toLowerCase().includes(q) || 
          (t.udise || '').includes(q) ||
          (t.schoolName || '').toLowerCase().includes(q)
        );

        const box = document.getElementById('trackResultBox');
        if (!ticket) {
          alert('டிக்கெட் எண் அல்லது UDISE எண் கிடைக்கவில்லை.');
          box.style.display = 'none';
          return;
        }

        document.getElementById('trackSchoolName').textContent = \`\${ticket.ticketId}: \${ticket.schoolName}\`;
        document.getElementById('trackMeta').textContent = \`\${ticket.block} Block • UDISE: \${ticket.udise} • AI: \${ticket.aiName} (\${ticket.phone})\`;

        const badge = document.getElementById('trackStatusBadge');
        badge.textContent = ticket.status;
        if (ticket.status.includes('Resolved') || ticket.status.includes('Solved') || ticket.status.includes('Closed')) {
          badge.style.background = '#dcfce7'; badge.style.color = '#15803d';
        } else if (ticket.status.includes('Vendor')) {
          badge.style.background = '#fee2e2'; badge.style.color = '#b91c1c';
        } else if (ticket.status.includes('Progress')) {
          badge.style.background = '#dbeafe'; badge.style.color = '#1e40af';
        } else {
          badge.style.background = '#fef3c7'; badge.style.color = '#b45309';
        }

        const catBadge = document.getElementById('trackCategoryBadge');
        catBadge.textContent = ticket.resolutionCategory || 'Pending';

        const tl = document.getElementById('trackTimeline');
        tl.innerHTML = (ticket.timeline || []).map(e => \`
          <div class="timeline-item">
            <strong>\${e.action}</strong> <span style="color:#64748b; font-size:11px;">(\${e.time})</span>
            <p style="color:#475569; margin-top:2px;">\${e.note}</p>
          </div>
        \`).join('');

        box.style.display = 'block';
      } catch (e) {
        alert('Tracking failed.');
      }
    }
  </script>
</body>
</html>`;
}

// Write the teacher view
function getITSMWorkbenchHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ITSM Field Engineer Workbench - Mohamed Shameer</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: #f8fafc; color: #0f172a; padding: 20px; line-height: 1.5; }
    .container { max-width: 1450px; margin: 0 auto; }
    
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .header h1 { font-size: 22px; font-weight: 800; color: #1e3a8a; }
    .header-sub { font-size: 13.5px; color: #64748b; margin-top: 2px; }
    
    .actions { display: flex; gap: 10px; }
    .btn {
      padding: 10px 16px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13px;
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; transition: all 0.15s;
    }
    .btn-green { background: #16a34a; color: white; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.2); }
    .btn-green:hover { background: #15803d; }
    .btn-blue { background: #2563eb; color: white; }
    .btn-blue:hover { background: #1d4ed8; }
    .btn-logout { background: #64748b; color: white; }
    .btn-logout:hover { background: #475569; }
    .btn-whatsapp { background: #22c55e; color: white; padding: 6px 12px; border-radius: 8px; font-size: 12px; }
    
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .kpi-card { background: white; padding: 18px; border-radius: 14px; border: 1px solid #e2e8f0; }
    .kpi-card span { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .kpi-card h3 { font-size: 26px; font-weight: 800; margin-top: 4px; }

    .filter-bar {
      background: white; padding: 14px 18px; border-radius: 12px; border: 1px solid #e2e8f0;
      margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
    }
    .filter-bar select, .filter-bar input {
      padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px;
    }

    .table-card { background: white; border-radius: 14px; border: 1px solid #e2e8f0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #f8fafc; padding: 12px 14px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:hover { background: #f8fafc; }

    .thumb-img { width: 50px; height: 50px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #cbd5e1; margin-right: 4px; }
    
    .badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-block; }
    .badge-remote { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-direct { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .badge-vendor { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-open { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }

    .prio-pill { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }
    .prio-crit { background: #fee2e2; color: #b91c1c; }
    .prio-high { background: #ffedd5; color: #c2410c; }
    .prio-med { background: #fef9c3; color: #854d0e; }

    /* Modal */
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; }
    .modal-content { max-width: 90%; max-height: 85%; border-radius: 10px; }
    
    .action-modal { background: white; padding: 24px; border-radius: 16px; width: 620px; max-width: 95%; }
    .action-modal h2 { font-size: 18px; font-weight: 800; margin-bottom: 14px; color: #1e3a8a; }
    .action-modal select, .action-modal input, .action-modal textarea { width: 100%; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13.5px; margin-bottom: 12px; }

    .category-choice-box {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;
    }
    .cat-btn {
      padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; background: #fff; cursor: pointer; text-align: center; font-weight: 700; font-size: 13px; transition: all 0.15s;
    }
    .cat-btn.selected-remote { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
    .cat-btn.selected-direct { border-color: #4f46e5; background: #eef2ff; color: #3730a3; }

    .quick-fix-bar { background: #f8fafc; border: 1px dashed #cbd5e1; padding: 10px; border-radius: 8px; margin-bottom: 14px; }
    .quick-fix-btn { background: #e2e8f0; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; cursor: pointer; margin: 2px; }
    .quick-fix-btn:hover { background: #cbd5e1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Field Engineer Resolution Command Center 🛠️</h1>
        <div class="header-sub">Logged in as: <strong>Mohamed Shameer</strong> • Incident Triage Hub (Thiruvarur - 183 Schools)</div>
      </div>
      <div class="actions">
        <a href="/head" class="btn btn-blue">Executive Report View 📊</a>
        <a href="/download-excel" class="btn btn-green">📥 Export Master Excel (.CSV)</a>
        <a href="/login" class="btn btn-logout">🔒 Switch / Logout</a>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span>TOTAL SCHOOLS</span>
        <h3 id="kpiTotal">183</h3>
      </div>
      <div class="kpi-card">
        <span>TOTAL REPORTED</span>
        <h3 id="kpiReported" style="color: #2563eb;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #16a34a;">
        <span>1. RESOLVED REMOTELY</span>
        <h3 id="kpiResolvedRemote" style="color: #16a34a;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #4f46e5;">
        <span>2. SOLVED BY DIRECT VISIT</span>
        <h3 id="kpiSolvedDirect" style="color: #4f46e5;">0</h3>
      </div>
      <div class="kpi-card" style="border-left: 4px solid #dc2626;">
        <span>VENDOR ESCALATIONS</span>
        <h3 id="kpiVendor" style="color: #dc2626;">0</h3>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" id="searchInput" placeholder="🔍 Search Ticket ID, School, UDISE, AI Name..." oninput="renderTable()">
      <select id="blockFilter" onchange="renderTable()">
        <option value="">All Blocks (10 Blocks)</option>
        <option value="Koradachery">Koradachery</option>
        <option value="Kottur">Kottur</option>
        <option value="Kudavasal">Kudavasal</option>
        <option value="Mannargudi">Mannargudi</option>
        <option value="Muthupet">Muthupet</option>
        <option value="Nannilam">Nannilam</option>
        <option value="Needamangalam">Needamangalam</option>
        <option value="Thiruthuraipoondi">Thiruthuraipoondi</option>
        <option value="Thiruvarur">Thiruvarur</option>
        <option value="Valangaiman">Valangaiman</option>
      </select>
      <select id="categoryFilter" onchange="renderTable()">
        <option value="">All Resolution Categories</option>
        <option value="Resolved Remotely">🟢 1. Resolved Remotely (Phone/WhatsApp)</option>
        <option value="Solved by Direct Visit">🔵 2. Solved by Direct Visit (On-Site Field Visit)</option>
        <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Needed)</option>
        <option value="Pending">🟡 Pending / In Triage</option>
      </select>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Photos</th>
            <th>School & Block</th>
            <th>AI Contact</th>
            <th>Reported Issue</th>
            <th>Resolution Category</th>
            <th>Resolution / Vendor Notes</th>
            <th>Action Workflow</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="8" style="text-align:center; padding: 30px; color: #94a3b8;">Loading tickets...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Image Modal -->
  <div id="imgModal" class="modal" onclick="this.style.display='none'">
    <img id="modalImg" class="modal-content">
  </div>

  <!-- ITSM Manage Modal with the 2 Categories -->
  <div id="actionModal" class="modal">
    <div class="action-modal">
      <h2 id="modalTicketTitle">Manage Incident & Set Resolution</h2>
      
      <label style="font-size: 12px; font-weight: 700; color:#475569; margin-bottom:6px; display:block;">Select Resolution Category:</label>
      <div class="category-choice-box">
        <div class="cat-btn" id="btnCatRemote" onclick="selectCategory('Resolved Remotely')">
          🟢 1. Resolved Remotely
          <span style="font-size:11px; display:block; font-weight:500; color:#64748b; margin-top:2px;">(Guided via Phone/WhatsApp)</span>
        </div>
        <div class="cat-btn" id="btnCatDirect" onclick="selectCategory('Solved by Direct Visit')">
          🔵 2. Solved by Direct Visit
          <span style="font-size:11px; display:block; font-weight:500; color:#64748b; margin-top:2px;">(Visited School Physically)</span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div>
          <label style="font-size: 12px; font-weight: 700; color:#475569;">Lifecycle Status:</label>
          <select id="modalStatus">
            <option value="Open / Triage">🟡 Open / In Triage</option>
            <option value="In Progress (Remote)">🔵 In Progress (Remote Support)</option>
            <option value="Resolved Remotely">🟢 Resolved Remotely</option>
            <option value="Solved by Direct Visit">🔵 Solved by Direct Visit</option>
            <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Required)</option>
            <option value="Closed / Verified">✅ Closed & Verified</option>
          </select>
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 700; color:#475569;">Priority Level:</label>
          <select id="modalPriority">
            <option value="Critical (Lab Down)">🔴 Critical (Lab Down)</option>
            <option value="High (Power Risk)">🟠 High (Power Risk)</option>
            <option value="Medium">🟡 Medium (Warning)</option>
            <option value="Low">🟢 Low (Minor)</option>
          </select>
        </div>
      </div>

      <div class="quick-fix-bar">
        <span style="font-size: 11px; font-weight: 700; color: #64748b; display: block; margin-bottom: 4px;">⚡ Quick Resolution Notes:</span>
        <button class="quick-fix-btn" onclick="applyQuickFix('Guided AI to reset rear MCB breaker; UPS started normally on load.', 'Resolved Remotely')">Remote: MCB Reset</button>
        <button class="quick-fix-btn" onclick="applyQuickFix('Switched Bypass mode to Normal Line; lab load operational.', 'Resolved Remotely')">Remote: Bypass Fix</button>
        <button class="quick-fix-btn" onclick="applyQuickFix('Visited school on-site. Replaced 15A input fuse and tightened loose battery terminal lug.', 'Solved by Direct Visit')">Direct Visit: Fuse & Lug Fix</button>
        <button class="quick-fix-btn" onclick="applyQuickFix('Visited school on-site. Replaced faulty MCB and re-calibrated inverter output voltage.', 'Solved by Direct Visit')">Direct Visit: MCB Replacement</button>
        <button class="quick-fix-btn" onclick="applyQuickFix('Inverter PCB blown / Battery dead. On-site vendor technician required.', 'Vendor Escalated')">Vendor Escalation</button>
      </div>

      <div id="vendorBox" style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px; margin-bottom:12px; display:none;">
        <span style="font-size: 12px; font-weight: 800; color:#b91c1c; display:block; margin-bottom:6px;">🚨 Vendor Escalation Details:</span>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <input type="text" id="modalVendorName" placeholder="Vendor Name (e.g. AVO)">
          <input type="text" id="modalVendorTicket" placeholder="Vendor Call Log #">
        </div>
        <input type="text" id="modalParts" placeholder="Spare Parts Required (e.g. Inverter PCB, 12V 42Ah Battery)" style="margin-bottom:0; margin-top:8px;">
      </div>

      <label style="font-size: 12px; font-weight: 700; color:#475569;">Engineer Resolution / Field Action Notes:</label>
      <textarea id="modalNotes" rows="3" placeholder="Explain what action was taken (Remote phone guidance vs On-site physical fix)..."></textarea>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
        <button onclick="closeActionModal()" class="btn" style="background:#e2e8f0; color:#475569;">Cancel</button>
        <button onclick="saveTicketUpdate()" class="btn btn-green">Save Resolution</button>
      </div>
    </div>
  </div>

  <script>
    let allTickets = [];
    let currentEditingTicketId = null;
    let selectedCategory = 'Pending';

    function selectCategory(cat) {
      selectedCategory = cat;
      const bRem = document.getElementById('btnCatRemote');
      const bDir = document.getElementById('btnCatDirect');
      bRem.classList.remove('selected-remote');
      bDir.classList.remove('selected-direct');

      if (cat === 'Resolved Remotely') {
        bRem.classList.add('selected-remote');
        document.getElementById('modalStatus').value = 'Resolved Remotely';
      } else if (cat === 'Solved by Direct Visit') {
        bDir.classList.add('selected-direct');
        document.getElementById('modalStatus').value = 'Solved by Direct Visit';
      }
    }

    document.getElementById('modalStatus').addEventListener('change', function() {
      document.getElementById('vendorBox').style.display = (this.value === 'Vendor Escalated') ? 'block' : 'none';
      if (this.value === 'Resolved Remotely') selectCategory('Resolved Remotely');
      else if (this.value === 'Solved by Direct Visit') selectCategory('Solved by Direct Visit');
    });

    async function loadData() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        allTickets = data.tickets || [];

        document.getElementById('kpiTotal').textContent = data.totalSchools;
        document.getElementById('kpiReported').textContent = data.totalReported;
        document.getElementById('kpiResolvedRemote').textContent = data.resolvedRemotelyCount;
        document.getElementById('kpiSolvedDirect').textContent = data.solvedDirectVisitCount;
        document.getElementById('kpiVendor').textContent = data.vendorCount;

        renderTable();
      } catch (e) {
        console.error(e);
      }
    }

    function renderTable() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const block = document.getElementById('blockFilter').value;
      const cat = document.getElementById('categoryFilter').value;

      const filtered = allTickets.filter(t => {
        const matchSearch = (t.schoolName || '').toLowerCase().includes(search) || 
                            (t.udise || '').includes(search) || 
                            (t.aiName || '').toLowerCase().includes(search) ||
                            (t.ticketId || '').toLowerCase().includes(search);
        const matchBlock = !block || (t.block || '').toLowerCase().includes(block.toLowerCase());
        const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
        const matchCat = !cat || (tCat === cat) || (cat === 'Vendor Escalated' && t.status === 'Vendor Escalated');
        return matchSearch && matchBlock && matchCat;
      });

      const tbody = document.getElementById('tableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: #64748b;">No matching tickets logged yet.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(t => {
        const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
        
        let badgeHtml = '<span class="badge badge-open">🟡 Open / In Triage</span>';
        if (tCat === 'Resolved Remotely') badgeHtml = '<span class="badge badge-remote">🟢 Resolved Remotely</span>';
        else if (tCat === 'Solved by Direct Visit') badgeHtml = '<span class="badge badge-direct">🔵 Solved by Direct Visit</span>';
        else if (t.status === 'Vendor Escalated') badgeHtml = '<span class="badge badge-vendor">🔴 Vendor Escalated</span>';

        let prioClass = 'prio-med';
        if (t.priority.includes('Critical')) prioClass = 'prio-crit';
        else if (t.priority.includes('High')) prioClass = 'prio-high';

        const waText = encodeURIComponent(\`Hello \${t.aiName} teacher, I am Mohamed Shameer (Field Engineer, Hi-Tech Lab). I received your ticket \${t.ticketId} for \${t.schoolName}. Let us resolve the UPS issue.\`);
        const waLink = \`https://wa.me/91\${t.phone}?text=\${waText}\`;

        return \`
          <tr>
            <td><strong>\${t.ticketId}</strong><br><small style="color:#64748b;">\${t.createdAt}</small></td>
            <td>
              <div style="display:flex;">
                \${t.photo1Url ? \`<img src="\${t.photo1Url}" class="thumb-img" onclick="showImgModal('\${t.photo1Url}')" title="Front Display">\` : ''}
                \${t.photo2Url ? \`<img src="\${t.photo2Url}" class="thumb-img" onclick="showImgModal('\${t.photo2Url}')" title="Battery / MCB">\` : ''}
                \${!t.photo1Url && !t.photo2Url ? '<span style="color:#94a3b8; font-size:11px;">No Photo</span>' : ''}
              </div>
            </td>
            <td><strong>\${t.schoolName}</strong><br><small style="color:#64748b;">\${t.block} • \${t.udise}</small></td>
            <td>\${t.aiName}<br><strong>\${t.phone}</strong></td>
            <td>
              <span style="font-weight:600; color:#1e3a8a;">\${t.issue}</span><br>
              <span class="prio-pill \${prioClass}">\${t.priority}</span>
            </td>
            <td>\${badgeHtml}</td>
            <td>
              <small>
                \${t.resolutionNotes ? \`<strong>Notes:</strong> \${t.resolutionNotes}<br>\` : ''}
                \${t.vendorName ? \`<strong style="color:#b91c1c;">Vendor:</strong> \${t.vendorName} (\${t.vendorTicketNo || 'Pending #'})\` : ''}
                \${!t.resolutionNotes && !t.vendorName ? '<span style="color:#94a3b8;">Pending diagnosis</span>' : ''}
              </small>
            </td>
            <td>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <a href="\${waLink}" target="_blank" class="btn btn-whatsapp">💬 WhatsApp AI</a>
                <button onclick="openActionModal('\${t.ticketId}')" class="btn btn-blue" style="padding:6px 10px; font-size:12px;">⚙️ Set Resolution</button>
              </div>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function showImgModal(src) {
      document.getElementById('modalImg').src = src;
      document.getElementById('imgModal').style.display = 'flex';
    }

    function openActionModal(ticketId) {
      currentEditingTicketId = ticketId;
      const t = allTickets.find(i => i.ticketId === ticketId);
      if (t) {
        document.getElementById('modalTicketTitle').textContent = \`Manage Ticket: \${t.ticketId} (\${t.schoolName})\`;
        document.getElementById('modalStatus').value = t.status || 'Open / Triage';
        document.getElementById('modalPriority').value = t.priority || 'Medium';
        document.getElementById('modalVendorName').value = t.vendorName || '';
        document.getElementById('modalVendorTicket').value = t.vendorTicketNo || '';
        document.getElementById('modalParts').value = t.partsRequired || '';
        document.getElementById('modalNotes').value = t.resolutionNotes || '';
        document.getElementById('vendorBox').style.display = (t.status === 'Vendor Escalated') ? 'block' : 'none';

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

      const payload = {
        ticketId: currentEditingTicketId,
        status: document.getElementById('modalStatus').value,
        priority: document.getElementById('modalPriority').value,
        resolutionCategory: selectedCategory,
        vendorName: document.getElementById('modalVendorName').value,
        vendorTicketNo: document.getElementById('modalVendorTicket').value,
        partsRequired: document.getElementById('modalParts').value,
        resolutionNotes: document.getElementById('modalNotes').value
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
        alert('Update failed.');
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`ITSM Service Desk running on port ${PORT}`);
});
