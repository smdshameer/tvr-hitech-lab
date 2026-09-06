#!/usr/bin/env node
/**
 * verify-project-state — validates the continuity system. Read-only. Exits 0 PASS / 1 FAIL.
 * Checks: required files + headings, no secrets in docs, continuation point present.
 * (scripts/verify-production.js is covered by its own self-test and out of scope here.)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = ['PROJECT_STATE.md', 'NEXT_TASK.md', 'ARCHITECTURE.md', 'REQUIREMENTS.md', 'DECISIONS.md', 'KNOWN_ISSUES.md', 'TEST_STATUS.md', 'DEPLOYMENT_STATUS.md', 'CHANGELOG.md'];
const NEED_HEADINGS = {
  'PROJECT_STATE.md': ['Identity', 'Objective / tasks', 'Status', 'Protected areas'],
  'NEXT_TASK.md': ['CURRENT OBJECTIVE', 'EXACT NEXT ACTION', 'SAFETY RESTRICTIONS', 'DO NOT REPEAT', 'DO NOT CHANGE'],
  'ARCHITECTURE.md': ['Key routes', 'Subsystems'],
  'REQUIREMENTS.md': ['Protected behavior'],
  'DECISIONS.md': ['Decision'],
  'KNOWN_ISSUES.md': ['KI-001'],
  'TEST_STATUS.md': ['Legend', 'Inventory'],
  'DEPLOYMENT_STATUS.md': ['Production URL', 'Cron'],
  'CHANGELOG.md': ['2c17f72'],
};
let fail = 0;
const ok = (c, msg) => console.log((c ? '✅ ' : '❌ ') + msg) || (c ? 0 : fail++);
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };

ok(fs.existsSync(path.join(ROOT, 'AGENT_RULES.md')), 'AGENT_RULES.md exists');
// Test-safety gate: fail-closed opt-in for production-mutating tests.
const gateSrc = read(path.join(ROOT, 'tests', 'production-gate.js')) || '';
ok(fs.existsSync(path.join(ROOT, 'tests', 'production-gate.js')), 'tests/production-gate.js exists');
ok(/process\.env\.PRODUCTION_TESTS === '1'/.test(gateSrc), 'gate is fail-closed (exact PRODUCTION_TESTS=1)');
let pkg = {};
try { pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); } catch (e) {}
ok(pkg.scripts && pkg.scripts['test:live'], 'package.json has test:live opt-in script');
ok(pkg.scripts && !/PRODUCTION_TESTS=1/.test(pkg.scripts.test || ''), 'npm test does not enable the production gate');
const gasSrc = read(path.join(ROOT, 'scripts', 'gas-forensics.js')) || '';
ok(fs.existsSync(path.join(ROOT, 'scripts', 'gas-forensics.js')), 'scripts/gas-forensics.js exists');
ok(pkg.scripts && pkg.scripts['gas:forensics'], 'package.json has gas:forensics script');
ok(fs.existsSync(path.join(ROOT, 'scripts', 'gas-auth-check.js')), 'scripts/gas-auth-check.js exists');
ok(pkg.scripts && pkg.scripts['gas:forensics:auth-check'], 'package.json has gas:forensics:auth-check script');
ok(fs.existsSync(path.join(ROOT, 'scripts', 'gas-processes.js')), 'scripts/gas-processes.js exists');
ok(pkg.scripts && pkg.scripts['gas:processes'], 'package.json has gas:processes script');
ok(/PRODUCTION_TESTS/.test(gasSrc) === false, 'forensics runner needs no production-test gate (read-only by design)');
// Context-window protection: continuation files stay compact, startup brief stays small.
const lineCount = (p) => { const t = read(p); return t === null ? 1e9 : t.split('\n').length; };
ok(lineCount(path.join(ROOT, 'docs', 'NEXT_TASK.md')) <= 45, 'NEXT_TASK.md compact (<=45 lines)');
ok(lineCount(path.join(ROOT, 'docs', 'PROJECT_STATE.md')) <= 55, 'PROJECT_STATE.md compact (<=55 lines)');
try {
  const { execFileSync } = require('child_process');
  const brief = execFileSync(process.execPath, [path.join(__dirname, 'agent-start.js')], { encoding: 'utf8', timeout: 60000 });
  const n = brief.split('\n').filter((l) => l.trim()).length;
  ok(n <= 30 && /EXACT NEXT ACTION|NEXT /.test(brief), 'agent:start brief <=30 non-empty lines with next action (' + n + ')');
} catch (e) { ok(false, 'agent:start runs cleanly (' + String((e && e.message) || e).slice(0, 100) + ')'); }
for (const d of DOCS) {
  const t = read(path.join(ROOT, 'docs', d));
  ok(t !== null, 'docs/' + d + ' exists');
  if (t === null) continue;
  for (const h of (NEED_HEADINGS[d] || [])) ok(t.includes(h), 'docs/' + d + ' has "' + h + '"');
  if (d === 'NEXT_TASK.md') ok(/EXACT NEXT ACTION\s*\n\s*\n?-?\s*\S/.test(t), 'NEXT_TASK has a continuation point');
}
// Secret scan over docs + continuity scripts only (fragmented so this file never self-matches).
const frag = ['post' + 'gres://', 'AKfyc' + 'bx', 'htl_ses' + 'sion=[A-Za-z0-9]', '-----BE' + 'GIN', 'x-cron-se' + 'cret:\\s*\\S'];
const targets = DOCS.map((d) => path.join(ROOT, 'docs', d))
  .concat([path.join(ROOT, 'AGENT_RULES.md'), __filename,
    path.join(__dirname, 'agent-start.js'), path.join(__dirname, 'project-handoff.js'),
    path.join(__dirname, 'run-live-tests.js'), path.join(__dirname, 'gas-forensics.js'),
    path.join(__dirname, 'gas-forensics-holder.js'), path.join(__dirname, 'gas-auth-check.js'),
    path.join(__dirname, 'gas-processes.js'),
    path.join(ROOT, 'tests', 'production-gate.js')]);
for (const f of targets) {
  const t = read(f);
  if (t === null) continue;
  for (const p of frag) {
    const hit = new RegExp(p, 'i').test(t);
    ok(!hit, 'no secret (' + p.slice(0, 12) + '…) in ' + path.basename(f));
  }
}
// Forbidden extraction APIs in continuity scripts (fragmented).
const apis = ['docu' + 'ment.co' + 'okie', 'stor' + 'ageSt' + 'ate(', 'localSto' + 'rage'];
for (const s of ['agent-start.js', 'project-handoff.js', 'verify-project-state.js']) {
  const t = read(path.join(__dirname, s)) || '';
  for (const a of apis) ok(!t.includes(a), 'no secret-API in scripts/' + s);
}
console.log(fail ? 'verify-project-state: FAIL (' + fail + ')' : 'verify-project-state: PASS');
process.exit(fail ? 1 : 0);
