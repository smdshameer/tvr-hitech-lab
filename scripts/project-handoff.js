#!/usr/bin/env node
/**
 * project:handoff — durable session checkpoint. Never touches production.
 * Refreshes the auto section of docs/PROJECT_STATE.md from live git state,
 * stamps handoff time, and prints what the agent must update by hand.
 * Never fabricates: anything not derivable is left UNKNOWN with a prompt.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'docs', 'PROJECT_STATE.md');
const git = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 15000 }).trim(); } catch (e) { return 'UNKNOWN'; } };

const head = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = git(['status', '--porcelain']);
const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';

let md = fs.readFileSync(STATE, 'utf8');
const block = [
  '## Last handoff (auto, do not edit by hand)',
  '',
  '- When: ' + now,
  '- HEAD: ' + head + ' on ' + branch,
  '- Working tree: ' + (dirty === 'UNKNOWN' ? 'UNKNOWN' : (dirty ? 'DIRTY:\n```\n' + dirty + '\n```' : 'clean')),
  '- Live prod/DB/Drive/Sheets status: UNKNOWN until re-verified read-only (see docs/NEXT_TASK.md).',
].join('\n');
if (/## Last handoff \(auto, do not edit by hand\)[\s\S]*?(?=\n## |$)/.test(md)) {
  md = md.replace(/## Last handoff \(auto, do not edit by hand\)[\s\S]*?(?=\n## |$)/, block + '\n');
} else {
  md = md.trimEnd() + '\n\n' + block + '\n';
}
fs.writeFileSync(STATE, md);

console.log('=== PROJECT HANDOFF ===');
console.log('Stamped docs/PROJECT_STATE.md at ' + now + ' (HEAD ' + head + ', ' + branch + ')');
console.log('Working tree: ' + (dirty === 'UNKNOWN' ? 'UNKNOWN' : (dirty ? 'DIRTY (' + dirty.split('\n').length + ' entries)' : 'clean')));
console.log('By hand before ending session:');
console.log(' 1. docs/NEXT_TASK.md — move finished items COMPLETED→, set new EXACT NEXT ACTION.');
console.log(' 2. docs/TEST_STATUS.md — record suites actually run with PASS/FAIL evidence.');
console.log(' 3. docs/KNOWN_ISSUES.md — new findings or blockers (never delete KI-001 history).');
console.log(' 4. docs/CHANGELOG.md — only for meaningful milestones.');
console.log(' 5. docs/DEPLOYMENT_STATUS.md — only if deployment state was re-verified.');
console.log('Next session starts with: npm run agent:start');
