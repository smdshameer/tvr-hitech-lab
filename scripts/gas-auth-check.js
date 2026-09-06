#!/usr/bin/env node
/**
 * gas-auth-check.js — SHORT headed diagnostic for the forensics login loop.
 *
 * Answers, without collecting any secrets:
 *   BROWSER_OPENED / LOGIN_PAGE_REACHED / AUTH_DETECTED /
 *   SCRIPT_GOOGLE_REACHED / EXECUTIONS_REACHABLE
 *
 * Usage: npm run gas:forensics:auth-check   (~2 min, headed window opens)
 * If you sign in inside the opened window during the run, AUTH_DETECTED
 * should flip to YES — proving the detection path works end to end.
 *
 * HARD RULES: no cookie/storage/DOM-secret APIs (url/title/visible-text only),
 * read-only navigation, temp profile ALWAYS destroyed, never touches the
 * user's normal Chrome, zero production writes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const workspaceRequire = createRequire(path.join(ROOT, 'package.json'));
const SAMPLES = 6;          // visible-state samples
const SAMPLE_GAP_MS = 15000; // 6 x 15s ≈ 90s total — deliberately short
// Persistent dedicated profile (user-local, outside repo): sign in ONCE there,
// reuse on later runs. The profile is browser-owned storage — automation drives
// pages only and never reads cookies/storage from it.
function persistentProfileDir() {
  return path.join(os.homedir(), 'AppData', 'Local', 'tvr-gas-forensics-profile');
}

function redact(s) {
  return String(s || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]');
}
function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}
function destroyProfile(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  return !fs.existsSync(dir);
}

(async () => {
  const t0 = Date.now();
  const usePersistent = process.argv.includes('--persistent-profile');
  const profileDir = usePersistent
    ? persistentProfileDir()
    : fs.mkdtempSync(path.join(os.tmpdir(), 'gas-authcheck-profile-'));
  if (usePersistent) fs.mkdirSync(profileDir, { recursive: true });
  console.log('PROFILE_MODE=' + (usePersistent ? 'PERSISTENT ' + profileDir : 'TEMPORARY (destroyed after run)'));
  const rep = {
    BROWSER_OPENED: 'NO', LOGIN_PAGE_REACHED: 'NO', AUTH_DETECTED: 'NO',
    SCRIPT_GOOGLE_REACHED: 'NO', EXECUTIONS_REACHABLE: 'UNKNOWN',
    hosts: [], titles: [], notes: [],
  };
  let chromium;
  try { ({ chromium } = workspaceRequire('@playwright/test')); }
  catch (e) { console.log('BROWSER_OPENED=NO (playwright unavailable)'); process.exit(2); }

  let ctx = null;
  const finish = () => {
    console.log('=== GAS AUTH DIAGNOSIS ===');
    for (const k of ['BROWSER_OPENED', 'LOGIN_PAGE_REACHED', 'AUTH_DETECTED', 'SCRIPT_GOOGLE_REACHED', 'EXECUTIONS_REACHABLE']) {
      console.log(k + '=' + rep[k]);
    }
    console.log('HOSTS_SEEN=' + [...new Set(rep.hosts)].join(','));
    console.log('TITLES_SEEN=' + [...new Set(rep.titles)].join(' | '));
    rep.notes.forEach((n) => console.log('NOTE=' + n));
    if (usePersistent) {
      console.log('PROFILE_RETAINED=' + profileDir + ' (sign in persists here for reuse; outside repo)');
    } else {
      const destroyed = destroyProfile(profileDir);
      console.log('PROFILE_DESTROYED=' + (destroyed ? 'YES' : 'NO'));
    }
    console.log('SAFETY: cookie=NONE storage=NONE creds=NONE normalChrome=UNTOUCHED prodWrites=0');
    console.log('Elapsed: ' + Math.round((Date.now() - t0) / 1000) + 's');
  };

  try {
    // Prefer the REAL installed Chrome (fewer automation signals than bundled
    // Chromium); fall back to bundled Chromium when unavailable.
    let launchedWith = 'bundled-chromium';
    try {
      ctx = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1400, height: 900 },
        args: ['--disable-blink-features=AutomationControlled'],
      });
      launchedWith = 'real-chrome';
    } catch (e) {
      ctx = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1400, height: 900 },
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }
    console.log('BROWSER_BINARY=' + launchedWith);
    rep.BROWSER_OPENED = 'YES';
    rep.notes.push('headed window requested; if you cannot see it, the OS window manager buried it — that alone explains missed logins');
  } catch (e) {
    rep.notes.push('launch failed: ' + redact(e.message).slice(0, 120));
    finish(); return;
  }

  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    // Canonical entry first: Google's own redirect chain decides login vs dashboard.
    // (/home/projects 404s on a fresh unauthenticated profile — a dead end with
    // no sign-in affordance. That dead end caused 4 silent login timeouts.)
    for (const entry of ['https://script.google.com/', 'https://script.google.com/home/projects', 'https://script.google.com/u/0/home/projects']) {
      try { await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {
        rep.notes.push('entry ' + entry + ': ' + redact(e.message).slice(0, 80));
        continue;
      }
      await new Promise((r) => setTimeout(r, 2500));
      let t = '';
      try { t = await page.title(); } catch (e) {}
      rep.notes.push('entry ' + entry + ' -> ' + (() => { try { return new URL(page.url()).hostname; } catch (e) { return '?'; } })() + ' / ' + clip(t, 50));
      if (!/Error 404/i.test(t)) break;
    }
    for (let i = 0; i < SAMPLES; i++) {
      for (const p of ctx.pages()) {
        try {
          const u = p.url();
          const host = new URL(u).hostname;
          const title = (await p.title().catch(() => '')) || '';
          rep.hosts.push(host);
          rep.titles.push(clip(title, 60));
          if (host.includes('script.google')) rep.SCRIPT_GOOGLE_REACHED = 'YES';
          if (host.includes('accounts.google')) rep.LOGIN_PAGE_REACHED = 'YES';
          let body = '';
          try { body = clip(await p.locator('body').innerText({ timeout: 8000 }), 1500); } catch (e) {}
          if (/sign in/i.test(title + ' ' + body) && (host.includes('accounts.google') || host.includes('script.google'))) {
            rep.LOGIN_PAGE_REACHED = 'YES';
          }
          if (host.includes('script.google') && !host.includes('accounts.google') &&
              (/my projects|all projects|overview|executions/i.test(body))) {
            rep.AUTH_DETECTED = 'YES';
            rep.EXECUTIONS_REACHABLE = 'LIKELY (dashboard visible; project lookup still required)';
          }
        } catch (e) {}
      }
      if (rep.AUTH_DETECTED === 'YES') break;
      await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
    }
    if (rep.AUTH_DETECTED === 'NO') {
      rep.EXECUTIONS_REACHABLE = 'NO (no authenticated session observed)';
      rep.notes.push('no dashboard markers in 90s: either nobody signed in, or the window was not visible/interacted with');
    }
    await ctx.close();
  } catch (e) {
    rep.notes.push('run error: ' + redact(e.message).slice(0, 120));
    try { if (ctx) await ctx.close(); } catch (err) {}
  }
  finish();
})();
