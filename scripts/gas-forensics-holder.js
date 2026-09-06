#!/usr/bin/env node
/**
 * gas-forensics-holder.js — owns the dedicated forensic browser process.
 *
 * Spawned DETACHED by `gas-forensics.js --launch-only` so the launcher can
 * return immediately with a READY banner while the window stays open for the
 * human sign-in. Sleeps until killed (`--shutdown` or manual close).
 *
 * HARD RULES: launches a DEDICATED profile only (never the user's normal
 * Chrome), opens the canonical Apps Script entry, writes a status file, and
 * does nothing else. No cookie/storage/secret reads of any kind.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const workspaceRequire = createRequire(path.join(ROOT, 'package.json'));

function argVal(k) {
  const i = process.argv.indexOf(k);
  return i !== -1 ? (process.argv[i + 1] || '') : '';
}
function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

(async () => {
  const profileDir = argVal('--profile-dir');
  const cdpPort = parseInt(argVal('--cdp-port'), 10) || 9333;
  if (!profileDir) { console.error('HOLDER: missing --profile-dir'); process.exit(2); }
  fs.mkdirSync(profileDir, { recursive: true });
  const { chromium } = workspaceRequire('@playwright/test');

  let ctx = null;
  const launchOpts = {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--remote-debugging-port=' + cdpPort],
  };
  try {
    ctx = await chromium.launchPersistentContext(profileDir, { ...launchOpts, channel: 'chrome' });
  } catch (e) {
    ctx = await chromium.launchPersistentContext(profileDir, launchOpts);
  }
  const page = ctx.pages()[0] || (await ctx.newPage());
  for (const entry of ['https://script.google.com/', 'https://script.google.com/home/projects', 'https://script.google.com/u/0/home/projects']) {
    try { await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {}
    await new Promise((r) => setTimeout(r, 2500));
    let t = '';
    try { t = await page.title(); } catch (e) {}
    if (!/Error 404/i.test(t)) break;
  }
  const statusFile = path.join(os.tmpdir(), 'gas-forensics-holder.json');
  const beat = () => {
    try {
      fs.writeFileSync(statusFile, JSON.stringify({
        pid: process.pid, cdpPort, profileDir,
        urlHost: (() => { try { return new URL(page.url()).hostname; } catch (e) { return '?'; } })(),
        aliveAt: new Date().toISOString(),
      }));
    } catch (e) {}
  };
  beat();
  setInterval(beat, 60000);
  const bye = async () => { try { await ctx.close(); } catch (e) {} process.exit(0); };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
  await new Promise(() => {}); // sleep until killed
})();
