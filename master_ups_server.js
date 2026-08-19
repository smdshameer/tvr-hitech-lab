const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'ups_submissions.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_UPS_Submissions_Live.csv');

// Reset / Initialize clean database
fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');

function loadSubmissions() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return []; }
  }
  return [];
}

function saveSubmissions(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
  
  // Build CSV with Photo column
  const headers = [
    'Submission Time', 'Ticket ID', 'School Name', 'UDISE Code', 'Block',
    'AI Teacher Name', 'Mobile Number', 'UPS Status', 'Issue Duration',
    'UPS Serial Number', 'Photo File Name', 'Photo Local Path', 'Remarks'
  ];
  
  const rows = list.map(item => [
    `"${item.timestamp || ''}"`,
    `"${item.ticketId || ''}"`,
    `"${item.schoolName || ''}"`,
    `"${item.udise || ''}"`,
    `"${item.block || ''}"`,
    `"${item.aiName || ''}"`,
    `"${item.phone || ''}"`,
    `"${item.status || ''}"`,
    `"${item.duration || ''}"`,
    `"${item.serialNo || ''}"`,
    `"${item.photoName || 'No Photo'}"`,
    `"${item.photoLocalPath || ''}"`,
    `"${(item.remarks || '').replace(/"/g, '""')}"`
  ]);
  
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
  
  try {
    fs.writeFileSync('C:/Users/acer/Downloads/Thiruvarur_UPS_Submissions_Live.csv', csvContent, 'utf8');
  } catch(e){}
}

const targetSchools = JSON.parse(fs.readFileSync('C:/Users/acer/.gemini/antigravity/brain/82dcd816-8a45-422f-bac4-88581a00a4b2/scratch/matched_22_ups_schools.json', 'utf8'));

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
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filepath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Image not found');
      return;
    }
  }

  // 1. Submit Form with Base64 / Image File
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const submissions = loadSubmissions();
        
        let photoName = '';
        let photoLocalPath = '';

        if (data.photoBase64) {
          const matches = data.photoBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'png' ? 'png' : 'jpg';
            const base64Data = matches[2];
            const cleanSchool = (data.schoolName || 'school').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            photoName = `UPS_${data.ticketId || 'NA'}_${cleanSchool}_${Date.now()}.${ext}`;
            photoLocalPath = path.join(UPLOADS_DIR, photoName);
            fs.writeFileSync(photoLocalPath, Buffer.from(base64Data, 'base64'));
          }
        }

        const newRecord = {
          id: 'SUB-' + Date.now(),
          timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          ticketId: data.ticketId || '',
          schoolName: data.schoolName || '',
          udise: data.udise || '',
          block: data.block || '',
          aiName: data.aiName || '',
          phone: data.phone || '',
          status: data.status || '',
          duration: data.duration || '',
          serialNo: data.serialNo || '',
          photoName: photoName,
          photoUrl: photoName ? `/uploads/${photoName}` : '',
          photoLocalPath: photoLocalPath,
          remarks: data.remarks || ''
        };

        submissions.push(newRecord);
        saveSubmissions(submissions);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Complaint and photo recorded successfully!' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. Get Data
  if (pathname === '/api/data' && req.method === 'GET') {
    const submissions = loadSubmissions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalTarget: targetSchools.length,
      receivedCount: submissions.length,
      submissions: submissions,
      targetSchools: targetSchools
    }));
    return;
  }

  // 3. Reset Submissions API
  if (pathname === '/api/reset' && req.method === 'POST') {
    saveSubmissions([]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Submissions reset successfully' }));
    return;
  }

  // 4. Download Excel CSV
  if (pathname === '/download-excel' || pathname === '/export') {
    const submissions = loadSubmissions();
    saveSubmissions(submissions);
    if (fs.existsSync(CSV_FILE)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Thiruvarur_UPS_Submissions_Live.csv"'
      });
      fs.createReadStream(CSV_FILE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No submissions yet.');
    }
    return;
  }

  // 5. Admin Dashboard
  if (pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getAdminHtml());
    return;
  }

  // 6. Teacher Form
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getFormHtml());
});

function getFormHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hi-Tech Lab UPS Complaint Verification - Thiruvarur</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 16px; line-height: 1.5; }
    .container { max-width: 640px; margin: 0 auto; }
    .header-card {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: white; padding: 24px 20px; border-radius: 16px; margin-bottom: 16px;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.2);
    }
    .header-badge {
      display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 3px 10px;
      border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px;
    }
    .header-card h1 { font-size: 20px; font-weight: 800; margin-bottom: 6px; }
    .header-card p { font-size: 13.5px; opacity: 0.9; }
    
    .form-card {
      background: var(--card); border: 1px solid var(--border); border-radius: 16px;
      padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); margin-bottom: 20px;
    }
    .form-group { margin-bottom: 18px; }
    .form-label { display: block; font-size: 13.5px; font-weight: 700; margin-bottom: 6px; color: var(--text); }
    .form-label .req { color: #dc2626; }
    .form-control, .form-select, .form-textarea {
      width: 100%; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: 14px; background: #fff;
    }
    .form-control:focus, .form-select:focus, .form-textarea:focus {
      outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .auto-fill-box {
      background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px;
      margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px;
    }
    .auto-fill-item span { display: block; color: var(--text-muted); font-size: 11px; font-weight: 600; }
    .auto-fill-item strong { color: var(--text); font-weight: 700; }
    
    .radio-option {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1.5px solid var(--border);
      border-radius: 10px; margin-bottom: 8px; cursor: pointer;
    }
    .radio-option input { margin-top: 3px; accent-color: var(--primary); }
    .radio-option strong { font-size: 13px; display: block; }
    .radio-option span { font-size: 11.5px; color: var(--text-muted); }

    .photo-upload-box {
      border: 2px dashed #93c5fd; background: #eff6ff; border-radius: 12px; padding: 18px;
      text-align: center; cursor: pointer; transition: all 0.2s;
    }
    .photo-upload-box:hover { background: #dbeafe; }
    .photo-preview { max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 10px; display: none; }
    
    .btn-submit {
      width: 100%; background: var(--primary); color: white; border: none; padding: 14px;
      border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }
    .btn-submit:hover { background: var(--primary-dark); }
    .success-card {
      display: none; background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 16px;
      padding: 32px 20px; text-align: center; color: #166534;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <span class="header-badge">ICT Hi-Tech Lab • Thiruvarur</span>
      <h1>UPS Verification & Photo Capture</h1>
      <p>Please select your school, capture/upload your UPS photo, and submit the current issue.</p>
    </div>

    <div class="form-card" id="formContainer">
      <form id="upsForm">
        <div class="form-group">
          <label class="form-label">1. Select Your School Name <span class="req">*</span></label>
          <select id="schoolSelect" class="form-select" required>
            <option value="">-- Choose School (22 Target Schools) --</option>
            ${targetSchools.map(s => `<option value="${s.id}">${s.school} (${s.block})</option>`).join('')}
          </select>
          <div class="auto-fill-box" id="autoBox" style="display:none;">
            <div class="auto-fill-item">
              <span>UDISE CODE</span>
              <strong id="dispUdise">-</strong>
            </div>
            <div class="auto-fill-item">
              <span>BLOCK</span>
              <strong id="dispBlock">-</strong>
            </div>
            <div class="auto-fill-item">
              <span>AI INSTRUCTOR</span>
              <strong id="dispAi">-</strong>
            </div>
            <div class="auto-fill-item">
              <span>CONTACT NUMBER</span>
              <strong id="dispPhone">-</strong>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">2. AI Instructor Name <span class="req">*</span></label>
          <input type="text" id="aiName" class="form-control" placeholder="Enter your full name" required>
        </div>

        <div class="form-group">
          <label class="form-label">3. AI Mobile / WhatsApp Number <span class="req">*</span></label>
          <input type="tel" id="aiPhone" class="form-control" placeholder="10-digit mobile number" pattern="[0-9]{10}" required>
        </div>

        <div class="form-group">
          <label class="form-label">4. Exact UPS Problem / Status <span class="req">*</span></label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="UPS Not Powering ON / Dead" required>
            <div>
              <strong>UPS Not Powering ON / Completely Dead</strong>
              <span>No LEDs light up, system completely dead.</span>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="No Battery Backup / Trips Immediately">
            <div>
              <strong>No Battery Backup / Trips Immediately</strong>
              <span>Shuts down immediately during power cuts.</span>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Continuous Beep Sound / Error Warning">
            <div>
              <strong>Continuous Beep Sound / Warning Alarm</strong>
              <span>Red/Orange light or continuous loud beep sound.</span>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="UPS Not Charging / Low Voltage">
            <div>
              <strong>UPS Not Charging / Low Voltage Input</strong>
              <span>Batteries are not holding charge.</span>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Isolation Transformer / MCB Tripping">
            <div>
              <strong>Isolation Transformer / MCB Tripping</strong>
              <span>Main circuit breaker trips frequently.</span>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="upsStatus" value="Already Repaired / Working Fine Now">
            <div>
              <strong>Already Repaired / Working Fine Now</strong>
              <span>Working normally now.</span>
            </div>
          </label>
        </div>

        <div class="form-group">
          <label class="form-label">5. Capture / Upload UPS Photo (Display / Front Panel) <span class="req">*</span></label>
          <div class="photo-upload-box" onclick="document.getElementById('photoInput').click()">
            <span style="font-size: 28px;">📷</span>
            <p style="font-size: 13px; font-weight: 700; color: #1e40af; margin-top: 4px;">Click to Take Photo or Upload Image</p>
            <p style="font-size: 11.5px; color: #64748b;">(Take a clear photo of the UPS front display & indicators)</p>
            <input type="file" id="photoInput" accept="image/*" capture="environment" style="display: none;" required>
            <img id="photoPreview" class="photo-preview" alt="Preview">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">6. Issue Duration <span class="req">*</span></label>
          <select id="duration" class="form-select" required>
            <option value="">-- Select Duration --</option>
            <option value="Less than 1 week">Less than 1 week</option>
            <option value="1 - 3 weeks">1 - 3 weeks</option>
            <option value="More than 1 month">More than 1 month</option>
            <option value="Since Installation / Long Pending">Since Installation / Long Pending</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">7. UPS Serial Number (Optional)</label>
          <input type="text" id="serialNo" class="form-control" placeholder="Label sticker on UPS">
        </div>

        <div class="form-group">
          <label class="form-label">8. Detailed Remarks (Optional)</label>
          <textarea id="remarks" class="form-textarea" rows="2" placeholder="Any specific details..."></textarea>
        </div>

        <button type="submit" class="btn-submit" id="btnSubmit">Submit Complaint & Photo</button>
      </form>
    </div>

    <div class="success-card" id="successBox">
      <span style="font-size: 44px;">✅</span>
      <h2 style="margin-top: 10px;">Complaint & Photo Successfully Recorded!</h2>
      <p style="margin-top: 6px;">Your school's UPS verification and image have been safely saved into the master district database.</p>
    </div>
  </div>

  <script>
    const schoolsData = ${JSON.stringify(targetSchools)};
    const select = document.getElementById('schoolSelect');
    const autoBox = document.getElementById('autoBox');
    let base64Photo = '';

    select.addEventListener('change', function() {
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

    document.getElementById('photoInput').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          base64Photo = evt.target.result;
          const preview = document.getElementById('photoPreview');
          preview.src = base64Photo;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('upsForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!base64Photo) {
        alert('Please capture or upload a photo of the UPS unit.');
        return;
      }
      const btn = document.getElementById('btnSubmit');
      btn.disabled = true;
      btn.textContent = 'Uploading & Saving...';

      const selectedId = select.value;
      const schoolObj = schoolsData.find(s => s.id === selectedId) || {};

      const payload = {
        ticketId: selectedId,
        schoolName: schoolObj.school || '',
        udise: schoolObj.udise || '',
        block: schoolObj.block || '',
        aiName: document.getElementById('aiName').value,
        phone: document.getElementById('aiPhone').value,
        status: document.querySelector('input[name="upsStatus"]:checked')?.value || '',
        duration: document.getElementById('duration').value,
        serialNo: document.getElementById('serialNo').value,
        photoBase64: base64Photo,
        remarks: document.getElementById('remarks').value
      };

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          document.getElementById('formContainer').style.display = 'none';
          document.getElementById('successBox').style.display = 'block';
        } else {
          alert('Error: ' + result.error);
          btn.disabled = false;
          btn.textContent = 'Submit Complaint & Photo';
        }
      } catch (err) {
        alert('Submission failed. Please check internet connection.');
        btn.disabled = false;
        btn.textContent = 'Submit Complaint & Photo';
      }
    });
  </script>
</body>
</html>`;
}

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard & Photo Gallery - Thiruvarur UPS</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: #f1f5f9; color: #0f172a; padding: 20px; }
    .container { max-width: 1250px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    h1 { font-size: 22px; font-weight: 800; }
    .actions { display: flex; gap: 10px; }
    .btn {
      padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13.5px;
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none;
    }
    .btn-download { background: #16a34a; color: white; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.2); }
    .btn-download:hover { background: #15803d; }
    .btn-reset { background: #ef4444; color: white; }
    .btn-reset:hover { background: #dc2626; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .stat-card { background: white; padding: 18px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .stat-card span { font-size: 12px; color: #64748b; font-weight: 600; }
    .stat-card h3 { font-size: 26px; font-weight: 800; margin-top: 4px; }
    
    .table-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { background: #f8fafc; padding: 12px 14px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:hover { background: #f8fafc; }
    
    .thumb-img { width: 55px; height: 55px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1px solid #cbd5e1; }
    .thumb-img:hover { transform: scale(1.08); transition: transform 0.15s; }
    .badge { padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-block; }
    .badge-success { background: #dcfce7; color: #15803d; }
    
    /* Image Modal */
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); align-items: center; justify-content: center; }
    .modal-content { max-width: 90%; max-height: 85%; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Hi-Tech Lab UPS Complaints & Photo Center</h1>
        <p style="color: #64748b; font-size: 13.5px;">Live Verification, Photo Inspection & Excel Export • Thiruvarur District</p>
      </div>
      <div class="actions">
        <a href="/download-excel" class="btn btn-download">📥 Download Live Excel (.CSV)</a>
        <button onclick="resetData()" class="btn btn-reset">🔄 Reset Test Data</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span>TOTAL TARGET SCHOOLS</span>
        <h3 id="statTotal">22</h3>
      </div>
      <div class="stat-card">
        <span>SUBMISSIONS WITH PHOTOS</span>
        <h3 id="statReceived" style="color: #16a34a;">0</h3>
      </div>
      <div class="stat-card">
        <span>PENDING SCHOOLS</span>
        <h3 id="statPending" style="color: #dc2626;">22</h3>
      </div>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>UPS Photo</th>
            <th>School Name</th>
            <th>Block</th>
            <th>AI Name</th>
            <th>Mobile Number</th>
            <th>Exact UPS Status</th>
            <th>Duration</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="9" style="text-align:center; padding: 30px; color: #94a3b8;">Loading submissions...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div id="imgModal" class="modal" onclick="this.style.display='none'">
    <img id="modalImg" class="modal-content">
  </div>

  <script>
    function showModal(src) {
      document.getElementById('modalImg').src = src;
      document.getElementById('imgModal').style.display = 'flex';
    }

    async function resetData() {
      if (confirm('Are you sure you want to reset all test submissions?')) {
        await fetch('/api/reset', { method: 'POST' });
        loadData();
      }
    }

    async function loadData() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        
        document.getElementById('statTotal').textContent = data.totalTarget;
        document.getElementById('statReceived').textContent = data.receivedCount;
        document.getElementById('statPending').textContent = data.totalTarget - data.receivedCount;

        const tbody = document.getElementById('tableBody');
        if (data.submissions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 40px; color: #64748b;">No complaints submitted yet. The system is clean and ready.</td></tr>';
          return;
        }

        tbody.innerHTML = data.submissions.map(s => \`
          <tr>
            <td><small>\${s.timestamp}</small></td>
            <td>
              \${s.photoUrl ? \`<img src="\${s.photoUrl}" class="thumb-img" onclick="showModal('\${s.photoUrl}')" title="Click to view full photo">\` : '<span style="color:#94a3b8;">No Photo</span>'}
            </td>
            <td><strong>\${s.schoolName}</strong><br><small style="color:#64748b;">\${s.udise}</small></td>
            <td>\${s.block}</td>
            <td>\${s.aiName}</td>
            <td><strong>\${s.phone}</strong></td>
            <td><span class="badge badge-success">\${s.status}</span></td>
            <td>\${s.duration}</td>
            <td>\${s.remarks || '-'}</td>
          </tr>
        \`).join('');
      } catch(e) {
        console.error(e);
      }
    }
    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Master UPS App with Photo Support running on http://localhost:${PORT}`);
});
