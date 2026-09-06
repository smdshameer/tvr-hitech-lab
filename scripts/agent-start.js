#!/usr/bin/env node
/**
 * agent:start — minimal session brief. Budget: <= 30 lines. Read-only, no secrets.
 * Prints ONLY: identity, phase, objective, blocker, next action, safety, and
 * the task-scoped docs to read. Everything else stays in files until needed.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const section = (md, head) => {
  const m = md.match(new RegExp('## ' + head + '[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)'));
  return m ? m[1].trim() : '';
};
const firstLines = (t, n) => t.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, n);
const git = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', timeout: 15000 }).trim(); } catch (e) { return '?'; } };

const state = read('docs/PROJECT_STATE.md');
const next = read('docs/NEXT_TASK.md');
if (!state || !next) {
  console.log('AGENT START: Level-1 docs MISSING — read AGENT_RULES.md, docs/PROJECT_STATE.md, docs/NEXT_TASK.md in full.');
  process.exit(2);
}

const repo = (state.match(/Repo:\s*`([^`]+)`/) || [])[1] || '?';
const prod = (state.match(/Production:\s*`([^`]+)`/) || [])[1] || '?';
const head = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = git(['status', '--porcelain']);
const dirtyN = !dirty || dirty === '?' ? '?' : String(dirty.split('\n').length);

const phase = firstLines(section(state, 'Identity').split('\n').filter((l) => /current phase/i.test(l)).join('\n'), 1)[0]
  .replace(/^-\s*Current phase:\s*/i, '') || '?';
const objective = firstLines(section(next, 'CURRENT OBJECTIVE'), 2).join(' ');
const blocker = firstLines(section(state, 'Objective / tasks').split('\n').filter((l) => /blocker/i.test(l)).join('\n'), 1)[0]
  .replace(/^-\s*Current blocker:\s*/i, '') || '?';
const action = firstLines(section(next, 'EXACT NEXT ACTION'), 3);

// Task-scoped pointers: only docs this task needs.
const readDocs = ['docs/NEXT_TASK.md (this action)'];
const probe = (re, doc) => { if (re.test(objective + ' ' + action.join(' '))) readDocs.push(doc); };
probe(/KI-001|gas|executions|forensics/i, 'docs/KNOWN_ISSUES.md#KI-001 + docs/forensics/KI-001-report.md');
probe(/test|suite|gam|regression/i, 'docs/TEST_STATUS.md');
probe(/deploy|vercel|release/i, 'docs/DEPLOYMENT_STATUS.md');
probe(/architect|refactor|structur/i, 'docs/ARCHITECTURE.md');
probe(/requirement|protect|gps|delet/i, 'docs/REQUIREMENTS.md');

const out = [
  'AGENT START',
  `PROJECT ${repo} @ ${branch}/${head} — ${prod} (tree: ${dirty === '' ? 'clean' : dirtyN + ' uncommitted'})`,
  `PHASE ${phase}`,
  `OBJECTIVE ${objective}`,
  `BLOCKER ${blocker}`,
  `NEXT ${action.join(' ')}`,
  'SAFETY read-only default; no probes/writes/deploys/commits without authorization; mutating tests need PRODUCTION_TESTS=1',
  'READ ' + [...new Set(readDocs)].join(' · '),
  'Full contract (skim once): AGENT_RULES.md',
];
console.log(out.join('\n'));
if (out.length > 30) { console.error('BUDGET EXCEEDED: ' + out.length + ' lines'); process.exit(1); }
