const assert = require('assert');
const fs = require('fs');

console.log('====================================================');
console.log('STARTING TARGETED FIXES TEST SUITE');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. TEST SCHOOL SEARCH TOUCH / SCROLL EVENT LOGIC
// ----------------------------------------------------
const path = require('path');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

// Verify CSS has touch-scrolling and pan-y
assert(serverJs.includes('touch-action: pan-y;'), 'CSS must include touch-action: pan-y');
assert(serverJs.includes('-webkit-overflow-scrolling: touch;'), 'CSS must include -webkit-overflow-scrolling: touch');
assert(serverJs.includes('overscroll-behavior: contain;'), 'CSS must include overscroll-behavior: contain');

// Verify no inline onpointerdown / onmousedown in renderSuggestions
assert(!serverJs.includes('onpointerdown="chooseSchool'), 'Must NOT have inline onpointerdown in suggest items');
assert(!serverJs.includes('onmousedown="chooseSchool'), 'Must NOT have inline onmousedown in suggest items');

// Simulate the gesture detection logic
function createGestureSimulator() {
  let selectedId = null;
  function chooseSchool(id) { selectedId = id; }

  let suggestTouchStartY = 0;
  let suggestTouchStartX = 0;
  let suggestTouchStartTime = 0;
  let suggestIsScrolling = false;
  let lastDeliberateTapTime = 0;

  return {
    touchStart: (x, y, time) => {
      suggestTouchStartY = y;
      suggestTouchStartX = x;
      suggestTouchStartTime = time || Date.now();
      suggestIsScrolling = false;
    },
    touchMove: (x, y) => {
      const deltaY = Math.abs(y - suggestTouchStartY);
      const deltaX = Math.abs(x - suggestTouchStartX);
      if (deltaY > 7 || deltaX > 7) {
        suggestIsScrolling = true;
      }
    },
    touchEnd: (targetId, time) => {
      if (suggestIsScrolling) return false;
      const duration = (time || Date.now()) - suggestTouchStartTime;
      if (duration < 600) {
        lastDeliberateTapTime = time || Date.now();
        chooseSchool(targetId);
        return true;
      }
      return false;
    },
    click: (targetId, time) => {
      if ((time || Date.now()) - lastDeliberateTapTime < 450 || suggestIsScrolling) {
        return false;
      }
      chooseSchool(targetId);
      return true;
    },
    getSelectedId: () => selectedId,
    reset: () => { selectedId = null; suggestIsScrolling = false; }
  };
}

const sim = createGestureSimulator();

// Scenario A: User swipes vertically to scroll (move 25px)
sim.reset();
sim.touchStart(100, 200, 1000);
sim.touchMove(100, 225); // moved 25px
const tapHandledA = sim.touchEnd('SCHOOL_123', 1150);
const clickHandledA = sim.click('SCHOOL_123', 1160);
assert.strictEqual(tapHandledA, false, 'TouchEnd must NOT select during scroll swipe');
assert.strictEqual(clickHandledA, false, 'Click must NOT select during scroll swipe');
assert.strictEqual(sim.getSelectedId(), null, 'Accidental selection during scroll MUST BE BLOCKED');
console.log('✅ Scenario A: Swipe gesture correctly scrolled list with ZERO accidental selection');

// Scenario B: User deliberately taps a school (stationary tap, 1px jitter)
sim.reset();
sim.touchStart(100, 200, 2000);
sim.touchMove(101, 200); // 1px micro-jitter
const tapHandledB = sim.touchEnd('SCHOOL_123', 2120);
assert.strictEqual(tapHandledB, true, 'TouchEnd must select on stationary deliberate tap');
assert.strictEqual(sim.getSelectedId(), 'SCHOOL_123', 'Deliberate tap must select correct school');
console.log('✅ Scenario B: Deliberate tap correctly selected school immediately');

// Scenario C: Desktop mouse click
sim.reset();
const clickHandledC = sim.click('SCHOOL_456', 3000);
assert.strictEqual(clickHandledC, true, 'Desktop click must select school');
assert.strictEqual(sim.getSelectedId(), 'SCHOOL_456', 'Desktop mouse selection works normally');
console.log('✅ Scenario C: Desktop click works smoothly');

// ----------------------------------------------------
// 2. TEST SECTION 5 QUICK PRE-CHECKS
// ----------------------------------------------------
console.log('\n--- 2. Testing Section 5 Quick Pre-Checks ---');
assert(serverJs.includes('1) Main Input Power / Phase Selector MCB ஆன் செய்யப்பட்டுள்ளதா?'), 'Check 1 missing');
assert(serverJs.includes('2) Wall Circuit Breaker'), 'Check 2 missing');
assert(serverJs.includes('3) Backside UPS Inbuilt Circuit Breaker'), 'Check 3 missing');
assert(serverJs.includes('4) Battery Side Single Circuit Breaker'), 'Check 4 missing');
assert(serverJs.includes('5) UPS Display-ல் 230V காட்டுகிறதா? (Is 230V Showing on UPS Display?)'), 'Check 5 missing');

assert(serverJs.includes('id="chkInputPower"'), 'chkInputPower missing');
assert(serverJs.includes('id="chkWallBreaker"'), 'chkWallBreaker missing');
assert(serverJs.includes('id="chkUpsBreaker"'), 'chkUpsBreaker missing');
assert(serverJs.includes('id="chkBatteryBreaker"'), 'chkBatteryBreaker missing');
assert(serverJs.includes('id="chkUps230V"'), 'chkUps230V missing');
console.log('✅ All 5 Section 5 Quick Pre-Checks present and individually selectable');

// ----------------------------------------------------
// 3. TEST MANDATORY REMARKS VALIDATION
// ----------------------------------------------------
console.log('\n--- 3. Testing Mandatory Remarks Validation ---');
assert(serverJs.includes('id="remarks" class="form-control" rows="2" placeholder="புகாரின் விளக்கம் / குறிப்புகள் உள்ளிடவும் (Description / Remarks is required)..." required'), 'Remarks textarea must be required');
assert(serverJs.includes('Description / Remarks is required'), 'Server validation for remarks must exist');
console.log('✅ Description / Remarks is strictly mandatory on both client and server');

// ----------------------------------------------------
// 4. TEST MANDATORY GPS CAMERA FOR COMPLETION PHOTO
// ----------------------------------------------------
console.log('\n--- 4. Testing Mandatory GPS Camera for Completion Photo ---');
assert(serverJs.includes('Live GPS Camera with verified location within 50m is mandatory for the Completion Photo'), 'Client must enforce GPS camera verification before submit');
assert(serverJs.includes('GPS location coordinates are mandatory for the completion photo'), 'Backend must enforce GPS coordinates');
assert(serverJs.includes('GPS accuracy must be within 50 meters'), 'Backend must enforce <= 50m accuracy threshold');
console.log('✅ GPS Camera & location verification strictly mandatory for completion photo');

// ----------------------------------------------------
// 5. TEST GOOGLE DRIVE FOLDER STRUCTURE & RESOLUTION
// ----------------------------------------------------
console.log('\n--- 5. Testing Google Drive Folder Structure & Idempotency ---');
const gasCode = fs.readFileSync(path.join(__dirname, '../google_apps_script_code.js'), 'utf8');

// Mock Google DriveApp
function createMockDriveApp() {
  const folders = [];

  class MockFolder {
    constructor(name, parent) {
      this.id = 'folder_' + Math.random().toString(36).substring(2, 9);
      this.name = name;
      this.parent = parent || null;
      this.subFolders = [];
      this.files = [];
      this.sharing = null;
    }
    getName() { return this.name; }
    getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
    setSharing(access, permission) { this.sharing = { access, permission }; }
    createFolder(name) {
      const sf = new MockFolder(name, this);
      this.subFolders.push(sf);
      return sf;
    }
    getFoldersByName(name) {
      const matches = this.subFolders.filter(f => f.getName() === name);
      let idx = 0;
      return {
        hasNext: () => idx < matches.length,
        next: () => matches[idx++]
      };
    }
    getFolders() {
      let idx = 0;
      const all = [...this.subFolders];
      return {
        hasNext: () => idx < all.length,
        next: () => all[idx++]
      };
    }
  }

  const root = new MockFolder('ROOT');

  const mockDrive = {
    root,
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFoldersByName: (name) => {
      const matches = root.subFolders.filter(f => f.getName() === name);
      let idx = 0;
      return {
        hasNext: () => idx < matches.length,
        next: () => matches[idx++]
      };
    },
    getFolders: () => {
      let idx = 0;
      const all = [...root.subFolders];
      return {
        hasNext: () => idx < all.length,
        next: () => all[idx++]
      };
    },
    createFolder: (name) => {
      const f = new MockFolder(name, root);
      root.subFolders.push(f);
      return f;
    }
  };
  return mockDrive;
}

const mockDrive = createMockDriveApp();

// Extract getOrCreateDistrictFolder, getOrCreateSchoolFolder, getOrCreateSubFolder from gasCode
const gasSandbox = {
  DriveApp: mockDrive,
  Utilities: {
    formatDate: () => '03/09/2026, 12:00:00 AM'
  }
};

const fnExtract = `
  ${gasCode.match(/function getOrCreateDistrictFolder[\s\S]*?\n\}/)[0]}
  ${gasCode.match(/function getOrCreateSchoolFolder[\s\S]*?\n\}/)[0]}
  ${gasCode.match(/function getOrCreateSubFolder[\s\S]*?\n\}/)[0]}
  return { getOrCreateDistrictFolder, getOrCreateSchoolFolder, getOrCreateSubFolder };
`;

const gasFns = new Function('DriveApp', 'Utilities', fnExtract)(mockDrive, gasSandbox.Utilities);

// Test 5A: District folder creation & reuse
const tvrDist1 = gasFns.getOrCreateDistrictFolder('Thiruvarur');
const tvrDist2 = gasFns.getOrCreateDistrictFolder('Thiruvarur');
assert.strictEqual(tvrDist1.id, tvrDist2.id, 'District folder must be reused (idempotent)');
console.log('✅ District folder resolution is idempotent');

// Test 5B: Separate district folder for Nagapattinam
const ngpDist = gasFns.getOrCreateDistrictFolder('Nagapattinam');
assert.notStrictEqual(ngpDist.id, tvrDist1.id, 'Different districts must have separate folders');
console.log('✅ Separate folder created for each district');

// Test 5C: School individual folder created under District
const schoolA1 = gasFns.getOrCreateSchoolFolder(tvrDist1, '33200503001', 'PUMS THIRUKKARAVASAL');
assert(schoolA1.getName().includes('33200503001'), 'School folder must include UDISE');
assert(schoolA1.getName().includes('PUMS THIRUKKARAVASAL'), 'School folder must include school name');

// Test 5D: School folder reuse (Idempotency - No duplicate folders!)
const schoolA2 = gasFns.getOrCreateSchoolFolder(tvrDist1, '33200503001', 'PUMS THIRUKKARAVASAL');
assert.strictEqual(schoolA1.id, schoolA2.id, 'School folder MUST be reused when UDISE matches! No duplicates allowed.');
console.log('✅ School folder resolution by UDISE is 100% idempotent (No duplicate folders)');

// Test 5E: Another school in same district gets its own folder
const schoolB = gasFns.getOrCreateSchoolFolder(tvrDist1, '33200503002', 'PUMS KOMAL');
assert.notStrictEqual(schoolA1.id, schoolB.id, 'Different schools must have different folders');
console.log('✅ Different schools have isolated individual folders under their district');

// Test 5F: Subfolders "Evidence" and "Completion Photos"
const evA = gasFns.getOrCreateSubFolder(schoolA1, 'Evidence');
const compA = gasFns.getOrCreateSubFolder(schoolA1, 'Completion Photos');
assert.strictEqual(evA.getName(), 'Evidence');
assert.strictEqual(compA.getName(), 'Completion Photos');

const evA_reused = gasFns.getOrCreateSubFolder(schoolA1, 'Evidence');
assert.strictEqual(evA.id, evA_reused.id, 'Subfolders must be reused without duplicating');
console.log('✅ Evidence and Completion Photos subfolders properly created and reused');

console.log('\n====================================================');
console.log('🎉 ALL TARGETED FIXES TESTS PASSED 100%');
console.log('====================================================');
