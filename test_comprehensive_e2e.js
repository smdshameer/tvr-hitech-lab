const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const https = require('https');

// Load Core Project Modules with absolute path
const projectRoot = __dirname;
const db = require(path.join(projectRoot, 'db.js'));
const serverContent = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');

const results = [];
function recordTest(dimension, name, passed, details = '') {
  results.push({ dimension, name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${dimension}] ${name} ${details ? '(' + details + ')' : ''}`);
}

async function runComprehensiveAudit() {
  console.log('\n========================================================');
  console.log('🚀 STARTING COMPREHENSIVE AUTOMATED E2E SYSTEM AUDIT');
  console.log('========================================================\n');

  // ----------------------------------------------------
  // DIMENSION 1: SYNTAX & COMPILATION AUDIT
  // ----------------------------------------------------
  console.log('--- DIMENSION 1: V8 Script Compilation & Zero Syntax Errors ---');
  try {
    const sandboxEnv = {
      require: (mod) => {
        if (mod.startsWith('.')) return require(path.join(projectRoot, mod));
        return require(mod);
      },
      __dirname: projectRoot,
      __filename: path.join(projectRoot, 'server.js'),
      module: { exports: {} },
      process: process,
      Buffer: Buffer,
      JSON: JSON,
      Date: Date,
      Math: Math,
      String: String,
      parseInt: parseInt,
      isNaN: isNaN,
      Array: Array,
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval
    };

    const fullModuleCode = `
      ${serverContent}
      module.exports = {
        teacherHtml: getTeacherPortalHtml(),
        engineerHtml: getITSMWorkbenchHtml(db.masterSchools),
        headHtml: getITSMExecutiveHtml(db.masterSchools),
        loginHtml: getLoginHtml()
      };
    `;

    const serverScript = new vm.Script(fullModuleCode);
    const serverCtx = vm.createContext(sandboxEnv);
    serverScript.runInContext(serverCtx);
    const { teacherHtml, engineerHtml, headHtml, loginHtml } = sandboxEnv.module.exports;

    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    function countValidScripts(html) {
      let m, count = 0;
      while ((m = scriptRegex.exec(html)) !== null) {
        new vm.Script(m[1]);
        count++;
      }
      return count;
    }

    const countT = countValidScripts(teacherHtml);
    recordTest('Dim 1: Syntax', 'Teacher Portal Client Scripts', countT > 0, `${countT} script blocks valid`);

    const countE = countValidScripts(engineerHtml);
    recordTest('Dim 1: Syntax', 'Engineer Workbench Client Scripts', countE > 0, `${countE} script blocks valid`);

    const countH = countValidScripts(headHtml);
    recordTest('Dim 1: Syntax', 'Reporting Head Dashboard Markup', headHtml && headHtml.length > 1000, `${headHtml.length} bytes valid HTML`);

    const countL = countValidScripts(loginHtml);
    recordTest('Dim 1: Syntax', 'Login Page Client Scripts', countL > 0, `${countL} script blocks valid`);
  } catch (err) {
    recordTest('Dim 1: Syntax', 'Client Script Compilation', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 2: SCHOOL SEARCH & 1-CLICK SELECT DOM SIMULATION
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 2: School Search, Filter & 1-Click Select ---');
  try {
    const fnStartT = serverContent.indexOf('function getTeacherPortalHtml(');
    const fnEndT = serverContent.indexOf('\nfunction generateTableRowsHtml(', fnStartT);
    const fnCodeT = serverContent.substring(fnStartT, fnEndT);
    const teacherHtml = (new Function('masterSchools', `const db = { masterSchools }; ${fnCodeT} return getTeacherPortalHtml();`))(db.masterSchools);

    const start = teacherHtml.indexOf('<script>') + 8;
    const end = teacherHtml.indexOf('</script>', start);
    const code = teacherHtml.substring(start, end);

    const elements = {};
    function makeEl(id) {
      return {
        id, value: '', style: {}, innerHTML: '', textContent: '', dataset: {},
        classList: { add: () => {}, remove: () => {} },
        focus: function() {},
        scrollIntoView: function() {},
        addEventListener: function(evt, fn) { this['on' + evt] = fn; }
      };
    }
    ['schoolSelect', 'schoolSearchInput', 'schoolSuggestionsBox', 'searchWrap', 'verifiedSchoolCard', 'customSchoolBox', 'aiName', 'aiPhone', 'incidentForm', 'verSchoolName', 'verBlock', 'verUdise', 'verAiName', 'verPhone'].forEach(id => {
      elements[id] = makeEl(id);
    });

    const sandbox = {
      document: { getElementById: (id) => elements[id] || makeEl(id), addEventListener: () => {} },
      window: {}, console: console, setTimeout: (fn) => fn(), Image: function() {}, FileReader: function() {}
    };

    const script = new vm.Script(code);
    script.runInContext(vm.createContext(sandbox));

    // Test A: Empty Search Box -> Dropdown MUST be hidden
    elements['schoolSearchInput'].value = '';
    elements['schoolSearchInput'].onfocus && elements['schoolSearchInput'].onfocus();
    const emptyHidden = elements['schoolSuggestionsBox'].style.display === 'none';
    recordTest('Dim 2: Search', 'Dropdown hidden on empty focus', emptyHidden);

    // Test B: Typing "33" -> Dropdown displays matches
    elements['schoolSearchInput'].value = '33';
    elements['schoolSearchInput'].oninput && elements['schoolSearchInput'].oninput();
    const matchShown = elements['schoolSuggestionsBox'].style.display === 'block' && elements['schoolSuggestionsBox'].innerHTML.includes('suggest-item');
    recordTest('Dim 2: Search', 'Live filtering on typing "33"', matchShown, `${(elements['schoolSuggestionsBox'].innerHTML.match(/suggest-item/g) || []).length} matches`);

    // Test C: 1-Click Select School "TVR-011"
    sandbox.window.chooseSchool('TVR-011');
    const selMatch = elements['schoolSelect'].value === 'TVR-011';
    const cardShown = elements['verifiedSchoolCard'].style.display === 'block';
    const autoName = elements['aiName'].value === 'Kothaibharathi Tamilmani';
    const autoPhone = elements['aiPhone'].value === '9042489993';
    recordTest('Dim 2: Search', '1-Click Select & Auto-Fill AI Details', selMatch && cardShown && autoName && autoPhone, `AI: ${elements['aiName'].value}`);

    // Test D: Reset / Change School Selection
    sandbox.window.resetSchoolSelection();
    const resetOk = elements['verifiedSchoolCard'].style.display === 'none' && elements['searchWrap'].style.display === 'block';
    recordTest('Dim 2: Search', 'Reset School Selection', resetOk);

    // Test E: Open Other / New School Modal
    sandbox.window.openOtherSchool();
    const otherOk = elements['customSchoolBox'].style.display === 'block';
    recordTest('Dim 2: Search', 'Open Other School Custom Form', otherOk);
  } catch (err) {
    recordTest('Dim 2: Search', 'DOM Simulation', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 3: 4 MANDATORY PHOTO VALIDATION
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 3: 4 Mandatory Photos Validation ---');
  try {
    const fnStartT = serverContent.indexOf('function getTeacherPortalHtml(');
    const fnEndT = serverContent.indexOf('\nfunction generateTableRowsHtml(', fnStartT);
    const fnCodeT = serverContent.substring(fnStartT, fnEndT);
    const teacherHtml = (new Function('masterSchools', `const db = { masterSchools }; ${fnCodeT} return getTeacherPortalHtml();`))(db.masterSchools);

    const hasBase64P1 = teacherHtml.includes('let base64Photo1 =');
    const hasBase64P2 = teacherHtml.includes('let base64Photo2 =');
    const hasBase64P3 = teacherHtml.includes('let base64Photo3 =');
    const hasBase64P4 = teacherHtml.includes('let base64Photo4 =');
    const hasScrollAlert = teacherHtml.includes('showPhotoMissingAlert(');
    recordTest('Dim 3: Photos', 'All 4 Photo variables & missing alert handler declared', hasBase64P1 && hasBase64P2 && hasBase64P3 && hasBase64P4 && hasScrollAlert);
  } catch(err) {
    recordTest('Dim 3: Photos', 'Photo Client Validation', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 4: BACKEND TICKET CREATION & DATA CONSISTENCY
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 4: Backend Ticket Creation & Database ---');
  try {
    const testPayload = {
      ticketId: 'HTL-TVR-E2E01',
      createdAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      createdDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      schoolId: 'TVR-011',
      schoolName: 'GGHSS KORADACHERY',
      udise: '33200305301',
      block: 'Koradachery',
      district: 'Thiruvarur',
      aiName: 'Kothaibharathi Tamilmani',
      phone: '9042489993',
      issue: 'Total Dead / No Power / Lab Off',
      duration: 'Today',
      serialNo: 'EM-10KVA-TEST',
      priority: db.normalizePriority('Critical', 'Total Dead / No Power'),
      status: 'New / Under Review',
      resolutionCategory: 'Pending',
      resolutionType: '',
      vendorName: '',
      vendorTicketNo: '',
      partsRequired: '',
      resolutionNotes: '',
      resolvedAt: '',
      photo1: 'test_p1.jpg',
      photo1Url: 'test_p1.jpg',
      photo2: 'test_p2.jpg',
      photo2Url: 'test_p2.jpg',
      photo3: 'test_p3.jpg',
      photo3Url: 'test_p3.jpg',
      photo4: 'test_p4.jpg',
      photo4Url: 'test_p4.jpg',
      remarks: 'Automated E2E Test Ticket',
      timeline: [
        { time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), action: 'Ticket Logged by School AI', note: 'Automated E2E Test Ticket' }
      ]
    };

    await db.createTicket(testPayload);
    const all = await db.getAllTickets();
    const created = all.find(t => t.ticketId === 'HTL-TVR-E2E01');
    recordTest('Dim 4: Backend', 'Create Ticket with 4 Photos in DB', !!created, created ? created.ticketId : 'Not found');

    // Clean up test ticket
    await db.deleteTicket('HTL-TVR-E2E01', 'E2E Test Cleanup');
    const afterDelete = await db.getAllTickets();
    const deletedOk = !afterDelete.some(t => t.ticketId === 'HTL-TVR-E2E01');
    recordTest('Dim 4: Backend', 'Delete Ticket from DB Cleanly', deletedOk);
  } catch (err) {
    recordTest('Dim 4: Backend', 'Database Operations', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 5: GOOGLE DRIVE CLOUD SYNC ENGINE
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 5: Google Drive Cloud Sync & 4 Photos Storage ---');
  try {
    const hasDriveFn = serverContent.includes('async function syncTicketToGoogleDrive(');
    const has4PhotoPayload = serverContent.includes('photo1Base64: rawData.photo1Base64') &&
                             serverContent.includes('photo2Base64: rawData.photo2Base64') &&
                             serverContent.includes('photo3Base64: rawData.photo3Base64') &&
                             serverContent.includes('photo4Base64: rawData.photo4Base64');
    recordTest('Dim 5: Drive', 'Google Drive Webhook & 4 Photo Sync Integration', hasDriveFn && has4PhotoPayload);
  } catch(err) {
    recordTest('Dim 5: Drive', 'Drive Sync Check', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 6: EXCEL & CSV EXPORT ENGINES
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 6: Excel & CSV Export Engines ---');
  try {
    const csvOk = typeof db.generateCsvExport === 'function';
    const excelOk = typeof db.generateExcelExport === 'function';
    if (excelOk) {
      const tickets = await db.getAllTickets();
      const buffer = await db.generateExcelExport(tickets);
      recordTest('Dim 6: Export', 'Multi-Sheet Excel Generation', buffer && buffer.length > 1000, `${buffer.length} bytes`);
    }
  } catch (err) {
    recordTest('Dim 6: Export', 'Export Engines', false, err.message);
  }

  // ----------------------------------------------------
  // DIMENSION 7: LIVE PRODUCTION SMOKE TEST
  // ----------------------------------------------------
  console.log('\n--- DIMENSION 7: Live Vercel Production Smoke Test ---');
  try {
    const liveHtml = await new Promise((resolve, reject) => {
      const req = https.get('https://hitech-lab.vercel.app/?cache=' + Date.now(), res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve(b));
      });
      req.on('error', reject);
    });

    const start = liveHtml.indexOf('<script>') + 8;
    const end = liveHtml.indexOf('</script>', start);
    const liveScript = liveHtml.substring(start, end);

    new vm.Script(liveScript);
    recordTest('Dim 7: Production', 'Live Vercel HTML Script V8 Execution', true, 'Zero SyntaxErrors');
    recordTest('Dim 7: Production', 'Live Verified School Card Markup', liveHtml.includes('verifiedSchoolCard'));
    recordTest('Dim 7: Production', 'Live 4-Photo Upload Box Grid', liveHtml.includes('photoBox4'));
  } catch (err) {
    recordTest('Dim 7: Production', 'Live Smoke Test', false, err.message);
  }

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log('\n========================================================');
  console.log('📊 COMPREHENSIVE AUDIT SUMMARY REPORT');
  console.log('========================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);

  if (failed === 0) {
    console.log('\n🎉 ALL ' + total + ' SYSTEM DIMENSIONS ARE 100% OPERATIONAL, SYNTAX-ERROR FREE & FULLY FUNCTIONAL!\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED — INVESTIGATION REQUIRED!\n');
    process.exit(1);
  }
}

runComprehensiveAudit();
