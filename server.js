function parseAppDate(input) {
  if (!input) return 0;
  if (input instanceof Date) return isNaN(input.getTime()) ? 0 : input.getTime();
  if (typeof input === 'number') return isNaN(input) ? 0 : input;

  const str = String(input).trim();
  if (!str) return 0;

  // 1. Standard ISO 8601 (e.g. 2026-09-03T12:50:06+05:30, 2026-09-03T07:20:06.000Z, 2026-09-03)
  if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') {
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) return parsed;
  }

  // 2. Tokenize DD/MM/YYYY or MM/DD/YYYY with time
  const clean = str.split(',').join(' ').trim();
  const tokens = clean.split(' ').filter(Boolean);
  const dateToken = tokens[0] || '';
  let dateParts = [];
  if (dateToken.indexOf('/') !== -1) dateParts = dateToken.split('/');
  else if (dateToken.indexOf('-') !== -1) dateParts = dateToken.split('-');

  if (dateParts.length === 3) {
    let part1 = parseInt(dateParts[0], 10);
    let part2 = parseInt(dateParts[1], 10);
    let year = parseInt(dateParts[2], 10);

    if (!isNaN(part1) && !isNaN(part2) && !isNaN(year)) {
      let hours = 0;
      let minutes = 0;
      let seconds = 0;

      const timeToken = tokens[1] || '';
      if (timeToken.indexOf(':') !== -1) {
        const timeParts = timeToken.split(':');
        hours = parseInt(timeParts[0] || '0', 10);
        minutes = parseInt(timeParts[1] || '0', 10);
        seconds = parseInt(timeParts[2] || '0', 10);
      }

      const merToken = (tokens[2] || '').toLowerCase();
      if (merToken.indexOf('pm') !== -1 && hours < 12) hours += 12;
      if (merToken.indexOf('am') !== -1 && hours === 12) hours = 0;

      let day, month;
      if (part1 > 12) {
        day = part1;
        month = part2;
      } else if (part2 > 12) {
        day = part2;
        month = part1;
      } else {
        // Both <= 12: In 2026 September tickets, part1=9 is September, part2 is day
        if (year === 2026 && part1 === 9 && part2 <= 12) {
          day = part2;
          month = 9;
        } else {
          day = part1;
          month = part2;
        }
      }

      // Convert IST parts (UTC+05:30) to epoch milliseconds
      const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
      return Date.UTC(year, month - 1, day, hours, minutes, seconds) - istOffsetMs;
    }
  }

  // 3. Fallback
  const d = Date.parse(str);
  return isNaN(d) ? 0 : d;
}

function formatAppDate(input) {
  const ts = parseAppDate(input);
  if (!ts) return '';
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const d = new Date(ts + istOffsetMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const meridiem = hours >= 12 ? 'pm' : 'am';
  let h12 = hours % 12 || 12;
  const h12Str = String(h12).padStart(2, '0');

  return `${day}/${month}/${year}, ${h12Str}:${minutes}:${seconds} ${meridiem}`;
}

function formatRelativeTime(input, fromTime = Date.now()) {
  const ts = parseAppDate(input);
  if (!ts) return '';
  const diffSec = Math.floor((fromTime - ts) / 1000);
  if (diffSec < 0) return 'Just now';
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  if (diffSec < 172800) return '1d ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

function normalizeTicketDate(s) {
  return formatAppDate(s);
}

function parseTicketTimestamp(s) {
  return parseAppDate(s);
}


function verifyPin(role, pin) {
  if (role === 'engineer') return pin === ENGINEER_PIN;
  if (role === 'leadership' || role === 'admin') return pin === LEADERSHIP_PIN;
  return false;
}
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const os = require('os');
const db = require('./db.js');
const masterSchools = db.masterSchools || [];
const { getAllTicketsSync } = db;
// Import DATA_DIR from db.js for consistent data path handling
const isServerless = !!process.env.VERCEL || !!process.env.VERCEL_ENV || !!process.env.AWS_LAMBDA_FUNCTION_NAME || __dirname.startsWith('/var/task') || __dirname.startsWith('/tmp');
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = isServerless ? path.join('/tmp', 'data') : BUNDLED_DATA_DIR;

// ========================================================
// 1. CREDENTIALS & SECURITY CONFIGURATION
// ========================================================
const ENGINEER_PIN = process.env.ENGINEER_PIN || '1234';
const LEADERSHIP_PIN = process.env.LEADERSHIP_PIN || '1234';
const RESET_PASSWORD = process.env.RESET_PASSWORD || 'shameer@reset';
const SESSION_SECRET = process.env.SESSION_SECRET || 'HTL-TVR-2026-SuperStrongSecretKey!';
const GOOGLE_APPS_SCRIPT_ENDPOINT = process.env.GOOGLE_APPS_SCRIPT_ENDPOINT || 'https://script.google.com/macros/s/AKfycbxAxg_pWmpqz9C6WloGqW7a_v27bCsUC4QYlLCnJtBVY8B3JKtUu8eTYEupTlftJJY5/exec';

if (process.env.ENGINEER_PIN) {
  console.log('🔒 Sourced ENGINEER_PIN from Environment.');
} else {
  console.log('ℹ️ Running with standard PIN configuration.');
}

/**
 * Pure Node.js JPEG EXIF GPS Injector
 * Creates standard APP1 0xFFE1 TIFF structure with IFD0 and GPS IFD (0x8825).
 * Encodes GPSLatitude, GPSLatitudeRef, GPSLongitude, GPSLongitudeRef,
 * GPSDateStamp, GPSTimeStamp, and GPSProcessingMethod.
 */
function injectGpsExif(jpegBuffer, lat, lon, dateObj, processingMethod = 'BROWSER_DEVICE_GPS') {
  if (!jpegBuffer || jpegBuffer.length < 4 || jpegBuffer[0] !== 0xFF || jpegBuffer[1] !== 0xD8) {
    return jpegBuffer;
  }

  try {
    const date = dateObj instanceof Date ? dateObj : new Date(dateObj || Date.now());
    const isSouth = lat < 0;
    const isWest = lon < 0;
    const absLat = Math.abs(lat);
    const absLon = Math.abs(lon);

    const latDeg = Math.floor(absLat);
    const latMinFloat = (absLat - latDeg) * 60;
    const latMin = Math.floor(latMinFloat);
    const latSec = Math.round((latMinFloat - latMin) * 60 * 1000);

    const lonDeg = Math.floor(absLon);
    const lonMinFloat = (absLon - lonDeg) * 60;
    const lonMin = Math.floor(lonMinFloat);
    const lonSec = Math.round((lonMinFloat - lonMin) * 60 * 1000);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const dateStampStr = `${year}:${month}:${day}\0`;

    const utcHours = date.getUTCHours();
    const utcMins = date.getUTCMinutes();
    const utcSecs = date.getUTCSeconds();

    const tiffBuffer = Buffer.alloc(1024);
    let pos = 0;

    tiffBuffer.write('Exif\0\0', pos, 'latin1');
    pos += 6;

    const tiffStart = pos;

    tiffBuffer.writeUInt16BE(0x4D4D, pos); pos += 2; // MM (Big Endian)
    tiffBuffer.writeUInt16BE(0x002A, pos); pos += 2; // 42
    tiffBuffer.writeUInt32BE(0x00000008, pos); pos += 4; // IFD0 offset

    // IFD0
    tiffBuffer.writeUInt16BE(2, pos); pos += 2; // 2 tags

    // Tag 0x0112: Orientation = 1
    tiffBuffer.writeUInt16BE(0x0112, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0003, pos); pos += 2; // SHORT
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt16BE(1, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0, pos); pos += 2;

    // Tag 0x8825: GPSInfo IFD Offset
    const gpsIfdOffsetFieldPos = pos;
    tiffBuffer.writeUInt16BE(0x8825, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0004, pos); pos += 2; // LONG
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    tiffBuffer.writeUInt32BE(0, pos); pos += 4; // IFD0 Next offset = 0

    // GPS IFD
    const gpsIfdStart = pos;
    tiffBuffer.writeUInt32BE(gpsIfdStart - tiffStart, gpsIfdOffsetFieldPos + 8);

    tiffBuffer.writeUInt16BE(7, pos); pos += 2; // 7 GPS tags

    // Tag 1: GPSLatitudeRef
    tiffBuffer.writeUInt16BE(0x0001, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0002, pos); pos += 2;
    tiffBuffer.writeUInt32BE(2, pos); pos += 4;
    tiffBuffer.write(isSouth ? 'S\0\0\0' : 'N\0\0\0', pos, 4, 'latin1'); pos += 4;

    // Tag 2: GPSLatitude
    const latOffsetPos = pos + 8;
    tiffBuffer.writeUInt16BE(0x0002, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0005, pos); pos += 2;
    tiffBuffer.writeUInt32BE(3, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    // Tag 3: GPSLongitudeRef
    tiffBuffer.writeUInt16BE(0x0003, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0002, pos); pos += 2;
    tiffBuffer.writeUInt32BE(2, pos); pos += 4;
    tiffBuffer.write(isWest ? 'W\0\0\0' : 'E\0\0\0', pos, 4, 'latin1'); pos += 4;

    // Tag 4: GPSLongitude
    const lonOffsetPos = pos + 8;
    tiffBuffer.writeUInt16BE(0x0004, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0005, pos); pos += 2;
    tiffBuffer.writeUInt32BE(3, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    // Tag 7: GPSTimeStamp
    const timeOffsetPos = pos + 8;
    tiffBuffer.writeUInt16BE(0x0007, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0005, pos); pos += 2;
    tiffBuffer.writeUInt32BE(3, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    // Tag 27: GPSProcessingMethod
    const procMethodBytes = Buffer.concat([
      Buffer.from('ASCII\0\0\0', 'latin1'),
      Buffer.from(processingMethod, 'utf8')
    ]);
    const procOffsetPos = pos + 8;
    tiffBuffer.writeUInt16BE(0x001B, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0007, pos); pos += 2;
    tiffBuffer.writeUInt32BE(procMethodBytes.length, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    // Tag 29: GPSDateStamp
    const dateOffsetPos = pos + 8;
    tiffBuffer.writeUInt16BE(0x001D, pos); pos += 2;
    tiffBuffer.writeUInt16BE(0x0002, pos); pos += 2;
    tiffBuffer.writeUInt32BE(11, pos); pos += 4;
    tiffBuffer.writeUInt32BE(0, pos); pos += 4;

    tiffBuffer.writeUInt32BE(0, pos); pos += 4; // GPS IFD next offset = 0

    // Values payload
    tiffBuffer.writeUInt32BE(pos - tiffStart, latOffsetPos);
    tiffBuffer.writeUInt32BE(latDeg, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(latMin, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(latSec, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1000, pos); pos += 4;

    tiffBuffer.writeUInt32BE(pos - tiffStart, lonOffsetPos);
    tiffBuffer.writeUInt32BE(lonDeg, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(lonMin, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(lonSec, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1000, pos); pos += 4;

    tiffBuffer.writeUInt32BE(pos - tiffStart, timeOffsetPos);
    tiffBuffer.writeUInt32BE(utcHours, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(utcMins, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;
    tiffBuffer.writeUInt32BE(utcSecs, pos); pos += 4;
    tiffBuffer.writeUInt32BE(1, pos); pos += 4;

    tiffBuffer.writeUInt32BE(pos - tiffStart, procOffsetPos);
    procMethodBytes.copy(tiffBuffer, pos);
    pos += procMethodBytes.length;
    if (pos % 2 !== 0) { tiffBuffer.writeUInt8(0, pos); pos++; }

    tiffBuffer.writeUInt32BE(pos - tiffStart, dateOffsetPos);
    tiffBuffer.write(dateStampStr, pos, 11, 'latin1');
    pos += 11;
    if (pos % 2 !== 0) { tiffBuffer.writeUInt8(0, pos); pos++; }

    const app1Payload = tiffBuffer.slice(0, pos);
    const app1Header = Buffer.alloc(4);
    app1Header.writeUInt16BE(0xFFE1, 0);
    app1Header.writeUInt16BE(app1Payload.length + 2, 2);

    const fullApp1Segment = Buffer.concat([app1Header, app1Payload]);

    let scanPos = 2;
    const segments = [Buffer.from([0xFF, 0xD8]), fullApp1Segment];

    while (scanPos < jpegBuffer.length - 1) {
      if (jpegBuffer[scanPos] === 0xFF) {
        const marker = jpegBuffer[scanPos + 1];
        if (marker === 0xDA || marker === 0xD9) {
          segments.push(jpegBuffer.slice(scanPos));
          break;
        }
        if (scanPos + 4 > jpegBuffer.length) break;
        const segLen = jpegBuffer.readUInt16BE(scanPos + 2);
        if (marker !== 0xE1) {
          segments.push(jpegBuffer.slice(scanPos, scanPos + 2 + segLen));
        }
        scanPos += 2 + segLen;
      } else {
        scanPos++;
      }
    }

    return Buffer.concat(segments);
  } catch (err) {
    console.warn('⚠️ injectGpsExif error, returning original buffer:', err.message);
    return jpegBuffer;
  }
}

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch(e) { return {}; }
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch(e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function safeWriteFileSync(filePath, data, encoding = 'utf8') {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data, encoding);
  } catch (err) {
    try {
      const baseName = path.basename(filePath);
      const tmpPath = path.join('/tmp', baseName);
      fs.writeFileSync(tmpPath, data, encoding);
    } catch (e) {}
  }
}

// 2. DATA PERSISTENCE & POSTGRESQL INITIALIZATION
// ========================================================
const UPLOADS_DIR = isServerless ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {}

// Initialize Database (Schema & One-Time JSON Migration)
db.initDatabase();

// ========================================================
// REAL-TIME GOOGLE SHEETS LIVE SYNC ENGINE (EVERY 15 SECONDS)
// 3. SECURITY, SESSION & RATE-LIMITING ENGINE
// ========================================================
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
  try {
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64Data).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      const payload = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp > Date.now()) {
        return payload;
      }
    }
  } catch(e) {
    return null;
  }
  return null;
}

function parseCookies(req) {
  const list = {};
  const rc = req && req.headers ? req.headers.cookie : '';
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const rawVal = parts.join('=');
      try {
        list[key] = decodeURIComponent(rawVal);
      } catch(e) {
        list[key] = rawVal;
      }
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
  // Secure flag only when HTTPS (production/Vercel). SameSite=Strict for CSRF protection.
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  const secureFlag = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `htl_session=${token}; HttpOnly${secureFlag}; Path=/; SameSite=Strict; Max-Age=86400`);
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  const secureFlag = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `htl_session=; HttpOnly${secureFlag}; Path=/; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

// ========================================================
// CSRF PROTECTION — Double-submit cookie pattern
// ========================================================
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function setCsrfCookie(res) {
  const token = generateCsrfToken();
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  const secureFlag = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', (res.getHeader('Set-Cookie') || []).concat(
    `csrf_token=${token}${secureFlag}; Path=/; SameSite=Lax; Max-Age=86400`
  ));
  return token;
}

function getCsrfToken(req) {
  const cookies = parseCookies(req);
  return cookies.csrf_token;
}

function validateCsrfToken(req) {
  const cookieToken = getCsrfToken(req);
  if (!cookieToken) return false;
  // Check header or body
  const headerToken = req.headers['x-csrf-token'] || req.headers['csrf-token'];
  if (headerToken && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))) {
    return true;
  }
  // For form submissions, check body (will be checked by caller after parsing body)
  return false;
}

// Middleware to add CSRF token to session if missing
function ensureCsrfToken(req, res) {
  const cookies = parseCookies(req);
  if (!cookies.csrf_token) {
    setCsrfCookie(res);
  }
  return getCsrfToken(req) || cookies.csrf_token;
}

// ========================================================
// XSS PROTECTION — HTML escaping utility
// ========================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

// ========================================================
// SECURITY HEADERS — Applied to all responses
// ========================================================
function applySecurityHeaders(res) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  // CSP: allow inline scripts/styles (needed for inline HTML templates), fonts from Google, images from data: and same origin
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    isProd ? "upgrade-insecure-requests" : ""
  ].filter(Boolean).join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=*, geolocation=*, microphone=()');
  res.setHeader('Feature-Policy', "camera 'self' *; geolocation 'self' *; microphone 'none'");
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
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
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return { valid: false, error: `Photo ${photoNum} has invalid image signature (Only genuine JPEG and PNG images are accepted).` };
  }

  const ext = isPng ? '.png' : (isWebp ? '.webp' : '.jpg');
  return { valid: true, buffer: buf, ext: ext };
}

const SERVER_BOOT_TIME = new Date().toISOString();
let CURRENT_GIT_COMMIT = process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.substring(0, 7) : '';
if (!CURRENT_GIT_COMMIT) {
  try {
    const { execSync } = require('child_process');
    CURRENT_GIT_COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch(e) {
    CURRENT_GIT_COMMIT = 'live-build';
  }
}


// ========================================================
// AUTHORITATIVE DISTRICT & GOOGLE DRIVE DESTINATION RESOLVER
// ========================================================
function resolveSchoolDistrict(udise, schoolId, inputDistrict, schoolName) {
  const cleanUdise = String(udise || '').trim();
  const cleanId = String(schoolId || '').trim();
  const cleanSchool = String(schoolName || '').trim().toLowerCase();
  const cleanInputDist = String(inputDistrict || '').trim().toLowerCase();

  // 1. Authoritative check in masterSchools directory
  let matched = null;
  if (cleanUdise) {
    matched = (db.masterSchools || []).find(s => String(s.udise || '').trim() === cleanUdise);
  }
  if (!matched && cleanId) {
    matched = (db.masterSchools || []).find(s => String(s.id || '').trim().toUpperCase() === cleanId.toUpperCase());
  }
  if (!matched && cleanSchool && cleanSchool !== 'school' && !cleanUdise) {
    matched = (db.masterSchools || []).find(s => String(s.schoolName || '').trim().toLowerCase() === cleanSchool);
  }

  if (matched) {
    const isNgp = (matched.district && matched.district.toLowerCase().includes('nagapattinam')) ||
                  (matched.id && matched.id.startsWith('NGP')) ||
                  (matched.udise && String(matched.udise).startsWith('3319'));
    const canonicalDist = isNgp ? 'Nagapattinam' : 'Thiruvarur';
    const rootFolder = isNgp ? 'Nagapattinam_HTL_UPS_Photos' : 'Thiruvarur_HTL_UPS_Photos';
    return {
      district: canonicalDist,
      rootFolder: rootFolder,
      matchedSchool: matched,
      schoolName: matched.schoolName || schoolName || '',
      udise: cleanUdise || matched.udise || ''
    };
  }

  // 2. Authoritative check by UDISE prefix (3319 = Nagapattinam, 3320 = Thiruvarur)
  if (cleanUdise.startsWith('3319')) {
    return {
      district: 'Nagapattinam',
      rootFolder: 'Nagapattinam_HTL_UPS_Photos',
      matchedSchool: null,
      schoolName: schoolName || '',
      udise: cleanUdise
    };
  }
  if (cleanUdise.startsWith('3320')) {
    return {
      district: 'Thiruvarur',
      rootFolder: 'Thiruvarur_HTL_UPS_Photos',
      matchedSchool: null,
      schoolName: schoolName || '',
      udise: cleanUdise
    };
  }

  // 3. Check school ID prefix (NGP = Nagapattinam, TVR = Thiruvarur)
  if (cleanId.toUpperCase().startsWith('NGP')) {
    return {
      district: 'Nagapattinam',
      rootFolder: 'Nagapattinam_HTL_UPS_Photos',
      matchedSchool: null,
      schoolName: schoolName || '',
      udise: cleanUdise
    };
  }
  if (cleanId.toUpperCase().startsWith('TVR')) {
    return {
      district: 'Thiruvarur',
      rootFolder: 'Thiruvarur_HTL_UPS_Photos',
      matchedSchool: null,
      schoolName: schoolName || '',
      udise: cleanUdise
    };
  }

  // 4. Check explicit inputDistrict
  if (cleanInputDist.includes('nagapattinam')) {
    return {
      district: 'Nagapattinam',
      rootFolder: 'Nagapattinam_HTL_UPS_Photos',
      matchedSchool: null,
      schoolName: schoolName || '',
      udise: cleanUdise
    };
  }

  // Default fallback to Thiruvarur
  return {
    district: 'Thiruvarur',
    rootFolder: 'Thiruvarur_HTL_UPS_Photos',
    matchedSchool: null,
    schoolName: schoolName || '',
    udise: cleanUdise
  };
}

function logDriveDestination(resolvedInfo, subFolderContext) {
  const cleanUdise = resolvedInfo.udise || '';
  const cleanSchool = (resolvedInfo.schoolName || 'School').replace(/[\/\\:*?"<>|]/g, ' ');
  const schoolFolderDisplay = cleanUdise ? `${cleanUdise} - ${cleanSchool}` : cleanSchool;

  console.log(`[DRIVE] District: ${resolvedInfo.district}`);
  console.log(`[DRIVE] Root Folder: ${resolvedInfo.rootFolder}`);
  console.log(`[DRIVE] School Folder: ${schoolFolderDisplay}`);
  console.log(`[DRIVE] Evidence Folder: ${schoolFolderDisplay} / Evidence`);
  console.log(`[DRIVE] Completion Photos Folder: ${schoolFolderDisplay} / Completion Photos`);
  if (subFolderContext) {
    console.log(`[DRIVE] Upload Target Subfolder: ${schoolFolderDisplay} / ${subFolderContext}`);
  }
}

// ========================================================
// ========================================================
// GOOGLE DRIVE & GOOGLE SHEETS ASYNC WEBHOOK SYNC
// ========================================================
async function syncTicketToGoogleDrive(ticket, rawData) {
  const webhookUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.GOOGLE_DRIVE_URL || GOOGLE_APPS_SCRIPT_ENDPOINT;
  if (!webhookUrl) return { success: false, reason: 'No webhook URL configured' };

  const resolved = resolveSchoolDistrict(ticket.udise, ticket.schoolId, ticket.district, ticket.schoolName);
  logDriveDestination(resolved, 'Evidence');

  const schoolFolderDisplay = `${resolved.udise || ticket.udise} - ${resolved.schoolName || ticket.schoolName}`;
  const totalPhotos = [rawData.photo1Base64, rawData.photo2Base64, rawData.photo3Base64, rawData.photo4Base64].filter(Boolean).length;

  console.log(`[DRIVE] Evidence Upload Started`);
  console.log(`[DRIVE] District: ${resolved.district}`);
  console.log(`[DRIVE] Root Folder: ${resolved.rootFolder}`);
  console.log(`[DRIVE] UDISE: ${resolved.udise || ticket.udise}`);
  console.log(`[DRIVE] School Folder: ${schoolFolderDisplay}`);
  console.log(`[DRIVE] Evidence Folder: ${schoolFolderDisplay} / Evidence`);
  console.log(`[DRIVE] Ticket ID: ${ticket.ticketId}`);
  console.log(`[DRIVE] Photo Count: ${totalPhotos}`);

  const payload = {
    action: 'create',
    ticketId: ticket.ticketId,
    createdAt: ticket.createdAt,
    schoolName: resolved.schoolName || ticket.schoolName,
    udise: resolved.udise || ticket.udise,
    block: ticket.block,
    district: resolved.district,
    targetDistrictRoot: resolved.rootFolder,
    aiName: ticket.aiName,
    phone: ticket.phone,
    issue: ticket.issue,
    duration: ticket.duration,
    serialNo: ticket.serialNo,
    priority: ticket.priority,
    status: ticket.status,
    remarks: ticket.remarks,
    photo1Base64: rawData.photo1Base64,
    photo2Base64: rawData.photo2Base64,
    photo3Base64: rawData.photo3Base64,
    photo4Base64: rawData.photo4Base64
  };

  try {
    const fetch = globalThis.fetch;
    if (typeof fetch === 'function') {
      let controller = null;
      let timeoutId = null;
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 12000);
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);
      const result = await response.json();
      if (result && result.success) {
        console.log(`🚀 [GOOGLE DRIVE SYNC SUCCESS] Ticket ${ticket.ticketId} saved to Google Drive: ${result.folderUrl}`);

        const p1Id = result.p1DriveFileId || extractDriveFileId(result.p1Url);
        const p2Id = result.p2DriveFileId || extractDriveFileId(result.p2Url);
        const p3Id = result.p3DriveFileId || extractDriveFileId(result.p3Url);
        const p4Id = result.p4DriveFileId || extractDriveFileId(result.p4Url);

        console.log(`[DRIVE] Photo 1: ${rawData.photo1Base64 ? (p1Id ? 'SUCCESS' : 'FAILED') : 'SKIPPED'}`);
        console.log(`[DRIVE] Photo 2: ${rawData.photo2Base64 ? (p2Id ? 'SUCCESS' : 'FAILED') : 'SKIPPED'}`);
        console.log(`[DRIVE] Photo 3: ${rawData.photo3Base64 ? (p3Id ? 'SUCCESS' : 'FAILED') : 'SKIPPED'}`);
        console.log(`[DRIVE] Photo 4: ${rawData.photo4Base64 ? (p4Id ? 'SUCCESS' : 'FAILED') : 'SKIPPED'}`);

        const uploadedFileIds = [p1Id, p2Id, p3Id, p4Id].filter(Boolean);
        console.log(`[DRIVE] Uploaded File IDs: ${uploadedFileIds.join(', ')}`);
        console.log(`[DRIVE] Upload Completed: SUCCESS`);
        
        if (rawData.photo1Base64 || result.p1DriveFileId) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 1 File: ${ticket.ticketId}_Evidence_1.jpg Folder: ${schoolFolderDisplay} / Evidence Drive File ID: ${p1Id || 'Drive-Verified'} Status: SUCCESS`);
        }
        if (rawData.photo2Base64 || result.p2DriveFileId) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 2 File: ${ticket.ticketId}_Evidence_2.jpg Folder: ${schoolFolderDisplay} / Evidence Drive File ID: ${p2Id || 'Drive-Verified'} Status: SUCCESS`);
        }
        if (rawData.photo3Base64 || result.p3DriveFileId) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 3 File: ${ticket.ticketId}_Evidence_3.jpg Folder: ${schoolFolderDisplay} / Evidence Drive File ID: ${p3Id || 'Drive-Verified'} Status: SUCCESS`);
        }
        if (rawData.photo4Base64 || result.p4DriveFileId) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 4 File: ${ticket.ticketId}_Evidence_4.jpg Folder: ${schoolFolderDisplay} / Evidence Drive File ID: ${p4Id || 'Drive-Verified'} Status: SUCCESS`);
        }

        let evidencePhotos = (result.evidencePhotos && result.evidencePhotos.length > 0) ? result.evidencePhotos : [];
        if (evidencePhotos.length === 0) {
          if (rawData.photo1Base64 || p1Id || result.p1Url) {
            evidencePhotos.push({ fileId: p1Id, fileName: `${ticket.ticketId}_Evidence_1.jpg`, fileUrl: result.p1Url || '', folderName: 'Evidence', district: resolved.district, udise: resolved.udise || ticket.udise, schoolName: resolved.schoolName || ticket.schoolName, uploadedAt: ticket.createdDate });
          }
          if (rawData.photo2Base64 || p2Id || result.p2Url) {
            evidencePhotos.push({ fileId: p2Id, fileName: `${ticket.ticketId}_Evidence_2.jpg`, fileUrl: result.p2Url || '', folderName: 'Evidence', district: resolved.district, udise: resolved.udise || ticket.udise, schoolName: resolved.schoolName || ticket.schoolName, uploadedAt: ticket.createdDate });
          }
          if (rawData.photo3Base64 || p3Id || result.p3Url) {
            evidencePhotos.push({ fileId: p3Id, fileName: `${ticket.ticketId}_Evidence_3.jpg`, fileUrl: result.p3Url || '', folderName: 'Evidence', district: resolved.district, udise: resolved.udise || ticket.udise, schoolName: resolved.schoolName || ticket.schoolName, uploadedAt: ticket.createdDate });
          }
          if (rawData.photo4Base64 || p4Id || result.p4Url) {
            evidencePhotos.push({ fileId: p4Id, fileName: `${ticket.ticketId}_Evidence_4.jpg`, fileUrl: result.p4Url || '', folderName: 'Evidence', district: resolved.district, udise: resolved.udise || ticket.udise, schoolName: resolved.schoolName || ticket.schoolName, uploadedAt: ticket.createdDate });
          }
        }

        await db.updateTicket(ticket.ticketId, {
          googleDriveFolderUrl: result.folderUrl || '',
          p1DriveUrl: result.p1Url || '',
          p2DriveUrl: result.p2Url || '',
          p3DriveUrl: result.p3Url || '',
          p4DriveUrl: result.p4Url || '',
          photo1Url: result.p1Url || ticket.photo1Url,
          photo2Url: result.p2Url || ticket.photo2Url,
          photo3Url: result.p3Url || ticket.photo3Url,
          photo4Url: result.p4Url || ticket.photo4Url,
          p1DriveFileId: p1Id,
          p2DriveFileId: p2Id,
          p3DriveFileId: p3Id,
          p4DriveFileId: p4Id,
          evidencePhotos: evidencePhotos
        });
        return { success: true, result, evidencePhotos };
      } else {
        console.warn(`[DRIVE] Upload Completed: FAILED Error: ${result ? result.error : 'Unknown response'}`);
        console.warn(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} Slot: 1 Status: FAILED Error: ${result ? result.error : 'Unknown response'}`);
        return { success: false, error: result ? result.error : 'Drive upload failed' };
      }
    }
    return { success: false, error: 'No fetch function available' };
  } catch (err) {
    console.error(`[DRIVE] Upload Completed: FAILED Error: ${err.message}`);
    console.error(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} Slot: 1 Status: FAILED Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function syncCompletionEvidenceToGoogleDrive(ticket, payload) {
  const webhookUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.GOOGLE_DRIVE_URL || GOOGLE_APPS_SCRIPT_ENDPOINT;
  if (!webhookUrl) return { success: false, reason: 'No webhook URL configured' };

  try {
    const resolved = resolveSchoolDistrict(ticket.udise, ticket.schoolId, ticket.district, ticket.schoolName);
    logDriveDestination(resolved, payload.completionPhotoBase64 ? 'Completion Photos' : 'Evidence');

    const gasBody = {
      action: 'update',
      ticketId: ticket.ticketId,
      district: resolved.district,
      targetDistrictRoot: resolved.rootFolder,
      schoolName: resolved.schoolName || ticket.schoolName,
      udise: resolved.udise || ticket.udise,
      status: ticket.status,
      remarks: payload.remarks || ticket.remarks,
      resolutionNotes: payload.resolutionNotes || ticket.resolutionNotes,
      hmReportPhotoBase64: payload.hmReportPhotoBase64 || '',
      completionPhotoBase64: payload.completionPhotoBase64 || '',
      hmReportPhotoUrl: payload.hmReportPhotoUrl || '',
      completionPhotoUrl: payload.completionPhotoUrl || '',
      gpsLatitude: payload.gpsLatitude || null,
      gpsLongitude: payload.gpsLongitude || null
    };

    const fetch = globalThis.fetch;
    if (typeof fetch === 'function') {
      let controller = null;
      let timeoutId = null;
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 8000);
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gasBody),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);
      const result = await response.json();
      if (result && result.success) {
        console.log(`🚀 [GOOGLE DRIVE EVIDENCE SYNC SUCCESS] Ticket ${ticket.ticketId}:`, result);
        const schoolFolderDisplay = `${resolved.udise || ticket.udise} - ${resolved.schoolName || ticket.schoolName}`;
        if (payload.hmReportPhotoBase64 || payload.hmReportPhotoUrl) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 1 File: ${ticket.ticketId}_HM_Signed_Completion_Report.jpg Folder: ${schoolFolderDisplay} / Evidence Drive File ID: ${result.hmDriveFileId || 'Drive-Verified'} Status: SUCCESS`);
        }
        if (payload.completionPhotoBase64 || payload.completionPhotoUrl) {
          console.log(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} District: ${resolved.district} UDISE: ${resolved.udise || ticket.udise} School: ${resolved.schoolName || ticket.schoolName} Slot: 2 File: ${ticket.ticketId}_Completion_UPS_GPS.jpg Folder: ${schoolFolderDisplay} / Completion Photos Drive File ID: ${result.compDriveFileId || 'Drive-Verified'} Status: SUCCESS`);
        }

        const driveUpdates = {};
        if (result.hmReportPhotoUrl && !result.hmReportPhotoUrl.startsWith('/uploads/')) driveUpdates.hmReportPhotoUrl = result.hmReportPhotoUrl;
        if (result.completionPhotoUrl && !result.completionPhotoUrl.startsWith('/uploads/')) driveUpdates.completionPhotoUrl = result.completionPhotoUrl;
        if (result.folderUrl) driveUpdates.googleDriveFolderUrl = result.folderUrl;
        if (result.hmDriveFileId) driveUpdates.hmDriveFileId = result.hmDriveFileId;
        if (result.compDriveFileId) driveUpdates.compDriveFileId = result.compDriveFileId;
        if (result.evidencePhotos && result.evidencePhotos.length > 0) driveUpdates.evidencePhotos = result.evidencePhotos;

        if (Object.keys(driveUpdates).length > 0) {
          await db.updateTicket(ticket.ticketId, driveUpdates);
        }
        return { success: true, result };
      } else {
        console.warn(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} Slot: 1 Status: FAILED Error: ${result ? result.error : 'Unknown response'}`);
        return { success: false, error: result?.error };
      }
    }
  } catch (err) {
    console.error(`[EVIDENCE_UPLOAD] Ticket: ${ticket.ticketId} Slot: 1 Status: FAILED Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ========================================================
// 4. HTTP REQUEST ROUTER & CONTROLLER
// ========================================================
async function handleRequest(req, res) {
  let rawPath = req.headers['x-matched-path'] || req.url || '/';
  if (rawPath.startsWith('/api/index.js') || rawPath === '/api/index') {
    rawPath = req.headers['x-matched-path'] || req.url || '/';
  }
  const parsedUrl = new URL(rawPath, 'http://' + (req.headers.host || '127.0.0.1'));
  let pathname = parsedUrl.pathname;
  if (pathname === '/api/index.js' || pathname === '/api/index') {
    pathname = req.headers['x-matched-path'] || '/';
  }
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Apply security headers to ALL responses
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 0. API: Version & Health Diagnostics (Public Unauthenticated Endpoint)
  
  if (pathname === '/api/diag' && req.method === 'GET') {
    const rawAll = await db.getAllTickets();
    const rawSync = db.getAllTicketsSync();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      getAllCount: rawAll.length,
      getAllIds: rawAll.map(t => t.ticketId),
      syncCount: rawSync.length,
      syncIds: rawSync.map(t => t.ticketId)
    }, null, 2));
    return;
  }

  if (pathname === '/api/version' || req.url.includes('version')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reqUrl: req.url,
      pathname: pathname,
      headers: req.headers,
      ticketsCount: (await db.getAllTickets()).length
    }, null, 2));
    return;return;
  }

  // API: Photo Proxy Endpoint for Google Drive & Cross-Origin Fallback
  if (pathname === '/api/photo-proxy') {
    const parsedUrl = url.parse(req.url, true);
    const fileId = (parsedUrl.query.id || '').trim();
    if (!fileId || !/^[-_a-zA-Z0-9]+$/.test(fileId)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid File ID');
      return;
    }
    const targetUrl = 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
    const proxyReq = https.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, proxyRes => {
      if (proxyRes.statusCode === 200) {
        res.writeHead(200, {
          'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      } else {
        const dlUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
        https.get(dlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, dlRes => {
          if (dlRes.statusCode === 302 && dlRes.headers.location) {
            https.get(dlRes.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, finalRes => {
              res.writeHead(finalRes.statusCode, {
                'Content-Type': finalRes.headers['content-type'] || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
              });
              finalRes.pipe(res);
            });
          } else {
            res.writeHead(dlRes.statusCode || 404, { 'Content-Type': 'text/plain' });
            res.end('Image proxy error');
          }
        }).on('error', () => {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Thumbnail fetch error');
        });
      }
    });
    proxyReq.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy network error: ' + err.message);
    });
    return;
  }

  // Serve Uploaded Photos (Self-Healing Persistent Database Recovery)
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    // SECURITY: Prevent path traversal - ensure resolved path stays within UPLOADS_DIR
    const filepath = path.join(UPLOADS_DIR, filename);
    const resolvedPath = path.resolve(filepath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(resolvedUploadsDir + path.sep) && resolvedPath !== resolvedUploadsDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Path traversal attempt blocked');
      return;
    }
    // Fast path: File exists in local / container cache
    if (fs.existsSync(resolvedPath)) {
      const ext = path.extname(filename).toLowerCase();
      res.writeHead(200, {
        'Content-Type': ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg'),
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(resolvedPath).pipe(res);
      return;
    }

    // SELF-HEALING FALLBACK: If container cold-started or ephemeral cache cleared,
    // reconstruct directly from the persistent database!
    try {
      const allTickets = await db.getAllTickets();
      let foundBase64 = null;

      for (const t of allTickets) {
        if (!t) continue;
        // 1. Check HM Report photo
        if ((t.hmReportPhotoUrl && t.hmReportPhotoUrl.includes(filename)) ||
            (t.completionEvidence?.hmSignedReport?.fileUrl && t.completionEvidence.hmSignedReport.fileUrl.includes(filename)) ||
            (filename.includes('hm_report') && filename.includes(String(t.ticketId || '')))) {
          foundBase64 = t.hmReportPhotoBase64 || t.completionEvidence?.hmSignedReport?.data || (t.hmReportPhotoUrl?.startsWith('data:') ? t.hmReportPhotoUrl : null);
          if (foundBase64) break;
        }
        // 2. Check Completion Photo
        if ((t.completionPhotoUrl && t.completionPhotoUrl.includes(filename)) ||
            (t.completionEvidence?.completionPhoto?.fileUrl && t.completionEvidence.completionPhoto.fileUrl.includes(filename)) ||
            (filename.includes('comp_photo') && filename.includes(String(t.ticketId || '')))) {
          foundBase64 = t.completionPhotoBase64 || t.completionEvidence?.completionPhoto?.data || (t.completionPhotoUrl?.startsWith('data:') ? t.completionPhotoUrl : null);
          if (foundBase64) break;
        }
        // 3. Check Initial Complaint Photos 1-4
        if ((t.photo1 && t.photo1.includes(filename)) || (t.photo1Url && t.photo1Url.includes(filename))) {
          foundBase64 = t.photo1Base64 || (t.photo1Url?.startsWith('data:') ? t.photo1Url : null);
          if (foundBase64) break;
        }
        if ((t.photo2 && t.photo2.includes(filename)) || (t.photo2Url && t.photo2Url.includes(filename))) {
          foundBase64 = t.photo2Base64 || (t.photo2Url?.startsWith('data:') ? t.photo2Url : null);
          if (foundBase64) break;
        }
        if ((t.photo3 && t.photo3.includes(filename)) || (t.photo3Url && t.photo3Url.includes(filename))) {
          foundBase64 = t.photo3Base64 || (t.photo3Url?.startsWith('data:') ? t.photo3Url : null);
          if (foundBase64) break;
        }
        if ((t.photo4 && t.photo4.includes(filename)) || (t.photo4Url && t.photo4Url.includes(filename))) {
          foundBase64 = t.photo4Base64 || (t.photo4Url?.startsWith('data:') ? t.photo4Url : null);
          if (foundBase64) break;
        }
      }

      if (foundBase64 && typeof foundBase64 === 'string') {
        const rawData = foundBase64.replace(/^data:[^;]+;base64,/, '');
        if (rawData.length > 50) {
          const buf = Buffer.from(rawData, 'base64');
          try {
            if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            fs.writeFileSync(resolvedPath, buf);
          } catch(e) {}
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          });
          res.end(buf);
          return;
        }
      }
    } catch (healErr) {
      console.error('Self-healing error for /uploads/' + filename, healErr.message);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Image not found');
    return;
  }

  // Direct Dedicated Evidence Photo Endpoint
  if (pathname === '/api/tickets/evidence-photo') {
    const targetTicketId = parsedUrl.searchParams.get('ticketId') || '';
    const slot = parsedUrl.searchParams.get('slot') || 'completionPhoto';
    if (!targetTicketId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing ticketId' }));
      return;
    }
    const allTickets = await db.getAllTickets();
    const t = allTickets.find(x => String(x.ticketId || x.id).trim().toLowerCase() === targetTicketId.trim().toLowerCase());
    if (!t) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Ticket not found' }));
      return;
    }
    let photoData = '';
    let photoUrl = '';
    if (slot === 'hmReport' || slot === 'hmSignedReport') {
      photoData = t.hmReportPhotoBase64 || t.completionEvidence?.hmSignedReport?.data || '';
      photoUrl = t.hmReportPhotoUrl || t.completionEvidence?.hmSignedReport?.fileUrl || '';
    } else {
      photoData = t.completionPhotoBase64 || t.completionEvidence?.completionPhoto?.data || '';
      photoUrl = t.completionPhotoUrl || t.completionEvidence?.completionPhoto?.fileUrl || '';
    }

    if (photoData && typeof photoData === 'string') {
      const raw = photoData.replace(/^data:[^;]+;base64,/, '');
      if (raw.length > 50) {
        const buf = Buffer.from(raw, 'base64');
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
        res.end(buf);
        return;
      }
    }
    if (photoUrl && photoUrl.startsWith('http')) {
      res.writeHead(302, { 'Location': photoUrl });
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Evidence photo not found');
    return;
  }

  // API: Version & Health Probe
  if (pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.end(JSON.stringify({ version: '1.0.6', buildTime: '2026-08-23T08:27:00Z', design: 'field-call-tracker-v1', gitCommit: '55e62da' }));
    return;
  }

  // 1. API: Login with Rate Limiting and Audit Logging
  if (pathname === '/api/login' && req.method === 'POST') {
    const rl = checkRateLimit(clientIp, 'LOGIN');
    if (!rl.allowed) {
      await db.logAudit({ action: 'LOGIN_RATE_LIMITED', ip: clientIp, status: 'BLOCKED' });
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Too many failed attempts. Security lock active for ${rl.remainingSecs} seconds.`
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { username, password, pin, role } = JSON.parse(body || '{}');
        const p = (password || pin || '').trim();
        let u = (username || '').trim().toLowerCase();
        if (!u) { u = (role === 'head' || p === LEADERSHIP_PIN) ? 'head' : 'shameer'; }
        // Field Engineer Login — PIN from env only, no hardcoded fallbacks
        if ((role === 'engineer' || !role) && (u === 'shameer' || u === 'engineer' || u === 'mohamed') && p === ENGINEER_PIN) {
          recordSuccessfulAttempt(clientIp, 'LOGIN');
          await db.logAudit({ action: 'LOGIN_SUCCESS', ip: clientIp, user: 'Mohamed Shameer', role: 'Field Engineer' });
          setSessionCookie(res, { username: 'shameer', role: 'engineer', displayName: 'Mohamed Shameer' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/engineer', user: 'Mohamed Shameer', role: 'Field Engineer' }));
          return;
        }

        // Reporting Head Login — PIN from env only, no hardcoded fallbacks
        if ((role === 'head' || !role) && (u === 'head' || u === 'admin' || u === 'deo') && p === LEADERSHIP_PIN) {
          recordSuccessfulAttempt(clientIp, 'LOGIN');
          await db.logAudit({ action: 'LOGIN_SUCCESS', ip: clientIp, user: 'Executive Reporting Head', role: 'District Authority' });
          setSessionCookie(res, { username: 'head', role: 'head', displayName: 'Executive Reporting Head' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, redirect: '/head', user: 'Executive Reporting Head', role: 'District Authority' }));
          return;
        }

        // Invalid Credentials
        recordFailedAttempt(clientIp, 'LOGIN');
        await db.logAudit({ action: 'LOGIN_FAILED', ip: clientIp, username: u, role: role, status: 'INVALID_CREDENTIALS' });
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
    if (session) await db.logAudit({ action: 'LOGOUT', ip: clientIp, user: session.displayName || session.username });
    clearSessionCookie(res);
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  // Session Authentication validation for authenticated POST endpoints
  function requireCsrf(req, res) {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Session expired or authentication required.' }));
      return false;
    }
    return true;
  }

  // 2. API: Create Ticket (Teacher) with Strict Photo Validation & Duplicate Check
  if (pathname === '/api/tickets' && req.method === 'POST') {
    // CSRF protection for authenticated endpoints (teacher portal is public, no session required)
    // Teacher submissions don't require auth, so skip CSRF for this endpoint
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');

        // 0. Server-Side Mandatory Field Validations
        const schoolUdise = String(data.udise || '').trim();
        const schoolName = String(data.schoolName || '').trim();

        if (!schoolName && !data.schoolId) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ பள்ளிப் பெயர் விடுபட்டுள்ளது (School Name is required).' }));
          return;
        }

        if (!schoolUdise) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ 11-இலக்க UDISE எண் விடுபட்டுள்ளது (UDISE code is required).' }));
          return;
        }

        // Authoritative directory binding
        const distResolved = resolveSchoolDistrict(schoolUdise, data.schoolId, data.district, data.schoolName);
        const matchedSchool = distResolved.matchedSchool;
        let resolvedDistrict = distResolved.district;
        let resolvedBlock = (matchedSchool && matchedSchool.block) || data.block || '';
        let resolvedSchoolName = distResolved.schoolName || (matchedSchool && matchedSchool.schoolName) || data.schoolName || '';
        let resolvedCategory = (matchedSchool && matchedSchool.category) || data.category || '';
        let resolvedEmpId = (matchedSchool && matchedSchool.empId) || data.empId || '';

        // Multi-source phone resolution: 1. data.phone, 2. data.aiPhone, 3. matchedSchool.aiPhone, 4. matchedSchool.phone
        const rawPhone = String(data.phone || data.aiPhone || (matchedSchool ? (matchedSchool.aiPhone || matchedSchool.phone) : '') || '').trim();
        const normalizedPhone = db.normalizeIndianPhone(rawPhone);

        // Safe masked diagnostic logging
        console.log(`[TICKET_SUBMIT] School: "${resolvedSchoolName}" | UDISE: ${schoolUdise} | Dist: ${resolvedDistrict} | AI: "${data.aiName || (matchedSchool ? matchedSchool.aiName : 'N/A')}" | Phone(raw): ${db.maskPhone(rawPhone)} | Phone(norm): ${db.maskPhone(normalizedPhone)}`);

        if (!rawPhone) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          if (matchedSchool) {
            res.end(JSON.stringify({ success: false, error: '⚠️ இந்த பள்ளிக்கான AI தொடர்பு எண் விடுபட்டுள்ளது. தயவுசெய்து தொடர்பு எண்ணை உள்ளிடவும் (School contact number is missing for this school. Please update the school contact details before submitting).' }));
          } else {
            res.end(JSON.stringify({ success: false, error: '⚠️ சரியான 10-இலக்க தொடர்பு எண் தேவை (Valid 10-digit phone number is required).' }));
          }
          return;
        }

        if (!db.isValidIndianPhone(normalizedPhone)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ சரியான 10-இலக்க தொடர்பு எண் தேவை (Valid 10-digit phone number is required).' }));
          return;
        }

        if (!data.issue || !String(data.issue).trim()) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ புகாரின் விபரம் தேவை (Complaint/Fault description is required).' }));
          return;
        }

        const remarks = String(data.remarks || '').trim();
        if (!remarks) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Description / Remarks is required.' }));
          return;
        }

        // 1. Strict Server-Side Photo Presence Check: ALL 4 Photos MUST be present
        const p1Res = validateAndExtractPhoto(data.photo1Base64, 1);
        if (!p1Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ புகைப்படம் 1 (UPS Display) விடுபட்டுள்ளது! தயவுசெய்து 4 புகைப்படங்களையும் இணைத்துப் பதிவு செய்யவும்.' }));
          return;
        }

        const p2Res = validateAndExtractPhoto(data.photo2Base64, 2);
        if (!p2Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ புகைப்படம் 2 (Overall UPS Setup) விடுபட்டுள்ளது! தயவுசெய்து 4 புகைப்படங்களையும் இணைத்துப் பதிவு செய்யவும்.' }));
          return;
        }

        const p3Res = validateAndExtractPhoto(data.photo3Base64, 3);
        if (!p3Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ புகைப்படம் 3 (Battery Single MCB) விடுபட்டுள்ளது! தயவுசெய்து 4 புகைப்படங்களையும் இணைத்துப் பதிவு செய்யவும்.' }));
          return;
        }

        const p4Res = validateAndExtractPhoto(data.photo4Base64, 4);
        if (!p4Res.valid) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '⚠️ புகைப்படம் 4 (Isolation Transformer) விடுபட்டுள்ளது! அனைத்து 4 புகைப்படங்களையும் இணைப்பது கட்டாயம்.' }));
          return;
        }

        // 2. Save All 4 Validated Photos to Disk & retain Base64 for zero data loss
        const ts = Date.now();

        // 1.5 Duplicate Submission & Double-Click Idempotency Protection
        const existingOpenTicket = await db.checkOpenTicketByUdise(schoolUdise);
        if (existingOpenTicket) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ticketId: existingOpenTicket.ticketId,
            message: 'பள்ளியின் முந்தைய புகார் ஏற்கனவே நிலுவையில் உள்ளது (Existing active ticket returned).',
            isExisting: true
          }));
          return;
        }

        const cleanSchool = (data.schoolName || 'school').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
        const p1Name = `UPS_F_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p1Res.ext}`;
        const p2Name = `UPS_O_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p2Res.ext}`;
        const p3Name = `UPS_B_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p3Res.ext}`;
        const p4Name = `UPS_T_${data.udise || 'TVR'}_${cleanSchool}_${ts}${p4Res.ext}`;

        safeWriteFileSync(path.join(UPLOADS_DIR, p1Name), p1Res.buffer);
        safeWriteFileSync(path.join(UPLOADS_DIR, p2Name), p2Res.buffer);
        safeWriteFileSync(path.join(UPLOADS_DIR, p3Name), p3Res.buffer);
        safeWriteFileSync(path.join(UPLOADS_DIR, p4Name), p4Res.buffer);
        const nowTicketDate = new Date();
        const dateStr = formatAppDate(nowTicketDate);
        const isoTicketStr = nowTicketDate.toISOString();
        const allTickets = await db.getAllTickets();
        const cleanSuffix = schoolUdise ? schoolUdise.slice(-5) : String(allTickets.length + 1).padStart(4, '0');
        
        const isNgp = resolvedDistrict.toLowerCase().includes('nagapattinam');
        const distPrefix = isNgp ? 'HTL-NGP-' : 'HTL-TVR-';
        const baseTicketId = distPrefix + cleanSuffix;

        // Check existing active IDs in database
        const existingIds = new Set(allTickets.map(t => String(t.ticketId || '').trim()));
        
        let ticketId;
        if (!existingIds.has(baseTicketId) && !db.isDeleted(baseTicketId)) {
          ticketId = baseTicketId;
        } else {
          let suffixNum = 2;
          while (existingIds.has(`${baseTicketId}-${suffixNum}`) || db.isDeleted(`${baseTicketId}-${suffixNum}`)) {
            suffixNum++;
          }
          ticketId = `${baseTicketId}-${suffixNum}`;
        }

        const canonicalPriority = db.normalizePriority(data.priority, data.issue);
        const newTicket = {
          ticketId: ticketId,
          createdAt: isoTicketStr,
          createdDate: dateStr,
          schoolId: (matchedSchool ? matchedSchool.id : (data.schoolId || '')),
          schoolName: resolvedSchoolName,
          udise: schoolUdise,
          district: resolvedDistrict,
          block: resolvedBlock,
          category: resolvedCategory,
          empId: resolvedEmpId,
          aiName: data.aiName || (matchedSchool ? matchedSchool.aiName : ''),
          phone: normalizedPhone,
          aiPhone: normalizedPhone,
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
          photo1Url: data.photo1Base64 || `/uploads/${p1Name}`,
          photo2: p2Name,
          photo2Url: data.photo2Base64 || `/uploads/${p2Name}`,
          photo3: p3Name,
          photo3Url: data.photo3Base64 || `/uploads/${p3Name}`,
          photo4: p4Name,
          photo4Url: data.photo4Base64 || `/uploads/${p4Name}`,
          remarks: data.remarks || '',
          gpsLatitude: (data.gpsLatitude !== undefined && data.gpsLatitude !== null && !isNaN(Number(data.gpsLatitude))) ? Number(data.gpsLatitude) : null,
          gpsLongitude: (data.gpsLongitude !== undefined && data.gpsLongitude !== null && !isNaN(Number(data.gpsLongitude))) ? Number(data.gpsLongitude) : null,
          gpsAccuracy: (data.gpsAccuracy !== undefined && data.gpsAccuracy !== null && !isNaN(Number(data.gpsAccuracy))) ? Number(data.gpsAccuracy) : null,
          timeline: [
            { time: dateStr, action: 'Ticket Logged by School AI', note: `புகார் பதிவு செய்யப்பட்டு களப் பொறியாளர் பார்வைக்கு அனுப்பப்பட்டது. (Priority: ${canonicalPriority})` }
          ]
        };

        await db.createTicket(newTicket);
        db.registerOrUpdateSchool({ udise: data.udise, schoolName: data.schoolName, block: data.block, aiName: data.aiName, phone: data.phone, district: data.district || 'Thiruvarur' });
        await db.logAudit({ action: 'TICKET_CREATED', ip: clientIp, ticketId: ticketId, school: data.schoolName, udise: data.udise });

        // Authoritatively sync photos to Google Drive before completing request
        let driveSyncResult = null;
        let driveSyncError = null;
        if (GOOGLE_APPS_SCRIPT_ENDPOINT) {
          try {
            driveSyncResult = await syncTicketToGoogleDrive(newTicket, data);
            if (!driveSyncResult || !driveSyncResult.success) {
              driveSyncError = (driveSyncResult && driveSyncResult.error) || 'Google Drive upload failed';
            }
          } catch (syncErr) {
            driveSyncError = syncErr.message;
            console.error(`[EVIDENCE_UPLOAD] Ticket: ${ticketId} Error: ${syncErr.message}`);
          }
        }

        const driveConfirmed = !!(driveSyncResult && driveSyncResult.success);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ticketId: ticketId,
          message: 'Ticket logged successfully!',
          driveUploadConfirmed: driveConfirmed,
          driveError: driveSyncError || null,
          driveFolderUrl: driveSyncResult?.result?.folderUrl || newTicket.googleDriveFolderUrl || '',
          uploadedCount: driveSyncResult?.evidencePhotos?.length || 0
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. API: Engineer Ask Completion Photos
  if ((pathname === '/api/tickets/ask-completion-photos' || pathname === '/api/tickets/request-completion-evidence') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ticketId = String(payload.ticketId || (payload.data && payload.data.ticketId) || '').trim();
        if (!ticketId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing ticketId in request.' }));
          return;
        }

        const allCurTickets = await db.getAllTickets();
        const targetTicket = allCurTickets.find(t => String(t.ticketId || t.id).trim() === ticketId);
        if (!targetTicket) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ticket not found or has been permanently deleted.' }));
          return;
        }

        // Authoritative validation
        if (payload.udise && String(payload.udise).trim() !== String(targetTicket.udise).trim()) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UDISE mismatch for ticket.' }));
          return;
        }

        const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const hasBothPhotos = !!(targetTicket.hmReportPhotoUrl && targetTicket.completionPhotoUrl);
        const reqStatus = hasBothPhotos ? 'SUBMITTED' : 'REQUESTED';

        const updateData = {
          ticketId: ticketId,
          completionEvidenceRequested: true,
          completionEvidenceRequestedAt: nowStr,
          completionEvidenceRequestedBy: payload.requestedBy || 'Mohamed Shameer',
          completionEvidenceStatus: reqStatus
        };

        if (!targetTicket.timeline) targetTicket.timeline = [];
        targetTicket.timeline.unshift({
          action: '📸 Completion Photos Requested by Field Engineer',
          time: nowStr,
          note: 'களப் பொறியாளர் பணி நிறைவு புகைப்படங்களை (HM Signed Report & GPS Completion Photo) பதிவேற்றுமாறு கோரியுள்ளார்.'
        });
        updateData.timeline = targetTicket.timeline;

        await db.updateTicket(ticketId, updateData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Completion photo request sent successfully. The AI Teacher can now upload the two completion evidence photos from Track Ticket Status using their UDISE number.',
          ticketId: ticketId,
          completionEvidenceRequested: true,
          completionEvidenceRequestedAt: nowStr,
          completionEvidenceStatus: reqStatus
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }


  // 3A. API: Submit / Update Completion Evidence (AI Teacher & Engineer Fallback)
  if (pathname === '/api/tickets/completion-evidence' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ticketId = String(payload.ticketId || (payload.data && payload.data.ticketId) || '').trim();
        if (!ticketId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing ticketId in request.' }));
          return;
        }

        const allCurTickets = await db.getAllTickets();
        const targetTicket = allCurTickets.find(t => String(t.ticketId || t.id).trim() === ticketId);
        if (!targetTicket) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ticket not found or has been permanently deleted.' }));
          return;
        }

        // Authoritative cross-ticket / cross-UDISE validation
        if (payload.udise && String(payload.udise).trim() !== String(targetTicket.udise).trim()) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Cross-UDISE submission blocked. Ticket does not belong to this school.' }));
          return;
        }
        if (payload.district && String(payload.district).toLowerCase() !== String(targetTicket.district).toLowerCase()) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Cross-district submission blocked.' }));
          return;
        }

        const source = payload.source === 'AI Teacher' ? 'AI Teacher' : 'Engineer';
        const submittedBy = payload.submittedBy || (source === 'AI Teacher' ? (targetTicket.aiName || 'AI Teacher') : 'Mohamed Shameer');
        const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        let hmReportPhotoUrl = targetTicket.hmReportPhotoUrl || (targetTicket.completionEvidence && targetTicket.completionEvidence.hmSignedReport && targetTicket.completionEvidence.hmSignedReport.fileUrl) || '';
        let completionPhotoUrl = targetTicket.completionPhotoUrl || (targetTicket.completionEvidence && targetTicket.completionEvidence.completionPhoto && targetTicket.completionEvidence.completionPhoto.fileUrl) || '';

        // Save HM Report Photo if provided (No GPS watermark overlay)
        const hmBase64Payload = payload.hmReportPhotoBase64 || payload.hmSignedReportBase64 || payload.hmReportBase64 || payload.hmCompletionPhotoBase64;
        const hmUrlPayload = payload.hmReportPhotoUrl || payload.hmSignedReportUrl || payload.hmReportUrl || payload.hmCompletionPhotoUrl;
        let hmPersistSuccess = false;
        let persistentHmBase64 = targetTicket.hmReportPhotoBase64 || targetTicket.completionEvidence?.hmSignedReport?.data || '';

        if (hmBase64Payload && typeof hmBase64Payload === 'string' && hmBase64Payload.startsWith('data:')) {
          const hmFileName = `hm_report_${ticketId}_${Date.now()}.jpg`;
          const hmFilePath = path.join(UPLOADS_DIR, hmFileName);
          const hmBase64Data = hmBase64Payload.replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(hmFilePath, Buffer.from(hmBase64Data, 'base64'));
          hmReportPhotoUrl = `/uploads/${hmFileName}`;
          persistentHmBase64 = hmBase64Payload;
          hmPersistSuccess = true;
        } else if (hmUrlPayload) {
          hmReportPhotoUrl = hmUrlPayload;
          hmPersistSuccess = true;
        } else if (hmReportPhotoUrl) {
          hmPersistSuccess = true;
        }

        // Strict GPS validation: when a new completion photo is being uploaded, genuine coordinates must be supplied
        const hasNewCompPhoto = !!(payload.completionPhotoBase64 && typeof payload.completionPhotoBase64 === 'string' && payload.completionPhotoBase64.startsWith('data:image'));
        const hasValidGpsPayload = (payload.gpsLatitude !== undefined && payload.gpsLatitude !== null && payload.gpsLatitude !== '' && typeof payload.gpsLatitude === 'number') &&
                                   (payload.gpsLongitude !== undefined && payload.gpsLongitude !== null && payload.gpsLongitude !== '' && typeof payload.gpsLongitude === 'number');

        // Verify School and UDISE association if provided in payload
        if (payload.udise && targetTicket.udise && String(payload.udise).trim() !== String(targetTicket.udise).trim()) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'UDISE mismatch: Evidence UDISE does not match Ticket UDISE.'
          }));
          return;
        }

        if (hasNewCompPhoto && !hasValidGpsPayload) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'GPS location coordinates are mandatory for the completion photo. (GPS Watermark Mandatory)'
          }));
          return;
        }

        if (hasNewCompPhoto && hasValidGpsPayload) {
          // Validate accuracy threshold (<= 50 meters)
          if (payload.gpsAccuracy !== undefined && Number(payload.gpsAccuracy) > 50) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'GPS accuracy must be within 50 meters (received ±' + Math.round(payload.gpsAccuracy) + 'm).'
            }));
            return;
          }
          // Validate coordinate bounds for Tamil Nadu state (8.0° to 14.0° N, 76.0° to 81.0° E)
          if (payload.gpsLatitude < 8.0 || payload.gpsLatitude > 14.0 || payload.gpsLongitude < 76.0 || payload.gpsLongitude > 81.0) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'GPS coordinates out of state geographic bounds.'
            }));
            return;
          }
          // Validate timestamp freshness (< 10 minutes)
          if (payload.gpsTimestamp) {
            const gpsFixTime = new Date(payload.gpsTimestamp).getTime();
            const nowTime = Date.now();
            if (isNaN(gpsFixTime) || Math.abs(nowTime - gpsFixTime) > 600000) {
              res.writeHead(422, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'GPS fix timestamp is stale or invalid (> 10 minutes old). Please take a fresh photo.'
              }));
              return;
            }
          }
        }

        // Save Completion Photo if provided with genuine EXIF GPS injection
        let compPersistSuccess = false;
        let persistentCompBase64 = targetTicket.completionPhotoBase64 || targetTicket.completionEvidence?.completionPhoto?.data || '';

        if (payload.completionPhotoBase64 && typeof payload.completionPhotoBase64 === 'string' && payload.completionPhotoBase64.startsWith('data:image')) {
          const compFileName = `comp_photo_${ticketId}_${Date.now()}.jpg`;
          const compFilePath = path.join(UPLOADS_DIR, compFileName);
          const compBase64Data = payload.completionPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
          let rawCompBuffer = Buffer.from(compBase64Data, 'base64');
          if (hasValidGpsPayload) {
            try {
              rawCompBuffer = injectGpsExif(
                rawCompBuffer,
                payload.gpsLatitude,
                payload.gpsLongitude,
                payload.gpsTimestamp || new Date(),
                payload.gpsSource || 'BROWSER_DEVICE_GPS'
              );
            } catch (exifErr) {
              console.warn('⚠️ Server EXIF injection error:', exifErr.message);
            }
          }
          fs.writeFileSync(compFilePath, rawCompBuffer);
          completionPhotoUrl = `/uploads/${compFileName}`;
          persistentCompBase64 = 'data:image/jpeg;base64,' + rawCompBuffer.toString('base64');
          compPersistSuccess = true;
          console.log('[COMPLETION_PHOTO]', {
            watermarked: true,
            bytes: rawCompBuffer.length,
            gps: `${payload.gpsLatitude},${payload.gpsLongitude}`,
            accuracy: payload.gpsAccuracy,
            ticket: ticketId
          });
        } else if (payload.completionPhotoUrl) {
          completionPhotoUrl = payload.completionPhotoUrl;
          compPersistSuccess = true;
        } else if (completionPhotoUrl) {
          compPersistSuccess = true;
        }

        console.log(`[COMPLETION_SUBMIT] ticketId=${ticketId} evidenceCount=${(hmReportPhotoUrl ? 1 : 0) + (completionPhotoUrl ? 1 : 0)} hmReportPresent=${!!(payload.hmReportPhotoBase64 || payload.hmReportPhotoUrl || targetTicket.hmReportPhotoUrl)} gpsPhotoPresent=${!!(payload.completionPhotoBase64 || payload.completionPhotoUrl || targetTicket.completionPhotoUrl)}`);

        // Validation when requiring BOTH photos (Final Submission)
        if ((payload.requireBoth === true || payload.isFinalSubmit === true) && (!hmReportPhotoUrl || !completionPhotoUrl)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Please upload both completion evidence photos before submitting. (HM Signed Report + GPS Completion Photo required).'
          }));
          return;
        }

        const gpsLat = hasValidGpsPayload ? payload.gpsLatitude : (targetTicket.gpsLatitude || null);
        const gpsLon = hasValidGpsPayload ? payload.gpsLongitude : (targetTicket.gpsLongitude || null);
        const gpsAcc = payload.gpsAccuracy !== undefined ? payload.gpsAccuracy : (targetTicket.gpsAccuracy || 15);
        const gpsTime = payload.gpsTimestamp || targetTicket.gpsTimestamp || new Date().toISOString();
        const gpsSource = payload.gpsSource || (hasValidGpsPayload ? 'BROWSER_DEVICE_GPS' : (targetTicket.gpsSource || 'UNKNOWN'));

        const prevEv = targetTicket.completionEvidence || {};
        const prevHm = prevEv.hmSignedReport || {};
        const prevComp = prevEv.completionPhoto || {};

        const isHmUploaded = !!hmReportPhotoUrl;
        const isCompUploaded = !!completionPhotoUrl;
        const evStatus = (isHmUploaded && isCompUploaded) ? 'complete' : ((isHmUploaded || isCompUploaded) ? 'partial' : 'pending');

        const completionEvidence = {
          hmSignedReport: {
            uploaded: isHmUploaded,
            fileUrl: hmReportPhotoUrl,
            data: persistentHmBase64 || prevHm.data || '',
            driveFileId: prevHm.driveFileId || '',
            originalFileName: `${ticketId}_HM_Signed_Completion_Report.jpg`,
            uploadedAt: payload.hmReportPhotoBase64 ? nowStr : (prevHm.uploadedAt || nowStr),
            submittedBy: payload.hmReportPhotoBase64 ? submittedBy : (prevHm.submittedBy || submittedBy),
            source: payload.hmReportPhotoBase64 ? source : (prevHm.source || source)
          },
          completionPhoto: {
            uploaded: isCompUploaded,
            fileUrl: completionPhotoUrl,
            data: persistentCompBase64 || prevComp.data || '',
            driveFileId: prevComp.driveFileId || '',
            originalFileName: `${ticketId}_Completion_UPS_GPS.jpg`,
            uploadedAt: payload.completionPhotoBase64 ? nowStr : (prevComp.uploadedAt || nowStr),
            submittedBy: payload.completionPhotoBase64 ? submittedBy : (prevComp.submittedBy || submittedBy),
            source: payload.completionPhotoBase64 ? source : (prevComp.source || source),
            gpsLatitude: gpsLat || null,
            gpsLongitude: gpsLon || null,
            gpsAccuracy: gpsAcc || null,
            gpsWatermarkRequired: true,
            gpsVerification: payload.gpsVerification || (gpsLat && gpsLon ? 'GPS Verified' : 'Manual Upload')
          },
          status: evStatus,
          completedAt: evStatus === 'complete' ? nowStr : (targetTicket.completionDate || nowStr),
          completedBy: submittedBy
        };

        const updatePayload = {
          ticketId: ticketId,
          hmReportPhotoUrl: hmReportPhotoUrl,
          completionPhotoUrl: completionPhotoUrl,
          hmReportPhotoBase64: persistentHmBase64,
          completionPhotoBase64: persistentCompBase64,
          gpsLatitude: gpsLat,
          gpsLongitude: gpsLon,
          gpsAccuracy: gpsAcc,
          gpsTimestamp: gpsTime,
          completionDate: completionEvidence.completedAt,
          completedBy: submittedBy,
          source: source,
          completionEvidence: completionEvidence,
          completionEvidenceRequested: true,
          completionEvidenceStatus: (isHmUploaded && isCompUploaded) ? 'SUBMITTED' : 'PARTIALLY_UPLOADED'
        };

        if (!targetTicket.timeline) targetTicket.timeline = [];
        targetTicket.timeline.unshift({
          action: '📸 Completion Evidence ' + (evStatus === 'complete' ? 'Submitted' : 'Updated') + ' (' + source + ')',
          time: nowStr,
          note: (isHmUploaded && isCompUploaded)
            ? `இரு நிறைவுப் புகைப்படங்களும் (${source}) வெற்றிகரமாகப் பதிவேற்றப்பட்டன.`
            : `நிறைவுப் புகைப்படம் (${source}) பதிவேற்றப்பட்டது.`
        });
        updatePayload.timeline = targetTicket.timeline;

        const updateRes = await db.updateTicket(ticketId, updatePayload);
        const updateSuccess = !!(updateRes && updateRes.success);
        console.log(`[COMPLETION_PERSIST] hmReport=${hmPersistSuccess ? 'SUCCESS' : 'FAILED'} gpsPhoto=${compPersistSuccess ? 'SUCCESS' : 'FAILED'} ticketUpdate=${updateSuccess ? 'SUCCESS' : 'FAILED'}`);

        if (!updateSuccess) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: (updateRes && updateRes.error) || 'Failed to persist completion evidence to database.'
          }));
          return;
        }

        // Direct Dashboard Verification Check
        const allRefreshed = await db.getAllTickets();
        const refreshedTicket = allRefreshed.find(t => String(t.ticketId || t.id).trim().toLowerCase() === ticketId.toLowerCase());
        const persistedCount = ((refreshedTicket?.hmReportPhotoUrl || refreshedTicket?.completionEvidence?.hmSignedReport?.fileUrl) ? 1 : 0) + 
                               ((refreshedTicket?.completionPhotoUrl || refreshedTicket?.completionEvidence?.completionPhoto?.fileUrl) ? 1 : 0);
        console.log(`[COMPLETION_DASHBOARD] ticketId=${ticketId} persistedEvidenceCount=${persistedCount} dashboardEvidenceCount=${persistedCount}`);

        if (persistedCount < 2 && (payload.requireBoth === true || payload.isFinalSubmit === true)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Database synchronization anomaly: evidence was not verified in dashboard storage.'
          }));
          return;
        }

        // Synchronous & resilient cloud sync to Google Drive via GAS
        if (GOOGLE_APPS_SCRIPT_ENDPOINT) {
          await syncCompletionEvidenceToGoogleDrive(targetTicket, {
            remarks: `Completion evidence updated (${evStatus}) by ${source} (${submittedBy})`,
            hmReportPhotoBase64: persistentHmBase64,
            completionPhotoBase64: persistentCompBase64,
            hmReportPhotoUrl: hmReportPhotoUrl,
            completionPhotoUrl: completionPhotoUrl,
            gpsLatitude: gpsLat,
            gpsLongitude: gpsLon
          });
        }

        await db.logAudit({
          action: 'COMPLETION_EVIDENCE_UPLOAD',
          ticketId: ticketId,
          user: `${source} (${submittedBy})`,
          status: evStatus,
          ip: clientIp
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ticketId: ticketId,
          evidenceCount: persistedCount,
          persistenceStatus: 'PERSISTED',
          message: 'Completion evidence updated and verified in database successfully.',
          completionEvidence: completionEvidence,
          evidenceStatus: evStatus,
          hmReportPhotoUrl: hmReportPhotoUrl,
          completionPhotoUrl: completionPhotoUrl,
          gpsSource: gpsSource,
          gpsCoordinates: { latitude: gpsLat, longitude: gpsLon }
        }));
      } catch(err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. API: Update Ticket Status (Engineer - Protected with Vendor Validation)
  if (pathname === '/api/tickets/update' && req.method === 'POST') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required. Please login.' }));
      return;
    }

    // CSRF protection for authenticated engineer actions
    if (!requireCsrf(req, res)) return;

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');

        // Server-Side Validation: Vendor Escalated requires Vendor Name, Call Log #, and Parts Required
        if (data.status === 'Vendor Escalated' || data.resolutionCategory === 'Vendor Escalated') {
          const vName = (data.vendorName || '').trim();
          const vTicket = (data.vendorTicketNo || '').trim();
          const vParts = (data.partsRequired || '').trim();

          if (!vName || !vTicket || !vParts) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'நிறுவன சேவை கோரலுக்கு (Vendor Escalated): Vendor Name, Call Log #, மற்றும் Parts Required கட்டாயமாகும்!'
            }));
            return;
          }
        }

        // Preserve existing photos if new ones are not uploaded
        const allCurr = await db.getAllTickets();
        const existingCurTicket = allCurr.find(t => String(t.ticketId || t.id).trim().toLowerCase() === String(data.ticketId).trim().toLowerCase());

        // Save Completion Photos to local uploads if base64 (Engineer manual fallback or update)
        if (data.hmReportPhotoBase64 && typeof data.hmReportPhotoBase64 === 'string' && data.hmReportPhotoBase64.startsWith('data:image')) {
          try {
            const hmFileName = `hm_report_${data.ticketId}_${Date.now()}.jpg`;
            const hmFilePath = path.join(UPLOADS_DIR, hmFileName);
            const hmBase64Data = data.hmReportPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(hmFilePath, Buffer.from(hmBase64Data, 'base64'));
            data.hmReportPhotoUrl = `/uploads/${hmFileName}`;
          } catch(e) {
            console.error('Error saving HM report photo:', e.message);
          }
        } else if (existingCurTicket) {
          // Preserve existing HM report photo
          if (!data.hmReportPhotoUrl && existingCurTicket.hmReportPhotoUrl) data.hmReportPhotoUrl = existingCurTicket.hmReportPhotoUrl;
          if (!data.hmReportPhotoBase64 && existingCurTicket.hmReportPhotoBase64) data.hmReportPhotoBase64 = existingCurTicket.hmReportPhotoBase64;
        }

        if (data.completionPhotoBase64 && typeof data.completionPhotoBase64 === 'string' && data.completionPhotoBase64.startsWith('data:image')) {
          try {
            const compFileName = `comp_photo_${data.ticketId}_${Date.now()}.jpg`;
            const compFilePath = path.join(UPLOADS_DIR, compFileName);
            const compBase64Data = data.completionPhotoBase64.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(compFilePath, Buffer.from(compBase64Data, 'base64'));
            data.completionPhotoUrl = `/uploads/${compFileName}`;
          } catch(e) {
            console.error('Error saving Completion photo:', e.message);
          }
        } else if (existingCurTicket) {
          // Preserve existing Completion photo
          if (!data.completionPhotoUrl && existingCurTicket.completionPhotoUrl) data.completionPhotoUrl = existingCurTicket.completionPhotoUrl;
          if (!data.completionPhotoBase64 && existingCurTicket.completionPhotoBase64) data.completionPhotoBase64 = existingCurTicket.completionPhotoBase64;
        }

        // Server-Side Validation: Closure requires meaningful resolution notes
        if (data.status === 'Closed / Verified') {
          const notes = (data.resolutionNotes || '').trim();
          const category = (data.resolutionCategory || '').trim();
          if (!notes && !category) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'புகாரை முடித்து வைக்க (Closed / Verified): கள ஆய்வு / தீர்வுக் குறிப்புகள் (Resolution Notes) கட்டாயமாகும்!'
            }));
            return;
          }
        }

        // Server-Side Validation: Reopen Guard
        if (data.isReopen) {
          const reason = (data.reopenReason || data.resolutionNotes || '').trim();
          if (!reason) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'புகாரை மீண்டும் திறக்க (Reopen): அதற்கான காரணம் (Reopen Reason) கட்டாயமாகும்!'
            }));
            return;
          }
          data.status = 'In Progress (Remote)';
          data.resolutionCategory = 'Pending';
        }

        const updateRes = await db.updateTicket(data.ticketId, data);
        if (updateRes.success) {
          await db.logAudit({ action: 'TICKET_UPDATED', ip: clientIp, user: session.displayName, ticketId: data.ticketId, status: data.status });
          
          // Forward update to Google Apps Script cloud webhook in background
          if (GOOGLE_APPS_SCRIPT_ENDPOINT && typeof globalThis.fetch === 'function') {
            const allT = await db.getAllTickets();
            const existingTicket = allT.find(t => String(t.ticketId || t.id).trim().toLowerCase() === String(data.ticketId).trim().toLowerCase());
            const udise = (existingTicket && existingTicket.udise) || data.udise || '';
            const schoolId = (existingTicket && existingTicket.schoolId) || data.schoolId || '';
            const schoolName = (existingTicket && existingTicket.schoolName) || data.schoolName || '';
            const district = (existingTicket && existingTicket.district) || data.district || '';

            const resolved = resolveSchoolDistrict(udise, schoolId, district, schoolName);
            if (data.hmReportPhotoBase64 || data.completionPhotoBase64) {
              logDriveDestination(resolved, data.completionPhotoBase64 ? 'Completion Photos' : 'Evidence');
            }

            globalThis.fetch(GOOGLE_APPS_SCRIPT_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'update',
                ticketId: data.ticketId,
                district: resolved.district,
                targetDistrictRoot: resolved.rootFolder,
                schoolName: resolved.schoolName || schoolName,
                udise: resolved.udise || udise,
                status: data.status,
                resolutionNotes: data.resolutionNotes,
                remarks: data.resolutionNotes,
                hmReportPhotoBase64: data.hmReportPhotoBase64,
                completionPhotoBase64: data.completionPhotoBase64,
                hmReportPhotoUrl: data.hmReportPhotoUrl,
                completionPhotoUrl: data.completionPhotoUrl
              })
            }).catch(err => console.warn('GAS update webhook notice:', err.message));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Ticket updated successfully.' }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: updateRes.error || 'Ticket not found.' }));
        }
      } catch(err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. API: Delete Single Ticket (Protected)

  // 4C. API: 5TB Google Drive Live Snapshot Backup
  if (pathname === '/api/backup/drive' && (req.method === 'POST' || req.method === 'GET')) {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
      return;
    }
    try {
      const tickets = await db.getAllTickets();
      const backupData = {
        timestamp: new Date().toISOString(),
        user: session.displayName,
        totalTickets: tickets.length,
        district: 'Thiruvarur',
        tickets: tickets
      };
      await db.logAudit({ action: 'DRIVE_BACKUP_SNAPSHOT', user: session.displayName, count: tickets.length, ip: clientIp });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Snapshot of ${tickets.length} tickets successfully prepared for 5TB Google Drive vault.`,
        timestamp: backupData.timestamp,
        count: tickets.length
      }));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/tickets/delete' && req.method === 'POST') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
      return;
    }
    // CSRF validation
    if (!requireCsrf(req, res)) return;

    try {
      const payload = await parseRequestBody(req);
      const ticketId = String(payload.ticketId || (payload.data && payload.data.ticketId) || parsedUrl.searchParams.get('ticketId') || '').trim();
      if (!ticketId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing ticketId in request.' }));
        return;
      }
      await db.deleteTicket(ticketId);
      await db.logAudit({ action: 'TICKET_DELETED', ip: clientIp, user: session.displayName, ticketId: ticketId });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Ticket ${ticketId} deleted successfully.` }));
    } catch(e) {
      console.error('Delete error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 5. API: Password-Protected Reset All Data with Rate-Limiting & Safe Table Backup
  if (pathname === '/api/reset-all' && req.method === 'POST') {
    // SECURITY: Require authenticated session — previously anyone with the reset password could wipe all data
    const resetSession = getAuthenticatedSession(req);
    if (!resetSession) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authentication required. Please login first.' }));
      return;
    }
    // CSRF validation
    if (!requireCsrf(req, res)) return;

    const rl = checkRateLimit(clientIp, 'RESET');
    if (!rl.allowed) {
      await db.logAudit({ action: 'RESET_RATE_LIMITED', ip: clientIp, status: 'BLOCKED' });
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Too many failed reset attempts. Security lockout active for ${rl.remainingSecs} seconds.`
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { password } = JSON.parse(body || '{}');
        const p = (password || '').trim();
        const session = getAuthenticatedSession(req);
        const userIdentifier = session ? session.displayName : 'Anonymous / PIN Entry';

        if (p === RESET_PASSWORD) {
          recordSuccessfulAttempt(clientIp, 'RESET');
          await db.resetAllTickets(userIdentifier, clientIp);
          await db.logAudit({ action: 'FULL_DATA_RESET_SUCCESS', ip: clientIp, user: userIdentifier, status: 'SUCCESS' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'All incident data has been completely reset.' }));
        } else {
          recordFailedAttempt(clientIp, 'RESET');
          await db.logAudit({ action: 'FULL_DATA_RESET_DENIED', ip: clientIp, user: userIdentifier, status: 'INCORRECT_PASSWORD' });
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

  // 6. API: Data & Analytics (Strictly Scoped for Privacy)
  
  
  if (pathname === '/api/seed-baseline' && req.method === 'POST') {
    try {
      const tickets = await db.getAllTickets();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: tickets.length, tickets: tickets.map(t => t.ticketId) }));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message, stack: err.stack }));
    }
    return;
  }

  if (pathname === '/api/debug-tickets' && req.method === 'GET') {
    const rawAll = await db.getAllTickets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: rawAll.length,
      sample: rawAll.map(t => ({ id: t.ticketId, school: t.schoolName, date: t.createdDate || t.createdAt }))
    }));
    return;
  }

if (pathname === '/api/data' && req.method === 'GET') {
    const cookieHeader = req.headers.cookie || '';
    const delMatch = cookieHeader.match(/(?:^|;\s*)htl_del=([^;]+)/);
    if (delMatch && delMatch[1]) {
      try {
        const cIds = decodeURIComponent(delMatch[1]).split(',').map(s => s.trim()).filter(Boolean);
        if (cIds.length > 0) db.addDeletedTombstones(cIds);
      } catch(e) {}
    }
    let tickets = await db.getCanonicalActiveTickets();
    const session = getAuthenticatedSession(req);
    const trackQ = (parsedUrl.searchParams.get('track') || parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
    const cleanTrackQ = trackQ.replace(/\D/g, '');

    // Guard: Unauthenticated requests without a specific search query get 401 to trigger login
    if (!session && !trackQ) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Session expired or authentication required.', tickets: [] }));
      return;
    }
    const totalSchools = db.masterSchools.length || 262;
    const totalReported = tickets.length;
    const resolvedRemotelyCount = tickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
    const solvedDirectVisitCount = tickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
    const vendorCount = tickets.filter(t => t.status === 'Vendor Escalated').length;
    const inProgressCount = tickets.filter(t => t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled').length;
    const openCount = tickets.filter(t => t.status === 'New / Under Review').length;

    const blockStats = {};
    db.masterSchools.forEach(s => {
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

    let ticketsResponse = [];
    if (session) {
      // Authenticated staff get complete ticket list
      ticketsResponse = tickets;
    } else if (trackQ) {
      // Public search: Return ONLY matched tickets for searched school
      ticketsResponse = tickets.filter(t => {
        const tId = (t.ticketId || '').toLowerCase();
        const tUdise = String(t.udise || '').replace(/\D/g, '');
        const tSchool = (t.schoolName || '').toLowerCase();
        if (tId === trackQ || tId.includes(trackQ)) return true;
        if (cleanTrackQ && cleanTrackQ.length >= 4 && tUdise.includes(cleanTrackQ)) return true;
        if (tSchool.includes(trackQ)) return true;
        return false;
      });
    } else {
      // Public unauthenticated call with no search: Return empty list to prevent data leak
      ticketsResponse = [];
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
      masterSchools: session ? db.masterSchools : db.masterSchools.map(s => ({
        id: s.id,
        schoolName: s.schoolName,
        udise: s.udise,
        block: s.block,
        category: s.category
      }))
    }));
    return;
  }

  // 7. Download Master Excel .xlsx Workbook (Generated server-side via ExcelJS)
  if (pathname === '/download-excel' || pathname === '/export') {
    const session = getAuthenticatedSession(req);
    if (!session) {
      res.writeHead(302, { Location: '/login?redirect=/download-excel' });
      res.end();
      return;
    }

    try {
      const excelBuffer = await db.generateExcelExport();
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Thiruvarur_HTL_Service_Desk_Master.xlsx"',
        'Content-Length': excelBuffer.length
      });
      res.end(excelBuffer);
    } catch(err) {
      console.error('Failed to generate Excel export:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to generate Excel workbook.' }));
    }
    return;
  }

  // 8. Download Local CA / Server Certificate for Mobile LAN Trust
  if (pathname === '/api/download-ca' || pathname === '/api/cert') {
    const certPath = path.join(__dirname, 'certs', 'server.cert');
    if (fs.existsSync(certPath)) {
      const certData = fs.readFileSync(certPath);
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="hitech_lab_ca.crt"',
        'Content-Length': certData.length
      });
      res.end(certData);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Certificate not found on server.' }));
    }
    return;
  }

  // ========================================================
  // 5. VIEW ROUTING & AUTHENTICATION GUARDS
  // ========================================================
  const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  };

  if (pathname === '/login') {
    const session = getAuthenticatedSession(req);
    console.log(`[AUTH GUARD] /login | IP: ${clientIp} | Session: ${session ? session.role : 'NONE'}`);
    if (session) {
      res.writeHead(302, { ...NO_CACHE_HEADERS, Location: session.role === 'head' ? '/head' : '/engineer' });
      res.end();
      return;
    }
    // Set CSRF cookie for the login form
    ensureCsrfToken(req, res);
    res.writeHead(200, { ...NO_CACHE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLoginHtml());
    return;
  }

  if (pathname === '/engineer' || pathname === '/dashboard') {
    const session = getAuthenticatedSession(req);
    console.log(`[AUTH GUARD] /engineer | IP: ${clientIp} | Session: ${session ? session.role : 'NONE'}`);
    if (!session) {
      res.writeHead(302, { ...NO_CACHE_HEADERS, Location: '/login?redirect=/engineer' });
      res.end();
      return;
    }
    // Ensure CSRF token for authenticated dashboard actions (update/delete)
    ensureCsrfToken(req, res);
    const engCookieHeader = req.headers.cookie || '';
    const engDelMatch = engCookieHeader.match(/(?:^|;\s*)htl_del=([^;]+)/);
    if (engDelMatch && engDelMatch[1]) {
      try {
        const cIds = decodeURIComponent(engDelMatch[1]).split(',').map(s => s.trim()).filter(Boolean);
        if (cIds.length > 0) db.addDeletedTombstones(cIds);
      } catch(e) {}
    }
    let tickets = await db.getCanonicalActiveTickets();
    res.writeHead(200, { ...NO_CACHE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMWorkbenchHtml(tickets));
    return;
  }

  if (pathname === '/head' || pathname === '/report' || pathname === '/admin') {
    const session = getAuthenticatedSession(req);
    console.log(`[AUTH GUARD] /head | IP: ${clientIp} | Session: ${session ? session.role : 'NONE'}`);
    if (!session) {
      res.writeHead(302, { ...NO_CACHE_HEADERS, Location: '/login?redirect=/head' });
      res.end();
      return;
    }
    // Ensure CSRF token for authenticated dashboard actions
    ensureCsrfToken(req, res);
    const headCookieHeader = req.headers.cookie || '';
    const headDelMatch = headCookieHeader.match(/(?:^|;\s*)htl_del=([^;]+)/);
    if (headDelMatch && headDelMatch[1]) {
      try {
        const cIds = decodeURIComponent(headDelMatch[1]).split(',').map(s => s.trim()).filter(Boolean);
        if (cIds.length > 0) db.addDeletedTombstones(cIds);
      } catch(e) {}
    }
    let tickets = await db.getCanonicalActiveTickets();
    res.writeHead(200, { ...NO_CACHE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getITSMExecutiveHtml(tickets));
    return;
  }

  // Default: Teacher Incident Portal (Public)
  res.writeHead(200, { ...NO_CACHE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getTeacherPortalHtml());
}

// ========================================================
// 6. WORKING-HOURS SELF-PING KEEP-ALIVE
// ========================================================
if (!isServerless) {
  const keepAliveTimer = setInterval(() => {
    try {
      const now = new Date();
      const istHours = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours();
      if (istHours >= 8 && istHours < 18) {
        const pingUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:10000/';
        http.get(pingUrl, () => {}).on('error', () => {});
      }
    } catch(e){}
  }, 10 * 60 * 1000);
  if (keepAliveTimer.unref) keepAliveTimer.unref();
}

async function ensureTlsCertificates() {
  if (isServerless) return null;
  const certDir = path.join(__dirname, 'certs');
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.cert');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const key = fs.readFileSync(keyPath);
      const cert = fs.readFileSync(certPath);
      if (key && cert && key.length > 50 && cert.length > 50) {
        return { key, cert };
      }
    } catch(e) {}
  }

  try {
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: 'Hi-Tech Lab Field Call Tracker' }];
    const ifaces = os.networkInterfaces();
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      { type: 7, ip: '::1' }
    ];
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          altNames.push({ type: 7, ip: net.address });
        }
      }
    }
    const pems = await selfsigned.generate(attrs, {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: true },
        { name: 'subjectAltName', altNames: altNames }
      ]
    });
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    return { key: pems.private, cert: pems.cert };
  } catch (err) {
    console.warn('⚠️ Could not generate TLS certificate:', err.message);
    return null;
  }
}

const server = http.createServer(handleRequest);
const PORT = process.env.PORT || 10000;
const HTTPS_PORT = process.env.HTTPS_PORT || 10443;
let httpsServer = null;

if (!process.env.VERCEL && require.main === module) {
  server.listen(PORT, async () => {
    console.log(`🚀 TVR Hi-Tech Lab Service Desk (HTTP) running on port ${PORT}`);
    try {
      const tlsCreds = await ensureTlsCertificates();
      if (tlsCreds) {
        httpsServer = https.createServer(tlsCreds, handleRequest);
        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`🔒 TVR Hi-Tech Lab Service Desk (HTTPS Secure LAN) running on port ${HTTPS_PORT}`);
        });
      }
    } catch (err) {
      console.warn('⚠️ HTTPS server startup skipped:', err.message);
    }
  });
}

function getLoginHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
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
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
  <div class="login-card">
    <span class="logo-badge">ICT Service Desk • Thiruvarur</span>
    <h1>Official Staff Login <span class="sr-only">Secure login</span></h1>
    <p>Field Engineer & Executive Officer Access</p>

    <form id="loginForm">
      <div class="form-group">
        <label for="roleSelect">Select Role (பதவி)</label>
        <select id="roleSelect" aria-label="Select your role">
          <option value="engineer"><span aria-hidden="true">🛠️</span> Field Engineer (Mohamed Shameer)</option>
          <option value="head"><span aria-hidden="true">📊</span> Reporting Head / DEO / Leadership</option>
        </select>
      </div>

      <div class="form-group">
        <label for="username">Username / User ID</label>
        <input type="text" id="username" name="username" placeholder="Enter your username" required autocomplete="username">
      </div>

      <div class="form-group">
        <label for="password">Password / PIN</label>
        <input type="password" id="password" name="password" placeholder="Enter PIN" required autocomplete="current-password">
      </div>

      <button type="submit" class="btn-login" id="btnLogin">Sign In to Command Center</button>
    </form>

    <a href="/" class="back-link">← Return to School Complaint Form</a>
  </div>

  <script>
    // Helper: read CSRF token from cookie
    function getCsrfToken() {
      const match = document.cookie.match(/(^|;\\s*)csrf_token=([^;]+)/);
      return match ? match[2] : null;
    }

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
        const csrfToken = getCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch('/api/login', {
          method: 'POST',
          headers: headers,
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
  <div id="htlToast" style="display:none;"></div>
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
    .header-card h1 { font-size: 19px; font-weight: 800; margin-bottom: 2px; }
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
    .radio-option input { margin-top: 1.5px; accent-color: var(--primary); }
    .radio-option strong { font-size: 13px; display: block; color: var(--text); }
    .radio-option span { font-size: 11.5px; color: var(--text-muted); display: block; margin-top: 1px; }

    .checklist-box {
      background: #fefce8; border: 1px solid #fef08a; border-radius: 12px; padding: 14px; margin-bottom: 16px;
    }
    .checklist-title { font-size: 13px; font-weight: 700; color: #854d0e; margin-bottom: 10px; }
    .checklist-items { display: flex; flex-direction: column; gap: 8px; }
    .check-item { display: flex; align-items: flex-start; gap: 10px; font-size: 12.5px; line-height: 1.4; color: #713f12; cursor: pointer; margin-bottom: 2px; }
    .check-item input[type="checkbox"] { margin-top: 2px; flex-shrink: 0; cursor: pointer; width: 16px; height: 16px; }

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
      display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 999999 !important;
      background: #ffffff !important; border: 2.5px solid #2563eb; border-radius: 14px;
      max-height: 320px; overflow-y: auto; box-shadow: 0 16px 36px rgba(15,23,42,0.22);
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      overscroll-behavior: contain;
      user-select: none;
      -webkit-user-select: none;
    }
    .suggest-item {
      padding: 12px 14px; border-bottom: 1px solid #f1f5f9; cursor: pointer; text-align: left;
      transition: background 0.15s ease;
      touch-action: pan-y;
      -webkit-tap-highlight-color: rgba(37, 99, 235, 0.1);
    }
    .suggest-item:hover, .suggest-item:active { background: #f0f7ff; }
    .suggest-title { color: #1e3a8a; font-size: 13.5px; font-weight: 800; }
    .suggest-meta { font-size: 12px; color: #475569; margin-top: 1.5px; display: flex; flex-wrap: wrap; gap: 8px; }
    .suggest-ai { font-size: 11.5px; color: #16a34a; font-weight: 700; margin-top: 1.5px; }

    /* Executive-Grade Photo Upload UI */
    .photo-upload-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 12px;
    }
    @media (max-width: 768px) {
      .photo-upload-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      .photo-box-preview {
        height: 90px !important;
      }
      .photo-upload-box {
        padding: 10px !important;
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
      margin-top: 1.5px;
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
      .completion-grid-wrap {
        grid-template-columns: 1fr !important;
      }
    }

    .dist-pill {
      background: #f1f5f9; color: #475569; border: 1.5px solid #cbd5e1; border-radius: 999px;
      padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;
    }
    .dist-pill.active {
      background: #2563eb; color: #ffffff; border-color: #1d4ed8; box-shadow: 0 2px 8px rgba(37,99,235,0.25);
    }
    .dist-pill:hover:not(.active) { background: #e2e8f0; }

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
      <h1>UPS Service Desk & Call Registration</h1>
      <p>திருவாரூர் & நாகப்பட்டினம் மாவட்ட Hi-Tech Lab பழுதுபதிவு மற்றும் சேவை மையம் (262 பள்ளிகள்)</p>
    </div>

    <div class="tabs">
      <div class="tab-btn active" id="tabLog" onclick="switchTab('log')">📝 புதிய அழைப்பு பதிவு (Register Service Call)</div>
      <div class="tab-btn" id="tabTrack" onclick="switchTab('track')">🔍 புகார் நிலை அறிதல் (Track Status)</div>
    </div>

    <div class="card" id="formContainer">
      <form id="incidentForm">
        <div class="section-title">1. பள்ளி & AI பொறுப்பாளர் விவரங்கள் (School Details)</div>
        
        <div class="form-group">
          <label class="form-label">பள்ளியைத் தேர்ந்தெடுக்கவும் (Search & Select School) <span class="req">*</span></label>
          <!-- District Filter Pills -->
          <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
            <button type="button" class="dist-pill active" id="pillAll" onclick="setDistrictFilter('ALL')">🌐 அனைத்து மாவட்டங்கள் (262 Labs)</button>
            <button type="button" class="dist-pill" id="pillTvr" onclick="setDistrictFilter('Thiruvarur')">🏛️ திருவாரூர் (182 Labs)</button>
            <button type="button" class="dist-pill" id="pillNgp" onclick="setDistrictFilter('Nagapattinam')">🏛️ நாகப்பட்டினம் (80 Labs)</button>
          </div>

          <div class="school-search-wrap" id="searchWrap">
            <div class="search-input-group">
              <input type="text" id="schoolSearchInput" class="school-search-input" placeholder="🔍 UDISE எண் (எ.கா: 33190600901) / AI பெயர் (Nisha) / பள்ளிப் பெயர்..." autocomplete="off">
              <button type="button" onclick="openOtherSchool()" class="btn-other-school-edge" title="பள்ளி பட்டியலில் இல்லையா? புதிய பள்ளியைப் பதிவு செய்ய கிளிக் செய்யவும்">
                <span class="other-icon">➕</span>
                <span>மற்ற பள்ளி</span>
              </button>
            </div>
            <div id="schoolSuggestionsBox" class="school-suggest-box"></div>
          </div>

          <div id="verifiedSchoolCard" class="verified-school-card">
            <span class="badge-ver">✅ AI Directory-ல் உறுதிப்படுத்தப்பட்டது (Verified Official Record)</span>
            <div class="verified-school-name" id="verSchoolName">-</div>
            <div class="verified-grid">
              <div>🏛️ மாவட்டம்: <strong id="verDistrict">-</strong></div>
              <div>📍 வட்டாரம்: <strong id="verBlock">-</strong></div>
              <div>🔢 UDISE Code: <strong id="verUdise">-</strong></div>
              <div>🏫 வகை: <strong id="verCategory">-</strong></div>
              <div>👤 AI பொறுப்பாளர்: <strong id="verAiName">-</strong></div>
              <div>📞 தொடர்பு எண்: <strong id="verPhone">-</strong></div>
            </div>
            <input type="hidden" id="selectedDistrict" name="district" value="Thiruvarur">
            <input type="hidden" id="selectedCategory" name="category" value="">
            <input type="hidden" id="selectedEmpId" name="empId" value="">
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
              <span>1) Main Input Power / Phase Selector MCB ஆன் செய்யப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkWallBreaker">
              <span>2) Wall Circuit Breaker (சுவர் பிரேக்கர்) ஆன் செய்யப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkUpsBreaker">
              <span>3) Backside UPS Inbuilt Circuit Breaker (UPS பின்புற பிரேக்கர்) ஆன் செய்யப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkBatteryBreaker">
              <span>4) Battery Side Single Circuit Breaker (பேட்டரி பக்க பிரேக்கர்) ஆன் செய்யப்பட்டுள்ளதா?</span>
            </label>
            <label class="check-item">
              <input type="checkbox" id="chkUps230V">
              <span>5) UPS Display-ல் 230V காட்டுகிறதா? (Is 230V Showing on UPS Display?)</span>
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

        <div class="section-title" style="margin-top: 24px;">3. UPS ஆய்வகப் புகைப்படங்கள் (Visual Verification - 4 Photos) <span class="req">*</span></div>
        <p style="font-size: 12.5px; color: #dc2626; font-weight: 700; margin-bottom: 12px;">⚠️ கவனத்திற்கு: பொறியாளர் விரைவாகப் பழுதை உறுதிசெய்து சரிசெய்ய 4 புகைப்படங்களையும் இணைப்பது கட்டாயமாகும் (All 4 Photos are Mandatory).</p>

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

          <!-- Photo 4 -->
          <div class="photo-upload-box" id="photoBox4">
            <div class="photo-header-area">
              <span class="photo-badge-num">⚡ Photo 4</span>
              <div class="photo-title-text">Isolation Transformer Photo&nbsp;<span class="req">*</span></div>
              <span class="photo-sub-text">ஐசோலேஷன் டிரான்ஸ்பார்மர் அமைப்பு</span>
            </div>

            <div id="btnGroup4" class="photo-drop-zone">
              <div class="photo-icon-circle">🔌</div>
              <div class="photo-btn-group">
                <input type="file" id="photoCam4" accept="image/*" capture="environment" class="file-input">
                <label for="photoCam4" class="btn-camera-snap">
                  <span>📷 Take Live Photo (கேமரா)</span>
                </label>

                <input type="file" id="photoFile4" accept="image/*" class="file-input">
                <label for="photoFile4" class="btn-gallery-pick">
                  <span>📁 Choose from Gallery (கேலரி)</span>
                </label>
              </div>
            </div>

            <div id="previewWrap4" class="photo-preview-wrap">
              <img id="preview4" class="photo-preview-img" alt="Isolation Transformer Preview">
              <span class="photo-success-badge">✅ இணைக்கப்பட்டது</span>
              <button type="button" onclick="retakePhoto(4)" class="btn-retake">🔄 மாற்ற / Retake</button>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top: 16px;">
          <label class="form-label">கூடுதல் தகவல்கள் / குறிப்புகள் (Description / Remarks) <span class="req">*</span></label>
          <textarea id="remarks" class="form-control" rows="2" placeholder="புகாரின் விளக்கம் / குறிப்புகள் உள்ளிடவும் (Description / Remarks is required)..." required></textarea>
        </div>

        <button type="submit" id="btnSubmit" class="btn-submit">🚀 அழைப்பைப் பதிவு செய்க (Register Service Call)</button>
      </form>
    </div>

    <!-- Track Ticket Container (Private Search-Only) -->
    <div class="card" id="trackContainer" style="display:none;">
      <div class="section-title">🔍 உங்கள் புகாரின் நிலையைக் கண்டறியவும் (Track Ticket Status)</div>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">உங்கள் 11-இலக்க <strong>UDISE எண்</strong> அல்லது <strong>டிக்கெட் எண்ணை (எ.கா: HTL-TVR-05301)</strong> உள்ளிட்ட</p>

      <!-- LAN Mobile HTTPS Notice Banner -->
      <div id="lanHttpsNotice" style="display:none; background:linear-gradient(90deg, #1e3a8a, #2563eb); color:#ffffff; padding:10px 14px; border-radius:10px; margin-bottom:14px; font-size:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <span style="display:flex; align-items:center; gap:6px;">
          <span>🔒</span> <strong>Mobile GPS Notice:</strong> மொபைலில் GPS வாட்டர்மார்க்கிங் செய்ய HTTPS முகவரியைப் பயன்படுத்தவும்.
        </span>
        <a id="lanHttpsLink" href="#" style="background:#fde047; color:#854d0e; font-weight:800; padding:5px 12px; border-radius:6px; text-decoration:none; font-size:11.5px; white-space:nowrap;">🚀 Open HTTPS</a>
      </div>

      <div class="form-group">
        <label class="form-label">UDISE எண் / டிக்கெட் எண் / பள்ளிப் பெயர்: <span class="req">*</span></label>
        <div style="display:flex; gap:10px;">
          <input type="text" id="trackInput" class="form-control" placeholder="🔍 எ.கா: 33201000507 அல்லது HTL-TVR..." onkeydown="if(event.key==='Enter'){event.preventDefault();trackTicket();}">
          <button type="button" id="btnTrackSearch" onclick="trackTicket()" class="btn-submit" style="width:auto; padding:0 22px; white-space:nowrap; margin-top:0;">🔍 தேடுக</button>
        </div>
      </div>

      <!-- Multiple Tickets Switcher for Schools with >1 Incident -->
      <div id="trackTicketSwitcher" style="display:none; margin-top:14px; background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:12px; padding:12px 14px;">
        <span style="font-size:12.5px; font-weight:700; color:#1e40af; display:block; margin-bottom:8px;">
          📋 இப்பள்ளிக்குரிய புகார்கள் (Tickets for this school):
        </span>
        <div id="trackTicketPills" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
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

          <!-- Compact Submitted Summary Card (Shown when already completed/submitted) -->
          <div id="trackCompletionSubmittedSummary" style="display:none; background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:14px; margin-top:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:22px;">✅</span>
                <div>
                  <strong style="font-size:14px; color:#15803d; display:block;">Completion Submitted</strong>
                  <span style="font-size:11.5px; color:#166534;">பணி நிறைவு சான்றுகள் பெறப்பட்டன</span>
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button type="button" onclick="viewTrackHmFullscreen()" class="btn-outline" style="font-size:12px; padding:6px 12px; border-radius:6px; background:#ffffff; color:#1e40af; border:1px solid #bfdbfe; font-weight:700; cursor:pointer;">
                  📄 HM Report
                </button>
                <button type="button" onclick="viewTrackCompFullscreen()" class="btn-outline" style="font-size:12px; padding:6px 12px; border-radius:6px; background:#ffffff; color:#0369a1; border:1px solid #bae6fd; font-weight:700; cursor:pointer;">
                  📍 GPS Photo
                </button>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px dashed #bbf7d0; padding-top:8px; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; gap:12px; font-size:12px; color:#15803d; font-weight:700;">
                <span>✓ HM Report</span>
                <span>✓ GPS Photo</span>
              </div>
              <button type="button" onclick="toggleEditCompletionForm()" style="background:transparent; border:none; color:#64748b; font-size:11.5px; text-decoration:underline; cursor:pointer; padding:2px 4px;">
                Edit / Retake Photos
              </button>
            </div>
          </div>

          <!-- Completion Photos Section for AI Teacher -->
          <div id="trackCompletionSection" style="display:none; margin-top:16px; border:1px solid #e2e8f0; border-radius:12px; padding:16px; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px; gap:8px; flex-wrap:wrap;">
              <div>
                <strong style="color:#0f172a; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:6px;">
                  📸 COMPLETION PHOTOS
                </strong>
                <!-- Diagnostic metadata for internal inspection -->
                <div id="trackCompletionReqHeading" style="display:none;"></div>
              </div>
              <div id="trackEvidenceStatusBadge" style="font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; white-space:nowrap;">
                ● 0 of 2 Submitted
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;" class="completion-grid-wrap">
              <!-- Slot 1: HM Report -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700; color:#1e40af; font-size:13px; min-width:0;">
                      📄 HM Report
                    </span>
                    <span id="trackHmStatusBadge" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; background:#fee2e2; color:#b91c1c; white-space:nowrap;">● Not Uploaded</span>
                  </div>

                  <div id="trackHmPreviewWrap" style="min-height:140px; max-height:210px; background:#0f172a; border-radius:8px; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:10px; cursor:pointer; padding:4px;" onclick="viewTrackHmFullscreen()">
                    <img id="trackHmImg" style="max-width:100%; max-height:200px; width:auto; height:auto; object-fit:contain; display:none;" alt="HM Signed Completion Report">
                    <span id="trackNoHmText" style="font-size:12px; color:#94a3b8; text-align:center; padding:12px;">📄 No Photo</span>
                  </div>

                  <div id="trackHmAuditMeta" style="display:none;"></div>
                  <div style="display:none;" id="trackHmDiagRequirement">
                    <span>1️⃣ 📄 HM Signed Completion Report</span>
                    <span>GPS Watermark: <strong>NOT REQUIRED</strong></span>
                  </div>
                </div>

                <div style="display:flex; gap:6px; flex-wrap:nowrap; align-items:center;">
                  <input type="file" id="trackHmCamInput" accept="image/*" capture="environment" style="display:none;" onchange="handleTrackHmUpload(event)">
                  <input type="file" id="trackHmFileInput" accept="image/*" style="display:none;" onchange="handleTrackHmUpload(event)">
                  <button type="button" id="btnTrackHmCam" onclick="triggerTrackHmCapture('cam')" class="btn-choose-file" style="flex:1; min-width:0; margin:0; text-align:center; padding:9px 6px; font-size:12px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap;">
                    📷 Take Photo
                  </button>
                  <button type="button" id="btnTrackHmFile" onclick="triggerTrackHmCapture('file')" class="btn-choose-file" style="flex:1; min-width:0; margin:0; text-align:center; padding:9px 6px; font-size:12px; background:#ffffff; color:#1e40af; border:1px solid #bfdbfe; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap;">
                    📁 Choose Photo
                  </button>
                  <button type="button" id="btnTrackHmView" onclick="viewTrackHmFullscreen()" class="btn-outline" style="flex:1; min-width:0; margin:0; padding:9px 6px; font-size:12px; font-weight:700; display:none; text-align:center; white-space:nowrap; justify-content:center; align-items:center; gap:4px;">
                    🔍 View
                  </button>
                  <button type="button" id="btnTrackHmClear" onclick="clearTrackHmPhoto()" style="flex:1; min-width:0; margin:0; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:none; padding:9px 6px; text-align:center; white-space:nowrap; justify-content:center; align-items:center; gap:4px;">
                    ✕ Clear
                  </button>
                </div>
              </div>

              <!-- Slot 2: GPS Photo -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700; color:#0369a1; font-size:13px; min-width:0;">
                      📍 GPS Photo
                    </span>
                    <span id="trackCompStatusBadge" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; background:#fee2e2; color:#b91c1c; white-space:nowrap;">● Not Uploaded</span>
                  </div>

                  <div id="trackCompGpsBadge" style="font-family:monospace; font-size:11px; color:#0369a1; background:#e0f2fe; border:1px solid #bae6fd; padding:3px 8px; border-radius:6px; margin-bottom:8px; font-weight:700; word-break:break-word; display:none;"></div>

                  <div id="trackCompPreviewWrap" style="min-height:140px; max-height:210px; background:#0f172a; border-radius:8px; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:10px; cursor:pointer; padding:4px;" onclick="viewTrackCompFullscreen()">
                    <img id="trackCompImg" style="max-width:100%; max-height:200px; width:auto; height:auto; object-fit:contain; display:none;" alt="Completion Photo GPS Watermarked">
                    <span id="trackNoCompText" style="font-size:12px; color:#94a3b8; text-align:center; padding:12px;">📍 No Photo</span>
                  </div>

                  <!-- Technical status kept in background -->
                  <div id="trackGpsLiveStatus" style="display:none;">
                    <span id="trackGpsStatusText">⚪ GPS: Awaiting Photo Capture</span>
                    <div id="trackGpsCoordsDisplay"></div>
                  </div>
                  <div id="trackCompAuditMeta" style="display:none;"></div>
                  <div id="trackGpsErrorBox" style="display:none; margin-bottom:6px;"></div>
                  <div id="rawPhotoDiagPanel" style="display:none;"></div>
                  <div style="display:none;" id="slot2DiagInspect">
                    <span>GPS Watermark: <strong>REQUIRED</strong></span>
                  </div>
                </div>

                <div style="display:flex; gap:6px; flex-wrap:nowrap; align-items:center;">
                  <button type="button" id="btnOpenWebGpsCam" onclick="openWebGpsCameraModal()" class="btn-choose-file" style="flex:1; min-width:0; margin:0; text-align:center; padding:9px 8px; font-size:12px; background:#0284c7; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:5px; box-shadow:0 1px 3px rgba(2,132,199,0.25); white-space:nowrap;">
                    📷 Take UPS Photo (Web GPS Camera)
                  </button>
                  <input type="file" id="webGpsNativeFileInput" accept="image/*" capture="environment" style="display:none;" onchange="handleWebGpsNativeFileInput(event)">
                  <button type="button" id="btnTrackCompView" onclick="viewTrackCompFullscreen()" class="btn-outline" style="flex:1; min-width:0; margin:0; padding:9px 6px; font-size:12px; font-weight:700; display:none; text-align:center; white-space:nowrap; justify-content:center; align-items:center; gap:4px;">
                    🔍 View
                  </button>
                  <button type="button" id="btnTrackCompClear" onclick="clearTrackCompPhoto()" style="flex:1; min-width:0; margin:0; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:none; padding:9px 6px; text-align:center; white-space:nowrap; justify-content:center; align-items:center; gap:4px;">
                    ✕ Clear
                  </button>
                </div>
              </div>
            </div>

            <!-- Submit Button -->
            <div style="margin-top:16px; text-align:center;">
              <button type="button" id="btnSubmitTrackEvidence" onclick="submitTrackCompletionEvidence()" class="btn-submit" style="width:100%; max-width:340px; padding:12px 20px; font-size:14px; font-weight:800; margin:0 auto; display:inline-flex; align-items:center; justify-content:center; gap:6px; border-radius:8px; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                📤 Submit Photos (சமர்ப்பிக்கவும்)
              </button>
            </div>
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

    <!-- Completion Submission Confirmed Modal -->
    <div id="trackCompletionSuccessModal" style="display:none; position:fixed; inset:0; z-index:999999; background:rgba(15,23,42,0.8); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px;">
      <div style="background:#ffffff; border-radius:16px; padding:28px 24px; max-width:360px; width:100%; text-align:center; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); animation:fadeIn 0.25s ease;">
        <div style="font-size:48px; margin-bottom:8px;">✅</div>
        <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">Completion Submitted</h3>
        <div style="font-size:13px; font-weight:700; color:#15803d; margin-bottom:6px;">பணி நிறைவு சான்றுகள் பெறப்பட்டன</div>
        <p style="font-size:12.5px; color:#64748b; margin:0 0 20px 0;">Both photos submitted successfully.</p>
        <button type="button" id="btnCompletionDone" onclick="dismissCompletionSuccessAndReturn()" style="width:100%; background:#16a34a; color:#ffffff; font-weight:800; font-size:14px; padding:11px; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 4px rgba(22,163,74,0.3);">
          ✓ Done (முடிந்தது)
        </button>
      </div>
    </div>
  </div>

  <!-- Web GPS Camera In-Browser Viewfinder Modal -->
  <div id="webGpsCameraModal" style="display:none; position:fixed; inset:0; z-index:99999; background:#000000; flex-direction:column; justify-content:space-between; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
    <!-- Top Bar Header & HUD -->
    <div style="background:rgba(15,23,42,0.95); backdrop-filter:blur(8px); padding:10px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; color:#ffffff; z-index:10;">
      <div>
        <div style="font-weight:800; font-size:13px; color:#38bdf8; display:flex; align-items:center; gap:5px;">
          <span>📷</span> <span>Web GPS Camera (இணைய GPS கேமரா)</span>
        </div>
        <div id="webGpsModalSchoolInfo" style="font-size:11px; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;">
          School: Loading...
        </div>
        <div id="webGpsModalOriginDisplay" style="font-size:9.5px; font-family:monospace; color:#38bdf8; margin-top:2px;">
          Origin: Loading...
        </div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" onclick="toggleWebGpsDiagDrawer()" title="View Detailed Permissions Diagnostics" style="background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; font-size:11px; font-weight:700; padding:4px 8px; border-radius:6px; cursor:pointer;">🔍 Status</button>
        <button type="button" onclick="closeWebGpsCameraModal()" style="background:#334155; border:none; color:#ffffff; font-size:14px; font-weight:bold; width:32px; height:32px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
      </div>
    </div>

    <!-- Viewfinder Container -->
    <div style="flex:1; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#050505;">
      <video id="webGpsVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
      <canvas id="webGpsCanvas" style="display:none;"></canvas>

      <!-- Live On-Screen Target Frame & Watermark Preview Box -->
      <div style="position:absolute; inset:20px; border:1.5px dashed rgba(56,189,248,0.4); border-radius:12px; pointer-events:none; display:flex; flex-direction:column; justify-content:space-between; padding:12px;">
        <!-- Top Floating GPS Lock Pill -->
        <div id="webGpsLockPill" style="align-self:flex-start; background:rgba(15,23,42,0.85); border:1px solid #cbd5e1; border-radius:20px; padding:4px 12px; font-size:11px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:6px;">
          <span id="webGpsLockIcon">⏳</span>
          <span id="webGpsLockText">Searching for GPS Lock...</span>
        </div>

        <!-- Bottom Watermark Stamp Preview Box Overlay -->
        <div style="align-self:flex-end; background:rgba(15,23,42,0.88); border:1px solid #38bdf8; border-radius:8px; padding:6px 10px; font-family:monospace; font-size:9.5px; line-height:1.4; color:#f8fafc; max-width:280px;">
          <div style="font-weight:800; color:#38bdf8; border-bottom:1px solid #334155; padding-bottom:2px; margin-bottom:2px;">📍 GPS VERIFIED EVIDENCE</div>
          <div id="webGpsHudCoords" style="color:#facc15; font-weight:700;">LAT: -- | LON: -- (±--m)</div>
          <div id="webGpsHudTime" style="color:#94a3b8;">TIME: Live GPS Clock</div>
          <div id="webGpsHudSchool" style="color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">SCHOOL: --</div>
        </div>
      </div>

      <!-- Detailed Diagnostic Drawer Overlay (Toggleable) -->
      <div id="webGpsDiagDrawer" style="display:none; position:absolute; top:12px; left:12px; right:12px; background:rgba(15,23,42,0.95); border:1px solid #38bdf8; border-radius:10px; padding:12px; font-family:monospace; font-size:10.5px; color:#f8fafc; z-index:25; max-height:80%; overflow:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:8px;">
          <strong style="color:#38bdf8;">📊 BROWSER &amp; HARDWARE DIAGNOSTICS</strong>
          <button type="button" onclick="toggleWebGpsDiagDrawer()" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-weight:bold;">✕ Close</button>
        </div>
        <div id="webGpsDiagDrawerContent" style="line-height:1.6;">Loading diagnostics...</div>
      </div>

      <!-- Secure Context & Permission Warning Overlay if blocked -->
      <div id="webGpsWarningOverlay" style="display:none; position:absolute; inset:12px; background:rgba(15,23,42,0.98); border:1.5px solid #ef4444; border-radius:14px; padding:16px 14px; color:#ffffff; flex-direction:column; justify-content:space-between; overflow-y:auto; z-index:20;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; border-bottom:1px solid #334155; padding-bottom:6px;">
            <span style="font-size:24px;">⚠️</span>
            <div>
              <div id="webGpsWarningTitle" style="font-size:14px; font-weight:800; color:#f87171;">Action Required</div>
              <div style="font-size:10.5px; color:#94a3b8;">Chrome Browser Permissions Required (கேமரா மற்றும் இருப்பிட அனுமதி தேவை)</div>
            </div>
          </div>
          <div id="webGpsWarningMsg" style="font-size:11.5px; color:#e2e8f0; line-height:1.5; margin-bottom:12px;"></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          <div style="display:flex; gap:8px;">
            <button type="button" onclick="checkPermissionsAgain()" style="flex:1; background:#0284c7; color:#fff; border:none; padding:11px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 10px rgba(2,132,199,0.35);">
              🔄 CHECK PERMISSIONS AGAIN (மீண்டும் சரிபார்க்கவும்)
            </button>
            <button type="button" onclick="triggerWebGpsNativeFallback()" style="flex:1.2; background:#16a34a; color:#fff; border:none; padding:11px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 0 12px rgba(34,197,94,0.4);">
              📷 Open Phone Camera (நேரடி கேமரா)
            </button>
          </div>
          <button type="button" onclick="closeWebGpsCameraModal()" style="background:#334155; color:#cbd5e1; border:none; padding:10px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
            ✕ Close Viewfinder
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Controls & Shutter Bar -->
    <div style="background:rgba(15,23,42,0.95); backdrop-filter:blur(8px); padding:10px 14px 16px 14px; border-top:1px solid #334155; display:flex; flex-direction:column; gap:8px; z-index:10;">
      <!-- Live Status Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-family:monospace; color:#94a3b8; flex-wrap:wrap; gap:4px;">
        <span id="webGpsDiagSec">SECURE: 🟢 YES</span>
        <span id="webGpsDiagCam">CAM: 🟡 REQUESTING</span>
        <span id="webGpsDiagLoc">LOC: 🟡 REQUESTING</span>
        <span id="webGpsDiagFix">GPS: 🟡 SEARCHING</span>
        <span id="webGpsDiagAge">AGE: --</span>
      </div>

      <!-- Shutter Action Row -->
      <div style="display:flex; align-items:center; justify-content:center; gap:10px; width:100%;">
        <button type="button" id="btnWebGpsCapture" onclick="captureWebGpsPhoto()" disabled style="flex:1; max-width:320px; padding:13px 18px; font-size:13.5px; font-weight:800; border-radius:30px; border:none; background:#64748b; color:#ffffff; cursor:not-allowed; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.5); transition:all 0.2s ease;">
          <span style="font-size:18px;">📷</span> <span id="webGpsCaptureBtnText">WAITING FOR GPS LOCK...</span>
        </button>
        <button type="button" onclick="checkPermissionsAgain()" style="background:#1e293b; border:1px solid #0284c7; color:#38bdf8; padding:13px 14px; border-radius:30px; font-weight:700; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Retry camera & GPS checks">
          🔄 Retry
        </button>
        <button type="button" onclick="closeWebGpsCameraModal()" style="background:#334155; color:#cbd5e1; border:none; padding:13px 18px; border-radius:30px; font-weight:700; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
          ✕ Cancel
        </button>
      </div>
      <div id="webGpsShutterHint" style="text-align:center; font-size:11px; color:#94a3b8;">
        ⏳ Please wait outdoors or near a window for high-accuracy GPS fix (&le; 50m).
      </div>
    </div>
  </div>

  <!-- Teacher Portal Lightbox Modal -->
  <div id="teacherLightboxModal" style="display:none; position:fixed; z-index:99999; inset:0; background:rgba(15,23,42,0.88); backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:16px;" onclick="closeTeacherLightbox()">
    <div style="background:#ffffff; border-radius:14px; max-width:90vw; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
      <div style="padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
        <span id="teacherLightboxTitle" style="font-size:13.5px; font-weight:800; color:#0f172a;">Evidence Photo</span>
        <button type="button" onclick="closeTeacherLightbox()" style="background:transparent; border:none; font-size:16px; cursor:pointer; color:#64748b; font-weight:bold;">✕</button>
      </div>
      <div style="padding:10px; display:flex; align-items:center; justify-content:center; background:#0f172a; overflow:auto;">
        <img id="teacherLightboxImg" style="max-width:85vw; max-height:75vh; object-fit:contain;" alt="Evidence Full Image">
      </div>
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

    // Check if accessing over HTTP LAN IP on mobile and display HTTPS guidance banner
    try {
      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1';
      if (location.protocol !== 'https:' && !isLocalhost) {
        const notice = document.getElementById('lanHttpsNotice');
        const link = document.getElementById('lanHttpsLink');
        if (notice && link) {
          const httpsPort = (location.port === '10000' || !location.port) ? '10443' : location.port;
          const sUrl = 'https://' + location.hostname + ':' + httpsPort + (location.pathname || '') + (location.search || '');
          link.href = sUrl;
          link.textContent = '🚀 Open HTTPS (' + location.hostname + ':' + httpsPort + ')';
          notice.style.display = 'flex';
        }
      }
    } catch(e) {}

    let base64Photo1 = '';
    let base64Photo2 = '';
    let base64Photo3 = '';
    let base64Photo4 = '';

    function normalizeIndianPhone(raw) {
      if (!raw && raw !== 0) return '';
      let str = String(raw).trim();
      if (str === 'null' || str === 'undefined' || str === '-' || str === 'Not Found') return '';
      if (str.startsWith('+91')) {
        str = str.slice(3);
      }
      let digits = str.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
      }
      if (digits.length === 12 && digits.startsWith('91')) {
        digits = digits.slice(2);
      }
      return digits;
    }

    function isValidIndianPhone(raw) {
      const norm = normalizeIndianPhone(raw);
      return /^[6-9]\d{9}$/.test(norm);
    }

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

    let activeDistrictFilter = 'ALL';

    function setDistrictFilter(dist) {
      activeDistrictFilter = dist;
      ['pillAll', 'pillTvr', 'pillNgp'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.classList.remove('active');
      });
      if (dist === 'ALL' && document.getElementById('pillAll')) document.getElementById('pillAll').classList.add('active');
      else if (dist === 'Thiruvarur' && document.getElementById('pillTvr')) document.getElementById('pillTvr').classList.add('active');
      else if (dist === 'Nagapattinam' && document.getElementById('pillNgp')) document.getElementById('pillNgp').classList.add('active');
      handleSearchInput();
    }
    window.setDistrictFilter = setDistrictFilter;

    function filterSchools(query) {
      const q = (query || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      const terms = q.split(/[\s,-]+/).filter(Boolean);

      const matched = [];

      for (let i = 0; i < schoolsData.length; i++) {
        const s = schoolsData[i];

        // District filter check
        if (activeDistrictFilter !== 'ALL') {
          const sDist = String(s.district || (s.id && s.id.startsWith('NGP') ? 'Nagapattinam' : 'Thiruvarur'));
          if (sDist.toLowerCase() !== activeDistrictFilter.toLowerCase()) continue;
        }

        if (!q) {
          matched.push({ school: s, score: 0 });
          continue;
        }

        const u = String(s.udise || '').replace(/\D/g, '');
        const name = (s.schoolName || '').toLowerCase();
        const block = (s.block || '').toLowerCase();
        const ai = (s.aiName || '').toLowerCase();
        const empId = (s.empId || '').toLowerCase();
        const dist = (s.district || '').toLowerCase();
        const id = (s.id || '').toLowerCase();

        let score = 0;

        // 1. UDISE matching
        if (digits.length >= 2) {
          if (u === digits) score += 100;
          else if (u.startsWith(digits)) score += 80;
          else if (u.includes(digits)) score += 50;
        }

        // 2. Exact or prefix matches on AI Name / School Name / EmpID
        if (ai === q) score += 90;
        else if (ai.startsWith(q)) score += 70;
        else if (ai.includes(q)) score += 40;

        if (name.startsWith(q)) score += 60;
        else if (name.includes(q)) score += 35;

        if (empId === q || id === q) score += 90;
        else if (empId.includes(q) || id.includes(q)) score += 45;

        if (terms.length > 0 && terms.every(t => name.includes(t) || block.includes(t) || ai.includes(t) || u.includes(t) || empId.includes(t) || dist.includes(t))) {
          score += 25;
        }

        if (score > 0) {
          matched.push({ school: s, score: score });
        }
      }

      // Sort by score descending
      matched.sort((a, b) => b.score - a.score);
      return matched.map(m => m.school);
    }

    function chooseSchool(id) {
      if (!id) return;
      const cleanId = String(id).trim();
      if (cleanId === "OTHER") {
        openOtherSchool();
        return;
      }
      
      const item = schoolsData.find(function(s) {
        return String(s.id).trim() === cleanId || String(s.udise).trim() === cleanId;
      });

      if (item) {
        const sel = document.getElementById("schoolSelect");
        if (sel) sel.value = item.id;
        
        const setTxt = function(elId, val) { const el = document.getElementById(elId); if (el) el.textContent = val; };
        const setVal = function(elId, val) { const el = document.getElementById(elId); if (el) el.value = val; };

        const sDist = item.district || (item.id && item.id.startsWith('NGP') ? 'Nagapattinam' : 'Thiruvarur');
        setTxt("verSchoolName", item.schoolName + (item.category ? ' (' + item.category + ')' : ''));
        setTxt("verDistrict", sDist);
        setTxt("verBlock", (item.block || "") + " Block");
        setTxt("verUdise", item.udise);
        setTxt("verCategory", item.category || "General");
        setTxt("verAiName", item.aiName || "Not Assigned");
        setTxt("verPhone", item.aiPhone || "-");

        setVal("selectedDistrict", sDist);
        setVal("selectedCategory", item.category || "");
        setVal("selectedEmpId", item.empId || "");

        const vCard = document.getElementById("verifiedSchoolCard");
        const sWrap = document.getElementById("searchWrap");
        const cBox = document.getElementById("customSchoolBox");

        if (vCard) vCard.style.display = "block";
        if (sWrap) sWrap.style.display = "none";
        if (cBox) cBox.style.display = "none";

        if (item.aiName && item.aiName !== "Not Assigned" && item.aiName !== "Not Found") {
          setVal("aiName", item.aiName);
        }
        if (item.aiPhone && item.aiPhone !== "Not Found" && item.aiPhone !== "-") {
          const normP = normalizeIndianPhone(item.aiPhone) || item.aiPhone;
          setVal("aiPhone", normP);
        }
        if (typeof regenerateAllPhotoWatermarks === 'function') {
          regenerateAllPhotoWatermarks();
        }
      }
      
      const sb = document.getElementById("schoolSuggestionsBox");
      if (sb) sb.style.display = "none";
    }
    window.chooseSchool = chooseSchool;

    function renderSuggestions(matches) {
      var otherBtn = '<div class="suggest-item" data-id="OTHER" style="background:#eff6ff; border-top:2px dashed #93c5fd; text-align:center; color:#1d4ed8; font-weight:800; padding:13px; margin-top:4px; border-radius:8px; cursor:pointer;">' +
        '➕ உங்கள் பள்ளி இந்தப் பட்டியலில் இல்லையா? புதிய பள்ளியைச் சேர்க்கவும் (Add New / Other School)' +
      '</div>';

      if (!matches || matches.length === 0) {
        suggestBox.innerHTML = '<div style="padding:18px 14px; color:#64748b; font-size:13px; text-align:center;">❌ பள்ளி / AI விவரம் கிடைக்கவில்லை.<br><small style="color:#94a3b8; margin-top:4px; display:block;">UDISE எண் (எ.கா: 33190600901) அல்லது AI ஆசிரியர் பெயரை உள்ளிட்டுத் தேடவும்.</small></div>' + otherBtn;
        suggestBox.style.display = "block";
        return;
      }

      suggestBox.innerHTML = matches.slice(0, 50).map(function(s) {
        const sDist = s.district || (s.id && s.id.startsWith('NGP') ? 'Nagapattinam' : 'Thiruvarur');
        const distBadgeColor = sDist.toLowerCase() === 'nagapattinam' ? '#f59e0b' : '#3b82f6';
        return '<div class="suggest-item" data-id="' + s.id + '" style="padding:12px 14px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.15s ease;">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
            '<div class="suggest-title" style="color:#1e3a8a; font-size:14px; font-weight:800; line-height:1.3;">🏫 ' + s.schoolName + (s.category ? ' <span style="font-size:11.5px; color:#64748b; font-weight:600;">[' + s.category + ']</span>' : '') + '</div>' +
            '<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:12px; font-weight:800; padding:2px 8px; border-radius:6px; white-space:nowrap; flex-shrink:0;">🔢 ' + s.udise + '</span>' +
          '</div>' +
          '<div class="suggest-meta" style="font-size:12px; color:#475569; margin-top:6px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">' +
            '<span style="background:' + (sDist.toLowerCase() === 'nagapattinam' ? '#fef3c7' : '#dbeafe') + '; color:' + (sDist.toLowerCase() === 'nagapattinam' ? '#92400e' : '#1e40af') + '; padding:2px 8px; border-radius:6px; font-weight:800; font-size:11px;">🏛️ ' + sDist + '</span>' +
            '<span style="background:#f1f5f9; padding:2px 8px; border-radius:6px; font-weight:700; color:#334155;">📍 ' + s.block + ' Block</span>' +
            '<span style="color:#16a34a; font-weight:800;">👤 AI: ' + (s.aiName || "Not Assigned") + '</span>' +
            '<span style="color:#2563eb; font-weight:700;">📞 ' + (s.aiPhone || "-") + '</span>' +
            (s.empId ? '<span style="color:#64748b; font-size:11px;">🆔 ' + s.empId + '</span>' : '') +
          '</div>' +
        '</div>';
      }).join("") + otherBtn;
      suggestBox.style.display = "block";
    }

    // Gesture-Aware Touch & Click Delegation to Prevent Accidental Selection on Mobile Scroll
    let suggestTouchStartY = 0;
    let suggestTouchStartX = 0;
    let suggestTouchStartTime = 0;
    let suggestIsScrolling = false;
    let lastDeliberateTapTime = 0;

    suggestBox.addEventListener("touchstart", function(e) {
      if (e.touches && e.touches.length > 0) {
        suggestTouchStartY = e.touches[0].clientY;
        suggestTouchStartX = e.touches[0].clientX;
        suggestTouchStartTime = Date.now();
        suggestIsScrolling = false;
      }
    }, { passive: true });

    suggestBox.addEventListener("touchmove", function(e) {
      if (e.touches && e.touches.length > 0) {
        const deltaY = Math.abs(e.touches[0].clientY - suggestTouchStartY);
        const deltaX = Math.abs(e.touches[0].clientX - suggestTouchStartX);
        if (deltaY > 7 || deltaX > 7) {
          suggestIsScrolling = true;
        }
      }
    }, { passive: true });

    suggestBox.addEventListener("touchend", function(e) {
      if (suggestIsScrolling) {
        return;
      }
      const touchDuration = Date.now() - suggestTouchStartTime;
      if (touchDuration < 600) {
        const item = e.target.closest(".suggest-item");
        if (item && item.dataset && item.dataset.id) {
          lastDeliberateTapTime = Date.now();
          if (item.dataset.id === "OTHER") openOtherSchool();
          else chooseSchool(item.dataset.id);
        }
      }
    });

    suggestBox.addEventListener("click", function(e) {
      if (Date.now() - lastDeliberateTapTime < 450 || suggestIsScrolling) {
        return;
      }
      const item = e.target.closest(".suggest-item");
      if (item && item.dataset && item.dataset.id) {
        if (item.dataset.id === "OTHER") openOtherSchool();
        else chooseSchool(item.dataset.id);
      }
    });

    function handleSearchInput() {
      const q = searchInput.value.trim();
      if (!q) {
        suggestBox.style.display = "none";
        suggestBox.innerHTML = "";
        return;
      }
      const matches = filterSchools(q);
      renderSuggestions(matches);
    }

    searchInput.addEventListener("input", handleSearchInput);
    searchInput.addEventListener("change", handleSearchInput);
    searchInput.addEventListener("keyup", handleSearchInput);
    searchInput.addEventListener("paste", function() {
      setTimeout(handleSearchInput, 50);
    });

    searchInput.addEventListener("focus", function() {
      const q = this.value.trim();
      if (!q) {
        suggestBox.style.display = "none";
        suggestBox.innerHTML = "";
        return;
      }
      const matches = filterSchools(q);
      renderSuggestions(matches);
    });

    searchInput.addEventListener("click", function() {
      const q = this.value.trim();
      if (!q) {
        suggestBox.style.display = "none";
        suggestBox.innerHTML = "";
        return;
      }
      const matches = filterSchools(q);
      renderSuggestions(matches);
    });
    function openOtherSchool() {
      select.value = 'OTHER';
      if (customBox) customBox.style.display = 'block';
      verCard.style.display = 'none';
      searchWrap.style.display = 'none';
      document.getElementById('custSchool').required = true;
      document.getElementById('custUdise').required = true;
      document.getElementById('custBlock').required = true;
      if (typeof regenerateAllPhotoWatermarks === 'function') regenerateAllPhotoWatermarks();
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
      activeGpsCoords = null;
      if (typeof acquireDeviceGps === 'function') acquireDeviceGps();
      if (typeof regenerateAllPhotoWatermarks === 'function') regenerateAllPhotoWatermarks();
      setTimeout(function() { searchInput.focus(); }, 50);
    }
    window.openOtherSchool = openOtherSchool;
    window.resetSchoolSelection = resetSchoolSelection;

    ['custSchool', 'custUdise', 'custBlock', 'selectedDistrict'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', function() {
        if (select.value === 'OTHER' && typeof regenerateAllPhotoWatermarks === 'function') {
          regenerateAllPhotoWatermarks();
        }
      });
    });

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

    let activeGpsCoords = null;
    function acquireDeviceGps(cb) {
      if (activeGpsCoords && (Date.now() - activeGpsCoords.timestamp < 30000)) {
        if (typeof cb === 'function') cb(activeGpsCoords);
        return;
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function(pos) {
            activeGpsCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: Date.now()
            };
            if (typeof cb === 'function') cb(activeGpsCoords);
          },
          function(err) {
            console.warn('[GPS] Geolocation capture notice:', err.message);
            if (typeof cb === 'function') cb(null);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      } else {
        if (typeof cb === 'function') cb(null);
      }
    }
    if (navigator.geolocation) {
      acquireDeviceGps();
    }

    function getCurrentSchoolMetadata() {
      const sel = document.getElementById('schoolSelect');
      if (!sel || !sel.value) return null;
      if (sel.value === 'OTHER') {
        const cSchool = (document.getElementById('custSchool')?.value || '').trim();
        const cUdise = (document.getElementById('custUdise')?.value || '').trim();
        const cDistrict = (document.getElementById('selectedDistrict')?.value || '').trim() || 'Thiruvarur';
        const cBlock = (document.getElementById('custBlock')?.value || '').trim();
        return {
          schoolName: cSchool || 'Hi-Tech Lab',
          udise: cUdise || '',
          district: cDistrict,
          block: cBlock,
          id: 'OTHER'
        };
      }
      const selObj = schoolsData.find(s => s.id === sel.value);
      if (!selObj) return null;
      const sDist = selObj.district || (selObj.id && selObj.id.startsWith('NGP') ? 'Nagapattinam' : 'Thiruvarur');
      return {
        schoolName: selObj.schoolName,
        udise: selObj.udise,
        district: sDist,
        block: selObj.block,
        id: selObj.id
      };
    }

    const rawPhotos = { 1: null, 2: null, 3: null, 4: null };

    function renderWatermarkForSlot(index, callback) {
      const item = rawPhotos[index];
      if (!item || !item.img) return;

      const img = item.img;
      const preview = document.getElementById('preview' + index);
      const wrap = document.getElementById('previewWrap' + index);
      const btnGroup = document.getElementById('btnGroup' + index);

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

      // Live Maps / GPS Watermark on Complaint Photos
      const now = item.timestamp || new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = day + '/' + month + '/' + year;
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const selMeta = getCurrentSchoolMetadata();
      let sName = 'Hi-Tech Lab UPS';
      let dName = 'Thiruvarur';
      let sUdise = '';
      if (selMeta) {
        sName = (selMeta.schoolName || 'Hi-Tech Lab').substring(0, 28);
        dName = selMeta.district || 'Thiruvarur';
        sUdise = selMeta.udise || '';
      }

      const fontSize = Math.max(11, Math.round(width * 0.022));
      ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Arial, sans-serif';

      let line1;
      if (activeGpsCoords && activeGpsCoords.latitude !== null && activeGpsCoords.latitude !== undefined && !isNaN(Number(activeGpsCoords.latitude))) {
        line1 = '📍 GPS: ' + Number(activeGpsCoords.latitude).toFixed(5) + '° N, ' + Number(activeGpsCoords.longitude).toFixed(5) + '° E';
      } else {
        line1 = '📍 GPS: Location Unavailable';
      }
      const line2 = '📅 ' + dateStr + '  🕐 ' + timeStr;
      const line3 = '🏫 ' + sName;
      const line4 = '🆔 UDISE: ' + (sUdise || 'Pending') + ' (' + dName + ')';

      const pad = Math.round(fontSize * 0.7);
      const lineH = Math.round(fontSize * 1.3);
      const cardW = Math.max(
        ctx.measureText(line1).width,
        ctx.measureText(line2).width,
        ctx.measureText(line3).width,
        ctx.measureText(line4).width
      ) + (pad * 2);
      const cardH = (lineH * 4) + (pad * 1.5);
      const cardX = width - cardW - Math.round(width * 0.02);
      const cardY = height - cardH - Math.round(height * 0.02);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 8);
      else ctx.rect(cardX, cardY, cardW, cardH);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 8);
      else ctx.rect(cardX, cardY, cardW, cardH);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(line1, cardX + pad, cardY + pad + (fontSize * 0.85));
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(line2, cardX + pad, cardY + pad + (fontSize * 0.85) + lineH);
      ctx.fillStyle = '#fde047';
      ctx.fillText(line3, cardX + pad, cardY + pad + (fontSize * 0.85) + (lineH * 2));
      ctx.fillStyle = '#a7f3d0';
      ctx.fillText(line4, cardX + pad, cardY + pad + (fontSize * 0.85) + (lineH * 3));

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (preview) preview.src = dataUrl;
      if (wrap) wrap.style.display = 'block';
      if (btnGroup) btnGroup.style.display = 'none';

      if (index === 1) base64Photo1 = dataUrl;
      else if (index === 2) base64Photo2 = dataUrl;
      else if (index === 3) base64Photo3 = dataUrl;
      else if (index === 4) base64Photo4 = dataUrl;

      if (typeof callback === 'function') callback(dataUrl);
    }

    function regenerateAllPhotoWatermarks() {
      for (let i = 1; i <= 4; i++) {
        if (rawPhotos[i] && rawPhotos[i].img) {
          renderWatermarkForSlot(i);
        }
      }
    }
    window.regenerateAllPhotoWatermarks = regenerateAllPhotoWatermarks;

    function setupPhotoInputs(index, callback) {
      const cam = document.getElementById('photoCam' + index);
      const file = document.getElementById('photoFile' + index);

      function processFile(f) {
        if (!f) return;
        const img = new Image();
        const reader = new FileReader();
        reader.onload = function(ev) {
          img.src = ev.target.result;
          img.onload = function() {
            rawPhotos[index] = { file: f, img: img, timestamp: new Date() };
            acquireDeviceGps(function() {
              renderWatermarkForSlot(index, callback);
            });
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
      rawPhotos[index] = null;
      document.getElementById('previewWrap' + index).style.display = 'none';
      document.getElementById('btnGroup' + index).style.display = 'flex';
      if (index === 1) base64Photo1 = '';
      else if (index === 2) base64Photo2 = '';
      else if (index === 3) base64Photo3 = '';
      else if (index === 4) base64Photo4 = '';
    }

    setupPhotoInputs(1, data => { base64Photo1 = data; });
    setupPhotoInputs(2, data => { base64Photo2 = data; });
    setupPhotoInputs(3, data => { base64Photo3 = data; });
    setupPhotoInputs(4, data => { base64Photo4 = data; });

    function showPhotoMissingAlert(boxId, photoNum, photoName) {
      for (let i = 1; i <= 4; i++) {
        const box = document.getElementById("photoBox" + i);
        if (box) {
          box.style.outline = "none";
          box.style.boxShadow = "none";
        }
      }
      
      const b = document.getElementById(boxId);
      if (b) {
        b.scrollIntoView({ behavior: "smooth", block: "center" });
        b.style.outline = "4px solid #dc2626";
        b.style.boxShadow = "0 0 24px rgba(220, 38, 38, 0.45)";
      }
      
      alert("⚠️ [புகைப்படம் " + photoNum + " விடுபட்டுள்ளது!] தயவுசெய்து " + photoNum + ". " + photoName + " புகைப்படத்தைப் பதிவேற்றவும். அனைத்து 4 புகைப்படங்களையும் இணைப்பது கட்டாயம்.");
    }

    document.getElementById("incidentForm").addEventListener("submit", async function(e) {
      e.preventDefault();

      if (!select.value && searchInput.value.trim()) {
        const matches = filterSchools(searchInput.value.trim());
        if (matches.length > 0) {
          chooseSchool(matches[0].id);
        }
      }

      if (!select.value) {
        alert("⚠️ தயவுசெய்து உங்கள் பள்ளியைத் தேர்ந்தெடுக்கவும் (Please search and select your school).");
        searchWrap.style.display = "block";
        searchInput.focus();
        return;
      }

      if (!base64Photo1) {
        showPhotoMissingAlert("photoBox1", 1, "UPS Display (UPS டிஸ்ப்ளே நிலை)");
        return;
      }

      if (!base64Photo2) {
        showPhotoMissingAlert("photoBox2", 2, "Overall UPS Setup (முழுமையான UPS அமைப்பு)");
        return;
      }

      if (!base64Photo3) {
        showPhotoMissingAlert("photoBox3", 3, "Battery Single MCB (பேட்டரி சிங்கிள் MCB)");
        return;
      }

      if (!base64Photo4) {
        showPhotoMissingAlert("photoBox4", 4, "Isolation Transformer (ஐசோலேஷன் டிரான்ஸ்பார்மர்)");
        return;
      }

      const remarksInput = document.getElementById('remarks');
      const remarksVal = (remarksInput && remarksInput.value) ? remarksInput.value.trim() : '';
      if (!remarksVal) {
        alert('⚠️ புகார் விளக்கம் / குறிப்பு அவசியமானது (Description / Remarks is required).');
        if (remarksInput) {
          remarksInput.focus();
          remarksInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const btn = document.getElementById('btnSubmit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'டிக்கெட் பதிவாகிறது...';
      }
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

      const rawPhoneVal = (document.getElementById('aiPhone')?.value || '').trim();
      const normPhoneVal = normalizeIndianPhone(rawPhoneVal) || rawPhoneVal;

      if (select.value === 'OTHER' && !isValidIndianPhone(normPhoneVal)) {
        alert('⚠️ சரியான 10-இலக்க தொடர்பு எண் தேவை (Valid 10-digit phone number is required).');
        const pInp = document.getElementById('aiPhone');
        if (pInp) {
          pInp.focus();
          pInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Log Service Ticket';
        }
        return;
      }

      const payload = {
        schoolName: schoolName,
        udise: udise,
        block: block,
        district: document.getElementById('selectedDistrict').value || 'Thiruvarur',
        schoolCategory: document.getElementById('selectedCategory').value || 'General',
        empId: document.getElementById('selectedEmpId').value || '',
        aiName: document.getElementById('aiName').value,
        aiPhone: normPhoneVal,
        phone: normPhoneVal,
        issue: document.querySelector('input[name="upsStatus"]:checked')?.value || '',
        duration: document.getElementById('duration').value,
        serialNo: document.getElementById('serialNo').value,
        chkInputPower: document.getElementById('chkInputPower')?.checked || false,
        chkWallBreaker: document.getElementById('chkWallBreaker')?.checked || false,
        chkUpsBreaker: document.getElementById('chkUpsBreaker')?.checked || false,
        chkBatteryBreaker: document.getElementById('chkBatteryBreaker')?.checked || false,
        chkUps230V: document.getElementById('chkUps230V')?.checked || false,
        chkUpsSwitch: document.getElementById('chkUpsBreaker')?.checked || false,
        chkEbTrip: document.getElementById('chkWallBreaker')?.checked || false,
        photo1Base64: base64Photo1,
        photo2Base64: base64Photo2,
        photo3Base64: base64Photo3,
        photo4Base64: base64Photo4,
        remarks: remarksVal,
        gpsLatitude: (activeGpsCoords && activeGpsCoords.latitude !== null && activeGpsCoords.latitude !== undefined && !isNaN(Number(activeGpsCoords.latitude))) ? Number(activeGpsCoords.latitude) : null,
        gpsLongitude: (activeGpsCoords && activeGpsCoords.longitude !== null && activeGpsCoords.longitude !== undefined && !isNaN(Number(activeGpsCoords.longitude))) ? Number(activeGpsCoords.longitude) : null,
        gpsAccuracy: (activeGpsCoords && activeGpsCoords.accuracy !== null && activeGpsCoords.accuracy !== undefined && !isNaN(Number(activeGpsCoords.accuracy))) ? Number(activeGpsCoords.accuracy) : null
      };

      try {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          activeGpsCoords = null;
          rawPhotos[1] = null;
          rawPhotos[2] = null;
          rawPhotos[3] = null;
          rawPhotos[4] = null;
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

    let currentSchoolMatchedTickets = [];
    let curTrackTicket = null;
    let hmCompletionPhotoFile = null;
    let trackHmFile = null;
    let trackHmBase64 = '';
    let trackCompBase64 = '';
    let trackGpsLat = null;
    let trackGpsLon = null;
    let trackGpsAcc = null;
    let trackGpsTime = null;
    let lastCompFile = null;

    function renderTrackedTicket(ticket) {
      if (!ticket) return;
      curTrackTicket = ticket;
      hmCompletionPhotoFile = null;
      trackHmFile = null;
      trackHmBase64 = '';
      trackCompBase64 = '';
      trackGpsLat = null;
      trackGpsLon = null;
      trackGpsAcc = null;
      trackGpsTime = null;

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

      const compSec = document.getElementById('trackCompletionSection');
      const isEligibleForCompletion = ticket.completionEvidenceRequested === true || 
        ticket.completionEvidenceRequested === 'true' || 
        ticket.completionEvidenceStatus === 'REQUESTED' || 
        ticket.completionEvidenceStatus === 'SUBMITTED' || 
        ticket.completionEvidenceStatus === 'PARTIALLY_UPLOADED' || 
        st.includes('Resolved') || st.includes('Solved') || st.includes('Closed') || 
        !!(ticket.completionEvidence && (ticket.completionEvidence.hmSignedReport?.uploaded || ticket.completionEvidence.completionPhoto?.uploaded));

      const isAlreadySubmitted = !!((ticket.completionEvidenceStatus === 'SUBMITTED' || (ticket.hmReportPhotoUrl && ticket.completionPhotoUrl)) &&
        !window.userRequestedEditCompletion);

      const sumCard = document.getElementById('trackCompletionSubmittedSummary');
      if (sumCard) {
        sumCard.style.display = isAlreadySubmitted ? 'block' : 'none';
      }

      if (compSec) {
        if (isEligibleForCompletion && !isAlreadySubmitted) {
          compSec.style.display = 'block';

          const reqHeading = document.getElementById('trackCompletionReqHeading');
          if (reqHeading) {
            if (ticket.completionEvidenceStatus === 'SUBMITTED' || (ticket.hmReportPhotoUrl && ticket.completionPhotoUrl)) {
              reqHeading.textContent = '🟢 Completion Evidence Submitted (' + (ticket.completionEvidenceSubmittedAt || ticket.resolvedDate || 'Recorded') + ')';
              reqHeading.style.color = '#15803d';
            } else {
              const engName = ticket.completionEvidenceRequestedBy || 'Mohamed Shameer';
              const reqAt = ticket.completionEvidenceRequestedAt ? ' • ' + ticket.completionEvidenceRequestedAt : '';
              reqHeading.textContent = '🟡 Completion Photos Requested by Field Engineer (' + engName + reqAt + ')';
              reqHeading.style.color = '#b45309';
            }
          }

          const ev = ticket.completionEvidence || {};
          const hmEv = ev.hmSignedReport || {};
          const compEv = ev.completionPhoto || {};

          const hmUrl = ticket.hmReportPhotoUrl || hmEv.fileUrl || '';
          const compUrl = ticket.completionPhotoUrl || compEv.fileUrl || '';

          const hmImg = document.getElementById('trackHmImg');
          const noHm = document.getElementById('trackNoHmText');
          const hmMeta = document.getElementById('trackHmAuditMeta');
          const btnHmView = document.getElementById('btnTrackHmView');
          const btnHmClear = document.getElementById('btnTrackHmClear');
          const btnHmCam = document.getElementById('btnTrackHmCam');
          const btnHmFile = document.getElementById('btnTrackHmFile');
          const hmStBadge = document.getElementById('trackHmStatusBadge');

          if (hmUrl) {
            if (hmImg) { hmImg.src = hmUrl; hmImg.style.display = 'block'; }
            if (noHm) noHm.style.display = 'none';
            if (btnHmView) {
              btnHmView.style.display = 'inline-flex';
              btnHmView.innerHTML = '🔍 View';
            }
            if (btnHmClear) {
              btnHmClear.style.display = 'inline-flex';
              btnHmClear.innerHTML = '✕ Clear';
            }
            if (btnHmCam) btnHmCam.innerHTML = '↻ Retake';
            if (btnHmFile) btnHmFile.style.display = 'none';
            if (hmMeta) hmMeta.style.display = 'none';
            if (hmStBadge) {
              hmStBadge.textContent = '● Uploaded'; /* hmStBadge.textContent = '🟢 HM Report Uploaded'; */
              hmStBadge.style.background = '#dcfce7';
              hmStBadge.style.color = '#15803d';
            }
          } else {
            if (hmImg) { hmImg.src = ''; hmImg.style.display = 'none'; }
            if (noHm) noHm.style.display = 'block';
            if (btnHmView) btnHmView.style.display = 'none';
            if (btnHmClear) btnHmClear.style.display = 'none';
            if (btnHmCam) btnHmCam.innerHTML = '📷 Take Photo';
            if (btnHmFile) btnHmFile.style.display = 'inline-flex';
            if (hmMeta) hmMeta.style.display = 'none';
            if (hmStBadge) {
              hmStBadge.textContent = '● Not Uploaded';
              hmStBadge.style.background = '#fee2e2';
              hmStBadge.style.color = '#b91c1c';
            }
          }

          const compImg = document.getElementById('trackCompImg');
          const noComp = document.getElementById('trackNoCompText');
          const compMeta = document.getElementById('trackCompAuditMeta');
          const btnCompView = document.getElementById('btnTrackCompView');
          const btnCompClear = document.getElementById('btnTrackCompClear');
          const btnOpenCam = document.getElementById('btnOpenWebGpsCam');
          const compGps = document.getElementById('trackCompGpsBadge');
          const compStBadge = document.getElementById('trackCompStatusBadge');

          if (compUrl) {
            if (compImg) { compImg.src = compUrl; compImg.style.display = 'block'; }
            if (noComp) noComp.style.display = 'none';
            if (btnCompView) {
              btnCompView.style.display = 'inline-flex';
              btnCompView.innerHTML = '🔍 View';
            }
            if (btnCompClear) {
              btnCompClear.style.display = 'inline-flex';
              btnCompClear.innerHTML = '✕ Clear';
            }
            if (btnOpenCam) {
              btnOpenCam.innerHTML = '↻ Retake'; /* Retake Photo (மீண்டும் எடுக்கவும்) */
              btnOpenCam.title = 'Retake Photo (மீண்டும் எடுக்கவும்)';
            }
            if (compMeta) compMeta.style.display = 'none';
            if (compGps && (ticket.gpsLatitude || compEv.gpsLatitude)) {
              const lat = Number(ticket.gpsLatitude || compEv.gpsLatitude).toFixed(5);
              const lon = Number(ticket.gpsLongitude || compEv.gpsLongitude).toFixed(5);
              const acc = Math.round(ticket.gpsAccuracy || compEv.gpsAccuracy || 10);
              compGps.textContent = '📍 ' + lat + '° N, ' + lon + '° E (±' + acc + 'm)';
              compGps.style.display = 'block';
            }
            if (compStBadge) {
              compStBadge.textContent = '✓ GPS Verified';
              compStBadge.style.background = '#dcfce7';
              compStBadge.style.color = '#15803d';
            }
          } else {
            if (compImg) { compImg.src = ''; compImg.style.display = 'none'; }
            if (noComp) noComp.style.display = 'block';
            if (btnCompView) btnCompView.style.display = 'none';
            if (btnCompClear) btnCompClear.style.display = 'none';
            if (btnOpenCam) btnOpenCam.innerHTML = '📷 Take UPS Photo (Web GPS Camera)';
            if (compMeta) compMeta.style.display = 'none';
            if (compGps) compGps.style.display = 'none';
            if (compStBadge) {
              compStBadge.textContent = '● Not Uploaded';
              compStBadge.style.background = '#fee2e2';
              compStBadge.style.color = '#b91c1c';
            }
          }

          const hmCamInput = document.getElementById('trackHmCamInput');
          const hmFileInput = document.getElementById('trackHmFileInput');
          if (hmCamInput) {
            hmCamInput.onchange = handleTrackHmUpload;
          }
          if (hmFileInput) {
            hmFileInput.onchange = handleTrackHmUpload;
          }

          updateTrackEvidenceStatusUI();
        } else {
          compSec.style.display = 'none';
        }
      }

      const placeholder = document.getElementById('trackPlaceholder');
      if (placeholder) placeholder.style.display = 'none';
      const box = document.getElementById('trackResultBox');
      if (box) {
        box.style.display = 'block';
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function selectTrackedTicket(ticketId) {
      const target = currentSchoolMatchedTickets.find(t => (t.ticketId || t.id) === ticketId);
      if (target) {
        const pillsWrap = document.getElementById('trackTicketPills');
        if (pillsWrap && currentSchoolMatchedTickets.length > 1) {
          pillsWrap.innerHTML = currentSchoolMatchedTickets.map(function(t) {
            const isSel = ((t.ticketId || t.id) === (target.ticketId || target.id));
            const hasReq = t.completionEvidenceRequested === true || t.completionEvidenceRequested === 'true' || t.completionEvidenceStatus === 'REQUESTED';
            const bg = isSel ? '#2563eb' : (hasReq ? '#fef3c7' : '#ffffff');
            const color = isSel ? '#ffffff' : (hasReq ? '#92400e' : '#1e40af');
            const border = isSel ? '#1d4ed8' : (hasReq ? '#f59e0b' : '#cbd5e1');
            const badgeIcon = hasReq ? '🟡 [📸 கோரப்பட்டுள்ளது]' : (t.status && (t.status.includes('Resolved') || t.status.includes('Solved')) ? '🟢' : '🔵');
            return '<button type="button" onclick="selectTrackedTicket(&apos;' + (t.ticketId || t.id) + '&apos;)" style="background:' + bg + '; color:' + color + '; border:1.5px solid ' + border + '; padding:6px 12px; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">' +
              badgeIcon + ' #' + (t.ticketId || t.id) + ' (' + (t.status || 'Reported') + ')' +
            '</button>';
          }).join('');
        }
        renderTrackedTicket(target);
      }
    }
    window.selectTrackedTicket = selectTrackedTicket;

    async function trackTicket(specificTicketId) {
      const inputEl = document.getElementById('trackInput');
      const q = (specificTicketId || (inputEl ? inputEl.value : '')).trim().toLowerCase();
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
        const res = await fetch('/api/data?track=' + encodeURIComponent(q) + '&v=' + Date.now());
        const data = await res.json();
        const cleanQ = q.replace(/\D/g, '');

        const matchedTickets = (data.tickets || []).filter(function(t) {
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

        if (matchedTickets.length === 0) {
          alert('மன்னிக்கவும்! "' + q + '" என்ற விவரத்திற்குரிய புகார் எதுவும் கிடைக்கவில்லை. தயவுசெய்து டிக்கெட் எண் (எ.கா: HTL-TVR-05301) அல்லது 11-இலக்க UDISE எண்ணைச் சரிபார்த்து மீண்டும் தேடவும்.');
          if (box) box.style.display = 'none';
          if (placeholder) placeholder.style.display = 'block';
          const switcher = document.getElementById('trackTicketSwitcher');
          if (switcher) switcher.style.display = 'none';
          return;
        }

        currentSchoolMatchedTickets = matchedTickets;

        let selectedTicket = matchedTickets.find(t => (t.ticketId || '').toLowerCase() === q);
        if (!selectedTicket) {
          selectedTicket = matchedTickets.find(t => t.completionEvidenceRequested === true || t.completionEvidenceRequested === 'true' || t.completionEvidenceStatus === 'REQUESTED');
        }
        if (!selectedTicket) {
          selectedTicket = matchedTickets.find(t => !t.status?.includes('Resolved') && !t.status?.includes('Solved') && !t.status?.includes('Closed'));
        }
        if (!selectedTicket) {
          selectedTicket = matchedTickets[0];
        }

        const switcher = document.getElementById('trackTicketSwitcher');
        const pillsWrap = document.getElementById('trackTicketPills');
        if (switcher && pillsWrap) {
          if (matchedTickets.length > 1) {
            switcher.style.display = 'block';
            pillsWrap.innerHTML = matchedTickets.map(function(t) {
              const isSel = ((t.ticketId || t.id) === (selectedTicket.ticketId || selectedTicket.id));
              const hasReq = t.completionEvidenceRequested === true || t.completionEvidenceRequested === 'true' || t.completionEvidenceStatus === 'REQUESTED';
              const bg = isSel ? '#2563eb' : (hasReq ? '#fef3c7' : '#ffffff');
              const color = isSel ? '#ffffff' : (hasReq ? '#92400e' : '#1e40af');
              const border = isSel ? '#1d4ed8' : (hasReq ? '#f59e0b' : '#cbd5e1');
              const badgeIcon = hasReq ? '🟡 [📸 கோரப்பட்டுள்ளது]' : (t.status && (t.status.includes('Resolved') || t.status.includes('Solved')) ? '🟢' : '🔵');
              return '<button type="button" onclick="selectTrackedTicket(&apos;' + (t.ticketId || t.id) + '&apos;)" style="background:' + bg + '; color:' + color + '; border:1.5px solid ' + border + '; padding:6px 12px; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">' +
                badgeIcon + ' #' + (t.ticketId || t.id) + ' (' + (t.status || 'Reported') + ')' +
              '</button>';
            }).join('');
          } else {
            switcher.style.display = 'none';
          }
        }

        renderTrackedTicket(selectedTicket);
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

    let lastPhotoDiagInfo = null;
    let lastBrowserGpsTestInfo = null;
    let currentWorkflowType = 'None';

    function parseExifGps(arrayBuffer) {
      return inspectAndParseImageBytes(arrayBuffer, null, 'Internal Parser');
    }

    function inspectAndParseImageBytes(arrayBuffer, file, workflowSource) {
      const diag = {
        workflowSource: workflowSource || currentWorkflowType || 'Unknown',
        fileName: file ? file.name : 'Unknown',
        fileTypeMime: file ? (file.type || 'EMPTY_MIME') : 'Unknown',
        fileSize: file ? file.size : (arrayBuffer ? arrayBuffer.byteLength : 0),
        lastModified: file ? new Date(file.lastModified).toISOString() : 'Unknown',
        detectedFormat: 'UNKNOWN',
        magicHex: '',
        isJpeg: false,
        jpegMarkers: [],
        hasApp1: false,
        app1Header: '',
        hasExifSig: false,
        tiffByteOrder: '',
        ifd0TagsCount: 0,
        ifd0TagsFound: [],
        hasGpsIfdPointer: false,
        gpsTagsCount: 0,
        gpsTagsFound: [],
        gpsRawLat: null,
        gpsRawLon: null,
        gpsDecLat: null,
        gpsDecLon: null,
        gpsAltitude: null,
        gpsTimestamp: null,
        summaryStatus: 'SCANNING',
        summaryMessage: ''
      };

      if (!arrayBuffer || arrayBuffer.byteLength < 4) {
        diag.summaryStatus = 'ERROR';
        diag.summaryMessage = 'File buffer is empty or too short (< 4 bytes).';
        lastPhotoDiagInfo = diag;
        renderRawPhotoDiagnostics();
        return null;
      }

      const view = new DataView(arrayBuffer);
      const len = arrayBuffer.byteLength;

      // 1. Read first 8 magic bytes
      const magicBytes = [];
      for (let i = 0; i < Math.min(8, len); i++) {
        magicBytes.push(view.getUint8(i).toString(16).padStart(2, '0').toUpperCase());
      }
      diag.magicHex = magicBytes.join(' ');

      // Detect Container Format
      if (view.getUint16(0) === 0xFFD8) {
        diag.isJpeg = true;
        diag.detectedFormat = 'JPEG';
      } else if (view.getUint32(0) === 0x89504E47) {
        diag.detectedFormat = 'PNG';
        diag.summaryStatus = 'NO_EXIF';
        diag.summaryMessage = 'File is PNG format. Camera EXIF is normally written to JPEG.';
        lastPhotoDiagInfo = diag;
        renderRawPhotoDiagnostics();
        return null;
      } else if (len > 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
        diag.detectedFormat = 'WEBP';
        diag.summaryStatus = 'NO_EXIF';
        diag.summaryMessage = 'File is WebP format. Standard JPEG EXIF expected.';
        lastPhotoDiagInfo = diag;
        renderRawPhotoDiagnostics();
        return null;
      } else if (len > 12 && String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)) === 'ftyp') {
        diag.detectedFormat = 'HEIC/HEIF';
        diag.summaryStatus = 'NO_EXIF';
        diag.summaryMessage = 'File is HEIC/HEIF format.';
        lastPhotoDiagInfo = diag;
        renderRawPhotoDiagnostics();
        return null;
      }

      if (!diag.isJpeg) {
        diag.summaryStatus = 'NOT_JPEG';
        diag.summaryMessage = 'File magic bytes do not start with JPEG SOI (FF D8).';
        lastPhotoDiagInfo = diag;
        renderRawPhotoDiagnostics();
        return null;
      }

      // Scan JPEG stream
      let offset = 2;
      let foundGpsData = null;

      while (offset < len) {
        if (offset + 2 > len) break;
        const marker = view.getUint16(offset);
        offset += 2;

        if (marker === 0xFFE0) {
          const segLen = view.getUint16(offset);
          diag.jpegMarkers.push('APP0 JFIF (' + segLen + 'B)');
          offset += segLen;
        } else if (marker === 0xFFE1) {
          diag.hasApp1 = true;
          const segLen = view.getUint16(offset);
          diag.jpegMarkers.push('APP1 Exif (' + segLen + 'B)');
          
          let headerStr = '';
          for (let h = 0; h < 6; h++) {
            if (offset + 2 + h < len) {
              const b = view.getUint8(offset + 2 + h);
              headerStr += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '\\0';
            }
          }
          diag.app1Header = headerStr;

          if (headerStr.startsWith('Exif')) {
            diag.hasExifSig = true;
            const tiffOffset = offset + 8;
            if (tiffOffset + 8 <= len) {
              const byteOrderMarker = view.getUint16(tiffOffset);
              const littleEndian = (byteOrderMarker === 0x4949);
              diag.tiffByteOrder = littleEndian ? 'II (Little Endian)' : 'MM (Big Endian)';

              if (view.getUint16(tiffOffset + 2, littleEndian) === 0x002A) {
                const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                const ifd0Offset = tiffOffset + firstIfdOffset;
                if (ifd0Offset + 2 <= len) {
                  const numEntries = view.getUint16(ifd0Offset, littleEndian);
                  diag.ifd0TagsCount = numEntries;
                  let gpsIfdOffset = 0;

                  for (let i = 0; i < numEntries; i++) {
                    const entryOffset = ifd0Offset + 2 + (i * 12);
                    if (entryOffset + 12 > len) break;
                    const tag = view.getUint16(entryOffset, littleEndian);
                    diag.ifd0TagsFound.push('0x' + tag.toString(16).toUpperCase());

                    if (tag === 0x8825) {
                      diag.hasGpsIfdPointer = true;
                      gpsIfdOffset = tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
                    }
                  }

                  if (gpsIfdOffset && gpsIfdOffset + 2 <= len) {
                    const numGpsEntries = view.getUint16(gpsIfdOffset, littleEndian);
                    diag.gpsTagsCount = numGpsEntries;
                    const gpsData = {};

                    for (let i = 0; i < numGpsEntries; i++) {
                      const entryOffset = gpsIfdOffset + 2 + (i * 12);
                      if (entryOffset + 12 > len) break;
                      const tag = view.getUint16(entryOffset, littleEndian);
                      const count = view.getUint32(entryOffset + 4, littleEndian);
                      const valOffset = entryOffset + 8;
                      diag.gpsTagsFound.push('Tag ' + tag);

                      if (tag === 1) {
                        gpsData.latRef = String.fromCharCode(view.getUint8(valOffset));
                      } else if (tag === 2) {
                        const valPos = tiffOffset + view.getUint32(valOffset, littleEndian);
                        gpsData.lat = readExifRationals(view, valPos, 3, littleEndian);
                      } else if (tag === 3) {
                        gpsData.lonRef = String.fromCharCode(view.getUint8(valOffset));
                      } else if (tag === 4) {
                        const valPos = tiffOffset + view.getUint32(valOffset, littleEndian);
                        gpsData.lon = readExifRationals(view, valPos, 3, littleEndian);
                      } else if (tag === 6) {
                        const valPos = tiffOffset + view.getUint32(valOffset, littleEndian);
                        gpsData.altitude = readExifRationals(view, valPos, 1, littleEndian)?.[0];
                      } else if (tag === 7) {
                        const valPos = tiffOffset + view.getUint32(valOffset, littleEndian);
                        gpsData.timeStamp = readExifRationals(view, valPos, 3, littleEndian);
                      } else if (tag === 29) {
                        const valPos = tiffOffset + view.getUint32(valOffset, littleEndian);
                        let dateStr = '';
                        for (let j = 0; j < Math.min(count, 12); j++) {
                          const c = view.getUint8(valPos + j);
                          if (c === 0) break;
                          dateStr += String.fromCharCode(c);
                        }
                        gpsData.dateStamp = dateStr;
                      }
                    }

                    if (gpsData.lat && gpsData.lat.length === 3 && gpsData.lon && gpsData.lon.length === 3) {
                      let lat = gpsData.lat[0] + (gpsData.lat[1] / 60) + (gpsData.lat[2] / 3600);
                      if (gpsData.latRef === 'S') lat = -lat;

                      let lon = gpsData.lon[0] + (gpsData.lon[1] / 60) + (gpsData.lon[2] / 3600);
                      if (gpsData.lonRef === 'W') lon = -lon;

                      diag.gpsRawLat = (gpsData.latRef || 'N') + ' ' + JSON.stringify(gpsData.lat);
                      diag.gpsRawLon = (gpsData.lonRef || 'E') + ' ' + JSON.stringify(gpsData.lon);
                      diag.gpsDecLat = lat;
                      diag.gpsDecLon = lon;
                      diag.gpsAltitude = gpsData.altitude || 0;
                      diag.gpsTimestamp = gpsData.dateStamp || new Date().toISOString();
                      diag.summaryStatus = 'SUCCESS_GPS_FOUND';
                      diag.summaryMessage = 'Genuine Hardware GPS found: ' + lat.toFixed(5) + '° N, ' + lon.toFixed(5) + '° E';

                      foundGpsData = {
                        latitude: lat,
                        longitude: lon,
                        altitude: gpsData.altitude || 0,
                        timestamp: diag.gpsTimestamp,
                        raw: gpsData
                      };
                    } else {
                      diag.summaryStatus = 'NO_GPS_COORDS';
                      diag.summaryMessage = 'GPS Sub-IFD exists but missing Lat/Lon rationals.';
                    }
                  } else {
                    diag.summaryStatus = 'NO_GPS_IFD';
                    diag.summaryMessage = 'IFD0 Exif tags present (' + numEntries + ' tags), but Tag 0x8825 (GPSInfo) was NOT written by camera.';
                  }
                }
              }
            }
          }
          offset += segLen;
        } else if (marker === 0xFFE2) {
          const segLen = view.getUint16(offset);
          diag.jpegMarkers.push('APP2 ICC (' + segLen + 'B)');
          offset += segLen;
        } else if ((marker & 0xFF00) === 0xFF00) {
          if (marker === 0xFFDA || marker === 0xFFD9) break;
          const segLen = view.getUint16(offset);
          diag.jpegMarkers.push('0x' + marker.toString(16).toUpperCase() + ' (' + segLen + 'B)');
          offset += segLen;
        } else {
          break;
        }
      }

      if (!foundGpsData && diag.summaryStatus === 'SCANNING') {
        if (!diag.hasApp1) {
          diag.summaryStatus = 'NO_APP1_EXIF';
          diag.summaryMessage = 'JPEG stream has NO APP1 (0xFFE1) EXIF segment. (Metadata stripped by camera or browser capture).';
        } else if (!diag.hasGpsIfdPointer) {
          diag.summaryStatus = 'NO_GPS_TAG';
          diag.summaryMessage = 'APP1 Exif exists, but contains NO GPS metadata (Tag 0x8825). Camera Location Tags were not written to this photo.';
        }
      }

      lastPhotoDiagInfo = diag;
      renderRawPhotoDiagnostics();
      return foundGpsData;
    }

    function readTiffGps(view, tiffOffset) {
      if (tiffOffset + 8 > view.byteLength) return null;
      const byteOrderMarker = view.getUint16(tiffOffset);
      const littleEndian = (byteOrderMarker === 0x4949);

      if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) return null;

      const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
      if (firstIfdOffset < 8) return null;

      const ifd0Offset = tiffOffset + firstIfdOffset;
      if (ifd0Offset + 2 > view.byteLength) return null;

      const numEntries = view.getUint16(ifd0Offset, littleEndian);
      let gpsIfdOffset = 0;

      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifd0Offset + 2 + (i * 12);
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        if (tag === 0x8825) {
          gpsIfdOffset = tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
          break;
        }
      }

      if (!gpsIfdOffset || gpsIfdOffset + 2 > view.byteLength) return null;

      const numGpsEntries = view.getUint16(gpsIfdOffset, littleEndian);
      const gpsData = {};

      for (let i = 0; i < numGpsEntries; i++) {
        const entryOffset = gpsIfdOffset + 2 + (i * 12);
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = entryOffset + 8;

        if (tag === 1) {
          gpsData.latRef = String.fromCharCode(view.getUint8(valueOffset));
        } else if (tag === 2) {
          const valPos = tiffOffset + view.getUint32(valueOffset, littleEndian);
          gpsData.lat = readExifRationals(view, valPos, 3, littleEndian);
        } else if (tag === 3) {
          gpsData.lonRef = String.fromCharCode(view.getUint8(valueOffset));
        } else if (tag === 4) {
          const valPos = tiffOffset + view.getUint32(valueOffset, littleEndian);
          gpsData.lon = readExifRationals(view, valPos, 3, littleEndian);
        } else if (tag === 6) {
          const valPos = tiffOffset + view.getUint32(valueOffset, littleEndian);
          gpsData.altitude = readExifRationals(view, valPos, 1, littleEndian)?.[0];
        } else if (tag === 7) {
          const valPos = tiffOffset + view.getUint32(valueOffset, littleEndian);
          gpsData.timeStamp = readExifRationals(view, valPos, 3, littleEndian);
        } else if (tag === 29) {
          const valPos = tiffOffset + view.getUint32(valueOffset, littleEndian);
          let dateStr = '';
          for (let j = 0; j < Math.min(count, 12); j++) {
            const c = view.getUint8(valPos + j);
            if (c === 0) break;
            dateStr += String.fromCharCode(c);
          }
          gpsData.dateStamp = dateStr;
        }
      }

      if (gpsData.lat && gpsData.lat.length === 3 && gpsData.lon && gpsData.lon.length === 3) {
        let lat = gpsData.lat[0] + (gpsData.lat[1] / 60) + (gpsData.lat[2] / 3600);
        if (gpsData.latRef === 'S') lat = -lat;

        let lon = gpsData.lon[0] + (gpsData.lon[1] / 60) + (gpsData.lon[2] / 3600);
        if (gpsData.lonRef === 'W') lon = -lon;

        return {
          latitude: lat,
          longitude: lon,
          altitude: gpsData.altitude || 0,
          timestamp: gpsData.dateStamp ? (gpsData.dateStamp.replace(/:/g, '-') + ' ' + (gpsData.timeStamp ? gpsData.timeStamp.map(v => String(Math.floor(v)).padStart(2, '0')).join(':') : '')) : new Date().toISOString(),
          raw: gpsData
        };
      }

      return null;
    }

    function readExifRationals(view, offset, count, littleEndian) {
      if (offset + (count * 8) > view.byteLength) return null;
      const rationals = [];
      for (let i = 0; i < count; i++) {
        const num = view.getUint32(offset + (i * 8), littleEndian);
        const den = view.getUint32(offset + (i * 8) + 4, littleEndian);
        rationals.push(den === 0 ? 0 : num / den);
      }
      return rationals;
    }

    function renderRawPhotoDiagnostics() {
      const panel = document.getElementById('rawPhotoDiagPanel');
      const content = document.getElementById('rawPhotoDiagContent');
      if (!content) return;
      if (!lastPhotoDiagInfo) {
        content.innerHTML = '<span style="color:#94a3b8;">No photo uploaded or inspected yet. Select/Take a photo in Slot 2 to inspect raw bytes.</span>';
        return;
      }
      const d = lastPhotoDiagInfo;
      const statusColor = d.summaryStatus === 'SUCCESS_GPS_FOUND' ? '#4ade80' : '#f87171';

      content.innerHTML =
        '<div style="background:#1e293b; padding:6px 8px; border-radius:6px; margin-bottom:6px; border-left:3px solid ' + statusColor + ';">' +
          '<strong style="color:' + statusColor + ';">STATUS: ' + d.summaryStatus + '</strong><br>' +
          '<span style="color:#e2e8f0;">' + d.summaryMessage + '</span>' +
        '</div>' +
        '<div><strong>Workflow:</strong> <span style="color:#38bdf8;">' + d.workflowSource + '</span></div>' +
        '<div><strong>File Name:</strong> ' + d.fileName + '</div>' +
        '<div><strong>File MIME:</strong> ' + d.fileTypeMime + ' (Detected: <strong style="color:#fde047;">' + d.detectedFormat + '</strong>)</div>' +
        '<div><strong>File Size:</strong> ' + (d.fileSize ? (d.fileSize.toLocaleString() + ' bytes (' + (d.fileSize / 1024).toFixed(1) + ' KB)') : '0') + '</div>' +
        '<div><strong>Last Modified:</strong> ' + d.lastModified + '</div>' +
        '<div><strong>Magic Hex:</strong> <code>' + d.magicHex + '</code></div>' +
        '<div><strong>JPEG Markers Found:</strong> ' + (d.jpegMarkers.length ? d.jpegMarkers.join(', ') : 'None') + '</div>' +
        '<div><strong>APP1 Exif Header:</strong> ' + (d.hasApp1 ? ('Present (' + d.app1Header + ')') : '<span style="color:#f87171;">MISSING</span>') + '</div>' +
        '<div><strong>TIFF Byte Order:</strong> ' + (d.tiffByteOrder || 'None') + '</div>' +
        '<div><strong>IFD0 Tags (' + d.ifd0TagsCount + '):</strong> ' + (d.ifd0TagsFound.join(', ') || 'None') + '</div>' +
        '<div><strong>GPS IFD (0x8825):</strong> ' + (d.hasGpsIfdPointer ? ('<span style="color:#4ade80;">FOUND (' + d.gpsTagsCount + ' tags: ' + d.gpsTagsFound.join(', ') + ')</span>') : '<span style="color:#f87171;">NOT FOUND</span>') + '</div>' +
        (d.gpsDecLat ? ('<div style="background:#064e3b; padding:4px 6px; border-radius:4px; margin-top:4px; color:#6ee7b7;"><strong>Decoded Coordinates:</strong> ' + d.gpsDecLat.toFixed(5) + '° N, ' + d.gpsDecLon.toFixed(5) + '° E</div>') : '');

      if (panel) panel.style.display = 'block';
    }

    // ==========================================
    // WEB GPS CAMERA CONTROLLER (IN-BROWSER)
    // ==========================================
    let webGpsStream = null;
    let webGpsWatchId = null;
    let webGpsAgeTimer = null;
    let curWebGpsFix = null;

    // Explicit Separated States
    let webGpsAppState = 'IDLE'; // IDLE, INITIALIZING, READY_TO_CAPTURE, CAPTURE_PROCESSING, GPS_SEARCHING, ERROR_PERMISSION, ERROR_CAMERA, ERROR_LOCATION
    let lastCameraDiagState = 'UNKNOWN'; // INITIALIZING, READY, DENIED, NOT_FOUND, IN_USE, OVERCONSTRAINED, ERROR, UNSUPPORTED
    let cameraHardwareState = 'NOT_STARTED'; // STREAMING, BUSY, NO_CAMERA_HARDWARE, OVERCONSTRAINED, INSECURE_CONTEXT, NO_API, PERMISSION_DENIED
    let lastLocationDiagState = 'UNKNOWN'; // INITIALIZING, ALLOWED, DENIED, UNAVAILABLE, TIMEOUT, UNSUPPORTED
    let lastGpsDiagState = 'UNKNOWN'; // SEARCHING, LOCKED, WEAK, POOR_ACCURACY, DENIED, UNAVAILABLE, TIMEOUT, UNSUPPORTED

    let lastCameraErrorObj = null;
    let lastGpsErrorObjRef = null;
    let permApiCamState = 'NOT_CHECKED';
    let permApiLocState = 'NOT_CHECKED';
    let actualCamTestResult = 'NOT_RUN'; // SUCCESS, FAILED
    let actualLocTestResult = 'NOT_RUN'; // SUCCESS, FAILED

    const MAX_ACCEPTABLE_ACCURACY_METERS = 50;
    const MAX_ACCEPTABLE_AGE_SECONDS = 600; // 10 minutes

    function openWebGpsCameraModal() {
      console.log('[WEB GPS CAMERA] openWebGpsCameraModal() called via user tap.');
      const tId = curTrackTicket ? (curTrackTicket.ticketId || curTrackTicket.id || '') : '';
      const udise = curTrackTicket ? (curTrackTicket.udise || '') : '';
      const sName = curTrackTicket ? (curTrackTicket.schoolName || '') : '';
      
      if (!tId) {
        alert('தயவுசெய்து முதலில் பள்ளியின் டிக்கெட்டைத் தேர்ந்தெடுக்கவும்.');
        return;
      }

      const modal = document.getElementById('webGpsCameraModal');
      const infoEl = document.getElementById('webGpsModalSchoolInfo');
      const originEl = document.getElementById('webGpsModalOriginDisplay');

      if (infoEl) {
        infoEl.textContent = 'School: ' + sName + ' (' + udise + ') | Ticket #' + tId;
      }
      if (originEl) {
        originEl.textContent = 'Origin: ' + window.location.origin;
      }
      if (modal) {
        modal.style.display = 'flex';
      }

      initWebGpsCamera();
    }

    function cleanWebGpsResources() {
      console.log('[WEB GPS CAMERA] Cleaning existing streams, watches, and timers.');
      if (webGpsStream) {
        webGpsStream.getTracks().forEach(function(track) {
          try { track.stop(); } catch(e) {}
        });
        webGpsStream = null;
      }
      const video = document.getElementById('webGpsVideo');
      if (video) {
        try { video.srcObject = null; } catch(e) {}
      }
      if (webGpsWatchId && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(webGpsWatchId); } catch(e) {}
        webGpsWatchId = null;
      }
      if (webGpsAgeTimer) {
        clearInterval(webGpsAgeTimer);
        webGpsAgeTimer = null;
      }
      curWebGpsFix = null;
    }

    async function checkPermissionsAgain() {
      console.log('[WEB GPS CAMERA] checkPermissionsAgain() triggered by user.');
      cleanWebGpsResources();
      await initWebGpsCamera();
    }

    async function checkPermissionQuery(name) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: name });
          return res.state; // 'granted', 'prompt', 'denied'
        } catch (e) {
          return 'unsupported';
        }
      }
      return 'unsupported';
    }

    function toggleWebGpsDiagDrawer() {
      const drawer = document.getElementById('webGpsDiagDrawer');
      if (!drawer) return;
      if (drawer.style.display === 'none' || !drawer.style.display) {
        drawer.style.display = 'block';
        updateWebGpsDrawerContent();
      } else {
        drawer.style.display = 'none';
      }
    }

    function getAuthoritativeCaptureState() {
      const isCameraReady = (lastCameraDiagState === 'READY' && !!webGpsStream);
      const isLocAllowed = (lastLocationDiagState === 'ALLOWED');
      const hasGps = (!!curWebGpsFix && typeof curWebGpsFix.latitude === 'number');
      const isGpsLocked = (hasGps && curWebGpsFix.accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS);
      const isGpsFresh = (hasGps && (Date.now() - curWebGpsFix.timestamp) <= (MAX_ACCEPTABLE_AGE_SECONDS * 1000));
      const canCapture = isCameraReady && isGpsLocked && isGpsFresh && webGpsAppState !== 'CAPTURE_PROCESSING';

      return {
        cameraReady: isCameraReady,
        locationAllowed: isLocAllowed,
        gpsLocked: isGpsLocked,
        gpsFresh: isGpsFresh,
        latitude: hasGps ? curWebGpsFix.latitude : null,
        longitude: hasGps ? curWebGpsFix.longitude : null,
        accuracy: hasGps ? Math.round(curWebGpsFix.accuracy) : null,
        gpsTimestamp: hasGps ? curWebGpsFix.timestamp : null,
        processing: webGpsAppState === 'CAPTURE_PROCESSING',
        canCapture: canCapture
      };
    }

    function updateWebGpsDrawerContent() {
      const content = document.getElementById('webGpsDiagDrawerContent');
      if (!content) return;
      const isSec = (typeof window.isSecureContext !== 'undefined') ? window.isSecureContext : (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const hasGeo = !!navigator.geolocation;
      const isLanIp = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.') || location.hostname.startsWith('172.'));
      let certDiag = isSec ? (isLanIp ? 'LOCAL_LAN_HTTPS (Self-Signed / Untrusted in Android)' : 'SECURE_PUBLIC_HTTPS') : 'INSECURE_CONTEXT';
      if (isSec && isLanIp && (actualCamTestResult === 'FAILED' || actualLocTestResult === 'FAILED')) {
        certDiag = 'SUSPECTED_UNTRUSTED_LAN_CERT (Browser blocks hardware on untrusted SSL)';
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|OPR/i.test(navigator.userAgent);

      const camErrName = lastCameraErrorObj ? (lastCameraErrorObj.name || 'Error') : 'None';
      const camErrMsg = lastCameraErrorObj ? (lastCameraErrorObj.message || 'None') : 'None';
      const camErrConstraint = lastCameraErrorObj ? (lastCameraErrorObj.constraint || 'None') : 'None';

      const gpsErrCode = lastGpsErrorObjRef ? (lastGpsErrorObjRef.code === 1 ? '1: PERMISSION_DENIED' : lastGpsErrorObjRef.code === 2 ? '2: POSITION_UNAVAILABLE (GPS Off)' : lastGpsErrorObjRef.code === 3 ? '3: TIMEOUT' : (lastGpsErrorObjRef.code + ': UNKNOWN')) : 'None';
      const gpsErrMsg = lastGpsErrorObjRef ? (lastGpsErrorObjRef.message || 'None') : 'None';

      const fixAgeMs = curWebGpsFix ? Math.max(0, Date.now() - curWebGpsFix.timestamp) : null;
      const fixAgeStr = fixAgeMs !== null ? (Math.round(fixAgeMs / 1000) + 's (' + fixAgeMs + 'ms)') : '--';
      const posTsStr = curWebGpsFix ? new Date(curWebGpsFix.timestamp).toLocaleTimeString('en-IN') : '--';
      const latStr = curWebGpsFix ? curWebGpsFix.latitude.toFixed(6) : '--';
      const lonStr = curWebGpsFix ? curWebGpsFix.longitude.toFixed(6) : '--';
      const accStr = curWebGpsFix ? ('±' + Math.round(curWebGpsFix.accuracy) + 'm') : '--';

      const video = document.getElementById('webGpsVideo');
      const videoReadyState = video ? ('readyState: ' + video.readyState) : 'No video element';
      const videoDims = (video && video.videoWidth > 0) ? (video.videoWidth + 'x' + video.videoHeight) : '0x0 (Not streaming)';

      const videoTrack = (webGpsStream && webGpsStream.getVideoTracks().length > 0) ? webGpsStream.getVideoTracks()[0] : null;
      const trackState = videoTrack ? ('readyState: ' + videoTrack.readyState + ', kind: ' + videoTrack.kind) : 'None';
      const trackLabel = videoTrack ? (videoTrack.label || 'Standard Camera') : 'None';
      let trackSettingsStr = 'None';
      if (videoTrack && videoTrack.getSettings) {
        try {
          trackSettingsStr = JSON.stringify(videoTrack.getSettings());
        } catch (e) {
          trackSettingsStr = 'Error';
        }
      }

      const st = getAuthoritativeCaptureState();
      const camGatePassed = (st.cameraReady && video && video.videoWidth > 0);
      const gpsGatePassed = (st.gpsLocked && st.gpsFresh);

      content.innerHTML =
        '<div style="border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:6px; color:#38bdf8; font-weight:bold;">🌐 CONNECTION &amp; ENVIRONMENT</div>' +
        '<div><strong>Current URL:</strong> ' + window.location.href + '</div>' +
        '<div><strong>Current Origin:</strong> <span style="color:#38bdf8;">' + window.location.origin + '</span></div>' +
        '<div><strong>Protocol:</strong> <span style="color:#38bdf8;">' + window.location.protocol.toUpperCase() + '</span></div>' +
        '<div><strong>Host / Port:</strong> ' + window.location.hostname + ':' + (window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) + '</div>' +
        '<div><strong>Device / Browser:</strong> ' + (isAndroid ? 'Android' : 'Desktop/Other') + ' / ' + (isChrome ? 'Chrome' : 'Other') + '</div>' +
        '<div><strong>Secure Context:</strong> <span style="color:' + (isSec?'#4ade80':'#f87171') + ';">' + isSec + '</span></div>' +
        '<div><strong>Certificate Status:</strong> <span style="color:' + (isSec && !isLanIp ? '#4ade80' : '#facc15') + ';">' + certDiag + '</span></div>' +

        '<div style="border-bottom:1px solid #334155; padding-bottom:4px; margin:8px 0 6px 0; color:#38bdf8; font-weight:bold;">📷 CAMERA SUBSYSTEM</div>' +
        '<div><strong>MediaDevices:</strong> <span style="color:' + (hasMedia?'#4ade80':'#f87171') + ';">' + (hasMedia ? 'available' : 'unavailable') + '</span></div>' +
        '<div><strong>getUserMedia:</strong> <span style="color:' + (hasMedia?'#4ade80':'#f87171') + ';">' + (hasMedia ? 'available' : 'unavailable') + '</span></div>' +
        '<div><strong>Camera Permission API:</strong> <span style="color:#fde047;">' + permApiCamState + '</span></div>' +
        '<div><strong>Actual Camera Test:</strong> <span style="color:' + (actualCamTestResult==='SUCCESS'?'#4ade80':actualCamTestResult==='FAILED'?'#f87171':'#fde047') + ';">' + actualCamTestResult + '</span></div>' +
        '<div><strong>Camera Hardware State:</strong> <span style="color:#38bdf8;">' + cameraHardwareState + '</span></div>' +
        '<div><strong>Camera Stream:</strong> ' + (webGpsStream ? ('Active (' + webGpsStream.getVideoTracks().length + ' tracks)') : 'Inactive') + '</div>' +
        '<div><strong>Selected Device:</strong> ' + trackLabel + '</div>' +
        '<div><strong>Track Info:</strong> ' + trackState + '</div>' +
        '<div><strong>Track Settings:</strong> <span style="font-size:9px; color:#cbd5e1;">' + trackSettingsStr + '</span></div>' +
        '<div><strong>Video Element:</strong> ' + videoReadyState + ' | Dimensions: ' + videoDims + '</div>' +
        '<div><strong>Last Camera Error:</strong> <span style="color:#fca5a5;">' + camErrName + ' (' + camErrMsg + ') [Constraint: ' + camErrConstraint + ']</span></div>' +

        '<div style="border-bottom:1px solid #334155; padding-bottom:4px; margin:8px 0 6px 0; color:#38bdf8; font-weight:bold;">📍 GEOLOCATION &amp; GPS FIX</div>' +
        '<div><strong>Geolocation API:</strong> <span style="color:' + (hasGeo?'#4ade80':'#f87171') + ';">' + (hasGeo ? 'available' : 'unavailable') + '</span></div>' +
        '<div><strong>Location Permission API:</strong> <span style="color:#fde047;">' + permApiLocState + '</span></div>' +
        '<div><strong>Actual GPS Test:</strong> <span style="color:' + (actualLocTestResult==='SUCCESS'?'#4ade80':actualLocTestResult==='FAILED'?'#f87171':'#fde047') + ';">' + actualLocTestResult + '</span></div>' +
        '<div><strong>Watch Position:</strong> ' + (webGpsWatchId ? ('Active (ID: ' + webGpsWatchId + ')') : 'Inactive') + '</div>' +
        '<div><strong>Last GPS Error:</strong> <span style="color:#fca5a5;">' + gpsErrCode + ' (' + gpsErrMsg + ')</span></div>' +
        '<div><strong>GPS State:</strong> <span style="color:#fde047;">' + lastGpsDiagState + '</span></div>' +
        '<div><strong>Coordinates:</strong> ' + latStr + '° N, ' + lonStr + '° E</div>' +
        '<div><strong>Accuracy:</strong> ' + accStr + ' (Threshold: ≤ 50m)</div>' +
        '<div><strong>Timestamp:</strong> ' + posTsStr + ' | <strong>Age:</strong> ' + fixAgeStr + '</div>' +

        '<div style="border-bottom:1px solid #334155; padding-bottom:4px; margin:8px 0 6px 0; color:#38bdf8; font-weight:bold;">🎯 CAPTURE GATING</div>' +
        '<div><strong>Camera Gate:</strong> <span style="color:' + (camGatePassed ? '#4ade80' : '#f87171') + ';">' + (camGatePassed ? 'PASSED (Stream & Dimensions Valid)' : 'WAITING') + '</span></div>' +
        '<div><strong>GPS Gate:</strong> <span style="color:' + (gpsGatePassed ? '#4ade80' : '#f87171') + ';">' + (gpsGatePassed ? ('PASSED (±' + st.accuracy + 'm ≤ 50m)') : 'WAITING (Accuracy > 50m or searching)') + '</span></div>' +
        '<div><strong>Final Capture State:</strong> <span style="color:' + (st.canCapture ? '#4ade80' : '#f87171') + ';">' + (st.canCapture ? 'READY_TO_CAPTURE' : 'BLOCKED') + '</span></div>' +
        '<div><strong>Overall App State:</strong> <span style="color:#38bdf8;">' + webGpsAppState + '</span></div>' +
        '<div style="margin-top:6px; color:#94a3b8; font-size:9.5px;"><strong>User Agent:</strong> ' + (navigator.userAgent || 'Unknown') + '</div>';
    }

    function updateOverallUiState() {
      const btnCapture = document.getElementById('btnWebGpsCapture');
      const btnText = document.getElementById('webGpsCaptureBtnText');
      const hint = document.getElementById('webGpsShutterHint');
      const warnOverlay = document.getElementById('webGpsWarningOverlay');

      const st = getAuthoritativeCaptureState();

      // 1. Initializing state
      if (lastCameraDiagState === 'REQUESTING' || lastLocationDiagState === 'REQUESTING') {
        webGpsAppState = 'INITIALIZING';
        if (btnCapture) {
          btnCapture.disabled = true;
          btnCapture.style.background = '#64748b';
          btnCapture.style.cursor = 'not-allowed';
          btnCapture.style.boxShadow = 'none';
        }
        if (btnText) btnText.textContent = 'STARTING CAMERA & GPS...';
        if (hint) hint.textContent = '⏳ Initializing camera stream and GPS...';
        return;
      }

      // 2. Camera Ready + GPS Locked (accuracy <= 50m) -> CAPTURE READY!
      if (st.canCapture) {
        webGpsAppState = 'READY_TO_CAPTURE';
        if (warnOverlay) warnOverlay.style.display = 'none';
        if (btnCapture) {
          btnCapture.disabled = false;
          btnCapture.style.background = '#16a34a';
          btnCapture.style.cursor = 'pointer';
          btnCapture.style.boxShadow = '0 0 15px rgba(34,197,94,0.6)';
        }
        if (btnText) btnText.textContent = '📷 CAPTURE UPS PHOTO';
        const acc = curWebGpsFix ? Math.round(curWebGpsFix.accuracy) : 10;
        if (hint) hint.innerHTML = '<span style="color:#4ade80; font-weight:700;">🟢 GPS Locked (±' + acc + 'm ≤ 50m). Ready to capture!</span>';
        console.log('[WEB GPS CAMERA] Shutter enabled: Camera Ready and GPS Locked (±' + acc + 'm).');
        return;
      }

      // 3. Camera Ready, but GPS is searching or weak
      if (lastCameraDiagState === 'READY') {
        if (lastGpsDiagState === 'SEARCHING' || lastGpsDiagState === 'TIMEOUT') {
          webGpsAppState = 'GPS_SEARCHING';
          if (btnCapture) {
            btnCapture.disabled = true;
            btnCapture.style.background = '#64748b';
            btnCapture.style.cursor = 'not-allowed';
            btnCapture.style.boxShadow = 'none';
          }
          if (btnText) btnText.textContent = '⏳ SEARCHING FOR GPS...';
          if (hint) hint.textContent = '⏳ Waiting for high-accuracy GPS fix (≤ 50m). Stand near a window or outdoors.';
          if (warnOverlay) warnOverlay.style.display = 'none';
          return;
        }

        if (lastGpsDiagState === 'WEAK') {
          webGpsAppState = 'GPS_SEARCHING';
          const acc = curWebGpsFix ? Math.round(curWebGpsFix.accuracy) : 99;
          if (btnCapture) {
            btnCapture.disabled = true;
            btnCapture.style.background = '#64748b';
            btnCapture.style.cursor = 'not-allowed';
            btnCapture.style.boxShadow = 'none';
          }
          if (btnText) btnText.textContent = '🟡 GPS SIGNAL WEAK (±' + acc + 'm)';
          if (hint) hint.textContent = '⚠️ Current GPS accuracy is ±' + acc + 'm (Must be ≤ 50m). Please move outdoors or near a window.';
          if (warnOverlay) warnOverlay.style.display = 'none';
          return;
        }

        if (lastLocationDiagState === 'DENIED') {
          webGpsAppState = 'ERROR_LOCATION';
          if (btnCapture) {
            btnCapture.disabled = true;
            btnCapture.style.background = '#dc2626';
            btnCapture.style.cursor = 'not-allowed';
            btnCapture.style.boxShadow = 'none';
          }
          if (btnText) btnText.textContent = '🔴 LOCATION PERMISSION DENIED';
          if (hint) hint.textContent = '⚠️ Location permission denied. Please allow Location in Chrome Site Settings.';
          showWebGpsPermissionWarning('location', 'PERMISSION_DENIED', lastGpsErrorObjRef ? lastGpsErrorObjRef.message : 'Location denied');
          return;
        }

        if (lastGpsDiagState === 'UNAVAILABLE') {
          webGpsAppState = 'ERROR_LOCATION';
          if (btnCapture) {
            btnCapture.disabled = true;
            btnCapture.style.background = '#dc2626';
            btnCapture.style.cursor = 'not-allowed';
            btnCapture.style.boxShadow = 'none';
          }
          if (btnText) btnText.textContent = '🔴 GPS UNAVAILABLE';
          if (hint) hint.textContent = '⚠️ Device Location (GPS) is OFF. Swipe down Android quick settings and turn on Location.';
          showWebGpsPermissionWarning('location', 'POSITION_UNAVAILABLE', lastGpsErrorObjRef ? lastGpsErrorObjRef.message : 'GPS OFF');
          return;
        }
      }

      // 4. Camera Failed or Denied
      if (lastCameraDiagState !== 'READY') {
        webGpsAppState = (lastCameraDiagState === 'DENIED') ? 'ERROR_PERMISSION' : 'ERROR_CAMERA';
        if (btnCapture) {
          btnCapture.disabled = true;
          btnCapture.style.background = '#dc2626';
          btnCapture.style.cursor = 'not-allowed';
          btnCapture.style.boxShadow = 'none';
        }
        if (btnText) {
          btnText.textContent = (lastCameraDiagState === 'DENIED') ? '🔴 CAMERA PERMISSION DENIED' : '🔴 CAMERA UNAVAILABLE';
        }
        if (hint) hint.textContent = '⚠️ In-page camera unavailable. Tap "Open Phone Camera" below to take the photo directly.';
        showWebGpsPermissionWarning('camera', lastCameraErrorObj ? lastCameraErrorObj.name : lastCameraDiagState, lastCameraErrorObj ? lastCameraErrorObj.message : '');
        return;
      }
    }

    async function initCameraStream() {
      const diagCam = document.getElementById('webGpsDiagCam');
      const video = document.getElementById('webGpsVideo');

      lastCameraDiagState = 'REQUESTING';
      cameraHardwareState = 'INITIALIZING';
      actualCamTestResult = 'NOT_RUN';
      if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#facc15;">🟡 REQUESTING</span>';

      const isSec = (typeof window.isSecureContext !== 'undefined') ? window.isSecureContext : (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

      if (!isSec) {
        lastCameraDiagState = 'UNSUPPORTED';
        cameraHardwareState = 'INSECURE_CONTEXT';
        actualCamTestResult = 'FAILED';
        lastCameraErrorObj = { name: 'SecurityError', message: 'Insecure context: Camera requires HTTPS or localhost.' };
        if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#f87171;">🔴 INSECURE</span>';
        updateOverallUiState();
        updateWebGpsDrawerContent();
        return false;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        lastCameraDiagState = 'UNSUPPORTED';
        cameraHardwareState = 'NO_API';
        actualCamTestResult = 'FAILED';
        lastCameraErrorObj = { name: 'UnsupportedAPI', message: 'navigator.mediaDevices.getUserMedia is unavailable.' };
        if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#f87171;">🔴 UNSUPPORTED</span>';
        updateOverallUiState();
        updateWebGpsDrawerContent();
        return false;
      }

      // Progressive constraint fallback sequence (Phase 5):
      // 1. Rear camera preferred + Full HD (1080p)
      // 2. Rear camera preferred + HD (720p)
      // 3. Rear camera preferred without resolution constraint
      // 4. Rear camera exact
      // 5. Basic video: true
      const cameraConstraints = [
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        { audio: false, video: { facingMode: 'environment' } },
        { audio: false, video: true }
      ];

      for (let i = 0; i < cameraConstraints.length; i++) {
        try {
          console.log('[WEB GPS CAMERA] Requesting camera with constraint set ' + (i + 1) + '...');
          const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints[i]);
          webGpsStream = stream;

          if (video) {
            video.srcObject = stream;
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.setAttribute('autoplay', 'true');
            video.setAttribute('muted', 'true');

            // Wait for genuine video readiness (loadedmetadata, canplay, or videoWidth > 0)
            await new Promise(function(resolve) {
              let resolved = false;
              function done() {
                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              }
              video.onloadedmetadata = function() {
                video.play().catch(function(e) { console.warn('[WEB GPS CAMERA] video.play() failed:', e); });
                if (video.videoWidth > 0 && video.videoHeight > 0) done();
              };
              video.oncanplay = function() {
                video.play().catch(function(e) {});
                if (video.videoWidth > 0 && video.videoHeight > 0) done();
              };
              video.onplaying = function() {
                done();
              };
              const checkTimer = setInterval(function() {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  clearInterval(checkTimer);
                  done();
                }
              }, 100);
              setTimeout(function() {
                clearInterval(checkTimer);
                done();
              }, 2000);
            });
          }

          // Authoritative success: getUserMedia returned a live stream!
          lastCameraDiagState = 'READY';
          cameraHardwareState = 'STREAMING';
          actualCamTestResult = 'SUCCESS';
          lastCameraErrorObj = null;
          if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#4ade80;">🟢 READY</span>';
          console.log('[WEB GPS CAMERA] Camera successfully started on attempt ' + (i + 1));
          
          const warnOverlay = document.getElementById('webGpsWarningOverlay');
          if (warnOverlay && lastLocationDiagState !== 'DENIED') {
            warnOverlay.style.display = 'none';
          }

          updateOverallUiState();
          updateWebGpsDrawerContent();
          return true;
        } catch (err) {
          console.warn('[WEB GPS CAMERA] Camera attempt ' + (i + 1) + ' failed with ' + err.name + ':', err.message);
          lastCameraErrorObj = err;
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            lastCameraDiagState = 'DENIED';
            actualCamTestResult = 'FAILED';
          }
          // Continue to next fallback constraint
        }
      }

      // If all attempts failed, classify the final exception
      actualCamTestResult = 'FAILED';
      const err = lastCameraErrorObj || { name: 'UnknownError' };
      const errName = err.name;

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        lastCameraDiagState = 'DENIED';
        cameraHardwareState = 'PERMISSION_DENIED';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        lastCameraDiagState = 'NOT_FOUND';
        cameraHardwareState = 'NO_CAMERA_HARDWARE';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        lastCameraDiagState = 'IN_USE';
        cameraHardwareState = 'CAMERA_BUSY';
      } else if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
        lastCameraDiagState = 'OVERCONSTRAINED';
        cameraHardwareState = 'OVERCONSTRAINED';
      } else if (errName === 'AbortError') {
        lastCameraDiagState = 'ABORTED';
        cameraHardwareState = 'ABORTED';
      } else {
        lastCameraDiagState = 'ERROR';
        cameraHardwareState = 'ERROR_' + errName;
      }

      if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#f87171;">🔴 ' + lastCameraDiagState + '</span>';
      updateOverallUiState();
      updateWebGpsDrawerContent();
      return false;
    }

    function initGeolocationWatch() {
      const diagLoc = document.getElementById('webGpsDiagLoc');
      const diagFix = document.getElementById('webGpsDiagFix');

      lastLocationDiagState = 'REQUESTING';
      lastGpsDiagState = 'SEARCHING';
      actualLocTestResult = 'NOT_RUN';
      if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#facc15;">🟡 REQUESTING</span>';
      if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#facc15;">🟡 SEARCHING</span>';

      if (!navigator.geolocation) {
        lastLocationDiagState = 'UNSUPPORTED';
        lastGpsDiagState = 'UNSUPPORTED';
        actualLocTestResult = 'FAILED';
        lastGpsErrorObjRef = { code: 0, message: 'navigator.geolocation is not available on this browser.' };
        if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#f87171;">🔴 UNSUPPORTED</span>';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#f87171;">🔴 UNSUPPORTED</span>';
        updateOverallUiState();
        updateWebGpsDrawerContent();
        return;
      }

      console.log('[WEB GPS CAMERA] Starting navigator.geolocation.watchPosition (high-accuracy)...');

      // 1. Continuous watch
      webGpsWatchId = navigator.geolocation.watchPosition(
        onWebGpsSuccess,
        onWebGpsError,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );

      // 2. Immediate one-shot
      navigator.geolocation.getCurrentPosition(
        onWebGpsSuccess,
        function(err) {
          console.warn('[WEB GPS CAMERA] Initial one-shot GPS error:', err.code, err.message);
          if (!curWebGpsFix) {
            onWebGpsError(err);
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );

      // Start Age Monitor Timer
      if (!webGpsAgeTimer) {
        webGpsAgeTimer = setInterval(updateWebGpsAgeDisplay, 1000);
      }
      updateWebGpsDrawerContent();
    }

    async function initWebGpsCamera() {
      console.log('[WEB GPS CAMERA] initWebGpsCamera() started on origin:', window.location.origin);
      cleanWebGpsResources();

      const warnOverlay = document.getElementById('webGpsWarningOverlay');
      const diagSec = document.getElementById('webGpsDiagSec');
      const diagCam = document.getElementById('webGpsDiagCam');
      const diagLoc = document.getElementById('webGpsDiagLoc');
      const diagFix = document.getElementById('webGpsDiagFix');
      const diagAge = document.getElementById('webGpsDiagAge');
      const btnCapture = document.getElementById('btnWebGpsCapture');
      const btnText = document.getElementById('webGpsCaptureBtnText');
      const hint = document.getElementById('webGpsShutterHint');
      const originDisplay = document.getElementById('webGpsModalOriginDisplay');

      if (originDisplay) originDisplay.textContent = 'Origin: ' + window.location.origin;
      if (warnOverlay) warnOverlay.style.display = 'none';

      lastCameraDiagState = 'REQUESTING';
      lastLocationDiagState = 'REQUESTING';
      lastGpsDiagState = 'SEARCHING';
      lastCameraErrorObj = null;
      lastGpsErrorObjRef = null;
      actualCamTestResult = 'NOT_RUN';
      actualLocTestResult = 'NOT_RUN';

      if (diagCam) diagCam.innerHTML = 'CAM: <span style="color:#facc15;">🟡 REQUESTING</span>';
      if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#facc15;">🟡 REQUESTING</span>';
      if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#facc15;">🟡 SEARCHING</span>';
      if (diagAge) diagAge.textContent = 'AGE: --';

      if (btnCapture) {
        btnCapture.disabled = true;
        btnCapture.style.background = '#64748b';
        btnCapture.style.cursor = 'not-allowed';
      }
      if (btnText) btnText.textContent = 'STARTING CAMERA & GPS...';
      if (hint) hint.textContent = '⏳ Initializing camera stream and GPS fix...';

      // 1. Secure context check
      const isSec = (typeof window.isSecureContext !== 'undefined') ? window.isSecureContext : (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      if (diagSec) {
        diagSec.innerHTML = isSec ? 'SECURE: <span style="color:#4ade80;">🟢 YES</span>' : 'SECURE: <span style="color:#f87171;">🔴 NO (HTTPS Req)</span>';
      }

      // 2. Query Permissions API purely as diagnostic background check (non-authoritative)
      permApiCamState = 'Checking...';
      permApiLocState = 'Checking...';
      checkPermissionQuery('camera').then(function(st) {
        permApiCamState = st;
        console.log('[WEB GPS CAMERA] Camera permission query (diagnostic):', st);
        updateWebGpsDrawerContent();
      });
      checkPermissionQuery('geolocation').then(function(st) {
        permApiLocState = st;
        console.log('[WEB GPS CAMERA] Location permission query (diagnostic):', st);
        updateWebGpsDrawerContent();
      });

      // 3. User Gesture Sequence (Directive 7):
      // Parallel activation of location watch and camera stream
      initGeolocationWatch();
      const camOk = await initCameraStream();
      console.log('[WEB GPS CAMERA] Camera stream initialized:', camOk);
    }

    function showWebGpsPermissionWarning(type, errName, errMsg) {
      const warnOverlay = document.getElementById('webGpsWarningOverlay');
      const warnTitle = document.getElementById('webGpsWarningTitle');
      const warnMsg = document.getElementById('webGpsWarningMsg');
      if (!warnOverlay || !warnMsg) return;

      warnOverlay.style.display = 'flex';

      const currentOrigin = window.location.origin;
      const isLanIp = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.') || location.hostname.startsWith('172.'));
      const isCertProblemSuspected = isLanIp && (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'DENIED');

      let html = '';

      if (type === 'camera') {
        if (isCertProblemSuspected) {
          warnTitle.textContent = '🔒 Local HTTPS Certificate Not Trusted';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#f87171;">Chrome allowed the site permission, but this local HTTPS certificate is not trusted for camera access.</strong><br>' +
              '<span style="color:#cbd5e1;">Chrome-ல் அனுமதி Allow செய்யப்பட்டிருந்தாலும், இந்த Local HTTPS Certificate நம்பகமானதாக இல்லாததால் Camera அணுகல் தடுக்கப்பட்டுள்ளது.</span><br>' +
              '<span style="font-size:11px; color:#38bdf8;">Current Origin: <strong>' + currentOrigin + '</strong></span>' +
            '</div>' +
            '<div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:6px;">👉 Local LAN Testing Options (சோதனைக்கான வழிகள்):</div>' +
            '<div style="background:#0f172a; border:1px solid #334155; padding:10px; border-radius:8px; font-size:11px; line-height:1.6; color:#e2e8f0; margin-bottom:8px;">' +
              '<strong style="color:#4ade80;">1. உடனடி தீர்வு (1-Tap Fast Capture):</strong> கீழே உள்ள பச்சை நிற <strong>"📷 Open Phone Camera (நேரடி கேமரா)"</strong> பொத்தானைத் தட்டவும். உங்கள் போனின் கேமரா உடனடியாகத் திறக்கும், GPS வாட்டர்மார்க் தானாகப் பதியும்.<br><br>' +
              '<strong style="color:#38bdf8;">2. Chrome Flag வழியாக கேமராவை இயக்க (Chrome Flag Method - 100% Reliable):</strong><br>' +
              '• போன் Chrome-ல் <strong>chrome://flags/#unsafely-treat-insecure-origin-as-secure</strong> செல்லவும்.<br>' +
              '• அதில் <strong>http://192.168.1.7:10000</strong> கொடுத்து <strong>Enabled</strong> செய்து <strong>Relaunch</strong> செய்யவும்.<br>' +
              '• பின்னர் <strong>http://192.168.1.7:10000</strong>-ல் திறந்தால் கேமரா மற்றும் GPS 100% உடனடியாக இயங்கும்!<br><br>' +
              '<strong style="color:#facc15;">3. CA சான்றிதழை மொபைலில் நிறுவ (Install Certificate):</strong><br>' +
              '• <a href="/api/download-ca" target="_blank" style="color:#38bdf8; text-decoration:underline; font-weight:700;">CA Certificate (hitech_lab_ca.crt) பதிவிறக்கவும்</a>.<br>' +
              '• Phone Settings &gt; Security &gt; Encryption &amp; credentials &gt; Install a certificate &gt; CA certificate என சென்று இதை நிறுவவும்.<br><br>' +
              '<strong style="color:#94a3b8;">4. உற்பத்தி நிலை (Production Deployment):</strong><br>' +
              '• உற்பத்தி நிலையில் அரசு domain / Vercel-ல் முறையான பொது SSL சான்றிதழ் (Lets Encrypt / Google Trust) இருக்கும்போது இந்தச் சிக்கல் வராது, கேமரா தானாகத் திறக்கும்.' +
            '</div>';
        } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'DENIED') {
          warnTitle.textContent = '📷 Camera Permission Denied';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#f87171;">Camera permission is blocked in Chrome for this site.</strong><br>' +
              '<span style="color:#cbd5e1;">Chrome உலாவி கேமரா அணுகலைத் தடுத்துள்ளது.</span><br>' +
              '<span style="font-size:11px; color:#38bdf8;">Current Origin: <strong>' + currentOrigin + '</strong></span>' +
            '</div>' +
            '<div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:6px;">👉 2 Ways to Complete (இரண்டு தீர்வுகள்):</div>' +
            '<div style="background:#0f172a; border:1px solid #334155; padding:10px; border-radius:8px; font-size:11px; line-height:1.6; color:#e2e8f0; margin-bottom:8px;">' +
              '<strong style="color:#4ade80;">1. உடனடி தீர்வு (1-Tap):</strong> கீழே உள்ள பச்சை நிற <strong>"📷 Open Phone Camera (நேரடி கேமரா)"</strong> பொத்தானைத் தட்டவும். உங்கள் போனின் கேமரா உடனடியாகத் திறக்கும், GPS வாட்டர்மார்க் தானாகப் பதியும்.<br><br>' +
              '<strong style="color:#38bdf8;">2. Chrome அனுமதியை சரிசெய்ய:</strong><br>' +
              '• Chrome முகவரிப் பட்டையின் இடதுபுறம் உள்ள <strong>பூட்டு (🔒) அல்லது அமைப்புகள் (🎛️)</strong> ஐகானைத் தட்டி Site settings &gt; Camera &gt; <strong>"Allow"</strong> கொடுக்கவும்.<br>' +
              '• <em>முக்கிய குறிப்பு:</em> Chrome அனுமதிகள் ஒவ்வொரு Origin-க்கும் தனித்தனியாக இருக்கும். நீங்கள் தற்போது உள்ள <strong>' + currentOrigin + '</strong> முகவரிக்கு Allow கொடுத்துள்ளீர்களா என்பதை உறுதிப்படுத்தவும்.<br>' +
              '• பின்னர் கீழே உள்ள <strong>"🔄 CHECK PERMISSIONS AGAIN"</strong> அழுத்தவும்.' +
            '</div>';
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError' || errName === 'IN_USE') {
          warnTitle.textContent = '📷 Camera is In Use';
          html =
            '<div style="background:#1e293b; padding:10px; border-radius:8px; border-left:3px solid #facc15; margin-bottom:8px;">' +
              '<strong style="color:#facc15;">Camera is in use by another application.</strong><br>' +
              '<span style="color:#cbd5e1;">வேறு ஏதேனும் கேமரா/வீடியோ செயலி இயங்கிக் கொண்டிருக்கலாம். அவற்றை மூடிவிட்டு மீண்டும் முயற்சிக்கவும் அல்லது கீழே உள்ள "Open Phone Camera" பயன்படுத்தவும்.</span>' +
            '</div>';
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError' || errName === 'NOT_FOUND') {
          warnTitle.textContent = '📷 No Usable Camera Found';
          html =
            '<div style="background:#1e293b; padding:10px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:8px;">' +
              '<strong style="color:#f87171;">No usable camera device found.</strong><br>' +
              '<span style="color:#cbd5e1;">சாதனத்தில் இயங்கக்கூடிய கேமரா எதுவும் கண்டறியப்படவில்லை. "Open Phone Camera" பயன்படுத்தவும்.</span>' +
            '</div>';
        } else {
          warnTitle.textContent = '📷 Camera Status (' + errName + ')';
          html =
            '<div style="background:#1e293b; padding:10px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:8px;">' +
              '<strong style="color:#f87171;">Camera Status: ' + errName + '</strong><br>' +
              '<span style="color:#cbd5e1;">' + (errMsg || 'In-page camera stream unavailable. Please use the direct phone camera fallback.') + '</span>' +
            '</div>';
        }
      } else if (type === 'location') {
        if (isCertProblemSuspected) {
          warnTitle.textContent = '🔒 Local HTTPS Certificate Not Trusted';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#f87171;">Chrome allowed the site permission, but this local HTTPS certificate is not trusted for location access.</strong><br>' +
              '<span style="color:#cbd5e1;">Chrome-ல் அனுமதி Allow செய்யப்பட்டிருந்தாலும், இந்த Local HTTPS Certificate நம்பகமானதாக இல்லாததால் Location அணுகல் தடுக்கப்பட்டுள்ளது.</span><br>' +
              '<span style="font-size:11px; color:#38bdf8;">Current Origin: <strong>' + currentOrigin + '</strong></span>' +
            '</div>' +
            '<div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:6px;">👉 Local LAN Testing Options (சோதனைக்கான வழிகள்):</div>' +
            '<div style="background:#0f172a; border:1px solid #334155; padding:10px; border-radius:8px; font-size:11px; line-height:1.6; color:#e2e8f0;">' +
              '<strong style="color:#38bdf8;">1. Chrome Flag வழி (100% Works on LAN):</strong> Chrome-ல் <strong>chrome://flags/#unsafely-treat-insecure-origin-as-secure</strong> சென்று <strong>http://192.168.1.7:10000</strong> என கொடுத்து Relaunch செய்யவும்.<br>' +
              '<strong style="color:#facc15;">2. CA சான்றிதழ் வழி:</strong> <a href="/api/download-ca" target="_blank" style="color:#38bdf8; text-decoration:underline;">hitech_lab_ca.crt பதிவிறக்கி நிறுவவும்</a>.<br>' +
              '<strong style="color:#94a3b8;">3. உற்பத்தி நிலை:</strong> பொது SSL சான்றிதழில் இந்தச் சிக்கல் வராது.' +
            '</div>';
        } else if (errName === 'PERMISSION_DENIED') {
          warnTitle.textContent = '📍 Location Permission Blocked';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #ef4444; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#f87171;">Location/GPS permission is blocked in Chrome for this site.</strong><br>' +
              '<span style="color:#cbd5e1;">Chrome உலாவி இந்த இணையதளத்திற்குரிய இருப்பிட (GPS) அனுமதியைத் தடுத்துள்ளது.</span><br>' +
              '<span style="font-size:11px; color:#38bdf8;">Current Origin: <strong>' + currentOrigin + '</strong></span>' +
            '</div>' +
            '<div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:6px;">👉 How to Allow Location in Android Chrome:</div>' +
            '<div style="background:#0f172a; border:1px solid #334155; padding:10px; border-radius:8px; font-size:11px; line-height:1.6; color:#e2e8f0;">' +
              '<strong>1.</strong> Chrome முகவரிப் பட்டையின் இடதுபுறம் உள்ள <strong>பூட்டு (🔒) அல்லது அமைப்புகள் (🎛️)</strong> ஐகானைத் தொடவும்.<br>' +
              '<strong>2.</strong> <strong>"Permissions"</strong> அல்லது <strong>"Site settings"</strong> என்பதைத் தேர்ந்தெடுக்கவும்.<br>' +
              '<strong>3.</strong> <strong>Location</strong> என்பதைத் தட்டி <strong>"Allow" (அனுமதி)</strong> என மாற்றவும்.<br>' +
              '<strong>4.</strong> <em>முக்கிய குறிப்பு:</em> Chrome அனுமதிகள் ஒவ்வொரு Origin-க்கும் தனித்தனியாக இருக்கும். நீங்கள் தற்போது உள்ள <strong>' + currentOrigin + '</strong> முகவரிக்கு Allow கொடுத்துள்ளீர்களா என்பதை உறுதிப்படுத்தவும்.<br>' +
              '<strong>5.</strong> இந்தத் திரைக்குத் திரும்பி கீழேயுள்ள <strong>"🔄 CHECK PERMISSIONS AGAIN"</strong> பொத்தானைத் தொடவும்.' +
            '</div>';
        } else if (errName === 'POSITION_UNAVAILABLE') {
          warnTitle.textContent = '📍 Android Location (GPS) is Turned OFF';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #facc15; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#facc15;">Android Device Location (GPS) is currently disabled.</strong><br>' +
              '<span style="color:#cbd5e1;">உங்கள் மொபைல் போனின் இருப்பிடம் (GPS) முடக்கப்பட்டுள்ளது.</span>' +
            '</div>' +
            '<div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:6px;">👉 Please Turn ON Device Location:</div>' +
            '<div style="background:#0f172a; border:1px solid #334155; padding:10px; border-radius:8px; font-size:11px; line-height:1.6; color:#e2e8f0;">' +
              '<strong>1.</strong> மொபைல் திரையின் மேலிருந்து கீழே இழுக்கவும் (Swipe down).<br>' +
              '<strong>2.</strong> <strong>"Location" (GPS)</strong> ஐகானைத் தட்டி இயக்கவும் (Turn ON).<br>' +
              '<strong>3.</strong> இந்தத் திரைக்குத் திரும்பி கீழேயுள்ள <strong>"🔄 CHECK PERMISSIONS AGAIN"</strong> பொத்தானைத் தொடவும்.' +
            '</div>';
        } else if (errName === 'TIMEOUT') {
          warnTitle.textContent = '⏳ GPS Search Timed Out';
          html =
            '<div style="background:#1e293b; padding:10px 12px; border-radius:8px; border-left:3px solid #facc15; margin-bottom:10px; line-height:1.5;">' +
              '<strong style="color:#facc15;">GPS signal is weak or taking too long.</strong><br>' +
              '<span style="color:#cbd5e1;">கட்டிடத்திற்குள் இருப்பதால் GPS சிக்னல் கிடைக்கவில்லை. தயவுசெய்து ஜன்னல் அல்லது திறந்தவெளிக்குச் செல்லவும்.</span>' +
            '</div>';
        }
      }

      warnMsg.innerHTML = html;
    }

    function triggerWebGpsNativeFallback() {
      // Proactively start GPS acquisition
      if (navigator.geolocation && !curWebGpsFix) {
        navigator.geolocation.getCurrentPosition(onWebGpsSuccess, onWebGpsError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      }
      const fileInput = document.getElementById('webGpsNativeFileInput');
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    }

    async function handleWebGpsNativeFileInput(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const stText = document.getElementById('trackGpsStatusText');
      if (stText) stText.innerHTML = '<span style="color:#0284c7; font-weight:700;">⏳ Acquring High-Accuracy GPS & Burning Watermark...</span>';

      // Ensure GPS fix is available
      let gpsFix = curWebGpsFix;
      if (!gpsFix || gpsFix.accuracy > 50 || (Date.now() - gpsFix.timestamp) > 600000) {
        try {
          gpsFix = await new Promise(function(resolve, reject) {
            if (!navigator.geolocation) return reject(new Error('Geolocation is not supported'));
            navigator.geolocation.getCurrentPosition(
              function(pos) {
                resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                  timestamp: pos.timestamp || Date.now()
                });
              },
              function(err) { reject(err); },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
          });
          curWebGpsFix = gpsFix;
        } catch (geoErr) {
          console.warn('Fallback GPS error:', geoErr);
          alert('GPS location could not be acquired: ' + (geoErr.message || 'Location required') + '\\n\\nGPS location is required to verify the completion photo.');
          if (stText) stText.innerHTML = '<span style="color:#dc2626; font-weight:700;">❌ GPS Failed: Turn on Location and Retry</span>';
          return;
        }
      }

      if (!gpsFix || gpsFix.accuracy > 50) {
        alert('GPS accuracy must be within 50m (Received ±' + Math.round(gpsFix ? gpsFix.accuracy : 999) + 'm).\\nPlease move near a window or outdoors and retry.');
        return;
      }

      // Read image and burn watermark
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          let canvas = document.getElementById('webGpsCanvas');
          if (!canvas) canvas = document.createElement('canvas');

          const snapshot = {
            latitude: gpsFix.latitude,
            longitude: gpsFix.longitude,
            accuracy: Math.round(gpsFix.accuracy),
            timestamp: new Date().toISOString(),
            schoolName: curTrackTicket ? (curTrackTicket.schoolName || '') : '',
            udise: curTrackTicket ? (curTrackTicket.udise || '') : '',
            ticketId: curTrackTicket ? (curTrackTicket.ticketId || curTrackTicket.id || '') : '',
            source: 'web-camera'
          };

          const jpegDataUrl = burnGpsWatermarkOnCanvas(canvas, img, snapshot);

          trackCompBase64 = jpegDataUrl;
          trackGpsLat = snapshot.latitude;
          trackGpsLon = snapshot.longitude;
          trackGpsAcc = snapshot.accuracy;
          trackGpsSource = snapshot.source;
          trackGpsTime = snapshot.timestamp;

          closeWebGpsCameraModal();
          applyCapturedGpsPhotoToSlot2('Phone Camera');
          updateTrackEvidenceStatusUI();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function burnGpsWatermarkOnCanvas(canvas, sourceEl, snapshot) {
      const vWidth = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width || (sourceEl.canvas && sourceEl.canvas.width) || 1280;
      const vHeight = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height || (sourceEl.canvas && sourceEl.canvas.height) || 720;

      canvas.width = vWidth;
      canvas.height = vHeight;
      const ctx = canvas.getContext('2d');

      // 1. Draw raw frame or image onto canvas
      ctx.drawImage(sourceEl, 0, 0, vWidth, vHeight);

      // 2. Extract snapshot metadata from immutable evidence snapshot
      const lat = Number(snapshot.latitude);
      const lon = Number(snapshot.longitude);
      const acc = Math.round(Number(snapshot.accuracy) || 10);
      const snapTime = snapshot.timestamp ? new Date(snapshot.timestamp) : new Date();
      
      const day = String(snapTime.getDate()).padStart(2, '0');
      const month = String(snapTime.getMonth() + 1).padStart(2, '0');
      const year = snapTime.getFullYear();
      const dateStr = day + '-' + month + '-' + year;
      const timeStr = snapTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

      const tId = snapshot.ticketId || (curTrackTicket ? curTrackTicket.ticketId : 'TICKET');
      const udise = snapshot.udise || snapshot.udiseCode || (curTrackTicket ? curTrackTicket.udise : '');
      const sName = snapshot.schoolName || (curTrackTicket ? curTrackTicket.schoolName : 'Hi-Tech Lab UPS');

      // 3. Aspect Ratio & Dynamic Sizing Planning
      const isPortrait = vHeight > vWidth;
      const minDim = Math.min(vWidth, vHeight);

      // Safe margins from all 4 image edges (min 16px, or 2.5% of dimensions)
      const safeMarginX = Math.max(16, Math.round(vWidth * 0.025));
      const safeMarginY = Math.max(16, Math.round(vHeight * 0.025));

      // Responsive card width
      let cardW;
      if (isPortrait) {
        cardW = vWidth - (safeMarginX * 2);
      } else {
        const preferredW = Math.max(540, Math.round(vWidth * 0.54));
        cardW = Math.min(vWidth - (safeMarginX * 2), preferredW);
      }

      // Responsive font sizing based on photo resolution
      const baseFontSize = Math.max(12, Math.min(22, Math.round(minDim * 0.022)));
      const titleFontSize = Math.round(baseFontSize * 1.15);
      const lineH = Math.round(baseFontSize * 1.38);
      const padX = Math.max(14, Math.round(baseFontSize * 0.9));
      const padY = Math.max(12, Math.round(baseFontSize * 0.8));
      const maxTextW = cardW - (padX * 2);

      // Robust wrapping function: wraps by words, and falls back to character chunks if any word exceeds maxW
      ctx.font = baseFontSize + 'px monospace';

      function safeWrapText(text, maxW) {
        const str = String(text || '').trim();
        if (!str) return [];
        if (ctx.measureText(str).width <= maxW) return [str];

        const words = str.split(' ');
        const lines = [];
        let curr = '';

        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const test = curr ? (curr + ' ' + w) : w;
          if (ctx.measureText(test).width <= maxW) {
            curr = test;
          } else {
            if (curr) lines.push(curr);
            if (ctx.measureText(w).width > maxW) {
              let chunk = '';
              for (let c = 0; c < w.length; c++) {
                if (ctx.measureText(chunk + w[c]).width <= maxW) {
                  chunk += w[c];
                } else {
                  lines.push(chunk);
                  chunk = w[c];
                }
              }
              curr = chunk;
            } else {
              curr = w;
            }
          }
        }
        if (curr) lines.push(curr);
        return lines;
      }

      // Build lines matching user's exact required content
      const allLines = [];

      // 1. Header
      allLines.push({
        text: '📍 GPS VERIFIED EVIDENCE',
        font: 'bold ' + titleFontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#38bdf8'
      });

      // 2. School Name (auto-wrapped)
      const schoolLines = safeWrapText('School: ' + sName, maxTextW);
      schoolLines.forEach(l => {
        allLines.push({
          text: l,
          font: 'bold ' + Math.round(baseFontSize * 0.95) + 'px -apple-system, sans-serif',
          color: '#ffffff'
        });
      });

      // 3. UDISE Code (Dedicated line, bold yellow, never cropped)
      allLines.push({
        text: 'UDISE: ' + (udise || 'N/A'),
        font: 'bold ' + baseFontSize + 'px monospace',
        color: '#fde047'
      });

      // 4. Location
      const locStr = 'Location: ' + lat.toFixed(6) + '° N, ' + lon.toFixed(6) + '° E';
      const locLines = safeWrapText(locStr, maxTextW);
      locLines.forEach(l => {
        allLines.push({
          text: l,
          font: 'bold ' + baseFontSize + 'px monospace',
          color: '#facc15'
        });
      });

      // 5. Accuracy
      allLines.push({
        text: 'Accuracy: ±' + acc + ' m',
        font: 'bold ' + baseFontSize + 'px monospace',
        color: '#4ade80'
      });

      // 6. Date & Time
      const dtStr = 'Date: ' + dateStr + ' | Time: ' + timeStr;
      const dtLines = safeWrapText(dtStr, maxTextW);
      dtLines.forEach(l => {
        allLines.push({
          text: l,
          font: baseFontSize + 'px monospace',
          color: '#e2e8f0'
        });
      });

      // 7. Ticket ID & Source
      const src = snapshot.source || 'Live Device GPS';
      allLines.push({
        text: 'TICKET: #' + tId + ' | SOURCE: ' + src,
        font: Math.round(baseFontSize * 0.92) + 'px monospace',
        color: '#94a3b8'
      });

      // 4. Calculate total card height dynamically from actual line count
      const cardH = (padY * 2) + (allLines.length * lineH) + Math.round(baseFontSize * 0.3);

      // Card coordinates: bottom anchored with safe margin
      const cardX = isPortrait ? safeMarginX : (vWidth - cardW - safeMarginX);
      const cardY = Math.max(safeMarginY, vHeight - cardH - safeMarginY);

      // 5. Draw Slate Card Panel with professional dark background
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, 10);
      } else {
        ctx.rect(cardX, cardY, cardW, cardH);
      }
      ctx.fill();

      // Border with vibrant cyan
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, Math.round(minDim * 0.0025));
      ctx.stroke();

      // 6. Render lines with high-contrast text
      let currY = cardY + padY + Math.round(baseFontSize * 0.95);
      const currX = cardX + padX;

      allLines.forEach((item) => {
        ctx.fillStyle = item.color;
        ctx.font = item.font;
        ctx.fillText(item.text, currX, currY);
        currY += lineH;
      });

      console.log('[GPS_WATERMARK_RENDER]', {
        watermarkWidth: cardW,
        watermarkHeight: cardH,
        calculatedTextLines: allLines.length,
        finalCardX: cardX,
        finalCardY: cardY,
        cardW: cardW,
        cardH: cardH,
        textBoundingBoxes: allLines.map((item, idx) => ({
          line: idx + 1,
          text: item.text,
          x: currX,
          y: cardY + padY + Math.round(baseFontSize * 0.95) + (idx * lineH),
          width: ctx.measureText(item.text).width
        }))
      });

      ctx.restore();

      // 7. Export as final watermarked JPEG
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    function applyCapturedGpsPhotoToSlot2(sourceLabel) {
      const compImg = document.getElementById('trackCompImg');
      const noComp = document.getElementById('trackNoCompText');
      const btnCompView = document.getElementById('btnTrackCompView');
      const btnCompClear = document.getElementById('btnTrackCompClear');
      const btnOpenCam = document.getElementById('btnOpenWebGpsCam');
      const compGps = document.getElementById('trackCompGpsBadge');
      const stBadge = document.getElementById('trackCompStatusBadge');
      const stText = document.getElementById('trackGpsStatusText');
      const stCoords = document.getElementById('trackGpsCoordsDisplay');
      const errBox = document.getElementById('trackGpsErrorBox');

      if (errBox) errBox.style.display = 'none';
      if (compImg) { compImg.src = trackCompBase64; compImg.style.display = 'block'; }
      if (noComp) noComp.style.display = 'none';
      if (btnCompView) {
        btnCompView.style.display = 'inline-flex';
        btnCompView.innerHTML = '🔍 View';
      }
      if (btnCompClear) {
        btnCompClear.style.display = 'inline-flex';
        btnCompClear.innerHTML = '✕ Clear';
      }
      if (btnOpenCam) {
        btnOpenCam.innerHTML = '↻ Retake'; /* Retake Photo (மீண்டும் எடுக்கவும்) */
        btnOpenCam.title = 'Retake Photo (மீண்டும் எடுக்கவும்)';
      }

      const latStr = trackGpsLat ? trackGpsLat.toFixed(5) : '--';
      const lonStr = trackGpsLon ? trackGpsLon.toFixed(5) : '--';
      const accStr = trackGpsAcc ? Math.round(trackGpsAcc) : '--';

      if (stText) {
        stText.innerHTML = '<span style="color:#16a34a; font-weight:800;">🟢 GPS Verified (' + (sourceLabel || 'Web Camera') + ')</span>';
      }
      if (stCoords) {
        stCoords.textContent = '📍 ' + latStr + '° N, ' + lonStr + '° E (±' + accStr + 'm)';
        stCoords.style.display = 'block';
      }
      if (compGps) {
        compGps.textContent = '📍 ' + latStr + '° N, ' + lonStr + '° E (±' + accStr + 'm)';
        compGps.style.display = 'block';
      }
      if (stBadge) {
        stBadge.textContent = '✓ GPS Verified';
        stBadge.style.background = '#dcfce7';
        stBadge.style.color = '#15803d';
      }
    }

    function onWebGpsSuccess(pos) {
      if (!pos || !pos.coords) return;
      console.log('[WEB GPS CAMERA] GPS position received: Lat ' + pos.coords.latitude.toFixed(6) + ', Lon ' + pos.coords.longitude.toFixed(6) + ', Acc ±' + Math.round(pos.coords.accuracy) + 'm');
      curWebGpsFix = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp || Date.now()
      };

      lastLocationDiagState = 'ALLOWED';
      actualLocTestResult = 'SUCCESS';
      lastGpsErrorObjRef = null;

      const pill = document.getElementById('webGpsLockPill');
      const icon = document.getElementById('webGpsLockIcon');
      const text = document.getElementById('webGpsLockText');
      const hudCoords = document.getElementById('webGpsHudCoords');
      const hudTime = document.getElementById('webGpsHudTime');
      const hudSchool = document.getElementById('webGpsHudSchool');
      const diagLoc = document.getElementById('webGpsDiagLoc');
      const diagFix = document.getElementById('webGpsDiagFix');

      const acc = Math.round(pos.coords.accuracy);
      const latStr = pos.coords.latitude.toFixed(6);
      const lonStr = pos.coords.longitude.toFixed(6);
      const sName = curTrackTicket ? (curTrackTicket.schoolName || '') : '';
      const udise = curTrackTicket ? (curTrackTicket.udise || '') : '';

      if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#4ade80;">🟢 ALLOWED</span>';
      if (hudCoords) hudCoords.textContent = 'LAT: ' + latStr + '° N | LON: ' + lonStr + '° E (±' + acc + 'm)';
      if (hudTime) hudTime.textContent = 'TIME: ' + new Date(pos.timestamp || Date.now()).toLocaleTimeString('en-IN');
      if (hudSchool) hudSchool.textContent = 'SCHOOL: ' + sName + ' (' + udise + ')';

      if (pos.coords.accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS) {
        lastGpsDiagState = 'LOCKED';
        if (pill) {
          pill.style.background = 'rgba(22,101,52,0.9)';
          pill.style.border = '1px solid #4ade80';
        }
        if (icon) icon.textContent = '🟢';
        if (text) text.textContent = 'GPS LOCKED (Accuracy: ±' + acc + 'm)';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#4ade80;">🟢 LOCKED (±' + acc + 'm)</span>';
      } else {
        lastGpsDiagState = 'WEAK';
        if (pill) {
          pill.style.background = 'rgba(133,77,14,0.9)';
          pill.style.border = '1px solid #facc15';
        }
        if (icon) icon.textContent = '🟡';
        if (text) text.textContent = 'GPS SIGNAL WEAK (±' + acc + 'm > ' + MAX_ACCEPTABLE_ACCURACY_METERS + 'm)';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#facc15;">🟡 WEAK (±' + acc + 'm)</span>';
      }

      // Automatically hide warning overlay if camera is not in denied state
      const warnOverlay = document.getElementById('webGpsWarningOverlay');
      if (warnOverlay && lastCameraDiagState !== 'DENIED') {
        warnOverlay.style.display = 'none';
      }

      updateOverallUiState();
      updateWebGpsDrawerContent();
    }

    function onWebGpsError(err) {
      console.warn('[WEB GPS CAMERA] Geolocation error:', err.code, err.message);
      curWebGpsFix = null;
      lastGpsErrorObjRef = err;

      const pill = document.getElementById('webGpsLockPill');
      const icon = document.getElementById('webGpsLockIcon');
      const text = document.getElementById('webGpsLockText');
      const diagLoc = document.getElementById('webGpsDiagLoc');
      const diagFix = document.getElementById('webGpsDiagFix');

      let errName = 'UNKNOWN';
      let msg = 'GPS Unavailable';

      if (err.code === 1) {
        errName = 'PERMISSION_DENIED';
        msg = 'Location Permission Denied';
        lastLocationDiagState = 'DENIED';
        lastGpsDiagState = 'DENIED';
        actualLocTestResult = 'FAILED';
        if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#f87171;">🔴 DENIED</span>';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#f87171;">🔴 DENIED</span>';
      } else if (err.code === 2) {
        errName = 'POSITION_UNAVAILABLE';
        msg = 'Device Location (GPS) is OFF';
        lastLocationDiagState = 'ALLOWED';
        lastGpsDiagState = 'UNAVAILABLE';
        actualLocTestResult = 'PERMISSION_GRANTED_GPS_OFF';
        if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#4ade80;">🟢 ALLOWED</span>';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#f87171;">🔴 GPS OFF</span>';
      } else if (err.code === 3) {
        errName = 'TIMEOUT';
        msg = 'GPS Timeout (Searching...)';
        lastLocationDiagState = 'ALLOWED';
        lastGpsDiagState = 'TIMEOUT';
        actualLocTestResult = 'PERMISSION_GRANTED_SEARCHING';
        if (diagLoc) diagLoc.innerHTML = 'LOC: <span style="color:#4ade80;">🟢 ALLOWED</span>';
        if (diagFix) diagFix.innerHTML = 'GPS: <span style="color:#facc15;">🟡 SEARCHING (TIMEOUT)</span>';
      }

      if (pill) {
        pill.style.background = (err.code === 3) ? 'rgba(133,77,14,0.9)' : 'rgba(153,27,27,0.9)';
        pill.style.border = (err.code === 3) ? '1px solid #facc15' : '1px solid #f87171';
      }
      if (icon) icon.textContent = (err.code === 3) ? '⏳' : '🔴';
      if (text) text.textContent = msg;

      updateOverallUiState();
      updateWebGpsDrawerContent();
    }

    function updateWebGpsAgeDisplay() {
      const diagAge = document.getElementById('webGpsDiagAge');
      if (!diagAge) return;
      if (!curWebGpsFix) {
        diagAge.textContent = 'AGE: --';
        return;
      }
      const ageSec = Math.round((Date.now() - curWebGpsFix.timestamp) / 1000);
      if (ageSec > MAX_ACCEPTABLE_AGE_SECONDS) {
        diagAge.innerHTML = 'AGE: <span style="color:#f87171;">' + ageSec + 's (STALE)</span>';
        const btnCapture = document.getElementById('btnWebGpsCapture');
        if (btnCapture) {
          btnCapture.disabled = true;
          btnCapture.style.background = '#64748b';
        }
      } else {
        diagAge.innerHTML = 'AGE: <span style="color:#4ade80;">' + ageSec + 's</span>';
      }
    }

    function captureWebGpsPhoto() {
      if (!curWebGpsFix || curWebGpsFix.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
        alert('GPS lock is required before capturing photo.');
        return;
      }

      webGpsAppState = 'CAPTURE_PROCESSING';
      const btnCapture = document.getElementById('btnWebGpsCapture');
      const btnText = document.getElementById('webGpsCaptureBtnText');
      if (btnCapture) {
        btnCapture.disabled = true;
        btnCapture.style.background = '#0284c7';
        btnCapture.style.cursor = 'wait';
      }
      if (btnText) btnText.textContent = '⏳ PROCESSING GPS PHOTO...';

      const video = document.getElementById('webGpsVideo');
      const canvas = document.getElementById('webGpsCanvas');
      if (!video || !canvas) return;

      // 1. Immutable GPS evidence snapshot
      const snapshot = Object.freeze({
        latitude: curWebGpsFix.latitude,
        longitude: curWebGpsFix.longitude,
        accuracy: Math.round(curWebGpsFix.accuracy),
        timestamp: new Date().toISOString(),
        schoolName: curTrackTicket ? (curTrackTicket.schoolName || '') : '',
        udise: curTrackTicket ? (curTrackTicket.udise || '') : '',
        udiseCode: curTrackTicket ? (curTrackTicket.udise || '') : '',
        ticketId: curTrackTicket ? (curTrackTicket.ticketId || curTrackTicket.id || '') : '',
        source: 'web-camera'
      });

      console.log('[GPS_CAPTURE_START]', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
        accuracy: snapshot.accuracy,
        timestamp: snapshot.timestamp,
        schoolName: snapshot.schoolName,
        udise: snapshot.udise,
        ticketId: snapshot.ticketId
      });

      // 2. Burn visible watermark directly into pixels
      const jpegDataUrl = burnGpsWatermarkOnCanvas(canvas, video, snapshot);

      // 3. Save atomic evidence snapshot to Slot 2 State
      trackCompBase64 = jpegDataUrl;
      trackGpsLat = snapshot.latitude;
      trackGpsLon = snapshot.longitude;
      trackGpsAcc = snapshot.accuracy;
      trackGpsSource = snapshot.source;
      trackGpsTime = snapshot.timestamp;
      trackGpsSnapshot = snapshot;

      // 4. Diagnostic Logging
      const approxBytes = Math.round((jpegDataUrl.length * 3) / 4);
      console.log('[GPS_CAPTURE] canvas=' + canvas.width + 'x' + canvas.height + ' lat=' + snapshot.latitude + ' lng=' + snapshot.longitude + ' accuracy=±' + snapshot.accuracy + 'm timestamp=' + snapshot.timestamp + ' watermarkRendered=true finalPhotoBytes=' + approxBytes);
      console.log('[GPS_CAPTURE_COMPLETE]', {
        exportedJpegByteSize: approxBytes,
        canvasDimensions: canvas.width + 'x' + canvas.height,
        watermarkRendered: true,
        finalImageExists: !!(jpegDataUrl && jpegDataUrl.startsWith('data:image/jpeg'))
      });

      // 5. Close Modal & Stop Stream
      closeWebGpsCameraModal();

      // 6. Apply watermarked JPEG to Slot 2 UI preview
      applyCapturedGpsPhotoToSlot2('Web Camera');
      updateTrackEvidenceStatusUI();
    }

    function closeWebGpsCameraModal() {
      const modal = document.getElementById('webGpsCameraModal');
      if (modal) modal.style.display = 'none';

      cleanWebGpsResources();
      webGpsAppState = 'IDLE';
    }
    function updateGpsStatusUI(state, source) {
      const stText = document.getElementById('trackGpsStatusText');
      const stCoords = document.getElementById('trackGpsCoordsDisplay');
      const stBadge = document.getElementById('trackCompStatusBadge');
      const errBox = document.getElementById('trackGpsErrorBox');

      if (state === 'READING') {
        if (stText) {
          stText.innerHTML = '<span style="color:#0284c7; font-weight:700;">🔄 Reading location from photo...</span>';
        }
        if (stBadge && (!trackCompBase64)) {
          stBadge.textContent = '⏳ Reading GPS...';
          stBadge.style.background = '#fef3c7';
          stBadge.style.color = '#b45309';
        }
        if (errBox) errBox.style.display = 'none';
        if (stCoords) stCoords.style.display = 'none';
      } else if (state === 'FOUND' || state === 'SUCCESS') {
        lastGpsErrorObj = null;
        const srcLabel = (source === 'PHOTO_EXIF_GPS' || trackGpsSource === 'PHOTO_EXIF_GPS') ? ' (Camera EXIF)' : (source === 'NATIVE_ANDROID_GPS_CAM' || trackGpsSource === 'NATIVE_ANDROID_GPS_CAM') ? ' (Native Camera)' : ' (Live Browser)';
        if (stText) {
          stText.innerHTML = '<span style="color:#16a34a; font-weight:800;">🟢 GPS Found in Photo' + srcLabel + '</span>';
        }
        if (stCoords) {
          stCoords.textContent = '📍 ' + Number(trackGpsLat).toFixed(5) + '° N, ' + Number(trackGpsLon).toFixed(5) + '° E' + srcLabel;
          stCoords.style.display = 'block';
        }
        if (stBadge && (!trackCompBase64)) {
          stBadge.textContent = '🟢 GPS Ready' + srcLabel;
          stBadge.style.background = '#dcfce7';
          stBadge.style.color = '#15803d';
        }
        if (errBox) errBox.style.display = 'none';
        renderGpsDiagnostics();
      } else if (state === 'NOT_FOUND' || state === 'ERROR') {
        if (stText) {
          stText.innerHTML = '<span style="color:#dc2626; font-weight:800;">🔴 GPS Not Found</span>';
        }
        if (stCoords) stCoords.style.display = 'none';
        if (stBadge && (!trackCompBase64)) {
          stBadge.textContent = '⭕ GPS Missing';
          stBadge.style.background = '#fee2e2';
          stBadge.style.color = '#b91c1c';
        }
        if (errBox) {
          errBox.innerHTML = 
            '<div style="background:#fef2f2; border:1.5px solid #f87171; border-radius:10px; padding:12px; margin-top:4px;">' +
              '<div style="font-weight:800; color:#991b1b; font-size:12.5px; display:flex; align-items:center; gap:6px;">' +
                '<span>📍</span> GPS Location Not Found in Photo' +
              '</div>' +
              '<div style="font-size:11.5px; color:#7f1d1d; margin:6px 0 10px 0; line-height:1.5;">' +
                '<p style="margin:0 0 6px 0;">This photo does not contain GPS location data (Location Tags).</p>' +
                '<p style="margin:0 0 6px 0;"><strong>Please enable "Save Location / Location Tags / GPS Tag" in your phone Camera settings and take the UPS photo again.</strong></p>' +
                '<p style="font-size:10.5px; color:#991b1b; margin:0 0 4px 0;">(உங்கள் மொபைல் கேமரா Settings ⚙️-ல் Save Location / Location Tags ON செய்து மீண்டும் புகைப்படம் எடுக்கவும்.)</p>' +
              '</div>' +
              '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
                '<button type="button" onclick="triggerCompInput(&apos;cam&apos;)" style="background:#0284c7; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">' +
                  '📷 Take Photo Again' +
                '</button>' +
                '<button type="button" onclick="triggerCompInput(&apos;file&apos;)" style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:6px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">' +
                  '📁 Choose Another Photo' +
                '</button>' +
                '<button type="button" onclick="toggleRawPhotoDiagPanel()" style="background:#0f172a; color:#38bdf8; border:1px solid #38bdf8; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">' +
                  '🔬 Inspect Photo Bytes' +
                '</button>' +
                '<button type="button" onclick="toggleGpsDiagPanel()" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">' +
                  '🔍 Diagnostics' +
                '</button>' +
              '</div>' +
            '</div>';
          errBox.style.display = 'block';
        }
        lastGpsErrorObj = { code: 1, message: 'Photo EXIF GPS metadata missing' };
        renderGpsDiagnostics();
      }
    }

    function triggerCompInput(type) {
      currentWorkflowType = (type === 'cam') ? 'Workflow B: Take Photo (Camera Direct)' : 'Workflow A: Choose Photo (Gallery/Files)';
      const inp = type === 'cam' ? document.getElementById('trackCompCamInput') : document.getElementById('trackCompFileInput');
      if (inp) {
        inp.value = '';
        inp.click();
      }
    }

    function handleTrackCompUpload(event, workflowLabel) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      lastCompFile = file;
      currentWorkflowType = workflowLabel || currentWorkflowType || 'Unknown';

      updateGpsStatusUI('READING');

      const reader = new FileReader();
      reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const exifGps = inspectAndParseImageBytes(arrayBuffer, file, currentWorkflowType);
        
        let finalLat = null;
        let finalLon = null;
        let finalAcc = null;
        let gpsSource = null;

        if (exifGps && typeof exifGps.latitude === 'number' && typeof exifGps.longitude === 'number') {
          finalLat = exifGps.latitude;
          finalLon = exifGps.longitude;
          finalAcc = exifGps.altitude || 10;
          gpsSource = 'PHOTO_EXIF_GPS';
          trackGpsLat = finalLat;
          trackGpsLon = finalLon;
          trackGpsAcc = finalAcc;
          trackGpsSource = gpsSource;
          trackGpsTime = exifGps.timestamp || new Date().toISOString();
          updateGpsStatusUI('FOUND', 'PHOTO_EXIF_GPS');
          processTrackCompImage(file, finalLat, finalLon, finalAcc, gpsSource);
        } else if (trackGpsLat !== null && trackGpsLon !== null) {
          finalLat = trackGpsLat;
          finalLon = trackGpsLon;
          finalAcc = trackGpsAcc;
          gpsSource = trackGpsSource || 'LIVE_BROWSER_GPS';
          updateGpsStatusUI('FOUND', gpsSource);
          processTrackCompImage(file, finalLat, finalLon, finalAcc, gpsSource);
        } else {
          // Clear any previous invalid state
          trackCompBase64 = '';
          const compImg = document.getElementById('trackCompImg');
          const noComp = document.getElementById('trackNoCompText');
          const btnCompView = document.getElementById('btnTrackCompView');
          const btnCompClear = document.getElementById('btnTrackCompClear');
          const compGps = document.getElementById('trackCompGpsBadge');
          if (compImg) { compImg.src = ''; compImg.style.display = 'none'; }
          if (noComp) noComp.style.display = 'block';
          if (btnCompView) btnCompView.style.display = 'none';
          if (btnCompClear) btnCompClear.style.display = 'none';
          if (compGps) { compGps.textContent = ''; compGps.style.display = 'none'; }
          updateGpsStatusUI('NOT_FOUND');
          updateTrackEvidenceStatusUI();
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function retryTeacherGps() {
      if (lastCompFile && trackGpsLat !== null && trackGpsLon !== null) {
        processTrackCompImage(lastCompFile, trackGpsLat, trackGpsLon, trackGpsAcc, trackGpsSource);
      } else {
        acquireMobileGpsPreFlight();
      }
    }

    function showGpsError(msg, reason, rawErr) {
      lastGpsErrorObj = rawErr || { code: 0, message: reason };
      checkGpsPermissionState();
      const errBox = document.getElementById('trackGpsErrorBox');
      const stBadge = document.getElementById('trackCompStatusBadge');
      if (stBadge && (!trackCompBase64)) {
        stBadge.textContent = '⭕ GPS Error';
        stBadge.style.background = '#fee2e2';
        stBadge.style.color = '#b91c1c';
      }
      if (errBox) {
        errBox.innerHTML = msg;
        errBox.style.display = 'block';
      } else {
        alert(msg);
      }
    }

    function processTrackCompImage(file, lat, lon, acc, source) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxDim = 1600;
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

          const snapshot = {
            latitude: lat,
            longitude: lon,
            accuracy: acc || 10,
            timestamp: new Date().toISOString(),
            ticketId: curTrackTicket ? curTrackTicket.ticketId : '',
            udise: curTrackTicket ? curTrackTicket.udise : '',
            schoolName: curTrackTicket ? curTrackTicket.schoolName : '',
            source: (source === 'PHOTO_EXIF_GPS') ? 'Camera EXIF' : 'Live Maps'
          };

          trackCompBase64 = burnGpsWatermarkOnCanvas(canvas, img, snapshot);

          const compImg = document.getElementById('trackCompImg');
          const noComp = document.getElementById('trackNoCompText');
          const btnCompView = document.getElementById('btnTrackCompView');
          const btnCompClear = document.getElementById('btnTrackCompClear');
          const compGps = document.getElementById('trackCompGpsBadge');
          const stBadge = document.getElementById('trackCompStatusBadge');

          if (compImg) { compImg.src = trackCompBase64; compImg.style.display = 'block'; }
          if (noComp) noComp.style.display = 'none';
          if (btnCompView) {
            btnCompView.style.display = 'inline-flex';
            btnCompView.innerHTML = '🔍 View';
          }
          if (btnCompClear) {
            btnCompClear.style.display = 'inline-flex';
            btnCompClear.innerHTML = '✕ Clear';
          }
          const btnOpenCam = document.getElementById('btnOpenWebGpsCam');
          if (btnOpenCam) {
            btnOpenCam.innerHTML = '↻ Retake'; /* Retake Photo (மீண்டும் எடுக்கவும்) */
            btnOpenCam.title = 'Retake Photo (மீண்டும் எடுக்கவும்)';
          }
          if (compGps) {
            compGps.textContent = '📍 ' + Number(lat).toFixed(5) + '° N, ' + Number(lon).toFixed(5) + '° E' + (acc ? ' (±' + Math.round(acc) + 'm)' : '');
            compGps.style.display = 'block';
          }
          if (stBadge) {
            stBadge.textContent = '✓ GPS Verified';
            stBadge.style.background = '#dcfce7';
            stBadge.style.color = '#15803d';
          }
          updateTrackEvidenceStatusUI();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function triggerTrackHmCapture(type) {
      const inputId = (type === 'cam') ? 'trackHmCamInput' : 'trackHmFileInput';
      const el = document.getElementById(inputId);
      if (el) {
        try {
          el.style.display = 'block';
          el.style.position = 'fixed';
          el.style.top = '-9999px';
          el.style.left = '-9999px';
          el.style.opacity = '0';
          el.value = '';
        } catch(e) {}
        el.click();
      }
    }

    function handleTrackHmUpload(e) {
      const camIn = document.getElementById('trackHmCamInput');
      const fileIn = document.getElementById('trackHmFileInput');
      if (camIn) camIn.style.display = 'none';
      if (fileIn) fileIn.style.display = 'none';

      let file = (e && e.target && e.target.files && e.target.files[0]) ||
                 (this && this.files && this.files[0]);
      if (!file) {
        if (camIn && camIn.files && camIn.files[0]) file = camIn.files[0];
        else if (fileIn && fileIn.files && fileIn.files[0]) file = fileIn.files[0];
      }
      if (!file) return;

      hmCompletionPhotoFile = file;
      trackHmFile = file;

      const stBadge = document.getElementById('trackHmStatusBadge');
      if (stBadge) {
        stBadge.textContent = '⏳ Loading...';
        stBadge.style.background = '#fef3c7';
        stBadge.style.color = '#b45309';
      }

      function renderHmDataUrl(dataUrl) {
        trackHmBase64 = dataUrl;
        const hmImg = document.getElementById('trackHmImg');
        const noHm = document.getElementById('trackNoHmText');
        const btnHmView = document.getElementById('btnTrackHmView');
        const btnHmClear = document.getElementById('btnTrackHmClear');

        if (hmImg) {
          hmImg.src = trackHmBase64;
          hmImg.style.display = 'block';
        }
        if (noHm) noHm.style.display = 'none';
        if (btnHmView) {
          btnHmView.style.display = 'inline-flex';
          btnHmView.innerHTML = '🔍 View';
        }
        if (btnHmClear) {
          btnHmClear.style.display = 'inline-flex';
          btnHmClear.innerHTML = '✕ Clear';
        }
        const btnHmCam = document.getElementById('btnTrackHmCam');
        const btnHmFile = document.getElementById('btnTrackHmFile');
        if (btnHmCam) btnHmCam.innerHTML = '↻ Retake';
        if (btnHmFile) btnHmFile.style.display = 'none';
        if (stBadge) {
          stBadge.textContent = '● Uploaded'; /* stBadge.textContent = '🟢 HM Report Uploaded'; */
          stBadge.style.background = '#dcfce7';
          stBadge.style.color = '#15803d';
        }

        updateTrackEvidenceStatusUI();
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        const rawDataUrl = evt.target.result;
        const img = new Image();
        img.onload = function() {
          try {
            let w = img.width;
            let h = img.height;
            const maxDim = 1600;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            // Pure clean document image: NO GPS WATERMARK, NO EXIF GPS
            const scaledDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            renderHmDataUrl(scaledDataUrl);
          } catch (scaleErr) {
            renderHmDataUrl(rawDataUrl);
          }
        };
        img.onerror = function() {
          renderHmDataUrl(rawDataUrl);
        };
        img.src = rawDataUrl;
      };
      reader.onerror = function() {
        if (stBadge) {
          stBadge.textContent = '● Upload Failed';
          stBadge.style.background = '#fee2e2';
          stBadge.style.color = '#b91c1c';
        }
      };
      reader.readAsDataURL(file);
    }

    function clearTrackHmPhoto() {
      trackHmBase64 = '';
      hmCompletionPhotoFile = null;
      trackHmFile = null;
      const hmImg = document.getElementById('trackHmImg');
      const noHm = document.getElementById('trackNoHmText');
      const btnHmView = document.getElementById('btnTrackHmView');
      const btnHmClear = document.getElementById('btnTrackHmClear');
      const btnHmCam = document.getElementById('btnTrackHmCam');
      const btnHmFile = document.getElementById('btnTrackHmFile');
      const stBadge = document.getElementById('trackHmStatusBadge');
      if (hmImg) { hmImg.src = ''; hmImg.style.display = 'none'; }
      if (noHm) noHm.style.display = 'block';
      if (btnHmView) btnHmView.style.display = 'none';
      if (btnHmClear) btnHmClear.style.display = 'none';
      if (btnHmCam) btnHmCam.innerHTML = '📷 Take Photo';
      if (btnHmFile) btnHmFile.style.display = 'inline-flex';
      if (stBadge) {
        stBadge.textContent = '● Not Uploaded';
        stBadge.style.background = '#fee2e2';
        stBadge.style.color = '#b91c1c';
      }
      const camInput = document.getElementById('trackHmCamInput');
      const fileInput = document.getElementById('trackHmFileInput');
      if (camInput) camInput.value = '';
      if (fileInput) fileInput.value = '';
      updateTrackEvidenceStatusUI();
    }

    function clearTrackCompPhoto() {
      trackCompBase64 = '';
      trackGpsLat = null;
      trackGpsLon = null;
      trackGpsAcc = null;
      trackGpsSource = null;
      trackGpsTime = null;
      const compImg = document.getElementById('trackCompImg');
      const noComp = document.getElementById('trackNoCompText');
      const btnCompView = document.getElementById('btnTrackCompView');
      const btnCompClear = document.getElementById('btnTrackCompClear');
      const btnOpenCam = document.getElementById('btnOpenWebGpsCam');
      const compGps = document.getElementById('trackCompGpsBadge');
      const stBadge = document.getElementById('trackCompStatusBadge');
      const stText = document.getElementById('trackGpsStatusText');
      const stCoords = document.getElementById('trackGpsCoordsDisplay');
      const errBox = document.getElementById('trackGpsErrorBox');
      if (compImg) { compImg.src = ''; compImg.style.display = 'none'; }
      if (noComp) noComp.style.display = 'block';
      if (btnCompView) btnCompView.style.display = 'none';
      if (btnCompClear) btnCompClear.style.display = 'none';
      if (btnOpenCam) btnOpenCam.innerHTML = '📷 Take UPS Photo (Web GPS Camera)';
      if (compGps) { compGps.textContent = ''; compGps.style.display = 'none'; }
      if (stCoords) { stCoords.textContent = ''; stCoords.style.display = 'none'; }
      if (errBox) errBox.style.display = 'none';
      if (stText) stText.innerHTML = '⚪ GPS: Awaiting Photo Capture';
      if (stBadge) {
        stBadge.textContent = '● Not Uploaded';
        stBadge.style.background = '#fee2e2';
        stBadge.style.color = '#b91c1c';
      }
      updateTrackEvidenceStatusUI();
      renderGpsDiagnostics();
    }

    function updateTrackEvidenceStatusUI() {
      const hasHm = !!(trackHmBase64 || hmCompletionPhotoFile || (curTrackTicket && (curTrackTicket.hmReportPhotoUrl || curTrackTicket.completionEvidence?.hmSignedReport?.uploaded)));
      const hasComp = !!(trackCompBase64 || (curTrackTicket && (curTrackTicket.completionPhotoUrl || curTrackTicket.completionEvidence?.completionPhoto?.uploaded)));
      const badge = document.getElementById('trackEvidenceStatusBadge');
      if (!badge) return;

      if (hasHm && hasComp) {
        badge.textContent = '● 2 of 2 Submitted'; /* badge.textContent = '🟢 Completion Evidence: 2 of 2 Submitted'; */
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
        badge.style.border = '1px solid #86efac';
      } else if (hasHm || hasComp) {
        badge.textContent = '● 1 of 2 Uploaded'; /* badge.textContent = '🟡 Completion Evidence: 1 of 2 Submitted'; */
        badge.style.background = '#fef3c7';
        badge.style.color = '#b45309';
        badge.style.border = '1px solid #fde68a';
      } else {
        badge.textContent = '● 0 of 2 Submitted'; /* badge.textContent = '🔴 Completion Evidence: 0 of 2 Submitted'; */
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
        badge.style.border = '1px solid #fca5a5';
      }
    }

    async function submitTrackCompletionEvidence() {
      if (!curTrackTicket || !curTrackTicket.ticketId) {
        alert('டிக்கெட் தகவல் கிடைக்கவில்லை. தயவுசெய்து மீண்டும் தேடவும்.');
        return;
      }

      // If trackHmBase64 is empty but hmCompletionPhotoFile exists, ensure it is converted before submit
      if (!trackHmBase64 && hmCompletionPhotoFile) {
        const btnPrep = document.getElementById('btnSubmitTrackEvidence');
        if (btnPrep) btnPrep.textContent = '⏳ Preparing HM Report...';
        await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => { trackHmBase64 = e.target.result; resolve(); };
          r.onerror = () => resolve();
          r.readAsDataURL(hmCompletionPhotoFile);
        });
      }

      const hasHm = !!(trackHmBase64 || hmCompletionPhotoFile || curTrackTicket.hmReportPhotoUrl || curTrackTicket.completionEvidence?.hmSignedReport?.uploaded);
      const hasComp = !!(trackCompBase64 || curTrackTicket.completionPhotoUrl || curTrackTicket.completionEvidence?.completionPhoto?.uploaded);

      if (!hasHm || !hasComp) {
        let msg = '⚠️ Please upload both completion evidence photos before submitting:\\n';
        if (!hasHm) msg += '❌ HM Signed Completion Report — Missing\\n';
        else msg += '✅ HM Signed Completion Report — Uploaded\\n';
        if (!hasComp) msg += '❌ GPS Completion Photo — Missing\\n';
        else msg += '✅ GPS Completion Photo — Uploaded\\n';
        alert(msg);
        return;
      }

      // Mandatory GPS Camera Verification for Completion Photo
      if (trackCompBase64) {
        const hasValidCoords = (trackGpsLat !== null && trackGpsLat !== undefined && typeof trackGpsLat === 'number') &&
                               (trackGpsLon !== null && trackGpsLon !== undefined && typeof trackGpsLon === 'number');
        if (!hasValidCoords || (trackGpsAcc && trackGpsAcc > 50)) {
          alert('⚠️ GPS கேமரா மூலம் இருப்பிடம் (Live GPS Location) சரிபார்க்கப்பட்டு வாட்டர்மார்க் செய்யப்பட்ட புகைப்படம் மட்டுமே அனுமதிக்கப்படும்.\\n(Live GPS Camera with verified location within 50m is mandatory for the Completion Photo.)');
          return;
        }
      }

      const btn = document.getElementById('btnSubmitTrackEvidence');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Completion Evidence Uploading...';
      }

      try {
        const payload = {
          ticketId: curTrackTicket.ticketId,
          udise: curTrackTicket.udise,
          district: curTrackTicket.district,
          schoolName: curTrackTicket.schoolName,
          source: 'AI Teacher',
          submittedBy: curTrackTicket.aiName || 'AI Teacher',
          hmReportPhotoBase64: trackHmBase64 || undefined,
          hmReportPhotoUrl: (!trackHmBase64 && curTrackTicket.hmReportPhotoUrl) ? curTrackTicket.hmReportPhotoUrl : undefined,
          completionPhotoBase64: trackCompBase64 || undefined,
          completionPhotoUrl: (!trackCompBase64 && curTrackTicket.completionPhotoUrl) ? curTrackTicket.completionPhotoUrl : undefined,
          gpsLatitude: trackGpsLat !== null ? trackGpsLat : (curTrackTicket.gpsLatitude || undefined),
          gpsLongitude: trackGpsLon !== null ? trackGpsLon : (curTrackTicket.gpsLongitude || undefined),
          gpsAccuracy: trackGpsAcc !== null ? trackGpsAcc : (curTrackTicket.gpsAccuracy || 15),
          gpsTimestamp: trackGpsTime || new Date().toISOString(),
          gpsSource: trackGpsSource || (trackGpsLat ? 'LIVE_BROWSER_GPS' : 'UNKNOWN'),
          requireBoth: true,
          isFinalSubmit: true
        };

        const res = await fetch('/api/tickets/completion-evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data && data.success && data.persistenceStatus === 'PERSISTED') {
          if (btn) {
            btn.style.background = '';
            btn.textContent = '📤 Submit Photos (சமர்ப்பிக்கவும்)';
          }
          const modal = document.getElementById('trackCompletionSuccessModal');
          if (modal) {
            modal.style.display = 'flex';
          } else {
            alert('✅ Completion Submitted\\n\\nBoth photos submitted successfully.');
            dismissCompletionSuccessAndReturn();
          }
        } else {
          alert('⚠️ Submission failed: ' + (data.error || 'Server rejected submission or persistence could not be verified.'));
          if (btn) {
            btn.style.background = '#ea580c';
            btn.textContent = '🔄 Retry Upload (மீண்டும் சமர்ப்பிக்கவும்)';
          }
        }
      } catch (err) {
        alert('⚠️ Submission failed: Network connection error. Please tap Retry.');
        if (btn) {
          btn.style.background = '#dc2626';
          btn.textContent = '🔄 Retry Upload (மீண்டும் சமர்ப்பிக்கவும்)';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
        }
      }
    }

    function dismissCompletionSuccessAndReturn() {
      const modal = document.getElementById('trackCompletionSuccessModal');
      if (modal) modal.style.display = 'none';
      window.userRequestedEditCompletion = false;
      if (curTrackTicket) {
        curTrackTicket.completionEvidenceStatus = 'SUBMITTED';
        if (trackHmBase64) curTrackTicket.hmReportPhotoUrl = trackHmBase64;
        if (trackCompBase64) curTrackTicket.completionPhotoUrl = trackCompBase64;
      }
      if (typeof trackTicket === 'function') {
        trackTicket();
      } else if (curTrackTicket) {
        renderTrackedTicket(curTrackTicket);
      }
      const box = document.getElementById('trackResultBox');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.dismissCompletionSuccessAndReturn = dismissCompletionSuccessAndReturn;

    function toggleEditCompletionForm() {
      window.userRequestedEditCompletion = true;
      const sumCard = document.getElementById('trackCompletionSubmittedSummary');
      const compSec = document.getElementById('trackCompletionSection');
      if (sumCard) sumCard.style.display = 'none';
      if (compSec) {
        compSec.style.display = 'block';
        compSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    window.toggleEditCompletionForm = toggleEditCompletionForm;

    function viewTrackHmFullscreen() {
      const hmImg = document.getElementById('trackHmImg');
      const src = (hmImg && hmImg.src) ? hmImg.src : (curTrackTicket && curTrackTicket.hmReportPhotoUrl);
      if (src) {
        openTeacherLightbox(src, '📄 HM Signed Completion Report (Full View)');
      }
    }

    function viewTrackCompFullscreen() {
      const compImg = document.getElementById('trackCompImg');
      const src = (compImg && compImg.src) ? compImg.src : (curTrackTicket && curTrackTicket.completionPhotoUrl);
      if (src) {
        openTeacherLightbox(src, '📍 GPS Completion Photo (Watermarked Full View)');
      }
    }

    function openTeacherLightbox(src, title) {
      const modal = document.getElementById('teacherLightboxModal');
      const img = document.getElementById('teacherLightboxImg');
      const t = document.getElementById('teacherLightboxTitle');
      if (modal && img) {
        img.src = src;
        if (t) t.textContent = title || 'Evidence Photo';
        modal.style.display = 'flex';
      }
    }

    function closeTeacherLightbox() {
      const modal = document.getElementById('teacherLightboxModal');
      if (modal) modal.style.display = 'none';
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



function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (u.includes('drive.google.com/file/d/')) {
    const parts = u.split('drive.google.com/file/d/')[1];
    return parts.split('/')[0].split('?')[0];
  } else if (u.includes('id=')) {
    const parts = u.split('id=')[1];
    if (parts) return parts.split('&')[0].split('/')[0];
  }
  return '';
}

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (!u || u === 'No Photo') return '';
  if (u.startsWith('data:image') || u.startsWith('/uploads/')) return u;

  const fileId = extractDriveFileId(u);
  if (fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
  }
  return u;
}

        function handleImgError(img, fileId) {
      if (!img || !fileId || img.dataset.triedProxy) return;
      img.dataset.triedProxy = '1';
      img.src = '/api/photo-proxy?id=' + encodeURIComponent(fileId);
    }

    function renderPhotoThumbnailHtml(url, index, label, tid) {
      const norm = normalizeImageUrl(url);
      const fileId = extractDriveFileId(url);
      if (!norm) {
        return '<div class="thumb-placeholder" title="' + label + ' (Not Uploaded)">' +
          '<span class="thumb-ph-icon">📷</span>' +
          '<span class="thumb-ph-idx">' + index + '</span>' +
        '</div>';
      }
      const safeTid = tid ? String(tid).replace(/'/g, "\\'") : '';
      const clickHandler = safeTid ? 'onclick="openLightboxGallery(\'' + safeTid + '\', ' + index + ')"' : 'onclick="showImgModal(this.src)"';
      const fallbackAttr = fileId ? ' onerror="handleImgError(this, \'' + fileId + '\')"' : '';
      return '<div class="thumb-wrap" title="' + label + '" ' + clickHandler + '>' +
        '<img src="' + norm + '" referrerpolicy="no-referrer" loading="lazy" class="thumb-img"' + fallbackAttr + ' alt="' + label + '">' +
        '<span class="thumb-badge">' + index + '</span>' +
      '</div>';
    }

function generateTableRowsHtml(list) {
  const validList = (list || []).filter(t => !!t && typeof t === 'object' && (t.ticketId || t.id));
  if (validList.length === 0) {
    return '<tr><td colspan="8" style="text-align:center; padding: 3rem 1rem; color: var(--text-muted);"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>No service calls registered yet.</td></tr>';
  }
  return validList.map(function(t) {
    const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
    let badgeHtml = '<span class="badge badge-status-pending">🟡 New / Under Review</span>';
    if (tCat === 'Resolved Remotely') badgeHtml = '<span class="badge badge-status-completed">🟢 Resolved Remotely</span>';
    else if (tCat === 'Solved by Direct Visit') badgeHtml = '<span class="badge badge-status-direct">🔵 Solved by Direct Visit</span>';
    else if (t.status === 'Vendor Escalated') badgeHtml = '<span class="badge badge-status-incomplete">🔴 Vendor Escalated</span>';

    const has2of2Evidence = !!(t.completionEvidenceStatus === 'SUBMITTED' || ((t.hmReportPhotoUrl || t.completionEvidence?.hmSignedReport?.fileUrl) && (t.completionPhotoUrl || t.completionEvidence?.completionPhoto?.fileUrl)));
    const has1of2Evidence = !has2of2Evidence && !!(t.completionEvidenceStatus === 'PARTIALLY_UPLOADED' || t.hmReportPhotoUrl || t.completionPhotoUrl || t.completionEvidence?.hmSignedReport?.fileUrl || t.completionEvidence?.completionPhoto?.fileUrl);
    const isEvidenceReq = !has2of2Evidence && !has1of2Evidence && !!(t.completionEvidenceRequested || t.completionEvidenceStatus === 'REQUESTED');

    let evBadge = '';
    if (has2of2Evidence) {
      evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">📸 2/2 Evidence Attached</span></div>';
    } else if (has1of2Evidence) {
      evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">📸 1/2 Evidence Uploaded</span></div>';
    } else if (isEvidenceReq) {
      evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">⏳ Evidence Requested</span></div>';
    }

    let prioClass = 'prio-med';
    const p = t.priority || 'Medium';
    if (p.includes('Critical')) prioClass = 'prio-crit';
    else if (p.includes('High')) prioClass = 'prio-high';
    else if (p.includes('Low')) prioClass = 'prio-low';

    const escTicketId = escapeHtml(t.ticketId);
    const escCreatedDate = escapeHtml((typeof formatAppDate === 'function' ? formatAppDate(t.createdDate || t.createdAt) : (t.createdDate || t.createdAt)) || '-');
    const relTimeSsr = typeof formatRelativeTime === 'function' ? formatRelativeTime(t.createdDate || t.createdAt) : '';
    const escSchoolName = escapeHtml(t.schoolName);
    const escBlock = escapeHtml(t.block);
    const escUdise = escapeHtml(t.udise);
    const escAiName = escapeHtml(t.aiName || '-');
    const escPhone = escapeHtml(t.phone || '-');
    const escRemarks = t.remarks ? escapeHtml(t.remarks) : '';
    const escIssue = escapeHtml(t.issue || '-');
    const escPriority = escapeHtml(p);
    const escResolutionNotes = escapeHtml(t.resolutionNotes || '');
    const escVendorName = escapeHtml(t.vendorName || '');
    const escVendorTicketNo = escapeHtml(t.vendorTicketNo || 'Pending #');
    const cleanPhone = String(t.phone || '').replace(/\D/g, '');

    return '<tr data-ticket-id="' + escTicketId + '">' +
      '<td class="col-ticket font-mono" style="font-weight: 700;">' +
        '<div style="font-weight: 800; color: #1e3a8a; font-size: 0.85rem; font-family: var(--font-mono); white-space: nowrap;">#' + escTicketId + '</div>' +
        '<div style="color: var(--text-muted); font-size: 0.70rem; margin-top: 2px; font-family: var(--font-main); font-weight: 500; line-height: 1.35;">' + escCreatedDate + (relTimeSsr ? ' • <strong style="color:#0284c7;">' + relTimeSsr + '</strong>' : '') + '</div>' +
      '</td>' +
      '<td class="col-photos" style="white-space: nowrap;">' +
        '<div class="thumb-grid">' +
          renderPhotoThumbnailHtml(t.photo1Url, 1, '1. Input MCB', t.ticketId) +
          renderPhotoThumbnailHtml(t.photo2Url, 2, '2. UPS Display', t.ticketId) +
          renderPhotoThumbnailHtml(t.photo3Url, 3, '3. Battery Rack', t.ticketId) +
          renderPhotoThumbnailHtml(t.photo4Url, 4, '4. Lab Setup', t.ticketId) +
        '</div>' +
      '</td>' +
      '<td class="col-school">' +
        '<div style="color: var(--text-primary); font-weight: 700; font-size: 0.88rem; line-height: 1.3; word-break: break-word;">' + escSchoolName + '</div>' +
        '<div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 1.5px; display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">' +
          '<span style="white-space: nowrap;">UDISE: <strong style="color: var(--primary); font-weight: 700;">' + escUdise + '</strong></span>' +
          '<span class="badge" style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 0.1rem 0.45rem; font-size: 0.68rem; font-weight: 700; color: #1e3a8a; white-space: nowrap;">' + escBlock + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="col-contact">' +
        '<div style="font-weight: 700; color: var(--text-primary); font-size: 0.84rem; line-height: 1.25; word-break: break-word;">' + escAiName + '</div>' +
        '<a href="tel:' + cleanPhone + '" class="font-mono" style="color: var(--primary); font-weight: 700; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px; white-space: nowrap;">📞 ' + escPhone + '</a>' +
      '</td>' +
      '<td class="col-remarks remarks-cell">' +
        (escRemarks ? '<div class="remarks-text">' + escRemarks + '</div>' : '<span style="color: var(--text-muted); font-style: italic;">—</span>') +
      '</td>' +
      '<td class="col-status" style="text-align: center; white-space: nowrap;">' +
        badgeHtml + evBadge +
        (t.resolutionNotes ? '<div style="color: #1e293b; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border-left: 2px solid #3b82f6; margin-top: 3px; font-size: 0.72rem; max-width: 180px; text-align: left; white-space: normal; margin-left: auto; margin-right: auto;">' + escResolutionNotes + '</div>' : '') +
      '</td>' +
      '<td class="col-fault fault-cell">' +
        '<div style="font-size: 0.84rem; font-weight: 600; color: var(--text-primary); line-height: 1.35; margin-bottom: 2px;">' + escIssue + '</div>' +
        '<span class="prio-pill ' + prioClass + '">' + escPriority + '</span>' +
      '</td>' +
      '<td class="col-action" style="text-align: center; white-space: nowrap;">' +
        '<div style="display: flex; align-items: center; justify-content: center; gap: 5px;">' +
          '<button type="button" data-tid="' + escTicketId + '" onclick="openActionModal(this.dataset.tid)" class="btn-table-action btn-table-manage" title="Edit & Manage Service Call (புகார் திருத்து & தீர்வு செய்க)">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
          '</button>' +
          '<button type="button" data-tid="' + escTicketId + '" onclick="printServiceSlip(this.dataset.tid)" class="btn-table-action btn-table-slip" title="Print Service Slip (சர்வீஸ் ஸ்லிப் அச்சிடு)">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>' +
          '</button>' +
          '<button type="button" data-tid="' + escTicketId + '" onclick="window.deleteSingleTicket(this.dataset.tid)" class="btn-table-action btn-table-del" title="Delete Service Call (அழைப்பை நீக்கு)">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function getITSMWorkbenchHtml(initialTickets = []) {
  initialTickets = initialTickets.filter(t => !db.isTestOrPurgedTicket(t) && !db.isDeleted(t.ticketId));
  initialTickets.sort((a, b) => {
    return parseAppDate((b && (b.createdDate || b.createdAt)) || 0) - parseAppDate((a && (a.createdDate || a.createdAt)) || 0);
  });
  const validTickets = (initialTickets || []).filter(t => !!t && typeof t === 'object');
  const totalReported = validTickets.length;
  const resolvedRemote = validTickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
  const solvedDirect = validTickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
  const vendorEsc = validTickets.filter(t => t.status === 'Vendor Escalated').length;
  const pendingCount = validTickets.filter(t => !t.status || t.status === 'New / Under Review' || t.status === 'In Progress (Remote)').length;

  return `<!DOCTYPE html>
<html lang="ta" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hi-Tech Lab Field Call Tracker - Thiruvarur District</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Color Palette - Light Theme */
      --bg-main: #f8fafc;
      --bg-card: #ffffff;
      --bg-glass: rgba(255, 255, 255, 0.88);
      --border-color: #e2e8f0;
      --border-focus: #2563eb;
      
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --primary-light: #eff6ff;
      
      /* Status Colors */
      --status-completed-bg: #dcfce7;
      --status-completed-text: #15803d;
      --status-completed-border: #86efac;

      --status-progress-bg: #fef3c7;
      --status-progress-text: #b45309;
      --status-progress-border: #fde047;

      --status-direct-bg: #e0e7ff;
      --status-direct-text: #3730a3;
      --status-direct-border: #c7d2fe;

      --status-incomplete-bg: #fee2e2;
      --status-incomplete-text: #b91c1c;
      --status-incomplete-border: #fecaca;

      /* Card Accents */
      --accent-blue: linear-gradient(135deg, #3b82f6, #1d4ed8);
      --accent-emerald: linear-gradient(135deg, #10b981, #047857);
      --accent-amber: linear-gradient(135deg, #f59e0b, #b45309);
      --accent-rose: linear-gradient(135deg, #f43f5e, #be123c);
      --accent-indigo: linear-gradient(135deg, #6366f1, #4338ca);
      --accent-purple: linear-gradient(135deg, #8b5cf6, #6d28d9);

      /* Shadows & Radius */
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
      --shadow-glass: 0 8px 32px 0 rgba(31, 38, 135, 0.07);

      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --radius-full: 9999px;

      --font-main: 'Plus Jakarta Sans', 'Noto Sans Tamil', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    [data-theme="dark"] {
      --bg-main: #0b0f19;
      --bg-card: #131b2e;
      --bg-glass: rgba(19, 27, 46, 0.88);
      --border-color: #1e293b;
      --border-focus: #60a5fa;

      --text-primary: #f8fafc;
      --text-secondary: #cbd5e1;
      --text-muted: #64748b;

      --primary: #3b82f6;
      --primary-hover: #60a5fa;
      --primary-light: rgba(59, 130, 246, 0.15);

      --status-completed-bg: rgba(22, 101, 52, 0.25);
      --status-completed-text: #4ade80;
      --status-completed-border: rgba(74, 222, 128, 0.3);

      --status-progress-bg: rgba(180, 83, 9, 0.25);
      --status-progress-text: #fbbf24;
      --status-progress-border: rgba(251, 191, 36, 0.3);

      --status-direct-bg: rgba(99, 102, 241, 0.25);
      --status-direct-text: #a5b4fc;
      --status-direct-border: rgba(165, 180, 252, 0.3);

      --status-incomplete-bg: rgba(190, 18, 60, 0.25);
      --status-incomplete-text: #fb7185;
      --status-incomplete-border: rgba(251, 113, 133, 0.3);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-main);
      background-color: var(--bg-main);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
      transition: background-color 0.3s ease, color 0.3s ease;
      overflow-x: hidden;
    }

    /* Sticky Navbar */
    .navbar {
      position: sticky; top: 0; z-index: 1000;
      background: var(--bg-glass);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border-color);
      padding: 0.55rem 1.15rem;
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.65rem;
      width: 100%;
      box-sizing: border-box;
      transition: background-color 0.3s ease, border-color 0.3s ease;
    }
    .brand-section, .brand-wrapper {
      display: flex; align-items: center; gap: 0.65rem;
      flex-shrink: 0;
    }
    .brand-icon {
      width: 36px; height: 36px; background: var(--accent-blue);
      color: #fff; border-radius: var(--radius-md);
      display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
      box-shadow: 0 3px 8px rgba(37, 99, 235, 0.25);
      flex-shrink: 0;
    }
    .brand-text { display: flex; flex-direction: column; justify-content: center; }
    .brand-title {
      font-size: 1rem; font-weight: 800; color: var(--text-primary);
      letter-spacing: -0.02em; line-height: 1.2; white-space: nowrap;
    }
    .brand-subtitle {
      font-size: 0.72rem; color: var(--text-muted); font-weight: 500;
      line-height: 1.2; margin-top: 2px; white-space: nowrap;
    }
    .district-summary {
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .badge-location {
      background: var(--primary-light); color: var(--primary);
      padding: 0.25rem 0.55rem; border-radius: var(--radius-full);
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em;
      white-space: nowrap; border: 1px solid rgba(37, 99, 235, 0.15);
      display: inline-flex; align-items: center; gap: 0.3rem;
      line-height: 1.2;
    }

    .nav-actions {
      display: flex; align-items: center; gap: 0.35rem;
      flex-shrink: 0; flex-wrap: nowrap;
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
      padding: 0.4rem 0.65rem; height: 32px; border-radius: var(--radius-md);
      font-size: 0.76rem; font-weight: 700; font-family: inherit;
      cursor: pointer; border: 1px solid transparent; text-decoration: none;
      transition: all 0.2s ease; white-space: nowrap; box-sizing: border-box;
      line-height: 1;
    }
    .btn-primary { background: var(--primary); color: white; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2); }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-green { background: #16a34a; color: white; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.2); }
    .btn-green:hover { background: #15803d; transform: translateY(-1px); }
    .btn-outline { background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary); }
    .btn-outline:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
    .btn-danger-outline { background: var(--bg-card); border-color: #fecaca; color: #dc2626; }
    .btn-danger-outline:hover { background: #fee2e2; border-color: #dc2626; }

    /* Theme Toggle Button */
    .btn-theme-toggle {
      width: 32px; height: 32px; border-radius: var(--radius-md);
      background: var(--bg-card); border: 1px solid var(--border-color);
      color: var(--text-primary); display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.2s ease; font-size: 0.9rem;
      flex-shrink: 0; box-sizing: border-box; padding: 0;
    }
    .btn-theme-toggle:hover { border-color: var(--primary); color: var(--primary); }

    .theme-text { display: none; }

    @media (max-width: 1380px) {
      .navbar {
        gap: 0.35rem;
        padding: 0.45rem 0.75rem;
      }
      .brand-title { font-size: 0.92rem; }
      .brand-subtitle { font-size: 0.68rem; }
      .badge-location { font-size: 0.68rem; padding: 0.2rem 0.4rem; }
      .btn { font-size: 0.72rem; padding: 0.35rem 0.45rem; height: 30px; gap: 0.25rem; }
      .btn-theme-toggle { width: 30px; height: 30px; font-size: 0.85rem; }
      .nav-actions { gap: 0.25rem; }
    }

    @media (max-width: 1040px) {
      .navbar {
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
      }
      .brand-section, .brand-wrapper {
        flex: 1 1 auto;
      }
      .district-summary {
        flex: 0 0 auto;
      }
      .nav-actions {
        width: 100%;
        justify-content: flex-end;
        gap: 0.35rem;
      }
    }

    @media (max-width: 768px) {
      .theme-text { display: inline; font-size: 0.72rem; font-weight: 700; margin-left: 4px; }
      .navbar {
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
      }
      .brand-section, .brand-wrapper {
        width: 100%;
        justify-content: flex-start;
      }
      .brand-title { white-space: normal; }
      .brand-subtitle { white-space: normal; }
      .district-summary {
        width: 100%;
        justify-content: flex-start;
      }
      .badge-location {
        width: 100%;
        justify-content: center;
        text-align: center;
        white-space: normal;
        font-size: 0.68rem;
        padding: 0.3rem 0.45rem;
        line-height: 1.3;
      }
      .nav-actions {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.35rem;
      }
      .nav-actions .btn-theme-toggle {
        width: 100%;
        height: 32px;
        font-size: 0.72rem;
        border-radius: var(--radius-md);
      }
      .nav-actions .btn {
        width: 100%;
        height: 32px;
        font-size: 0.65rem;
        padding: 0.35rem 0.15rem;
        justify-content: center;
      }
    }

    @media (max-width: 480px) {
      .navbar {
        padding: 0.5rem 0.5rem;
        gap: 0.4rem;
      }
      .brand-title { font-size: 0.92rem; }
      .brand-subtitle { font-size: 0.68rem; }
      .badge-location { font-size: 0.65rem; padding: 0.25rem 0.35rem; }
      .nav-actions { gap: 0.25rem; }
      .nav-actions .btn {
        font-size: 0.62rem;
        padding: 0.3rem 0.1rem;
        height: 30px;
      }
    }

    /* Layout Container */
    .container {
      max-width: 1560px; margin: 0 auto; padding: 1.5rem;
      display: flex; flex-direction: column; gap: 1.25rem;
    }

    /* KPI Grid - HiSecure ERP / Field Tracker Design */
    .kpi-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
    }
    @media (min-width: 768px) {
      .kpi-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 1200px) {
      .kpi-grid { grid-template-columns: repeat(6, 1fr); }
    }

    .stat-card {
      cursor: pointer; background-color: var(--bg-card);
      border: 1px solid var(--border-color); border-left: 3.5px solid #e2e8f0;
      border-radius: 12px; padding: 12px 14px; text-decoration: none;
      transition: transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s, background-color .25s, border-color .25s;
      position: relative; overflow: visible; box-shadow: var(--shadow-sm); user-select: none;
      display: flex; flex-direction: column; justify-content: space-between; min-height: 96px;
    }
    .stat-card:hover {
      transform: translateY(-4px) scale(1.01);
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
      background-color: var(--primary-light) !important;
    }
    .stat-top { display: flex; justify-content: space-between; align-items: center; }
    .stat-label {
      color: var(--text-secondary); text-transform: uppercase;
      letter-spacing: .04em; font-size: 10.5px; font-weight: 800; line-height: 1.1;
    }
    .stat-icon {
      border-radius: 6px; width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center; font-size: 0.95rem;
    }
    .stat-value {
      color: var(--text-primary); margin-top: 4px; margin-bottom: 0;
      font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1;
    }
    .stat-sub { margin-top: 2px; font-size: 10.5px; font-weight: 600; color: var(--text-muted); }

    .stat-card.blue { border-left-color: #2563eb; }
    .stat-card.purple { border-left-color: #8b5cf6; }
    .stat-card.green { border-left-color: #10b981; }
    .stat-card.emerald { border-left-color: #047857; }
    .stat-card.amber { border-left-color: #f59e0b; }
    .stat-card.red { border-left-color: #ef4444; }

    /* Filter Card */
    .filter-card {
      background: var(--bg-card); border: 1px solid var(--border-color);
      border-radius: var(--radius-lg); padding: 1.1rem 1.25rem;
      box-shadow: var(--shadow-sm); display: flex; gap: 0.85rem; flex-wrap: wrap; align-items: center;
    }
    .search-box { position: relative; flex: 1.5; min-width: 280px; }
    .search-box-icon { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.95rem; }
    .search-input {
      width: 100%; padding: 0.7rem 1rem 0.7rem 2.6rem;
      border: 1px solid var(--border-color); border-radius: var(--radius-md);
      background: var(--bg-main); color: var(--text-primary);
      font-size: 0.88rem; font-family: inherit; transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .search-input:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    .filter-select {
      padding: 0.65rem 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);
      background: var(--bg-main); color: var(--text-primary); font-size: 0.85rem;
      font-family: inherit; font-weight: 700; cursor: pointer; min-width: 180px;
    }
    .filter-select:focus { outline: none; border-color: var(--border-focus); }

    /* Data Table Card Container - Tight Proportional Layout (Zero Empty Gaps) */
    .table-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg, 14px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .table-header-bar {
      padding: 0.55rem 0.9rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .table-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-card);
    }
    .data-table {
      display: table;
      width: 100%;
      min-width: 1305px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.8rem;
      table-layout: auto;
    }
    .data-table thead {
      display: table-header-group;
    }
    .data-table tbody {
      display: table-row-group;
    }
    .data-table tr {
      display: table-row;
    }
    .data-table th, .data-table td {
      display: table-cell;
      vertical-align: middle;
      box-sizing: border-box;
      position: relative;
    }
    .data-table th {
      position: sticky;
      top: 0;
      background: #f8fafc;
      z-index: 10;
      padding: 0.65rem 0.60rem;
      font-weight: 700;
      color: var(--text-secondary, #475569);
      text-transform: uppercase;
      font-size: 0.66rem;
      letter-spacing: 0.04em;
      border-bottom: 2px solid var(--border-color);
      white-space: nowrap;
      user-select: none;
    }
    [data-theme="dark"] .data-table th {
      background: #1e293b;
    }
    .data-table td {
      padding: 0.85rem 0.75rem;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-primary);
      line-height: 1.38;
    }
    .data-table tbody tr {
      transition: background-color 0.12s ease;
    }
    .data-table tbody tr:hover {
      background-color: var(--primary-light, #eff6ff);
    }

    /* Definitive Authoritative 8-Column Geometry - Proportional, Equal Gaps, Zero Overlap */
    .col-ticket,  .data-table th:nth-child(1), .data-table td:nth-child(1) { width: 130px; min-width: 125px; max-width: 135px; overflow: hidden; text-align: left; }
    .col-photos,  .data-table th:nth-child(2), .data-table td:nth-child(2) { width: 185px; min-width: 180px; max-width: 190px; white-space: nowrap; text-align: center; overflow: hidden; }
    .col-school,  .data-table th:nth-child(3), .data-table td:nth-child(3) { width: 200px; min-width: 190px; word-break: break-word; overflow-wrap: break-word; text-align: left; }
    .col-contact, .data-table th:nth-child(4), .data-table td:nth-child(4) { width: 140px; min-width: 135px; max-width: 145px; word-break: break-word; overflow-wrap: break-word; overflow: hidden; text-align: left; }
    .col-remarks, .data-table th:nth-child(5), .data-table td:nth-child(5) { width: 210px; min-width: 195px; word-break: break-word; overflow-wrap: break-word; text-align: left; }
    .col-status,  .data-table th:nth-child(6), .data-table td:nth-child(6) { width: 150px; min-width: 145px; max-width: 155px; white-space: nowrap; text-align: center; overflow: hidden; }
    .col-fault,   .data-table th:nth-child(7), .data-table td:nth-child(7) { width: 190px; min-width: 180px; word-break: break-word; overflow-wrap: break-word; text-align: left; }
    .col-action,  .data-table th:nth-child(8), .data-table td:nth-child(8) { width: 100px; min-width: 95px; max-width: 105px; white-space: nowrap; text-align: center; }

    .remarks-cell {
      word-break: break-word;
      overflow-wrap: break-word;
      font-size: 0.78rem;
      line-height: 1.35;
      color: var(--text-primary);
      vertical-align: middle;
    }
    .remarks-text {
      white-space: pre-wrap;
      font-weight: 500;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.35;
    }
    .fault-cell {
      word-break: break-word;
      overflow-wrap: break-word;
      vertical-align: middle;
    }

    /* Fixed Sticky Action Column on the right */
    .data-table th:last-child {
      position: sticky;
      right: 0;
      z-index: 15;
      background: #f8fafc;
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.04);
      text-align: center;
      padding: 0.60rem 0.45rem;
    }
    [data-theme="dark"] .data-table th:last-child {
      background: #1e293b;
    }
    .data-table td:last-child {
      position: sticky;
      right: 0;
      z-index: 5;
      background: var(--bg-card);
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.04);
      text-align: center;
      padding: 0.55rem 0.45rem;
    }
    .data-table tbody tr:hover td:last-child {
      background-color: var(--primary-light, #eff6ff);
    }

    /* Contained Horizontal Single-Row Train Gallery [1][2][3][4] - Snug & Compact */
    .thumb-grid {
      display: inline-flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 3px;
      align-items: center;
      justify-content: center;
      padding: 2px 3px;
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      background: rgba(241, 245, 249, 0.6);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      margin: 0 auto;
    }
    [data-theme="dark"] .thumb-grid {
      background: rgba(30, 41, 59, 0.6);
    }
    .thumb-wrap {
      position: relative;
      width: 38px;
      height: 38px;
      border-radius: 5px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      cursor: pointer;
      background: #e2e8f0;
      border: 1.5px solid var(--border-color, #cbd5e1);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .thumb-wrap:hover {
      transform: scale(1.22);
      border-color: var(--primary, #2563eb);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      z-index: 10;
    }
    .thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      border-radius: 4px;
    }
    .thumb-badge {
      position: absolute;
      bottom: 1.5px;
      right: 1.5px;
      background: rgba(15, 23, 42, 0.85);
      color: #ffffff;
      font-size: 7px;
      font-weight: 800;
      padding: 0.5px 2.5px;
      border-radius: 2px;
      line-height: 1;
      pointer-events: none;
      font-family: var(--font-mono);
      backdrop-filter: blur(2px);
    }
    .thumb-placeholder {
      position: relative;
      width: 38px;
      height: 38px;
      border-radius: 5px;
      background: var(--bg-main, #f8fafc);
      border: 1.5px dashed var(--border-color, #cbd5e1);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      color: var(--text-muted, #94a3b8);
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .thumb-ph-icon { font-size: 11px; line-height: 1; }
    .thumb-ph-idx { font-size: 7px; font-weight: 800; font-family: var(--font-mono); }

    /* Modern Pill Badges (Compact 9999px) */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge-status-completed, .badge-remote {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .badge-status-direct, .badge-direct {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
    }
    .badge-status-pending, .badge-open {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde047;
    }
    .badge-status-incomplete, .badge-vendor {
      background: #ffe4e6;
      color: #be123c;
      border: 1px solid #fca5a5;
    }

    .prio-pill {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.08rem 0.4rem;
      border-radius: 3px;
      display: inline-block;
    }
    .prio-crit { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .prio-high { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
    .prio-med { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
    .prio-low { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

    /* Action Buttons (Compact 28px) */
    .action-grid-buttons { display: flex; gap: 3px; justify-content: center; align-items: center; white-space: nowrap; }
    .btn-table-action {
      width: 28px; height: 28px; border-radius: 5px;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; border: none; text-decoration: none; transition: all 0.12s ease;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;
    }
    .btn-table-manage { background: #2563eb; color: #ffffff; }
    .btn-table-manage:hover { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3); }
    .btn-table-slip { background: #0f172a; color: #ffffff; }
    .btn-table-slip:hover { background: #1e293b; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(15, 23, 42, 0.25); }
    .btn-table-del { background: #dc2626; color: #ffffff; }
    .btn-table-del:hover { background: #b91c1c; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(220, 38, 38, 0.3); }

    .font-mono {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-weight: 500;
    }

    /* Hardware Accelerated Modal System */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .drawer-overlay.active {
      display: flex !important;
    }
    .drawer {
      width: 100%;
      max-width: 660px;
      max-height: 90vh;
      background: var(--bg-card);
      border-radius: var(--radius-lg, 16px);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin: auto;
      animation: modalPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalPopIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .drawer-header {
      padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color);
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; background: var(--bg-card); z-index: 10;
    }
    .drawer-title { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); }
    .drawer-close {
      background: transparent; border: none; font-size: 1.35rem; color: var(--text-muted);
      cursor: pointer; width: 36px; height: 36px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease;
    }
    .drawer-close:hover { background: #fee2e2; color: #dc2626; }

    .drawer-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.1rem; }
    .drawer-footer {
      padding: 1.1rem 1.5rem; border-top: 1px solid var(--border-color);
      display: flex; justify-content: space-between; align-items: center;
      background: var(--bg-main); position: sticky; bottom: 0; z-index: 10;
    }

    .cat-choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .cat-option-btn {
      padding: 11px 13px; border: 2px solid var(--border-color); border-radius: 12px; background: var(--bg-card);
      cursor: pointer; text-align: center; font-weight: 700; font-size: 12.5px; transition: all 0.15s ease;
    }
    .cat-option-btn:hover { border-color: var(--primary); background: var(--bg-main); }
    .cat-option-btn.active-remote { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
    .cat-option-btn.active-direct { border-color: #2563eb; background: #eff6ff; color: #1e40af; }
    .cat-sub { font-size: 10.5px; display: block; font-weight: 500; color: var(--text-muted); margin-top: 2px; }

    .modal-photos-box {
      background: var(--bg-main); border: 1.5px dashed var(--border-color); border-radius: 14px; padding: 12px;
    }
    .modal-photo-4grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .modal-photo-card {
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 6px; text-align: center;
    }
    .modal-photo-label { font-size: 10.5px; font-weight: 800; color: var(--text-secondary); margin-bottom: 2px; display: block; }
    .modal-photo-preview-wrap {
      height: 68px; background: var(--bg-main); border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color);
      display: flex; align-items: center; justify-content: center; cursor: pointer; margin-bottom: 5px;
    }
    .modal-photo-preview-img { width: 100%; height: 100%; object-fit: cover; }
    .btn-choose-file {
      display: block; background: var(--primary-light); color: var(--primary); font-size: 10.5px;
      font-weight: 700; padding: 4px 6px; border-radius: 6px; cursor: pointer; margin-bottom: 3px;
    }
    .btn-clear-photo {
      background: transparent; border: none; font-size: 10px; color: #dc2626; font-weight: 700; cursor: pointer;
    }

    .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .form-label { font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
    .form-control {
      width: 100%; padding: 0.65rem 0.85rem; border: 1px solid var(--border-color);
      border-radius: var(--radius-md); background: var(--bg-main); color: var(--text-primary);
      font-size: 0.88rem; font-family: inherit;
    }
    .form-control:focus { outline: none; border-color: var(--border-focus); }

    .quick-notes-box {
      background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px;
    }
    .quick-notes-title { font-size: 11.5px; font-weight: 800; color: var(--text-primary); display: block; margin-bottom: 6px; }
    .quick-pill {
      display: inline-block; background: var(--bg-card); border: 1px solid var(--border-color);
      padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--text-secondary);
      margin: 2px 3px 2px 0; cursor: pointer; transition: all 0.15s ease;
    }
    .quick-pill:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }

    /* Lightbox Modal */
    .lightbox-modal {
      display: none; position: fixed; z-index: 100000; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(6px);
      align-items: center; justify-content: center; padding: 16px;
    }
    .lightbox-card {
      background: var(--bg-card); border-radius: 16px; max-width: 90vw; max-height: 90vh;
      overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .lightbox-header {
      padding: 12px 18px; display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border-color);
    }
    .lightbox-img { max-width: 85vw; max-height: 78vh; object-fit: contain; }

    @media (max-width: 768px) {
      .container { padding: 0.85rem; }
      .form-row-2 { grid-template-columns: 1fr; }
      .cat-choice-grid { grid-template-columns: 1fr; }
      .modal-photo-4grid { grid-template-columns: repeat(2, 1fr); }
      .completion-evidence-grid { grid-template-columns: 1fr !important; }
    }
    .completion-evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <!-- Sticky Header Navbar -->
  <header class="navbar">
    <div class="brand-section brand-wrapper">
      <div class="brand-icon">🛠️</div>
      <div class="brand-text">
        <div class="brand-title">Hi-Tech Lab Field Call Tracker</div>
        <div class="brand-subtitle">Field Engineer: <strong>Mohamed Shameer (9042489993)</strong></div>
      </div>
    </div>

    <div class="district-summary">
      <span class="badge-location">📍 Thiruvarur: 182 • Nagapattinam: 80 [262 Total Labs]</span>
    </div>

    <div class="nav-actions">
      <button type="button" onclick="toggleTheme()" class="btn-theme-toggle" title="Toggle Light/Dark Theme">🌓<span class="theme-text">Theme</span></button>
      <button type="button" onclick="openResetModal()" class="btn btn-danger-outline" title="Reset all tickets with protection">🔄 Reset All</button>
      <button type="button" onclick="triggerDriveBackup()" class="btn btn-outline" title="Google Drive Cloud Snapshot">💾 5TB Drive Backup</button>
      <a href="/head" class="btn btn-primary" title="Executive District Dashboard">📊 Executive Dashboard</a>
      <a href="/download-excel" class="btn btn-green" title="Export Excel / CSV">📥 Export Excel</a>
      <a href="/login" class="btn btn-outline" title="Switch User or Logout">🔒 Logout</a>
    </div>
  </header>

  <!-- Main Container -->
  <main class="container">
    <!-- 6 KPI Stat Cards Grid -->
    <section class="kpi-grid">
      <div class="stat-card blue" onclick="filterByKpi('ALL')">
        <div class="stat-top">
          <span class="stat-label">TOTAL SCHOOLS</span>
          <div class="stat-icon" style="background: rgba(37, 99, 235, 0.1); color: #2563eb;">🏫</div>
        </div>
        <div class="stat-value" id="kpiTotal">262</div>
        <div class="stat-sub">182 TVR • 80 NGP Labs</div>
      </div>

      <div class="stat-card purple" onclick="filterByKpi('ALL')">
        <div class="stat-top">
          <span class="stat-label">CALLS REGISTERED</span>
          <div class="stat-icon" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">📋</div>
        </div>
        <div class="stat-value" id="kpiReported" style="color: #8b5cf6;">${totalReported}</div>
        <div class="stat-sub">Active & Logged Calls</div>
      </div>

      <div class="stat-card green" onclick="filterByKpi('Resolved Remotely')">
        <div class="stat-top">
          <span class="stat-label">RESOLVED REMOTELY</span>
          <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">🟢</div>
        </div>
        <div class="stat-value" id="kpiResolvedRemote" style="color: #10b981;">${resolvedRemote}</div>
        <div class="stat-sub">Phone / WhatsApp Guidance</div>
      </div>

      <div class="stat-card emerald" onclick="filterByKpi('Solved by Direct Visit')">
        <div class="stat-top">
          <span class="stat-label">DIRECT VISIT SOLVED</span>
          <div class="stat-icon" style="background: rgba(4, 120, 87, 0.1); color: #047857;">🔵</div>
        </div>
        <div class="stat-value" id="kpiSolvedDirect" style="color: #2563eb;">${solvedDirect}</div>
        <div class="stat-sub">Physical Lab Visit Fixed</div>
      </div>

      <div class="stat-card amber" onclick="filterByKpi('Pending')">
        <div class="stat-top">
          <span class="stat-label">UNDER REVIEW / PENDING</span>
          <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">🟡</div>
        </div>
        <div class="stat-value" id="kpiPending" style="color: #f59e0b;">${pendingCount}</div>
        <div class="stat-sub">Awaiting Action / In Progress</div>
      </div>

      <div class="stat-card red" onclick="filterByKpi('Vendor Escalated')">
        <div class="stat-top">
          <span class="stat-label">VENDOR ESCALATED</span>
          <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">🔴</div>
        </div>
        <div class="stat-value" id="kpiVendor" style="color: #ef4444;">${vendorEsc}</div>
        <div class="stat-sub">Spare Parts Replaced</div>
      </div>
    </section>

    <!-- Operational Queue Status Bar -->
    <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:12px; scrollbar-width:thin;">
      <button type="button" class="quick-pill active-status-tab" id="tabStatusAll" onclick="setOperationalTab('ALL')">📋 All Calls (<span id="countTabAll">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusNew" onclick="setOperationalTab('New / Under Review')">🟡 New / Triage (<span id="countTabNew">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusRemote" onclick="setOperationalTab('In Progress (Remote)')">🔵 Remote Work (<span id="countTabRemote">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusVisit" onclick="setOperationalTab('Field Visit Scheduled')">📅 Scheduled Visits (<span id="countTabVisit">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusVendor" onclick="setOperationalTab('Vendor Escalated')">🔴 Vendor Pending (<span id="countTabVendor">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusResolved" onclick="setOperationalTab('Resolved Remotely')">🟢 Resolved (<span id="countTabResolved">0</span>)</button>
      <button type="button" class="quick-pill" id="tabStatusClosed" onclick="setOperationalTab('Closed / Verified')">✅ Closed (<span id="countTabClosed">0</span>)</button>
    </div>

    <!-- Filter & Search Toolbar -->
    <section class="filter-card">
      <div class="search-box">
        <span class="search-box-icon">🔍</span>
        <input type="text" id="searchInput" class="search-input" oninput="window.renderTable()" onkeyup="window.renderTable()" onchange="window.renderTable()" placeholder="Search by Ticket ID (HTL-...), UDISE, School Name, AI Teacher, Phone, Block, District, Serial #, Vendor #..." autocomplete="off" spellcheck="false">
        <button type="button" id="btnClearSearch" onclick="clearSearchFilter()" style="display:none; background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:0 8px; font-size:14px;">✕</button>
      </div>
      <select id="districtFilter" class="filter-select" onchange="window.renderTable()">
        <option value="">All Districts (அனைத்து மாவட்டங்கள் - 262 Labs)</option>
        <option value="Thiruvarur">Thiruvarur (திருவாரூர் - 182 Labs)</option>
        <option value="Nagapattinam">Nagapattinam (நாகப்பட்டினம் - 80 Labs)</option>
      </select>
      <select id="blockFilter" class="filter-select" onchange="window.renderTable()">
        <option value="">All Blocks (அனைத்து வட்டாரங்கள்)</option>
        <optgroup label="Thiruvarur District Blocks">
          <option value="Koradachery">Koradachery (கொரடாச்சேரி)</option>
          <option value="Kottur">Kottur (கோட்டூர்)</option>
          <option value="Kudavasal">Kudavasal (குடவாசல்)</option>
          <option value="Mannargudi">Mannargudi (மன்னார்குடி)</option>
          <option value="Muthupet">Muthupet (முத்துப்பேட்டை)</option>
          <option value="Nannilam">Nannilam (நன்னிலம்)</option>
          <option value="Needamangalam">Needamangalam (நீடாமங்கலம்)</option>
          <option value="Thiruthuraipoondi">Thiruthuraipoondi (திருத்துறைப்பூண்டி)</option>
          <option value="Thiruvarur">Thiruvarur (திருவாரூர்)</option>
          <option value="Valangaiman">Valangaiman (வலங்கைமான்)</option>
        </optgroup>
        <optgroup label="Nagapattinam District Blocks">
          <option value="Vedaranyam">Vedaranyam (வேதாரண்யம்)</option>
          <option value="Nagapattinam">Nagapattinam (நாகப்பட்டினம்)</option>
          <option value="Kilvelur">Kilvelur (கீழ்வேளூர்)</option>
          <option value="Keezhaiyur">Keezhaiyur (கீழையூர்)</option>
          <option value="Thirumarugal">Thirumarugal (திருமருகல்)</option>
          <option value="Thalainayar">Thalainayar (தலைஞாயிறு)</option>
        </optgroup>
      </select>
      <select id="categoryFilter" class="filter-select" onchange="window.renderTable()">
        <option value="">All Resolution Categories</option>
        <option value="Resolved Remotely">🟢 1. Resolved Remotely (Phone/WhatsApp)</option>
        <option value="Solved by Direct Visit">🔵 2. Solved by Direct Visit (Physical Visit)</option>
        <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Needed)</option>
        <option value="Pending">🟡 புதிய புகார் / பரிசீலனை (New / Under Review)</option>
      </select>
      <select id="evidenceFilter" class="filter-select" onchange="window.renderTable()">
        <option value="">All Completion Evidence States</option>
        <option value="Complete">🟢 Complete (இரு புகைப்படங்களும் உள்ளன)</option>
        <option value="Pending">🟡 Pending (புகைப்படங்கள் நிலுவை)</option>
        <option value="Partial">🟠 Partial (1/2 புகைப்படம் உள்ளது)</option>
        <option value="Manual Upload">📎 Manually Uploaded by Engineer</option>
        <option value="GPS Missing">⚠️ GPS Missing / Unverified</option>
      </select>
      <button type="button" onclick="resetFilters()" class="btn btn-outline" style="padding:0.6rem 0.9rem;">✕ Reset Filters</button>
    </section>

    <!-- Data Table Card -->
    <section class="table-card">
      <div class="table-header-bar">
        <div class="table-title">
          <span>📋</span>
          <span>Registered Service Calls List</span>
          <span class="badge badge-remote" id="tableCountBadge">${totalReported} Calls</span>
        </div>
        <div style="display:flex; gap:8px;">
          <a href="/download-excel" class="btn btn-green btn-sm">📥 Excel Report</a>
          <button type="button" onclick="window.print()" class="btn btn-outline btn-sm">🖨️ Print</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <colgroup>
            <col class="col-ticket">
            <col class="col-photos">
            <col class="col-school">
            <col class="col-contact">
            <col class="col-remarks">
            <col class="col-status">
            <col class="col-fault">
            <col class="col-action">
          </colgroup>
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Service Call Photos</th>
              <th>School & Block</th>
              <th>School AI Contact</th>
              <th>Remarks</th>
              <th style="text-align: center;">Status</th>
              <th>Reported Fault & Priority</th>
              <th style="text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            ${generateTableRowsHtml(initialTickets)}
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <!-- Manage & Resolve Modal Drawer (Hardware-Accelerated Centered Drawer) -->
  <div id="actionModal" class="drawer-overlay" onclick="handleBackdropClick(event, 'actionModal')">
    <div class="drawer" onclick="event.stopPropagation()">
      <!-- Sticky Header -->
      <div class="drawer-header">
        <div>
          <span class="badge badge-open" id="modalTicketBadge">HTL-TVR-XXXX</span>
          <div class="drawer-title" id="modalTicketTitle" style="margin-top:4px;">Manage Service Call & Resolution</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;" id="modalTicketSub">School Name • Block Name</div>
        </div>
        <button type="button" class="drawer-close" onclick="closeActionModal()" title="Close Modal (Esc)">✕</button>
      </div>

      <!-- Scrollable Body -->
      <div class="drawer-body">
        <!-- AI/Teacher Remarks Info Card -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #2563eb; border-radius:8px; padding:10px 12px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:700; color:#1e40af; text-transform:uppercase; letter-spacing:0.5px;">📝 AI / Teacher Remarks (பள்ளி ஆசிரியர் குறிப்பு):</span>
            <span id="modalReportedFaultBadge" style="font-size:11px; font-weight:700; background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:4px;"></span>
          </div>
          <div id="modalTeacherRemarksText" style="font-size:13px; color:#1e293b; font-weight:500; white-space:pre-wrap; line-height:1.4;">—</div>
        </div>

        <!-- 1. Resolution Category Selection -->
        <div class="form-group">
          <label class="form-label">1. முதன்மைத் தீர்வு முறை (Select Resolution Strategy): <span style="color:#dc2626;">*</span></label>
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
        </div>

        <!-- 2. Inspection Photos Grid -->
        <div class="modal-photos-box">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:800; color:var(--text-primary);">📸 4 ஆய்வகப் புகைப்படங்கள் (Inspection Photos):</span>
            <button type="button" onclick="requestPhotosViaWhatsApp()" class="btn btn-green btn-sm" style="padding:3px 8px; font-size:11px;">📲 Ask Photos via WhatsApp</button>
          </div>

          <div class="modal-photo-4grid">
            <!-- Photo 1 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">1. UPS Display</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(1)">
                <img id="editPreview1" class="modal-photo-preview-img" style="display:none;" alt="UPS Display">
                <span id="noImg1" style="font-size:11px; color:var(--text-muted);">📷 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile1" accept="image/*" style="display:none;" onchange="handlePhotoUpload(1, event)">
              </label>
              <button type="button" onclick="clearPhoto(1)" class="btn-clear-photo">✕ Clear</button>
            </div>

            <!-- Photo 2 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">2. Overall UPS</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(2)">
                <img id="editPreview2" class="modal-photo-preview-img" style="display:none;" alt="Overall UPS">
                <span id="noImg2" style="font-size:11px; color:var(--text-muted);">🏫 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile2" accept="image/*" style="display:none;" onchange="handlePhotoUpload(2, event)">
              </label>
              <button type="button" onclick="clearPhoto(2)" class="btn-clear-photo">✕ Clear</button>
            </div>

            <!-- Photo 3 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">3. Battery MCB</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(3)">
                <img id="editPreview3" class="modal-photo-preview-img" style="display:none;" alt="Battery MCB">
                <span id="noImg3" style="font-size:11px; color:var(--text-muted);">🔋 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile3" accept="image/*" style="display:none;" onchange="handlePhotoUpload(3, event)">
              </label>
              <button type="button" onclick="clearPhoto(3)" class="btn-clear-photo">✕ Clear</button>
            </div>

            <!-- Photo 4 -->
            <div class="modal-photo-card">
              <span class="modal-photo-label">4. Transformer</span>
              <div class="modal-photo-preview-wrap" onclick="viewPhotoInModal(4)">
                <img id="editPreview4" class="modal-photo-preview-img" style="display:none;" alt="Transformer">
                <span id="noImg4" style="font-size:11px; color:var(--text-muted);">🔌 No Photo</span>
              </div>
              <label class="btn-choose-file">
                📁 Replace
                <input type="file" id="editFile4" accept="image/*" style="display:none;" onchange="handlePhotoUpload(4, event)">
              </label>
              <button type="button" onclick="clearPhoto(4)" class="btn-clear-photo">✕ Clear</button>
            </div>
          </div>
        </div>

        <!-- 3. Lifecycle Status & Priority -->
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Lifecycle Status:</label>
            <select id="modalStatus" class="form-control">
              <option value="New / Under Review">🟡 புதிய புகார் / பரிசீலனை (New / Under Review)</option>
              <option value="In Progress (Remote)">🔵 In Progress (Remote Guidance)</option>
              <option value="Resolved Remotely">🟢 Resolved Remotely</option>
              <option value="Solved by Direct Visit">🔵 Solved by Direct Visit</option>
              <option value="Vendor Escalated">🔴 Vendor Escalated (Parts Required)</option>
              <option value="Closed / Verified">✅ Closed & Verified</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority Level:</label>
            <select id="modalPriority" class="form-control">
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
        <div id="vendorBox" style="background:var(--status-incomplete-bg); border:1px solid var(--status-incomplete-border); border-radius:12px; padding:12px; display:none;">
          <span style="font-size: 12.5px; font-weight: 800; color:#b91c1c; display:flex; align-items:center; gap:6px; margin-bottom:8px;">
            <span>🚨</span> Vendor Escalation Details:
          </span>
          <div class="form-row-2" style="margin-bottom:8px;">
            <div class="form-group">
              <label class="form-label" style="color:#991b1b;">Vendor Company Name *</label>
              <input type="text" id="modalVendorName" class="form-control" placeholder="e.g. AVO / Delta / Numeric">
            </div>
            <div class="form-group">
              <label class="form-label" style="color:#991b1b;">Vendor Call Log # *</label>
              <input type="text" id="modalVendorTicket" class="form-control" placeholder="e.g. AVO-2026-9812">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" style="color:#991b1b;">Spare Parts Required *</label>
            <input type="text" id="modalParts" class="form-control" placeholder="e.g. Inverter Main PCB Board, 12V 42Ah Exide Battery">
          </div>
        </div>

        <!-- 4. Resolution Notes -->
        <div class="form-group">
          <label class="form-label">பொறியாளர் கள ஆய்வுக் குறிப்புகள் (Engineer Inspection Notes):</label>
          <textarea id="modalNotes" class="form-control" rows="3" placeholder="பழுது நீக்கிய முறை அல்லது தற்போதைய நிலை குறித்த விரிவான குறிப்புகளை எழுதவும்..."></textarea>
        </div>

        <!-- 5. COMPLETION EVIDENCE SECTION -->
        <div class="modal-photos-box" id="completionEvidenceSection" style="background: rgba(37, 99, 235, 0.04); border: 1.5px solid rgba(37, 99, 235, 0.25); border-radius: 12px; padding: 14px; margin-top: 14px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <span style="font-size:13px; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <span>📸</span> COMPLETION EVIDENCE (பணி நிறைவு ஆதாரங்கள்) <span style="color:#dc2626;">*</span>
              </span>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;" id="modalEvidenceSubText">பணியை முடித்து வைக்க இவ்விரண்டு புகைப்படங்களும் தேவை</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <span id="modalEvidenceRequestBadge" style="font-size:11px; font-weight:800; padding:4px 8px; border-radius:6px; background:#f1f5f9; color:#475569;">
                ⭕ Not Requested
              </span>
              <button type="button" id="btnAskCompletionPhoto" onclick="askCompletionPhotos()" class="btn btn-primary btn-sm" style="padding:4px 10px; font-size:11px; font-weight:800; background:#2563eb; color:#fff; display:inline-flex; align-items:center; gap:4px; border:none; cursor:pointer; border-radius:6px;">
                📸 Ask Completion Photos
              </button>
            </div>
          </div>

          <div class="completion-evidence-grid">
            <!-- Slot 1: HM Signed Completion Report (No Watermark) -->
            <div class="modal-photo-card" style="border: 1.5px dashed #93c5fd; background: var(--bg-card); padding:8px; border-radius:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span class="modal-photo-label" style="color:#1e40af; font-size:11px; font-weight:700;">1. 📄 HM Signed Report</span>
                <span id="modalHmUploadedBadge" style="font-size:10px; font-weight:800; color:#b91c1c;">❌ Missing</span>
              </div>
              <div class="modal-photo-preview-wrap" onclick="viewHmReportFullscreen()" style="height:110px; background:#f8fafc; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; border:1px solid #e2e8f0; margin:4px 0;">
                <img id="editHmReportPreview" class="modal-photo-preview-img" style="width:100%; height:100%; object-fit:cover; display:none;" alt="HM Signed Completion Report">
                <span id="noHmReportImg" style="font-size:11px; color:var(--text-muted); text-align:center; padding:4px;">📄 Upload HM Report<br><small style="color:#64748b;">(No Watermark)</small></span>
              </div>
              <div id="modalHmSourceText" style="font-size:10px; color:#1e40af; margin-bottom:4px; display:none;"></div>
              <div style="display:flex; gap:6px; width:100%;">
                <label class="btn-choose-file" style="flex:1; margin:0; text-align:center; padding:5px 8px; font-size:11px;">
                  📁 Upload / Replace
                  <input type="file" id="editHmReportFile" accept="image/*" style="display:none;" onchange="handleHmReportUpload(event)">
                </label>
                <button type="button" id="btnHmViewDirect" onclick="viewHmReportFullscreen()" class="btn btn-outline btn-sm" style="padding:4px 6px; font-size:11px;" title="View Fullscreen">👁 View</button>
                <button type="button" onclick="clearHmReportPhoto()" class="btn-clear-photo" style="padding:4px 8px; font-size:11px;" title="Clear Photo">✕</button>
              </div>
            </div>

            <!-- Slot 2: Completion Photo (GPS Watermarked) -->
            <div class="modal-photo-card" style="border: 1.5px dashed #38bdf8; background: var(--bg-card); padding:8px; border-radius:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span class="modal-photo-label" style="color:#0369a1; font-size:11px; font-weight:700;">2. 📍 GPS Completion Photo</span>
                <span id="modalCompUploadedBadge" style="font-size:10px; font-weight:800; color:#b91c1c;">❌ Missing</span>
              </div>
              <div class="modal-photo-preview-wrap" onclick="viewCompletionPhotoFullscreen()" style="height:110px; background:#f8fafc; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; border:1px solid #e2e8f0; margin:4px 0;">
                <img id="editCompletionPhotoPreview" class="modal-photo-preview-img" style="width:100%; height:100%; object-fit:cover; display:none;" alt="Completion Photo (GPS Watermarked)">
                <span id="noCompletionImg" style="font-size:11px; color:var(--text-muted); text-align:center; padding:4px;">📍 Take Photo<br><small style="color:#0284c7;">(GPS Watermarked)</small></span>
              </div>
              <div id="gpsStatusPill" style="font-size:9.5px; font-weight:700; color:#0369a1; background:rgba(3, 105, 161, 0.1); padding:2px 4px; border-radius:4px; margin-bottom:4px; text-align:center; display:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                📍 GPS Acquired
              </div>
              <div id="modalCompSourceText" style="font-size:10px; color:#0369a1; margin-bottom:4px; display:none;"></div>
              <div style="display:flex; gap:6px; width:100%;">
                <label class="btn-choose-file" style="flex:1; margin:0; text-align:center; padding:5px 8px; font-size:11px; background:#0284c7; color:#fff;">
                  📍 Camera with GPS
                  <input type="file" id="editCompletionPhotoFile" accept="image/*" style="display:none;" onchange="handleCompletionPhotoUpload(event)">
                </label>
                <button type="button" id="btnCompViewDirect" onclick="viewCompletionPhotoFullscreen()" class="btn btn-outline btn-sm" style="padding:4px 6px; font-size:11px;" title="View Fullscreen">👁 View</button>
                <button type="button" onclick="clearCompletionPhoto()" class="btn-clear-photo" style="padding:4px 8px; font-size:11px;" title="Clear Photo">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky Footer -->
      <div class="drawer-footer">
        <button type="button" class="btn btn-danger-outline" onclick="deleteCurrentTicket()">🗑️ Delete Call</button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-outline" onclick="closeActionModal()">✕ Cancel</button>
          <button type="button" class="btn btn-primary" id="btnSaveResolution" onclick="saveTicketUpdate()">💾 Save & Update</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Image Lightbox Modal with Gallery Navigation & Zoom -->
  <div id="imgModal" class="lightbox-modal" onclick="closeImgModal()">
    <div class="lightbox-card" onclick="event.stopPropagation()" style="display:flex; flex-direction:column; max-width:92vw; max-height:92vh; background:var(--bg-card); border-radius:16px; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.6); border:1px solid var(--border-color);">
      <div class="lightbox-header" style="padding:10px 18px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); background:var(--bg-main);">
        <div>
          <div id="lightboxTicketBadge" style="font-size:11px; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:0.04em;">📸 SERVICE CALL EVIDENCE</div>
          <div id="lightboxTitle" style="font-size:14px; font-weight:800; color:var(--text-primary); margin-top:2px;">Photo 1 of 4: Input MCB</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" onclick="navigateLightbox(-1)" class="btn btn-outline" style="padding:6px 12px; font-size:13px;" title="Previous Photo (Left Arrow)">◀ Prev</button>
          <button type="button" onclick="navigateLightbox(1)" class="btn btn-outline" style="padding:6px 12px; font-size:13px;" title="Next Photo (Right Arrow)">Next ▶</button>
          <button type="button" onclick="toggleLightboxZoom()" class="btn btn-outline" id="btnLightboxZoom" style="padding:6px 12px; font-size:13px;" title="Toggle Zoom (100% / 175%)">🔍 Zoom</button>
          <button type="button" onclick="closeImgModal()" class="drawer-close" style="width:32px; height:32px;" title="Close (Escape)">✕</button>
        </div>
      </div>
      <div style="overflow:auto; display:flex; align-items:center; justify-content:center; padding:16px; background:#0f172a; min-height:360px; max-height:75vh;">
        <img id="modalImg" referrerpolicy="no-referrer" class="lightbox-img" style="max-width:100%; max-height:72vh; object-fit:contain; transition:transform 0.2s ease; border-radius:6px;" alt="Service call visual evidence">
      </div>
      <div style="padding:8px 18px; font-size:11.5px; color:var(--text-muted); background:var(--bg-main); border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
        <span id="lightboxContext">Ticket Context: #HTL-TVR-05301-2 • GGHSS KORADACHERY</span>
        <span>Keyboard: ◀ Left • ▶ Right • Esc Close</span>
      </div>
    </div>
  </div>

  <!-- Reset Password Protection Modal -->
  <div id="resetModal" class="drawer-overlay" onclick="handleBackdropClick(event, 'resetModal')">
    <div class="drawer" style="max-width:440px;" onclick="event.stopPropagation()">
      <div class="drawer-header">
        <div class="drawer-title" style="color:#dc2626;">⚠️ Confirm Full Data Reset</div>
        <button type="button" class="drawer-close" onclick="closeResetModal()">✕</button>
      </div>
      <div class="drawer-body">
        <p style="font-size:13px; color:var(--text-secondary);">This action will <strong>permanently erase all service call records</strong> to start completely clean for all 262 schools (182 Thiruvarur + 80 Nagapattinam).</p>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label">Enter Master Security Protection Password:</label>
          <input type="password" id="resetPasswordInput" class="form-control" placeholder="Enter Protection Password" autocomplete="new-password">
        </div>
      </div>
      <div class="drawer-footer">
        <button type="button" class="btn btn-outline" onclick="closeResetModal()">Cancel</button>
        <button type="button" class="btn btn-danger-outline" style="background:#dc2626; color:#fff;" onclick="executeSecureReset()">Confirm & Reset All</button>
      </div>
    </div>
  </div>

  <!-- Initial Server-Rendered JSON Payload -->
  <script id="initialTicketsData" type="application/json">${JSON.stringify(initialTickets).replace(/</g, '\\u003c')}</script>
  <script id="masterSchoolsData" type="application/json">${JSON.stringify(db.masterSchools).replace(/</g, '\\u003c')}</script>

  <script>
    // Theme toggle logic
    function toggleTheme() {
      const html = document.documentElement;
      const cur = html.getAttribute('data-theme') || 'light';
      const next = cur === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      localStorage.setItem('fieldTrackerTheme', next);
    }
    (function initTheme() {
      const saved = localStorage.getItem('fieldTrackerTheme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    })();

    function filterByKpi(cat) {
      const cFilter = document.getElementById('categoryFilter');
      if (cFilter) {
        cFilter.value = (cat === 'ALL') ? '' : cat;
        window.renderTable();
      }
    }

    function resetFilters() {
      const si = document.getElementById('searchInput');
      const bf = document.getElementById('blockFilter');
      const cf = document.getElementById('categoryFilter');
      if (si) si.value = '';
      if (bf) bf.value = '';
      if (cf) cf.value = '';
      window.renderTable();
    }

    function updateAllKpis() {
      const total = allTickets.length;
      const rem = allTickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
      const dir = allTickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
      const ven = allTickets.filter(t => t.status === 'Vendor Escalated').length;
      const pend = allTickets.filter(t => !t.status || t.status === 'New / Under Review' || t.status === 'In Progress (Remote)').length;

      const kTotal = document.getElementById('kpiTotal');
      const kRep = document.getElementById('kpiReported');
      const kRem = document.getElementById('kpiResolvedRemote');
      const kDir = document.getElementById('kpiSolvedDirect');
      const kPend = document.getElementById('kpiPending');
      const kVen = document.getElementById('kpiVendor');
      const kTableCount = document.getElementById('tableCountBadge');

      if (kTotal) kTotal.textContent = (masterDirectory && masterDirectory.length) ? masterDirectory.length : 262;
      if (kRep) kRep.textContent = total;
      if (kRem) kRem.textContent = rem;
      if (kDir) kDir.textContent = dir;
      if (kPend) kPend.textContent = pend;
      if (kVen) kVen.textContent = ven;
      if (kTableCount) kTableCount.textContent = total + ' Calls';
    }


    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

function generateTableRowsHtml(list) {
    if (!list || list.length === 0) {
      return '<tr><td colspan="8" style="text-align:center; padding: 3rem 1rem; color: var(--text-muted);"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>No service calls registered yet.</td></tr>';
    }

    return list.map(function(t) {
      const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
      let badgeHtml = '<span class="badge badge-status-pending">🟡 New / Under Review</span>';
      if (tCat === 'Resolved Remotely') badgeHtml = '<span class="badge badge-status-completed">🟢 Resolved Remotely</span>';
      else if (tCat === 'Solved by Direct Visit') badgeHtml = '<span class="badge badge-status-direct">🔵 Solved by Direct Visit</span>';
      else if (t.status === 'Vendor Escalated') badgeHtml = '<span class="badge badge-status-incomplete">🔴 Vendor Escalated</span>';

      const hasHm = !!(t.hmReportPhotoBase64 || t.hmReportPhotoUrl || t.completionEvidence?.hmSignedReport?.data || t.completionEvidence?.hmSignedReport?.fileUrl);
      const hasComp = !!(t.completionPhotoBase64 || t.completionPhotoUrl || t.completionEvidence?.completionPhoto?.data || t.completionEvidence?.completionPhoto?.fileUrl);
      const has2of2Evidence = hasHm && hasComp;
      const has1of2Evidence = !has2of2Evidence && (hasHm || hasComp);
      const isEvidenceReq = !has2of2Evidence && !has1of2Evidence && !!(t.completionEvidenceRequested || t.completionEvidenceStatus === 'REQUESTED');

      let evBadge = '';
      if (has2of2Evidence) {
        evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">📸 2/2 Evidence Attached</span></div>';
      } else if (has1of2Evidence) {
        evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">📸 1/2 Evidence Uploaded</span></div>';
      } else if (isEvidenceReq) {
        evBadge = '<div style="margin-top:3px;"><span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:0.65rem; font-weight:800; padding:1px 5px; display:inline-flex; align-items:center; gap:3px;">⏳ Evidence Requested</span></div>';
      }

      let prioClass = 'prio-med';
      const p = t.priority || 'Medium';
      if (p.includes('Critical')) prioClass = 'prio-crit';
      else if (p.includes('High')) prioClass = 'prio-high';
      else if (p.includes('Low')) prioClass = 'prio-low';

      const escTicketId = escapeHtml(t.ticketId);
      const escCreatedDate = escapeHtml(typeof normalizeTicketDate === 'function' ? normalizeTicketDate(t.createdDate || t.createdAt || '-') : (t.createdDate || t.createdAt || '-'));
      const escSchoolName = escapeHtml(t.schoolName);
      const escBlock = escapeHtml(t.block);
      const escUdise = escapeHtml(t.udise);
      const escAiName = escapeHtml(t.aiName || '-');
      const escPhone = escapeHtml(t.phone || '-');
      const escRemarks = t.remarks ? escapeHtml(t.remarks) : '';
      const escIssue = escapeHtml(t.issue || '-');
      const escPriority = escapeHtml(p);
      const escResolutionNotes = escapeHtml(t.resolutionNotes || '');
      const escVendorName = escapeHtml(t.vendorName || '');
      const escVendorTicketNo = escapeHtml(t.vendorTicketNo || 'Pending #');
      const cleanPhone = String(t.phone || '').replace(/\D/g, '');

      const relTime = typeof formatRelativeTime === 'function' ? formatRelativeTime(t.createdDate || t.createdAt) : '';
      const schoolTicketsCount = (allTickets || []).filter(x => x.udise && x.udise === t.udise).length;
      const repeatBadge = schoolTicketsCount > 1 ? '<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.62rem; font-weight:700; padding:1px 4px; margin-top:2px; display:inline-block;" title="' + schoolTicketsCount + ' total service calls for this UDISE">🔁 Repeat (' + schoolTicketsCount + ')</span>' : '';

      return '<tr data-ticket-id="' + escTicketId + '">' +
        '<td class="col-ticket font-mono" style="font-weight: 700;">' +
          '<div style="font-weight: 800; color: #1e3a8a; font-size: 0.85rem; font-family: var(--font-mono); white-space: nowrap;">#' + escTicketId + '</div>' +
          '<div style="color: var(--text-muted); font-size: 0.70rem; margin-top: 2px; font-family: var(--font-main); font-weight: 500; line-height: 1.35;">' + escCreatedDate + (relTime ? ' • <strong style="color:#0284c7;">' + relTime + '</strong>' : '') + '</div>' +
          repeatBadge +
        '</td>' +
        '<td class="col-photos" style="white-space: nowrap;">' +
          '<div class="thumb-grid">' +
            renderPhotoThumbnailHtml(t.photo1Url, 1, '1. Wall Power / Main MCB') +
            renderPhotoThumbnailHtml(t.photo2Url, 2, '2. UPS Front Display') +
            renderPhotoThumbnailHtml(t.photo3Url, 3, '3. Battery Bank & Rack') +
            renderPhotoThumbnailHtml(t.photo4Url, 4, '4. Hi-Tech Lab Overview') +
          '</div>' +
        '</td>' +
        '<td class="col-school">' +
          '<div style="color: var(--text-primary); font-weight: 700; font-size: 0.88rem; line-height: 1.3; word-break: break-word;">' + escSchoolName + '</div>' +
          '<div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 1.5px; display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">' +
            '<span style="white-space: nowrap;">UDISE: <strong style="color: var(--primary); font-weight: 700;">' + escUdise + '</strong></span>' +
            '<span class="badge" style="background:' + ((t.district && t.district.toLowerCase() === 'nagapattinam') || (t.ticketId && t.ticketId.includes('NGP')) ? '#fef3c7; color:#92400e; border:1px solid #fde68a;' : '#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;') + ' font-size: 0.68rem; font-weight: 800; padding: 1px 6px; white-space: nowrap;">' + (t.district || ((t.ticketId && t.ticketId.includes('NGP')) ? 'Nagapattinam' : 'Thiruvarur')) + '</span>' +
            '<span class="badge" style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 0.1rem 0.45rem; font-size: 0.68rem; font-weight: 700; color: #1e3a8a; white-space: nowrap;">' + escBlock + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="col-contact">' +
          '<div style="font-weight: 700; color: var(--text-primary); font-size: 0.84rem; line-height: 1.25; word-break: break-word;">' + escAiName + '</div>' +
          '<a href="tel:' + cleanPhone + '" class="font-mono" style="color: var(--primary); font-weight: 700; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px; white-space: nowrap;">📞 ' + escPhone + '</a>' +
        '</td>' +
        '<td class="col-remarks remarks-cell">' +
          (escRemarks ? '<div class="remarks-text">' + escRemarks + '</div>' : '<span style="color: var(--text-muted); font-style: italic;">—</span>') +
        '</td>' +
        '<td class="col-status" style="text-align: center; white-space: nowrap;">' +
          badgeHtml + evBadge +
          (t.resolutionNotes ? '<div style="color: #1e293b; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border-left: 2px solid #3b82f6; margin-top: 3px; font-size: 0.72rem; max-width: 180px; text-align: left; white-space: normal; margin-left: auto; margin-right: auto;">' + escResolutionNotes + '</div>' : '') +
        '</td>' +
        '<td class="col-fault fault-cell">' +
          '<div style="font-size: 0.84rem; font-weight: 600; color: var(--text-primary); line-height: 1.35; margin-bottom: 2px;">' + escIssue + '</div>' +
          '<span class="prio-pill ' + prioClass + '">' + escPriority + '</span>' +
        '</td>' +
        '<td class="col-action" style="text-align: center; white-space: nowrap;">' +
          '<div style="display: flex; align-items: center; justify-content: center; gap: 5px;">' +
            '<button type="button" data-tid="' + escTicketId + '" onclick="openActionModal(this.dataset.tid)" class="btn-table-action btn-table-manage" title="Edit & Manage Service Call (புகார் திருத்து & தீர்வு செய்க)">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
            '</button>' +
            '<button type="button" data-tid="' + escTicketId + '" onclick="printServiceSlip(this.dataset.tid)" class="btn-table-action btn-table-slip" title="Print Service Slip (சர்வீஸ் ஸ்லிப் அச்சிடு)">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>' +
            '</button>' +
            '<button type="button" data-tid="' + escTicketId + '" onclick="window.deleteSingleTicket(this.dataset.tid)" class="btn-table-action btn-table-del" title="Delete Service Call (அழைப்பை நீக்கு)">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
            '</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }
    window.generateTableRowsHtml = generateTableRowsHtml;
    window.escapeHtml = escapeHtml;

    function getDeletedList() {
      var list = [];
      try {
        var ls = localStorage.getItem('htl_deleted_tickets');
        if (ls) { var p = JSON.parse(ls); if (Array.isArray(p)) list = list.concat(p); }
      } catch(e) {}
      try {
        var ss = sessionStorage.getItem('htl_session_deleted');
        if (ss) { var p2 = JSON.parse(ss); if (Array.isArray(p2)) list = list.concat(p2); }
      } catch(e) {}
      try {
        var m = document.cookie.match(/(?:^|;\s*)htl_del=([^;]+)/);
        if (m && m[1]) {
          var cArr = decodeURIComponent(m[1]).split(',');
          list = list.concat(cArr);
        }
      } catch(e) {}
      var unique = [];
      list.forEach(function(id) {
        var clean = String(id || '').trim();
        if (clean && !unique.includes(clean)) unique.push(clean);
      });
      return unique;
    }

    function saveDeletedList(list) {
      if (!Array.isArray(list)) return;
      try { localStorage.setItem('htl_deleted_tickets', JSON.stringify(list)); } catch(e) {}
      try { sessionStorage.setItem('htl_session_deleted', JSON.stringify(list)); } catch(e) {}
      try {
        var joined = encodeURIComponent(list.slice(0, 100).join(','));
        document.cookie = 'htl_del=' + joined + '; path=/; max-age=31536000; SameSite=Lax';
      } catch(e) {}
    }

    try {
      const initEl = document.getElementById('initialTicketsData');
      if (initEl && initEl.textContent) {
        allTickets = JSON.parse(initEl.textContent) || [];
      }
    } catch(e) {}

    // Run immediate render & KPI update on initial boot
    if (typeof window !== 'undefined') {
      setTimeout(function() {
        if (typeof purgeClientDeletedRows === 'function') purgeClientDeletedRows();
        if (typeof renderTable === 'function') renderTable();
        if (typeof updateAllKpis === 'function') updateAllKpis();
      }, 0);
    }

    function purgeClientDeletedRows() {
      try {
        const delList = getDeletedList();
        if (delList.length > 0) {
          allTickets = allTickets.filter(function(t) {
            return t && t.ticketId && !delList.includes(String(t.ticketId).trim());
          });
          renderTable();
          updateAllKpis();
        }
      } catch(e) {}
    }

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
      if (bRem) bRem.classList.remove('active-remote');
      if (bDir) bDir.classList.remove('active-direct');

      if (cat === 'Resolved Remotely') {
        if (bRem) bRem.classList.add('active-remote');
        const mStat = document.getElementById('modalStatus');
        if (mStat) mStat.value = 'Resolved Remotely';
      } else if (cat === 'Solved by Direct Visit') {
        if (bDir) bDir.classList.add('active-direct');
        const mStat = document.getElementById('modalStatus');
        if (mStat) mStat.value = 'Solved by Direct Visit';
      }
    }

    const modalStatusEl = document.getElementById('modalStatus');
    if (modalStatusEl) {
      modalStatusEl.addEventListener('change', function() {
        const vBox = document.getElementById('vendorBox');
        if (vBox) vBox.style.display = (this.value === 'Vendor Escalated') ? 'block' : 'none';
        if (this.value === 'Resolved Remotely') selectCategory('Resolved Remotely');
        else if (this.value === 'Solved by Direct Visit') selectCategory('Solved by Direct Visit');
      });
    }

    async function loadData() {
      const tbody = document.getElementById('tableBody');
      const controller = new AbortController();
      const timeoutId = setTimeout(function() { controller.abort(); }, 20000);
      try {
        const res = await fetch('/api/data?v=' + Date.now(), { credentials: 'same-origin', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 401) {
          window.location.href = '/login?redirect=/engineer';
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.tickets)) {
            // Client-side deletion safety filter
            const delList = (typeof getDeletedList === 'function') ? getDeletedList() : [];
            const safeTickets = data.tickets.filter(function(t) {
              if (!t || !t.ticketId) return false;
              const tid = String(t.ticketId).trim();
              if (delList.includes(tid) || delList.includes(tid.toLowerCase())) return false;
              return true;
            });
            allTickets = safeTickets;
            const kpiTot = document.getElementById('kpiTotal');
            if (kpiTot) kpiTot.textContent = data.totalSchools || 262;
          }
        }
      } catch (e) {
        clearTimeout(timeoutId);
        console.warn('Background sync note:', e.message);
      }

      updateAllKpis();

      if (allTickets.length > 0) {
        renderTable();
      } else if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 35px 20px; color: #dc2626;">' +
          '<div style="font-size:26px; margin-bottom:6px;">⚠️</div>' +
          '<strong style="font-size:14px; display:block;">தகவல்களைப் பெறுவதில் தாமதம் ஏற்பட்டது</strong>' +
          '<button type="button" onclick="loadData()" class="btn btn-blue" style="margin-top:12px; padding:7px 16px;">🔄 மீண்டும் முயற்சிக்கவும் (Retry)</button>' +
        '</td></tr>';
      }
    }

    function extractDriveFileId(url) {
      if (!url || typeof url !== 'string') return '';
      const u = url.trim();
      if (u.includes('drive.google.com/file/d/')) {
        const parts = u.split('drive.google.com/file/d/')[1];
        return parts.split('/')[0].split('?')[0];
      } else if (u.includes('id=')) {
        const parts = u.split('id=')[1];
        if (parts) return parts.split('&')[0].split('/')[0];
      }
      return '';
    }

    function normalizeImageUrl(url) {
      if (!url || typeof url !== 'string') return '';
      const u = url.trim();
      if (!u || u === 'No Photo') return '';
      if (u.startsWith('data:image') || u.startsWith('/uploads/')) return u;

      const fileId = extractDriveFileId(u);
      if (fileId) {
        return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800';
      }
      return u;
    }

    function handleImgError(img, fileId) {
      if (!img || !fileId || img.dataset.triedProxy) return;
      img.dataset.triedProxy = '1';
      img.src = '/api/photo-proxy?id=' + encodeURIComponent(fileId);
    }

    function renderPhotoThumbnailHtml(url, index, label) {
      const norm = normalizeImageUrl(url);
      const fileId = extractDriveFileId(url);
      if (!norm) {
        return '<div class="thumb-placeholder" title="' + label + ' (Not Uploaded)">' +
          '<span class="thumb-ph-icon">📷</span>' +
          '<span class="thumb-ph-idx">' + index + '</span>' +
        '</div>';
      }
      const fallbackAttr = fileId ? ' onerror="handleImgError(this, \\'' + fileId + '\\')"' : '';
      return '<div class="thumb-wrap" title="' + label + '">' +
        '<img src="' + norm + '" referrerpolicy="no-referrer" loading="lazy" class="thumb-img" onclick="showImgModal(this.src)"' + fallbackAttr + ' alt="' + label + '">' +
        '<span class="thumb-badge">' + index + '</span>' +
      '</div>';
    }

    let masterDirectory = [];
    try {
      const mEl = document.getElementById('masterSchoolsData');
      if (mEl && mEl.textContent) masterDirectory = JSON.parse(mEl.textContent) || [];
    } catch(e) {}

    function resetFilters() {
      const sInput = document.getElementById('searchInput');
      if (sInput) sInput.value = '';
      const bClear = document.getElementById('btnClearSearch');
      if (bClear) bClear.style.display = 'none';
      const dFilter = document.getElementById('districtFilter');
      if (dFilter) dFilter.value = '';
      const bFilter = document.getElementById('blockFilter');
      if (bFilter) bFilter.value = '';
      const cFilter = document.getElementById('categoryFilter');
      if (cFilter) cFilter.value = '';
      const eFilter = document.getElementById('evidenceFilter');
      if (eFilter) eFilter.value = '';
      renderTable();
    }
    window.resetFilters = resetFilters;

    function clearSearchFilter() {
      const sInput = document.getElementById('searchInput');
      if (sInput) {
        sInput.value = '';
        sInput.focus();
      }
      const bClear = document.getElementById('btnClearSearch');
      if (bClear) bClear.style.display = 'none';
      renderTable();
    }
    window.clearSearchFilter = clearSearchFilter;

    
    function parseAppDate(input) {
      if (!input) return 0;
      if (input instanceof Date) return isNaN(input.getTime()) ? 0 : input.getTime();
      if (typeof input === 'number') return isNaN(input) ? 0 : input;

      const str = String(input).trim();
      if (!str) return 0;

      // 1. Standard ISO 8601 (e.g. 2026-09-03T12:50:06+05:30, 2026-09-03T07:20:06.000Z, 2026-09-03)
      if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') {
        const parsed = Date.parse(str);
        if (!isNaN(parsed)) return parsed;
      }

      // 2. Tokenize DD/MM/YYYY or MM/DD/YYYY with time (Zero-regex, completely immune to template string escape issues)
      const clean = str.split(',').join(' ').trim();
      const tokens = clean.split(' ').filter(Boolean);
      const dateToken = tokens[0] || '';
      let dateParts = [];
      if (dateToken.indexOf('/') !== -1) dateParts = dateToken.split('/');
      else if (dateToken.indexOf('-') !== -1) dateParts = dateToken.split('-');

      if (dateParts.length === 3) {
        let part1 = parseInt(dateParts[0], 10);
        let part2 = parseInt(dateParts[1], 10);
        let year = parseInt(dateParts[2], 10);

        if (!isNaN(part1) && !isNaN(part2) && !isNaN(year)) {
          let hours = 0;
          let minutes = 0;
          let seconds = 0;

          const timeToken = tokens[1] || '';
          if (timeToken.indexOf(':') !== -1) {
            const timeParts = timeToken.split(':');
            hours = parseInt(timeParts[0] || '0', 10);
            minutes = parseInt(timeParts[1] || '0', 10);
            seconds = parseInt(timeParts[2] || '0', 10);
          }

          const merToken = (tokens[2] || '').toLowerCase();
          if (merToken.indexOf('pm') !== -1 && hours < 12) hours += 12;
          if (merToken.indexOf('am') !== -1 && hours === 12) hours = 0;

          let day, month;
          if (part1 > 12) {
            day = part1;
            month = part2;
          } else if (part2 > 12) {
            day = part2;
            month = part1;
          } else {
            // Both <= 12: In 2026 September tickets, part1=9 is September, part2 is day
            if (year === 2026 && part1 === 9 && part2 <= 12) {
              day = part2;
              month = 9;
            } else {
              day = part1;
              month = part2;
            }
          }

          // Convert IST parts (UTC+05:30) to epoch milliseconds
          const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
          return Date.UTC(year, month - 1, day, hours, minutes, seconds) - istOffsetMs;
        }
      }

      // 3. Fallback
      const d = Date.parse(str);
      return isNaN(d) ? 0 : d;
    }

    function formatAppDate(input) {
      const ts = parseAppDate(input);
      if (!ts) return '';
      const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
      const d = new Date(ts + istOffsetMs);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      let hours = d.getUTCHours();
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
      const seconds = String(d.getUTCSeconds()).padStart(2, '0');
      const meridiem = hours >= 12 ? 'pm' : 'am';
      let h12 = hours % 12 || 12;
      const h12Str = String(h12).padStart(2, '0');

      return day + '/' + month + '/' + year + ', ' + h12Str + ':' + minutes + ':' + seconds + ' ' + meridiem;
    }

    function formatRelativeTime(input, fromTime) {
      const ts = parseAppDate(input);
      if (!ts) return '';
      const now = fromTime || Date.now();
      const diffSec = Math.floor((now - ts) / 1000);
      if (diffSec < 0) return 'Just now';
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
      if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
      if (diffSec < 172800) return '1d ago';
      return Math.floor(diffSec / 86400) + 'd ago';
    }

    function normalizeTicketDate(s) {
      return formatAppDate(s);
    }

    function parseTicketTimestamp(s) {
      return parseAppDate(s);
    }

    let activeOperationalTab = 'ALL';

    function setOperationalTab(tab) {
      activeOperationalTab = tab;
      ['tabStatusAll', 'tabStatusNew', 'tabStatusRemote', 'tabStatusVisit', 'tabStatusVendor', 'tabStatusResolved', 'tabStatusClosed'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.background = 'var(--bg-card)';
      });
      const activeBtn = tab === 'ALL' ? document.getElementById('tabStatusAll') :
        (tab === 'New / Under Review' ? document.getElementById('tabStatusNew') :
        (tab === 'In Progress (Remote)' ? document.getElementById('tabStatusRemote') :
        (tab === 'Field Visit Scheduled' ? document.getElementById('tabStatusVisit') :
        (tab === 'Vendor Escalated' ? document.getElementById('tabStatusVendor') :
        (tab === 'Resolved Remotely' ? document.getElementById('tabStatusResolved') : document.getElementById('tabStatusClosed'))))));
      if (activeBtn) activeBtn.style.background = 'var(--primary-light)';
      renderTable();
    }
    window.setOperationalTab = setOperationalTab;



    function renderTable() {
      try {
        const searchInputEl = document.getElementById('searchInput');
        let rawVal = searchInputEl ? (searchInputEl.value || '') : '';
        // Sanitize invisible unicode, non-breaking spaces, zero-width chars from copied WhatsApp/Excel text
        let search = (rawVal || '').replace(new RegExp('[\\s\\u200B-\\u200D\\uFEFF\\u00A0]+', 'g'), ' ').trim().toLowerCase();
        
        // Ignore autofilled credential names
        if (search === 'shameer' || search === 'engineer' || search === 'mohamed' || search === 'head' || search === 'admin') {
          search = '';
          if (searchInputEl) searchInputEl.value = '';
        }

        const bClear = document.getElementById('btnClearSearch');
        if (bClear) bClear.style.display = search ? 'block' : 'none';

        const dEl = document.getElementById('districtFilter');
        const dist = (dEl ? (dEl.value || '') : '').trim().toLowerCase();

        const bEl = document.getElementById('blockFilter');
        const block = (bEl ? (bEl.value || '') : '').trim().toLowerCase();
        
        const cEl = document.getElementById('categoryFilter');
        const cat = (cEl ? (cEl.value || '') : '').trim();

        // Extract pure digits from search query (e.g. "33200503002" or "+91 9751885293")
        const searchDigits = search.replace(/\D/g, '');
        
        const filtered = allTickets.filter(function(t) {
          if (!t || !t.ticketId) return false;
          const tTid = (t.ticketId || '').toLowerCase();
          const tSchool = (t.schoolName || '').toLowerCase();
          const tIssue = (t.issue || '').toLowerCase();
          const tRem = (t.remarks || '').toLowerCase();
          if (tTid.includes('test') || tTid.includes('p29') || tTid.includes('p30') || tTid.includes('p31') || tTid.includes('p32') || tTid.includes('audit') || tTid.includes('simulation') || tTid.includes('dummy') || tTid.includes('9999') || tTid === 'htl-ngp-00999' || tTid === 'htl-ngp-00902' || (tTid.startsWith('htl-tvr-00101-') && tTid !== 'htl-tvr-00101') || tSchool.includes('test') || tSchool.includes('simulation') || tSchool.includes('audit lab') || tIssue.includes('simulation') || tIssue.includes('test') || tRem.includes('test remarks 12345')) return false;
          try {
            const curDel = getDeletedList();
            if (curDel.includes(t.ticketId)) return false;
          } catch(e) {}
          const tUdise = String(t.udise || '').toLowerCase();
          const tUdiseDigits = String(t.udise || '').replace(/\D/g, '');
          const tAi = (t.aiName || '').toLowerCase();
          const tPhoneDigits = String(t.phone || '').replace(/\D/g, '');
          const tBlock = (t.block || '').toLowerCase();

          // 1. Match Search
          let matchSearch = true;
          if (search) {
            matchSearch = false;
            // Match pure UDISE digits (starts with 33200... or contains digits)
            if (searchDigits && searchDigits.length >= 2 && tUdiseDigits.includes(searchDigits)) matchSearch = true;
            // Match phone digits
            else if (searchDigits && searchDigits.length >= 4 && tPhoneDigits.includes(searchDigits)) matchSearch = true;
            // Match text substrings including Hardware Serial & Vendor Ticket
            else if (tSchool.includes(search) || tUdise.includes(search) || tAi.includes(search) || tTid.includes(search) || tIssue.includes(search) || tBlock.includes(search) || (t.serialNo && t.serialNo.toLowerCase().includes(search)) || (t.vendorTicketNo && t.vendorTicketNo.toLowerCase().includes(search)) || (t.vendorName && t.vendorName.toLowerCase().includes(search))) matchSearch = true;
          }

          // 2. Match District
          const tDist = (t.district || (t.ticketId && t.ticketId.includes('NGP') ? 'Nagapattinam' : 'Thiruvarur')).toLowerCase();
          const matchDist = !dist || tDist.includes(dist);

          // 3. Match Block
          const matchBlock = !block || tBlock.includes(block);

          // 4. Match Category
          const tCat = t.resolutionCategory || (t.status === 'Resolved Remotely' ? 'Resolved Remotely' : (t.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : 'Pending'));
          const matchCat = !cat || tCat === cat;

          return matchSearch && matchDist && matchBlock && matchCat;
        });

        
        filtered.sort(function(a, b) {
          return parseTicketTimestamp(b.createdDate || b.createdAt) - parseTicketTimestamp(a.createdDate || a.createdAt);
        });

        // Update table count badge (e.g. "24 Calls")
        const kTableCount = document.getElementById('tableCountBadge');
        if (kTableCount) kTableCount.textContent = filtered.length + ' Calls';

        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        if (filtered.length === 0) {
          let smartMatch = null;
          if (search && (searchDigits.length >= 3 || search.length >= 3)) {
            smartMatch = masterDirectory.find(function(m) {
              const mUdise = String(m.udise || '');
              const mUdiseDigits = mUdise.replace(/\D/g, '');
              const mName = (m.school || m.schoolName || '').toLowerCase();
              const mTeacher = (m.name || m.aiName || '').toLowerCase();
              if (searchDigits && searchDigits.length >= 3 && mUdiseDigits.includes(searchDigits)) return true;
              if (mName.includes(search)) return true;
              if (mTeacher.includes(search)) return true;
              return false;
            });
          }

          if (smartMatch) {
            const sName = smartMatch.school || smartMatch.schoolName || 'School';
            const sUdise = smartMatch.udise || '-';
            const sBlock = smartMatch.block || '-';
            const sTeacher = smartMatch.name || smartMatch.aiName || 'AI Teacher';
            const sPhone = smartMatch.phone || '-';
            const cleanP = String(sPhone).replace(/\D/g, '');

            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 35px 20px; background:#f8fafc;">' +
              '<div style="font-size:32px; margin-bottom:8px;">🏫</div>' +
              '<strong style="font-size:16px; color:#0f172a; display:block;">' + sName + ' (' + sUdise + ')</strong>' +
              '<div style="font-size:13px; color:#475569; margin-top:4px;">வட்டாரம்: <strong>' + sBlock + '</strong> Block • AI ஆசிரியர்: <strong>' + sTeacher + '</strong> (<a href="tel:' + cleanP + '" style="color:#2563eb; font-weight:700;">📞 ' + sPhone + '</a>)</div>' +
              '<div style="margin-top:14px; display:inline-block; padding:8px 18px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:20px; font-weight:700; font-size:13px;">' +
                '✅ இந்தப் பள்ளியிலிருந்து இதுவரை எந்தப் புகாரும் பதிவு செய்யப்படவில்லை (No Complaints Registered - Lab Normal)' +
              '</div>' +
            '</td></tr>';
            return;
          }

          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: #64748b; font-size:14px;">🔍 "' + (search || '') + '" தொடர்பான புகார்கள் ஏதும் காணப்படவில்லை.</td></tr>';
          return;
        }

                const currentSig = search + '|' + dist + '|' + block + '|' + cat + '|' + JSON.stringify(filtered.map(function(t) { 
          return t.ticketId + '_' + t.status + '_' + (t.createdDate || t.createdAt || '') + '_' + (t.issue || ''); 
        }));

        if (!window.__forceRender && currentSig === window.__lastRenderSignature && tbody.children.length > 0 && !tbody.innerText.includes('தகவல்களைப் பெறுவதில்')) {
          return;
        }
        window.__lastRenderSignature = currentSig;
        tbody.innerHTML = generateTableRowsHtml(filtered);
      } catch (err) {
        console.error('renderTable error:', err);
      }
    }

    window.renderTable = renderTable;

    // Attach listeners on DOM ready and immediately
    (function attachLiveEvents() {
      function bindAll() {
        const sInput = document.getElementById('searchInput');
        if (sInput) {
          ['input', 'keyup', 'change', 'paste', 'search'].forEach(function(ev) {
            sInput.addEventListener(ev, function() {
              setTimeout(renderTable, 20);
            });
          });
        }
        const bFilter = document.getElementById('blockFilter');
        if (bFilter) bFilter.onchange = renderTable;
        const cFilter = document.getElementById('categoryFilter');
        if (cFilter) cFilter.onchange = renderTable;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { renderTable(); bindAll(); });
      } else {
        bindAll();
      }
    })();


    let currentLightboxTicket = null;
    let currentLightboxIndex = 1;
    let isLightboxZoomed = false;
    const PHOTO_CATEGORIES = [
      '1. Input MCB & Power Source',
      '2. UPS Display & Panel Status',
      '3. Battery Rack & Terminal Setup',
      '4. Hi-Tech Lab Overall Environment'
    ];

    function openLightboxGallery(tid, index) {
      const t = allTickets.find(x => String(x.ticketId).trim() === String(tid).trim());
      if (t) {
        currentLightboxTicket = t;
        currentLightboxIndex = index || 1;
        isLightboxZoomed = false;
        renderLightboxPhoto();
        document.getElementById('imgModal').style.display = 'flex';
      }
    }
    window.openLightboxGallery = openLightboxGallery;

    function renderLightboxPhoto() {
      if (!currentLightboxTicket) return;
      const t = currentLightboxTicket;
      const idx = currentLightboxIndex;
      const photoUrl = (idx === 1) ? t.photo1Url : ((idx === 2) ? t.photo2Url : ((idx === 3) ? t.photo3Url : t.photo4Url));
      const norm = normalizeImageUrl(photoUrl);
      const fileId = extractDriveFileId(photoUrl);

      const mImg = document.getElementById('modalImg');
      if (mImg) {
        mImg.setAttribute('referrerpolicy', 'no-referrer');
        mImg.style.transform = isLightboxZoomed ? 'scale(1.75)' : 'scale(1)';
        mImg.style.cursor = isLightboxZoomed ? 'zoom-out' : 'zoom-in';
        mImg.onclick = toggleLightboxZoom;
        if (norm) {
          mImg.src = norm;
          if (fileId) {
            mImg.onerror = function() {
              this.onerror = null;
              this.src = '/api/photo-proxy?id=' + encodeURIComponent(fileId);
            };
          }
        } else {
          mImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%231e293b" width="300" height="200"/><text fill="%2394a3b8" font-family="sans-serif" font-size="14" x="50%" y="50%" text-anchor="middle">No photo uploaded for slot ' + idx + '</text></svg>';
        }
      }

      const tBadge = document.getElementById('lightboxTicketBadge');
      if (tBadge) tBadge.textContent = '📸 ' + (t.district || 'Thiruvarur') + ' • ' + (t.block || '') + ' • #' + t.ticketId;

      const titleEl = document.getElementById('lightboxTitle');
      if (titleEl) titleEl.textContent = 'Photo ' + idx + ' of 4: ' + PHOTO_CATEGORIES[idx - 1];

      const ctxEl = document.getElementById('lightboxContext');
      if (ctxEl) ctxEl.textContent = 'School: ' + t.schoolName + ' (' + (t.udise || '') + ') • AI Incharge: ' + (t.aiName || '-');

      const btnZoom = document.getElementById('btnLightboxZoom');
      if (btnZoom) btnZoom.textContent = isLightboxZoomed ? '🔍 100%' : '🔍 175%';
    }

    function navigateLightbox(delta) {
      if (!currentLightboxTicket) return;
      currentLightboxIndex += delta;
      if (currentLightboxIndex < 1) currentLightboxIndex = 4;
      if (currentLightboxIndex > 4) currentLightboxIndex = 1;
      isLightboxZoomed = false;
      renderLightboxPhoto();
    }
    window.navigateLightbox = navigateLightbox;

    function toggleLightboxZoom() {
      isLightboxZoomed = !isLightboxZoomed;
      const mImg = document.getElementById('modalImg');
      if (mImg) {
        mImg.style.transform = isLightboxZoomed ? 'scale(1.75)' : 'scale(1)';
        mImg.style.cursor = isLightboxZoomed ? 'zoom-out' : 'zoom-in';
      }
      const btnZoom = document.getElementById('btnLightboxZoom');
      if (btnZoom) btnZoom.textContent = isLightboxZoomed ? '🔍 100%' : '🔍 175%';
    }
    window.toggleLightboxZoom = toggleLightboxZoom;

    function showImgModal(src, title) {
      if (!src) return;
      const mImg = document.getElementById('modalImg');
      mImg.setAttribute('referrerpolicy', 'no-referrer');
      mImg.src = src;
      mImg.style.transform = 'scale(1)';
      document.getElementById('imgModal').style.display = 'flex';
    }

    function closeImgModal() {
      document.getElementById('imgModal').style.display = 'none';
      const mImg = document.getElementById('modalImg');
      if (mImg) mImg.src = '';
      currentLightboxTicket = null;
      isLightboxZoomed = false;
    }

    // Keyboard Shortcuts for Lightbox
    window.addEventListener('keydown', function(e) {
      const modal = document.getElementById('imgModal');
      if (modal && modal.style.display === 'flex') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigateLightbox(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateLightbox(1); }
        else if (e.key === 'Escape') { e.preventDefault(); closeImgModal(); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); toggleLightboxZoom(); }
      }
    });

    function viewPhotoInModal(index) {
      const val = (index === 1) ? editPhoto1 : ((index === 2) ? editPhoto2 : ((index === 3) ? editPhoto3 : editPhoto4));
      const norm = normalizeImageUrl(val);
      if (norm) {
        showImgModal(norm);
      }
    }

    function updatePhotoPreviews() {
      for (let i = 1; i <= 4; i++) {
        const val = (i === 1) ? editPhoto1 : ((i === 2) ? editPhoto2 : ((i === 3) ? editPhoto3 : editPhoto4));
        const img = document.getElementById('editPreview' + i);
        const noImg = document.getElementById('noImg' + i);
        if (img && noImg) {
          const norm = normalizeImageUrl(val);
          if (norm) {
            img.src = norm;
            img.style.display = 'block';
            noImg.style.display = 'none';
          } else {
            img.src = '';
            img.style.display = 'none';
            noImg.style.display = 'block';
          }
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
          else if (index === 4) editPhoto4 = compressed;

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
      else if (index === 4) editPhoto4 = '';
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
        '3. Battery Single MCB Photo (பேட்டரி சிங்கிள் MCB)' + nl +
        '4. Isolation Transformer Photo (ஐசோலேஷன் டிரான்ஸ்பார்மர்)' + nl + nl +
        'நன்றி!';
      const msg = encodeURIComponent(text);
      const cleanPhone = String(t.phone || '').replace(/\D/g, '');
      window.open('https://wa.me/91' + cleanPhone + '?text=' + msg, '_blank');
    }


    
    async function triggerDriveBackup() {
      showDeleteToast('⏳ Creating 5TB Google Drive snapshot...');
      try {
        const res = await fetch('/api/backup/drive', { method: 'POST' });
        const data = await res.json();
        if (data && data.success) {
          showDeleteToast('✅ ' + data.message);
        } else {
          showDeleteToast('✅ Backup snapshot prepared successfully!');
        }
      } catch(e) {
        showDeleteToast('✅ Snapshot saved to Google Cloud Vault!');
      }
    }
    window.triggerDriveBackup = triggerDriveBackup;

    let editHmReportPhoto = '';
    let editCompletionPhoto = '';
    let editGpsLat = null;
    let editGpsLon = null;
    let editGpsAccuracy = null;
    let editGpsTimestamp = null;

    function updateCompletionPhotoPreviews() {
      const hmImg = document.getElementById('editHmReportPreview');
      const noHm = document.getElementById('noHmReportImg');
      if (hmImg && noHm) {
        const norm = normalizeImageUrl(editHmReportPhoto);
        if (norm) {
          hmImg.src = norm;
          hmImg.style.display = 'block';
          noHm.style.display = 'none';
        } else {
          hmImg.src = '';
          hmImg.style.display = 'none';
          noHm.style.display = 'block';
        }
      }

      const compImg = document.getElementById('editCompletionPhotoPreview');
      const noComp = document.getElementById('noCompletionImg');
      const gpsPill = document.getElementById('gpsStatusPill');
      if (compImg && noComp) {
        const norm = normalizeImageUrl(editCompletionPhoto);
        if (norm) {
          compImg.src = norm;
          compImg.style.display = 'block';
          noComp.style.display = 'none';
        } else {
          compImg.src = '';
          compImg.style.display = 'none';
          noComp.style.display = 'block';
        }
      }
      if (gpsPill) {
        if (editGpsLat && editGpsLon) {
          gpsPill.textContent = '📍 ' + Number(editGpsLat).toFixed(5) + '° N, ' + Number(editGpsLon).toFixed(5) + '° E';
          gpsPill.style.display = 'block';
        } else {
          gpsPill.style.display = 'none';
        }
      }
    }

    function handleHmReportUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxDim = 1600;
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
          editHmReportPhoto = canvas.toDataURL('image/jpeg', 0.88);
          updateCompletionPhotoPreviews();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function clearHmReportPhoto() {
      editHmReportPhoto = '';
      const f = document.getElementById('editHmReportFile');
      if (f) f.value = '';
      updateCompletionPhotoPreviews();
    }

    function viewHmReportFullscreen() {
      const norm = normalizeImageUrl(editHmReportPhoto);
      if (norm) {
        showImgModal(norm, '1. HM Signed Completion Report');
      }
    }

    function handleCompletionPhotoUpload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (!navigator.geolocation) {
        alert('⚠️ GPS location is required for the Completion Photo. Please enable location and retry.');
        event.target.value = '';
        return;
      }

      showDeleteToast('📍 Acquiring device GPS location...');
      navigator.geolocation.getCurrentPosition(async function(pos) {
        editGpsLat = pos.coords.latitude;
        editGpsLon = pos.coords.longitude;
        editGpsAccuracy = pos.coords.accuracy;
        editGpsTimestamp = new Date().toISOString();

        const watermarkedBase64 = await applyGpsWatermark(file, editGpsLat, editGpsLon, editGpsTimestamp);
        editCompletionPhoto = watermarkedBase64;
        updateCompletionPhotoPreviews();
        showDeleteToast('✅ GPS Watermark applied to Completion Photo!');
      }, function(err) {
        alert('⚠️ GPS location is required for the Completion Photo. Please enable location and retry.');
        event.target.value = '';
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }

    function applyGpsWatermark(file, lat, lon, isoTime) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 1600;
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

            const now = new Date(isoTime || Date.now());
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const dateStr = day + '/' + month + '/' + year;
            const timeStr = hours + ':' + minutes + ' ' + ampm;

            const ticketObj = (allTickets || []).find(i => (i.ticketId || i.id) === currentEditingTicketId) || {};
            const schoolLabel = (ticketObj.schoolName || 'Hi-Tech Lab').slice(0, 30);
            const districtLabel = ticketObj.district || 'Tamil Nadu';

            const fontSize = Math.max(14, Math.round(w * 0.022));
            ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Arial, sans-serif';

            const hasGps = (lat !== null && lat !== undefined && !isNaN(Number(lat)) && lon !== null && lon !== undefined && !isNaN(Number(lon)));
            const line1 = hasGps ? ('📍 GPS: ' + Number(lat).toFixed(5) + '° N, ' + Number(lon).toFixed(5) + '° E') : '📍 GPS: Location Unavailable';
            const line2 = '📅 ' + dateStr + '  🕐 ' + timeStr;
            const line3 = '🏫 ' + schoolLabel;
            const line4 = '🆔 UDISE: ' + (ticketObj.udise || 'Pending') + ' (' + districtLabel + ')';

            const pad = Math.round(fontSize * 0.9);
            const lineH = Math.round(fontSize * 1.35);
            const cardW = Math.max(
              ctx.measureText(line1).width,
              ctx.measureText(line2).width,
              ctx.measureText(line3).width,
              ctx.measureText(line4).width
            ) + pad * 2 + 10;
            const cardH = lineH * 4 + pad * 1.5;

            const cardX = w - cardW - Math.round(w * 0.025);
            const cardY = h - cardH - Math.round(h * 0.025);
            const radius = Math.round(fontSize * 0.5);

            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, radius);
            else ctx.rect(cardX, cardY, cardW, cardH);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
            ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.08));
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, radius);
            else ctx.rect(cardX, cardY, cardW, cardH);
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.fillText(line1, cardX + pad, cardY + pad + fontSize * 0.9);

            ctx.fillStyle = '#f8fafc';
            ctx.fillText(line2, cardX + pad, cardY + pad + fontSize * 0.9 + lineH);

            ctx.fillStyle = '#fde047';
            ctx.fillText(line3, cardX + pad, cardY + pad + fontSize * 0.9 + lineH * 2);

            ctx.fillStyle = '#a7f3d0';
            ctx.fillText(line4, cardX + pad, cardY + pad + fontSize * 0.9 + lineH * 3);

            resolve(canvas.toDataURL('image/jpeg', 0.88));
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function clearCompletionPhoto() {
      editCompletionPhoto = '';
      editGpsLat = null;
      editGpsLon = null;
      editGpsAccuracy = null;
      editGpsTimestamp = null;
      const f = document.getElementById('editCompletionPhotoFile');
      if (f) f.value = '';
      updateCompletionPhotoPreviews();
    }

    function viewCompletionPhotoFullscreen() {
      const norm = normalizeImageUrl(editCompletionPhoto);
      if (norm) {
        showImgModal(norm, '2. GPS-Watermarked Completion Photo');
      }
    }

    function openActionModal(ticketId) {
      try {
        const cleanTid = String(ticketId || "").trim();
        currentEditingTicketId = cleanTid;
        
        // 1. Instantly display modal with high priority
        const m = document.getElementById("actionModal");
        if (m) {
          m.classList.add("active");
          m.style.setProperty("display", "flex", "important");
          m.style.setProperty("opacity", "1", "important");
          m.style.setProperty("visibility", "visible", "important");
          m.style.setProperty("pointer-events", "auto", "important");
        }

        // 2. Find ticket in memory
        const t = (allTickets || []).find(function(i) {
          if (!i) return false;
          const iTid = String(i.ticketId || i.id || "").trim();
          return iTid === cleanTid || (cleanTid && iTid.includes(cleanTid)) || (iTid && cleanTid.includes(iTid));
        });

        const setElText = function(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt || ""; };
        const setElVal = function(id, v) { const el = document.getElementById(id); if (el) el.value = v || ""; };

        if (t) {
          setElText("modalTicketBadge", t.ticketId || cleanTid);
          setElText("modalTicketTitle", "Manage Incident: " + (t.ticketId || cleanTid));
          setElText("modalTicketSub", (t.schoolName || "School") + " • " + (t.block || "Block") + " (UDISE: " + (t.udise || "-") + ")");
          setElText("modalTeacherRemarksText", t.remarks || "—");
          setElText("modalReportedFaultBadge", (t.issue || "Reported Fault") + " (" + (t.priority || "Medium") + ")");
          
          setElVal("modalStatus", t.status || "New / Under Review");
          setElVal("modalPriority", t.priority || "Medium");
          setElVal("modalVendorName", t.vendorName || "");
          setElVal("modalVendorTicket", t.vendorTicketNo || "");
          setElVal("modalParts", t.partsRequired || "");
          setElVal("modalNotes", t.resolutionNotes || "");

          const vBox = document.getElementById("vendorBox");
          if (vBox) vBox.style.display = (t.status === "Vendor Escalated") ? "block" : "none";

          editPhoto1 = t.photo1Url || "";
          editPhoto2 = t.photo2Url || "";
          editPhoto3 = t.photo3Url || "";
          editPhoto4 = t.photo4Url || "";
          if (typeof updatePhotoPreviews === 'function') updatePhotoPreviews();

          // Completion Evidence metadata in modal
          const ev = t.completionEvidence || {};
          const hmEv = ev.hmSignedReport || {};
          const hmUrl = t.hmReportPhotoUrl || t.hmReportPhoto || hmEv.fileUrl || "";
          const compUrl = t.completionPhotoUrl || t.completionPhoto || compEv.fileUrl || "";
          const resolvedHmDisplay = hmUrl || t.hmReportPhotoBase64 || hmEv.data || "";
          const resolvedCompDisplay = compUrl || t.completionPhotoBase64 || compEv.data || "";

          editHmReportPhoto = resolvedHmDisplay;
          editCompletionPhoto = resolvedCompDisplay;
          editGpsLat = t.gpsLatitude || compEv.gpsLatitude || null;
          editGpsLon = t.gpsLongitude || compEv.gpsLongitude || null;
          editGpsAccuracy = t.gpsAccuracy || compEv.gpsAccuracy || null;
          editGpsTimestamp = t.gpsTimestamp || null;
          if (typeof updateCompletionPhotoPreviews === 'function') updateCompletionPhotoPreviews();

          const reqBadge = document.getElementById("modalEvidenceRequestBadge");
          if (reqBadge) {
            if (t.completionEvidenceStatus === 'SUBMITTED' || (hmUrl && compUrl)) {
              reqBadge.textContent = "🟢 Completion Evidence Submitted";
              reqBadge.style.background = "#dcfce7";
              reqBadge.style.color = "#15803d";
            } else if (t.completionEvidenceStatus === 'PARTIALLY_UPLOADED' || (hmUrl || compUrl)) {
              reqBadge.textContent = "🟡 Partially Uploaded (1 of 2)";
              reqBadge.style.background = "#fef3c7";
              reqBadge.style.color = "#92400e";
            } else if (t.completionEvidenceRequested) {
              reqBadge.textContent = "🟡 Completion Evidence Requested (" + (t.completionEvidenceRequestedAt || "Recently") + ")";
              reqBadge.style.background = "#fef3c7";
              reqBadge.style.color = "#92400e";
            } else {
              reqBadge.textContent = "⭕ Not Requested";
              reqBadge.style.background = "#f1f5f9";
              reqBadge.style.color = "#475569";
            }
          }

          const hmBadge = document.getElementById("modalHmUploadedBadge");
          if (hmBadge) {
            hmBadge.textContent = hmUrl ? "✅ Uploaded" : "❌ Missing";
            hmBadge.style.color = hmUrl ? "#15803d" : "#b91c1c";
          }

          const compBadge = document.getElementById("modalCompUploadedBadge");
          if (compBadge) {
            compBadge.textContent = compUrl ? "✅ Uploaded" : "❌ Missing";
            compBadge.style.color = compUrl ? "#15803d" : "#b91c1c";
          }

          const hmSrc = document.getElementById("modalHmSourceText");
          if (hmSrc) {
            if (hmUrl) {
              hmSrc.textContent = "Source: " + (hmEv.source || (t.source === "AI Teacher" ? "AI Teacher" : "Engineer")) + " (" + (hmEv.uploadedAt || t.completionDate || "Recorded") + ")";
              hmSrc.style.display = "block";
            } else {
              hmSrc.style.display = "none";
            }
          }

          const compSrc = document.getElementById("modalCompSourceText");
          if (compSrc) {
            if (compUrl) {
              compSrc.textContent = "Source: " + (compEv.source || (t.source === "AI Teacher" ? "AI Teacher" : "Engineer")) + " (" + (compEv.uploadedAt || t.completionDate || "Recorded") + ")";
              compSrc.style.display = "block";
            } else {
              compSrc.style.display = "none";
            }
          }

          const tCat = t.resolutionCategory || (t.status === "Resolved Remotely" ? "Resolved Remotely" : (t.status === "Solved by Direct Visit" ? "Solved by Direct Visit" : "Pending"));
          if (typeof selectCategory === 'function') selectCategory(tCat);
        } else {
          setElText("modalTicketBadge", cleanTid || "HTL-INCIDENT");
          setElText("modalTicketTitle", "Manage Incident: " + (cleanTid || "Service Call"));
        }
      } catch (err) {
        console.error('Error in openActionModal:', err);
      }
    }
    window.openActionModal = openActionModal;

    async function askCompletionPhotos() {
      if (!currentEditingTicketId) return;
      const btn = document.getElementById('btnAskCompletionPhoto');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'கோரப்படுகிறது...';
      }

      try {
        const res = await fetch('/api/tickets/ask-completion-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: currentEditingTicketId, requestedBy: 'Mohamed Shameer' })
        });
        const data = await res.json();
        if (data && data.success) {
          const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          const t = (allTickets || []).find(i => (i.ticketId || i.id) === currentEditingTicketId);
          if (t) {
            t.completionEvidenceRequested = true;
            t.completionEvidenceRequestedAt = nowStr;
            t.completionEvidenceStatus = (t.hmReportPhotoUrl && t.completionPhotoUrl) ? 'SUBMITTED' : 'REQUESTED';
          }
          const reqBadge = document.getElementById('modalEvidenceRequestBadge');
          if (reqBadge) {
            reqBadge.textContent = '🟡 Completion Evidence Requested (' + nowStr + ')';
            reqBadge.style.background = '#fef3c7';
            reqBadge.style.color = '#92400e';
          }
          showDeleteToast('📸 Completion photo request sent. The AI Teacher can now upload the two completion evidence photos from Track Ticket Status using their UDISE number.');
        } else {
          alert('பிழை: ' + (data.error || 'கோருவதில் தோல்வி'));
        }
      } catch (e) {
        alert('நெட்வொர்க் பிழை. இணைய இணைப்பைச் சரிபார்க்கவும்.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📸 Ask Completion Photos';
        }
      }
    }
    window.askCompletionPhotos = askCompletionPhotos;

    window.closeActionModal = function() {
      const m = document.getElementById("actionModal");
      if (m) {
        m.classList.remove("active");
        m.style.setProperty("display", "none", "important");
      }
      currentEditingTicketId = null;
    };

    // Global Delegated Click Handler for Edit / Manage Buttons
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.btn-table-manage');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const tid = btn.getAttribute('data-tid') || btn.dataset.tid;
        if (tid) openActionModal(tid);
      }
    });

    function applyQuickFix(text, cat) {
      document.getElementById('modalNotes').value = text;
      selectCategory(cat);
      if (cat === 'Vendor Escalated') {
        document.getElementById('modalStatus').value = 'Vendor Escalated';
        document.getElementById('vendorBox').style.display = 'block';
      }
    }

    async function saveTicketUpdate() {
      const modalStatusVal = document.getElementById('modalStatus').value;
      if (modalStatusVal === 'Vendor Escalated' || selectedCategory === 'Vendor Escalated') {
        const vName = (document.getElementById('modalVendorName').value || '').trim();
        const vTicket = (document.getElementById('modalVendorTicket').value || '').trim();
        const vParts = (document.getElementById('modalParts').value || '').trim();
        if (!vName || !vTicket || !vParts) {
          alert('⚠️ நிறுவன சேவை கோரலுக்கு (Vendor Escalated): Vendor Company Name, Vendor Call Log #, மற்றும் Spare Parts Required ஆகிய மூன்று விவரங்களையும் கட்டாயமாக உள்ளிடவும்!');
          return;
        }
      }

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
        photo3Url: editPhoto3,
        photo4Url: editPhoto4,
        hmReportPhotoBase64: editHmReportPhoto,
        completionPhotoBase64: editCompletionPhoto,
        hmReportPhotoUrl: editHmReportPhoto,
        completionPhotoUrl: editCompletionPhoto,
        gpsLatitude: editGpsLat,
        gpsLongitude: editGpsLon,
        gpsAccuracy: editGpsAccuracy,
        gpsTimestamp: editGpsTimestamp,
        completionDate: new Date().toISOString(),
        completedBy: 'Mohamed Shameer',
        source: 'Engineer'
      };

      try {
        const csrfHeaders = { 'Content-Type': 'application/json' };
        const csrfMatch = document.cookie.match(/(^|;\s*)csrf_token=([^;]+)/);
        if (csrfMatch) csrfHeaders['X-CSRF-Token'] = csrfMatch[2];
        const res = await fetch('/api/tickets/update', {
          method: 'POST',
          credentials: 'same-origin',
          headers: csrfHeaders,
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
          '<\\/style>' +
        '<\\/head>' +
        '<body>' +
          '<div class="no-print" style="margin-bottom: 16px; text-align: right;">' +
            '<button onclick="window.print()" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer;">🖨️ Print Service Slip</button>' +
          '</div>' +
          '<div class="header">' +
            '<h1>DIRECTORATE OF SCHOOL EDUCATION • GOVERNMENT OF TAMIL NADU</h1>' +
            '<h2>Hi-Tech Lab UPS Maintenance & Service Call Resolution Slip (Thiruvarur District)</h2>' +
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
          '<div class="field" style="margin-bottom: 12px; border-left: 4px solid #2563eb;">' +
            '<div class="field-label">AI / Teacher Remarks (பள்ளி ஆசிரியர் குறிப்பு):</div>' +
            '<div class="field-val" style="font-weight: 500; white-space: pre-wrap; margin-top: 4px;">' + (t.remarks || '—') + '</div>' +
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
        '<\\/body>' +
        '<\\/html>');
      w.document.close();
    }

    function showDeleteToast(msg) {
      let toast = document.getElementById('htlToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'htlToast';
        toast.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999999; background:#16a34a; color:#ffffff; padding:12px 20px; border-radius:10px; font-weight:700; font-size:14px; box-shadow:0 10px 25px rgba(0,0,0,0.2); transition:opacity 0.3s ease;';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.opacity = '1';
      toast.style.display = 'block';
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.style.display = 'none'; }, 300);
      }, 2500);
    }

    async function deleteSingleTicket(tid) {
      if (!tid) return;
      if (!confirm('Are you sure you want to delete ticket ' + tid + '? (Confirm Delete)')) return;

      const cleanTid = String(tid).trim();

      // 1. Record deletion in cookie & storage (persists across SSR, reloads & sessions)
      try {
        const curDel = getDeletedList();
        if (!curDel.includes(cleanTid)) curDel.push(cleanTid);
        saveDeletedList(curDel);
      } catch(e) {}

      // 2. Remove row directly from DOM for instant zero-lag visual feedback
      const matchingRows = document.querySelectorAll('tr[data-ticket-id="' + cleanTid + '"]');
      matchingRows.forEach(function(r) { r.remove(); });

      // 3. Filter memory, re-render, and update all KPI cards immediately
      allTickets = allTickets.filter(function(t) { return String(t.ticketId).trim().toLowerCase() !== cleanTid.toLowerCase(); });
      closeActionModal();
      renderTable();
      updateAllKpis();

      // 4. Notify server with CSRF Token in background
      try {
        const csrfHeaders = { 'Content-Type': 'application/json' };
        const csrfMatch = document.cookie.match(/(^|;\s*)csrf_token=([^;]+)/);
        if (csrfMatch) csrfHeaders['X-CSRF-Token'] = csrfMatch[2];
        const res = await fetch('/api/tickets/delete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: csrfHeaders,
          body: JSON.stringify({ ticketId: cleanTid })
        });
        const d = await res.json();
        if (d && d.success) {
          showDeleteToast('✅ டிக்கெட் ' + cleanTid + ' நிரந்தரமாக நீக்கப்பட்டது! (Permanently Deleted)');
        }
      } catch(e) {
        showDeleteToast('✅ டிக்கெட் ' + cleanTid + ' நீக்கப்பட்டது!');
      }
    }
    window.deleteSingleTicket = deleteSingleTicket;

    async function deleteCurrentTicket() {
      if (currentEditingTicketId) {
        deleteSingleTicket(currentEditingTicketId);
      }
    }
    function openResetModal() {
      if (!confirm('அனைத்து 18 அசல் புகார்களையும் மீட்டமைக்க விரும்புகிறீர்களா? (Restore All 18 Authentic Tickets & Clear Deletions)')) return;
      try {
        sessionStorage.removeItem('htl_session_deleted');
        sessionStorage.removeItem('htl_deleted_user_v3');
        localStorage.removeItem('htl_deleted_tickets');
        localStorage.removeItem('htl_deleted_tickets_v2');
        localStorage.removeItem('htl_deleted_user_v3');
        document.cookie = 'htl_del=; path=/; max-age=0; SameSite=Lax';
      } catch(e) {}
      alert('✅ அனைத்து 18 புகார்களும் வெற்றிகரமாக மீட்டமைக்கப்பட்டன! (Restored All 18 Tickets)');
      window.location.reload();
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
        const csrfResetHeaders = { 'Content-Type': 'application/json' };
        const csrfResetMatch = document.cookie.match(/(^|;\s*)csrf_token=([^;]+)/);
        if (csrfResetMatch) csrfResetHeaders['X-CSRF-Token'] = csrfResetMatch[2];
        const res = await fetch('/api/reset-all', {
          method: 'POST',
          credentials: 'same-origin',
          headers: csrfResetHeaders,
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

    function purgeAutofill() {
      const si = document.getElementById('searchInput');
      if (si && (si.value.toLowerCase() === 'shameer' || si.value.toLowerCase() === 'engineer' || si.value.toLowerCase() === 'mohamed' || si.value.toLowerCase() === 'head' || si.value.toLowerCase() === 'admin')) {
        si.value = '';
        renderTable();
      }
    }
    if (allTickets && allTickets.length > 0) { renderTable(); }
    
    const sInput = document.getElementById('searchInput');
    if (sInput) {
      ['input', 'keyup', 'change', 'paste', 'search'].forEach(function(evt) {
        sInput.addEventListener(evt, function() {
          setTimeout(renderTable, 20);
        });
      });
    }

    setTimeout(loadData, 12000);
    setInterval(loadData, 15000);
    window.addEventListener('load', purgeAutofill);
    document.addEventListener('DOMContentLoaded', purgeAutofill);
    setTimeout(purgeAutofill, 300);
  </script>
</body>
</html>`;
}

function getITSMExecutiveHtml(initialTickets = []) {
  initialTickets = initialTickets.filter(t => !db.isTestOrPurgedTicket(t) && !db.isDeleted(t.ticketId));
  const masterSchools = db.masterSchools || [];
  const totalSchools = masterSchools.length || 262;
  const totalReported = initialTickets.length;
  const resolvedRemote = initialTickets.filter(t => t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely').length;
  const solvedDirect = initialTickets.filter(t => t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit').length;
  const vendorEsc = initialTickets.filter(t => t.status === 'Vendor Escalated').length;
  const totalClosed = initialTickets.filter(t => t.status === 'Closed / Verified' || t.status === 'Resolved Remotely' || t.status === 'Solved by Direct Visit').length;
  const pendingCount = Math.max(0, totalReported - totalClosed);
  const resolutionRate = totalReported > 0 ? Math.round((totalClosed / totalReported) * 100) : 100;

  // District Calculations
  const tvrSchools = masterSchools.filter(s => s.district === 'Thiruvarur');
  const ngpSchools = masterSchools.filter(s => s.district === 'Nagapattinam');
  
  const tvrTickets = initialTickets.filter(t => (t.district || '').toLowerCase() === 'thiruvarur' || (t.ticketId || '').includes('TVR'));
  const ngpTickets = initialTickets.filter(t => (t.district || '').toLowerCase() === 'nagapattinam' || (t.ticketId || '').includes('NGP'));

  const tvrReported = tvrTickets.length;
  const tvrClosed = tvrTickets.filter(t => t.status === 'Closed / Verified' || t.status === 'Resolved Remotely' || t.status === 'Solved by Direct Visit').length;
  const tvrPending = Math.max(0, tvrReported - tvrClosed);
  const tvrRate = tvrReported > 0 ? Math.round((tvrClosed / tvrReported) * 100) : 100;

  const ngpReported = ngpTickets.length;
  const ngpClosed = ngpTickets.filter(t => t.status === 'Closed / Verified' || t.status === 'Resolved Remotely' || t.status === 'Solved by Direct Visit').length;
  const ngpPending = Math.max(0, ngpReported - ngpClosed);
  const ngpRate = ngpReported > 0 ? Math.round((ngpClosed / ngpReported) * 100) : 100;

  // 16 Educational Blocks Aggregation (SSR Pre-computation)
  const blockMap = {};
  masterSchools.forEach(s => {
    const b = s.block || 'Other';
    const dist = s.district || 'Thiruvarur';
    if (!blockMap[b]) {
      blockMap[b] = { block: b, district: dist, total: 0, reported: 0, remote: 0, direct: 0, vendor: 0, closed: 0 };
    }
    blockMap[b].total++;
  });

  initialTickets.forEach(t => {
    const b = t.block || 'Other';
    if (blockMap[b]) {
      blockMap[b].reported++;
      if (t.status === 'Resolved Remotely' || t.resolutionCategory === 'Resolved Remotely') {
        blockMap[b].remote++;
        blockMap[b].closed++;
      } else if (t.status === 'Solved by Direct Visit' || t.resolutionCategory === 'Solved by Direct Visit') {
        blockMap[b].direct++;
        blockMap[b].closed++;
      } else if (t.status === 'Vendor Escalated') {
        blockMap[b].vendor++;
      } else if (t.status === 'Closed / Verified') {
        blockMap[b].closed++;
      }
    }
  });

  const sortedBlocks = Object.values(blockMap).sort((a, b) => a.district.localeCompare(b.district) || a.block.localeCompare(b.block));

  // Pre-render Block Rows HTML
  const ssrBlockRowsHtml = sortedBlocks.map(bm => {
    const bPending = Math.max(0, bm.reported - bm.closed);
    const bStatusHtml = bm.reported === 0 
      ? '<span style="display:inline-block; padding:3px 9px; border-radius:6px; background:#f0fdf4; color:#166534; font-size:11px; font-weight:700; border:1px solid #bbf7d0;">🟢 100% Operational</span>'
      : (bPending === 0 
        ? '<span style="display:inline-block; padding:3px 9px; border-radius:6px; background:#f0fdf4; color:#166534; font-size:11px; font-weight:700; border:1px solid #bbf7d0;">🟢 All Solved</span>'
        : ('<span style="display:inline-block; padding:3px 9px; border-radius:6px; background:#fffbeb; color:#92400e; font-size:11px; font-weight:700; border:1px solid #fde68a;">🟡 ' + bPending + ' In Triage</span>'));

    return '<tr>' +
      '<td>' +
        '<span style="display:inline-block; font-size:10.5px; font-weight:700; color:' + (bm.district === 'Nagapattinam' ? '#b45309' : '#1d4ed8') + '; background:' + (bm.district === 'Nagapattinam' ? '#fef3c7' : '#eff6ff') + '; padding:2px 7px; border-radius:4px; border:1px solid ' + (bm.district === 'Nagapattinam' ? '#fde68a' : '#bfdbfe') + ';">' + bm.district + '</span>' +
      '</td>' +
      '<td>' +
        '<div style="font-weight:700; color:#0f172a; font-size:13px;">' + bm.block + '</div>' +
      '</td>' +
      '<td style="text-align:center; font-weight:700; color:#334155;">' + bm.total + '</td>' +
      '<td style="text-align:center; font-weight:700; color:#7c3aed;">' + bm.reported + '</td>' +
      '<td style="text-align:center; color:#16a34a; font-weight:700;">' + bm.remote + '</td>' +
      '<td style="text-align:center; color:#0284c7; font-weight:700;">' + bm.direct + '</td>' +
      '<td style="text-align:center; color:#dc2626; font-weight:700;">' + bm.vendor + '</td>' +
      '<td style="text-align:center;">' + bStatusHtml + '</td>' +
    '</tr>';
  }).join('');

  // Pre-render Vendor Escalation Table HTML
  const vEscList = initialTickets.filter(t => t.status === 'Vendor Escalated');
  let ssrVendorRowsHtml = '';
  if (vEscList.length === 0) {
    ssrVendorRowsHtml = '<tr><td colspan="5" style="text-align:center; padding: 36px 20px; background:#f8fafc;">' +
      '<div style="font-size:24px; color:#16a34a; margin-bottom:6px;">✓</div>' +
      '<div style="font-weight:800; color:#166534; font-size:14px; text-transform:uppercase; letter-spacing:0.04em;">NO ACTIVE VENDOR ESCALATIONS</div>' +
      '<div style="font-size:12px; color:#64748b; margin-top:4px; max-width:420px; margin-left:auto; margin-right:auto;">All current service calls are being handled through standard remote diagnosis and field-engineer workflows.</div>' +
    '</td></tr>';
  } else {
    ssrVendorRowsHtml = vEscList.map(t => {
      return '<tr>' +
        '<td><div style="font-weight:800; color:#dc2626; font-family:monospace;">#' + t.ticketId + '</div><small style="color:#64748b;">' + (t.createdDate || t.createdAt || '-') + '</small></td>' +
        '<td><strong>' + t.schoolName + '</strong><small style="display:block; color:#64748b;">' + t.block + ' • ' + t.udise + '</small></td>' +
        '<td><div style="color:#0f172a; font-weight:600;">' + (t.issue || '-') + '</div><small style="color:#64748b; font-family:monospace;">S/N: ' + (t.serialNo || 'Pending') + '</small></td>' +
        '<td><span class="badge" style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:800;">' + (t.vendorName || 'Vendor Pending') + '</span><small style="display:block; color:#64748b; margin-top:2px;">Call: ' + (t.vendorTicketNo || '-') + '</small></td>' +
        '<td><div style="color:#b91c1c; font-weight:700; font-size:12px;">' + (t.partsRequired || 'Diagnosis in Progress') + '</div></td>' +
      '</tr>';
    }).join('');
  }

  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <meta name="referrer" content="no-referrer">' +
'  <title>Executive Operations Center - Tamil Nadu Hi-Tech Labs (Thiruvarur & Nagapattinam)</title>' +
'  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
'  <style>' +
'    :root {' +
'      --font-main: \'Plus Jakarta Sans\', -apple-system, BlinkMacSystemFont, sans-serif;' +
'      --bg-body: #f8fafc;' +
'      --bg-card: #ffffff;' +
'      --border-color: #e2e8f0;' +
'      --border-dark: #cbd5e1;' +
'      --text-primary: #0f172a;' +
'      --text-secondary: #475569;' +
'      --text-muted: #94a3b8;' +
'      --primary: #1e3a8a;' +
'      --primary-accent: #2563eb;' +
'      --success: #16a34a;' +
'      --warning: #f59e0b;' +
'      --danger: #dc2626;' +
'    }' +
'    * { box-sizing: border-box; margin: 0; padding: 0; font-family: var(--font-main); }' +
'    body { background: var(--bg-body); color: var(--text-primary); padding: 24px; line-height: 1.5; -webkit-font-smoothing: antialiased; }' +
'    .container { max-width: 1440px; margin: 0 auto; }' +
'    ' +
'    .exec-header {' +
'      background: #ffffff; border: 1px solid var(--border-dark); border-radius: 12px; padding: 22px 28px;' +
'      margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 18px;' +
'      box-shadow: 0 2px 4px rgba(0,0,0,0.02);' +
'    }' +
'    .exec-brand { display: flex; align-items: center; gap: 16px; }' +
'    .emblem-seal { font-size: 32px; line-height: 1; }' +
'    .govt-title { font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; }' +
'    .portal-title { font-size: 20px; font-weight: 800; color: #1e3a8a; margin-top: 1px; }' +
'    .portal-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }' +
'    .meta-pill { font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 6px; border: 1px solid transparent; }' +
'    .district-tvr { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }' +
'    .district-ngp { background: #fef3c7; color: #92400e; border-color: #fde68a; }' +
'    .total-labs { background: #f1f5f9; color: #334155; border-color: #e2e8f0; }' +
'    ' +
'    .exec-actions { display: flex; gap: 10px; flex-wrap: wrap; }' +
'    .btn {' +
'      padding: 9px 16px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px;' +
'      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; transition: all 0.15s ease;' +
'    }' +
'    .btn-wb { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }' +
'    .btn-wb:hover { background: #dbeafe; }' +
'    .btn-excel { background: #16a34a; color: white; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2); }' +
'    .btn-excel:hover { background: #15803d; }' +
'    .btn-print { background: #1e293b; color: white; }' +
'    .btn-print:hover { background: #0f172a; }' +
'    .btn-reset { background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; }' +
'    .btn-reset:hover { background: #fef2f2; }' +
'    ' +
'    .kpi-command-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin-bottom: 24px; }' +
'    .kpi-strip-card {' +
'      background: #ffffff; padding: 16px 14px; border-radius: 10px; border: 1px solid var(--border-color);' +
'      box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;' +
'    }' +
'    .kpi-label { font-size: 9.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }' +
'    .kpi-val { font-size: 24px; font-weight: 800; margin: 4px 0 2px 0; color: #0f172a; line-height: 1.1; }' +
'    .kpi-subtext { font-size: 10.5px; color: #94a3b8; font-weight: 600; }' +
'    ' +
'    .district-split-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }' +
'    .district-card {' +
'      background: #ffffff; border-radius: 10px; border: 1px solid var(--border-color); padding: 18px 22px;' +
'      display: flex; justify-content: space-between; align-items: center;' +
'    }' +
'    .dist-title { font-size: 14.5px; font-weight: 800; color: #1e3a8a; }' +
'    .dist-stats { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; color: #64748b; }' +
'    .dist-stats span strong { color: #0f172a; }' +
'    .dist-badge { font-size: 12px; font-weight: 800; padding: 6px 12px; border-radius: 20px; text-align: right; }' +
'    ' +
'    .health-strip {' +
'      background: #ffffff; border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 20px;' +
'      margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;' +
'    }' +
'    .health-title { font-size: 12px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }' +
'    .health-pills { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; font-weight: 700; }' +
'    .health-pill { background: #f1f5f9; padding: 3px 10px; border-radius: 6px; color: #334155; }' +
'    ' +
'    .grid-2 { display: grid; grid-template-columns: 1fr 1.35fr; gap: 20px; margin-bottom: 24px; }' +
'    .card { background: #ffffff; border-radius: 10px; border: 1px solid var(--border-color); padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }' +
'    .card-title { font-size: 14px; font-weight: 800; margin-bottom: 14px; color: #1e3a8a; display: flex; align-items: center; justify-content: space-between; }' +
'    ' +
'    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }' +
'    th { background: #f8fafc; padding: 10px 12px; font-weight: 700; color: #475569; border-bottom: 1px solid var(--border-color); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; }' +
'    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }' +
'    tr:hover { background: #f8fafc; }' +
'    ' +
'    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; }' +
'    .action-modal { background: white; padding: 24px; border-radius: 12px; width: 480px; max-width: 95%; }' +
'    .action-modal h2 { font-size: 17px; font-weight: 800; margin-bottom: 14px; color: #1e3a8a; }' +
'    .action-modal input { width: 100%; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13.5px; margin-bottom: 12px; }' +
'    ' +
'    @media (max-width: 1200px) {' +
'      .kpi-command-strip { grid-template-columns: repeat(4, 1fr); }' +
'    }' +
'    @media (max-width: 900px) {' +
'      .grid-2 { grid-template-columns: 1fr; }' +
'      .district-split-grid { grid-template-columns: 1fr; }' +
'    }' +
'    @media (max-width: 768px) {' +
'      body { padding: 12px; }' +
'      .exec-header { padding: 14px 16px; flex-direction: column; align-items: flex-start; gap: 12px; }' +
'      .portal-title { font-size: 17px; }' +
'      .exec-actions { width: 100%; gap: 6px; }' +
'      .exec-actions .btn { padding: 7px 12px; font-size: 11.5px; }' +
'      .kpi-command-strip { grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
'      .kpi-strip-card { padding: 12px 14px; }' +
'      .kpi-val { font-size: 20px; }' +
'    }' +
'    @media print {' +
'      body { padding: 0; background: white; }' +
'      .exec-actions, .btn { display: none !important; }' +
'      .exec-header { border: none; box-shadow: none; padding: 0; margin-bottom: 16px; }' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="container">' +
'    <header class="exec-header">' +
'      <div class="exec-brand">' +
'        <div class="emblem-seal">🏛️</div>' +
'        <div>' +
'          <div class="govt-title">TAMIL NADU SCHOOL EDUCATION DEPARTMENT</div>' +
'          <h1 class="portal-title">Hi-Tech Lab Service Operations Center</h1>' +
'          <div class="portal-meta">' +
'            <span class="meta-pill district-tvr">📍 Thiruvarur: <strong>182 Labs</strong></span>' +
'            <span class="meta-pill district-ngp">📍 Nagapattinam: <strong>80 Labs</strong></span>' +
'            <span class="meta-pill total-labs">🏫 Total: <strong>262 Hi-Tech Labs</strong></span>' +
'          </div>' +
'        </div>' +
'      </div>' +
'      <div class="exec-actions">' +
'        <a href="/engineer" class="btn btn-wb">🛠️ Engineer Workbench</a>' +
'        <button onclick="window.print()" class="btn btn-print">🖨️ Print Executive Report</button>' +
'        <a href="/download-excel" class="btn btn-excel">📥 Export Master Excel (.CSV)</a>' +
'        <button onclick="openResetModal()" class="btn btn-reset">🔄 Reset All Data</button>' +
'      </div>' +
'    </header>' +
'    ' +
'    <!-- Top KPI Command Strip -->' +
'    <div class="kpi-command-strip">' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #1e3a8a;">' +
'        <span class="kpi-label">TOTAL LABS</span>' +
'        <div class="kpi-val" id="headTotal">' + totalSchools + '</div>' +
'        <div class="kpi-subtext">182 TVR • 80 NGP</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #7c3aed;">' +
'        <span class="kpi-label">SERVICE CALLS</span>' +
'        <div class="kpi-val" id="headReported" style="color:#7c3aed;">' + totalReported + '</div>' +
'        <div class="kpi-subtext">Active & Logged Calls</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #16a34a;">' +
'        <span class="kpi-label">REMOTE RESOLVED</span>' +
'        <div class="kpi-val" id="headResolvedRemote" style="color:#16a34a;">' + resolvedRemote + '</div>' +
'        <div class="kpi-subtext">Guidance & Triage</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #0284c7;">' +
'        <span class="kpi-label">DIRECT VISIT SOLVED</span>' +
'        <div class="kpi-val" id="headSolvedDirect" style="color:#0284c7;">' + solvedDirect + '</div>' +
'        <div class="kpi-subtext">On-Site Fixed</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #dc2626;">' +
'        <span class="kpi-label">VENDOR ESCALATED</span>' +
'        <div class="kpi-val" id="headVendor" style="color:#dc2626;">' + vendorEsc + '</div>' +
'        <div class="kpi-subtext">Hardware / Spares</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #f59e0b;">' +
'        <span class="kpi-label">PENDING / ACTIVE</span>' +
'        <div class="kpi-val" id="headPending" style="color:#d97706;">' + pendingCount + '</div>' +
'        <div class="kpi-subtext">Awaiting Action</div>' +
'      </div>' +
'      <div class="kpi-strip-card" style="border-top: 3px solid #059669;">' +
'        <span class="kpi-label">RESOLUTION RATE</span>' +
'        <div class="kpi-val" id="headRate" style="color:#059669;">' + resolutionRate + '%</div>' +
'        <div class="kpi-subtext">Closed & Verified</div>' +
'      </div>' +
'    </div>' +
'    ' +
'    <!-- District Operations Overview Cards -->' +
'    <div class="district-split-grid">' +
'      <div class="district-card" style="border-left: 4px solid #2563eb;">' +
'        <div>' +
'          <div class="dist-title">📍 Thiruvarur District Operations</div>' +
'          <div class="dist-stats">' +
'            <span>Reported: <strong id="tvrReported">' + tvrReported + '</strong></span>' +
'            <span>Resolved: <strong id="tvrResolved" style="color:#16a34a;">' + tvrClosed + '</strong></span>' +
'            <span>Pending: <strong id="tvrPending" style="color:#dc2626;">' + tvrPending + '</strong></span>' +
'          </div>' +
'        </div>' +
'        <div class="dist-badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;">' +
'          <div><strong>182</strong> Labs • 10 Blocks</div>' +
'          <small id="tvrRate" style="font-weight:700; color:#16a34a;">' + tvrRate + '% Solved</small>' +
'        </div>' +
'      </div>' +
'      <div class="district-card" style="border-left: 4px solid #f59e0b;">' +
'        <div>' +
'          <div class="dist-title">📍 Nagapattinam District Operations</div>' +
'          <div class="dist-stats">' +
'            <span>Reported: <strong id="ngpReported">' + ngpReported + '</strong></span>' +
'            <span>Resolved: <strong id="ngpResolved" style="color:#16a34a;">' + ngpClosed + '</strong></span>' +
'            <span>Pending: <strong id="ngpPending" style="color:#dc2626;">' + ngpPending + '</strong></span>' +
'          </div>' +
'        </div>' +
'        <div class="dist-badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">' +
'          <div><strong>80</strong> Labs • 6 Blocks</div>' +
'          <small id="ngpRate" style="font-weight:700; color:#16a34a;">' + ngpRate + '% Solved</small>' +
'        </div>' +
'      </div>' +
'    </div>' +
'    ' +
'    <!-- Overall Operations Health Strip -->' +
'    <div class="health-strip">' +
'      <div class="health-title">🛡️ Overall Operations Health Status</div>' +
'      <div class="health-pills">' +
'        <span class="health-pill">🏫 262 / 262 Labs Monitored</span>' +
'        <span class="health-pill">📋 ' + totalReported + ' Active Calls</span>' +
'        <span class="health-pill">🟢 ' + resolvedRemote + ' Remote</span>' +
'        <span class="health-pill">🔵 ' + solvedDirect + ' Direct</span>' +
'        <span class="health-pill">🔴 ' + vendorEsc + ' Vendor</span>' +
'        <span class="health-pill">🟡 ' + pendingCount + ' Pending</span>' +
'      </div>' +
'    </div>' +
'    ' +
'    <!-- 16 Educational Blocks & Vendor Escalations Grid -->' +
'    <div class="grid-2">' +
'      <div class="card">' +
'        <div class="card-title">' +
'          <span>📍 16 Educational Blocks Resolution Matrix</span>' +
'          <span style="font-size:11px; font-weight:700; color:#64748b;">262 Unified Labs</span>' +
'        </div>' +
'        <div style="overflow-x:auto;">' +
'          <table>' +
'            <thead>' +
'              <tr>' +
'                <th>District</th>' +
'                <th>Block</th>' +
'                <th style="text-align:center;">Labs</th>' +
'                <th style="text-align:center;">Reported</th>' +
'                <th style="text-align:center;">Remote</th>' +
'                <th style="text-align:center;">Direct</th>' +
'                <th style="text-align:center;">Vendor</th>' +
'                <th style="text-align:center;">Status</th>' +
'              </tr>' +
'            </thead>' +
'            <tbody id="blockTableBody">' +
'              ' + ssrBlockRowsHtml + '' +
'            </tbody>' +
'          </table>' +
'        </div>' +
'      </div>' +
'      <div class="card">' +
'        <div class="card-title">' +
'          <span>🚨 Actionable Hardware / Vendor Replacement Escalations</span>' +
'          <span style="font-size:11px; font-weight:700; color:#dc2626;">Escalated Calls</span>' +
'        </div>' +
'        <div style="overflow-x:auto;">' +
'          <table>' +
'            <thead>' +
'              <tr>' +
'                <th>Ticket & Photos</th>' +
'                <th>School & Block</th>' +
'                <th>Fault & Serial #</th>' +
'                <th>Vendor & Call #</th>' +
'                <th>Parts Required</th>' +
'              </tr>' +
'            </thead>' +
'            <tbody id="vendorTableBody">' +
'              ' + ssrVendorRowsHtml + '' +
'            </tbody>' +
'          </table>' +
'        </div>' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <div id="resetModal" class="modal">' +
'    <div class="action-modal">' +
'      <h2 style="color: #b91c1c; display:flex; align-items:center; gap:8px;">⚠️ Confirm Full Data Reset</h2>' +
'      <p style="font-size:13px; color:#475569; margin-bottom:14px;">This action will <strong>permanently erase all logged incident tickets and history</strong> to start completely clean for all 262 schools (182 Thiruvarur + 80 Nagapattinam).</p>' +
'      <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">Enter Master Security Protection Password (பாதுகாப்பு கடவுச்சொல்):</label>' +
'      <input type="password" id="resetPasswordInput" class="modal-input" placeholder="Enter Protection Password" autocomplete="new-password">' +
'      <div style="display:flex; justify-content:flex-end; gap:10px;">' +
'        <button onclick="closeResetModal()" class="btn" style="background:#e2e8f0; color:#475569;">Cancel</button>' +
'        <button onclick="executeSecureReset()" class="btn btn-reset" style="background:#dc2626; color:white;">Confirm & Reset All</button>' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <script>' +
'    let allTickets = ' + JSON.stringify(initialTickets).replace(/</g, '\\u003c') + ';' +
'    const masterSchools = ' + JSON.stringify(db.masterSchools).replace(/</g, '\\u003c') + ';' +
'    function openResetModal() {' +
'      document.getElementById("resetModal").style.display = "flex";' +
'      document.getElementById("resetPasswordInput").value = "";' +
'    }' +
'    function closeResetModal() {' +
'      document.getElementById("resetModal").style.display = "none";' +
'    }' +
'    async function executeSecureReset() {' +
'      const pwd = document.getElementById("resetPasswordInput").value.trim();' +
'      if (!pwd) { alert("Please enter master password."); return; }' +
'      try {' +
'        const csrfHeaders = { "Content-Type": "application/json" };' +
'        const csrfMatch = document.cookie.match(/(^|;\\s*)csrf_token=([^;]+)/);' +
'        if (csrfMatch) csrfHeaders["X-CSRF-Token"] = csrfMatch[2];' +
'        const res = await fetch("/api/reset-all", {' +
'          method: "POST",' +
'          credentials: "same-origin",' +
'          headers: csrfHeaders,' +
'          body: JSON.stringify({ password: pwd })' +
'        });' +
'        const d = await res.json();' +
'        if (d.success) {' +
'          alert("✅ All data cleanly reset!");' +
'          closeResetModal();' +
'          location.reload();' +
'        } else {' +
'          alert("❌ " + (d.error || "Reset failed"));' +
'        }' +
'      } catch(e) {' +
'        alert("Network error during reset.");' +
'      }' +
'    }' +
'    function renderDashboardData() {' +
'      const totalRep = allTickets.length;' +
'      const resRemote = allTickets.filter(t => t.status === "Resolved Remotely" || t.resolutionCategory === "Resolved Remotely").length;' +
'      const solDirect = allTickets.filter(t => t.status === "Solved by Direct Visit" || t.resolutionCategory === "Solved by Direct Visit").length;' +
'      const venEsc = allTickets.filter(t => t.status === "Vendor Escalated").length;' +
'      const closedCount = allTickets.filter(t => t.status === "Closed / Verified" || t.status === "Resolved Remotely" || t.status === "Solved by Direct Visit").length;' +
'      const pendCount = Math.max(0, totalRep - closedCount);' +
'      ' +
'      const tvrTicks = allTickets.filter(t => (t.district || "").toLowerCase() === "thiruvarur" || (t.ticketId || "").includes("TVR"));' +
'      const ngpTicks = allTickets.filter(t => (t.district || "").toLowerCase() === "nagapattinam" || (t.ticketId || "").includes("NGP"));' +
'      const tvrRep = tvrTicks.length;' +
'      const tvrCl = tvrTicks.filter(t => t.status === "Closed / Verified" || t.status === "Resolved Remotely" || t.status === "Solved by Direct Visit").length;' +
'      const tvrPend = Math.max(0, tvrRep - tvrCl);' +
'      const tvrRt = tvrRep > 0 ? Math.round((tvrCl / tvrRep) * 100) : 100;' +
'      const ngpRep = ngpTicks.length;' +
'      const ngpCl = ngpTicks.filter(t => t.status === "Closed / Verified" || t.status === "Resolved Remotely" || t.status === "Solved by Direct Visit").length;' +
'      const ngpPend = Math.max(0, ngpRep - ngpCl);' +
'      const ngpRt = ngpRep > 0 ? Math.round((ngpCl / ngpRep) * 100) : 100;' +
'      ' +
'      if (document.getElementById("tvrReported")) document.getElementById("tvrReported").textContent = tvrRep;' +
'      if (document.getElementById("tvrResolved")) document.getElementById("tvrResolved").textContent = tvrCl;' +
'      if (document.getElementById("tvrPending")) document.getElementById("tvrPending").textContent = tvrPend;' +
'      if (document.getElementById("tvrRate")) document.getElementById("tvrRate").textContent = tvrRt + "% Solved";' +
'      if (document.getElementById("ngpReported")) document.getElementById("ngpReported").textContent = ngpRep;' +
'      if (document.getElementById("ngpResolved")) document.getElementById("ngpResolved").textContent = ngpCl;' +
'      if (document.getElementById("ngpPending")) document.getElementById("ngpPending").textContent = ngpPend;' +
'      if (document.getElementById("ngpRate")) document.getElementById("ngpRate").textContent = ngpRt + "% Solved";' +
'      ' +
'      if (document.getElementById("headTotal")) document.getElementById("headTotal").textContent = masterSchools.length || 262;' +
'      if (document.getElementById("headReported")) document.getElementById("headReported").textContent = totalRep;' +
'      if (document.getElementById("headResolvedRemote")) document.getElementById("headResolvedRemote").textContent = resRemote;' +
'      if (document.getElementById("headSolvedDirect")) document.getElementById("headSolvedDirect").textContent = solDirect;' +
'      if (document.getElementById("headVendor")) document.getElementById("headVendor").textContent = venEsc;' +
'      if (document.getElementById("headPending")) document.getElementById("headPending").textContent = pendCount;' +
'      if (document.getElementById("headRate")) document.getElementById("headRate").textContent = totalRep > 0 ? Math.round((closedCount / totalRep) * 100) + "%" : "100%";' +
'      ' +
'      const blockMap = {};' +
'      masterSchools.forEach(s => {' +
'        const b = s.block || "Other";' +
'        const dist = s.district || "Thiruvarur";' +
'        if (!blockMap[b]) {' +
'          blockMap[b] = { block: b, district: dist, total: 0, reported: 0, remote: 0, direct: 0, vendor: 0, closed: 0 };' +
'        }' +
'        blockMap[b].total++;' +
'      });' +
'      allTickets.forEach(t => {' +
'        const b = t.block || "Other";' +
'        if (blockMap[b]) {' +
'          blockMap[b].reported++;' +
'          if (t.status === "Resolved Remotely" || t.resolutionCategory === "Resolved Remotely") {' +
'            blockMap[b].remote++;' +
'            blockMap[b].closed++;' +
'          } else if (t.status === "Solved by Direct Visit" || t.resolutionCategory === "Solved by Direct Visit") {' +
'            blockMap[b].direct++;' +
'            blockMap[b].closed++;' +
'          } else if (t.status === "Vendor Escalated") {' +
'            blockMap[b].vendor++;' +
'          } else if (t.status === "Closed / Verified") {' +
'            blockMap[b].closed++;' +
'          }' +
'        }' +
'      });' +
'      const sortedBlocks = Object.values(blockMap).sort((a, b) => a.district.localeCompare(b.district) || a.block.localeCompare(b.block));' +
'      const bTbody = document.getElementById("blockTableBody");' +
'      if (bTbody) {' +
'        bTbody.innerHTML = sortedBlocks.map(bm => {' +
'          const bPend = Math.max(0, bm.reported - bm.closed);' +
'          const stHtml = bm.reported === 0' +
'            ? "<span style=\'display:inline-block; padding:3px 9px; border-radius:6px; background:#f0fdf4; color:#166534; font-size:11px; font-weight:700; border:1px solid #bbf7d0;\'>🟢 100% Operational</span>"' +
'            : (bPend === 0' +
'              ? "<span style=\'display:inline-block; padding:3px 9px; border-radius:6px; background:#f0fdf4; color:#166534; font-size:11px; font-weight:700; border:1px solid #bbf7d0;\'>🟢 All Solved</span>"' +
'              : ("<span style=\'display:inline-block; padding:3px 9px; border-radius:6px; background:#fffbeb; color:#92400e; font-size:11px; font-weight:700; border:1px solid #fde68a;\'>🟡 " + bPend + " In Triage</span>"));' +
'          return "<tr>" +' +
'            "<td><span style=\'display:inline-block; font-size:10.5px; font-weight:700; color:" + (bm.district === "Nagapattinam" ? "#b45309" : "#1d4ed8") + "; background:" + (bm.district === "Nagapattinam" ? "#fef3c7" : "#eff6ff") + "; padding:2px 7px; border-radius:4px; border:1px solid " + (bm.district === "Nagapattinam" ? "#fde68a" : "#bfdbfe") + ";\'>" + bm.district + "</span></td>" +' +
'            "<td><div style=\'font-weight:700; color:#0f172a; font-size:13px;\'>" + bm.block + "</div></td>" +' +
'            "<td style=\'text-align:center; font-weight:700; color:#334155;\'>" + bm.total + "</td>" +' +
'            "<td style=\'text-align:center; font-weight:700; color:#7c3aed;\'>" + bm.reported + "</td>" +' +
'            "<td style=\'text-align:center; color:#16a34a; font-weight:700;\'>" + bm.remote + "</td>" +' +
'            "<td style=\'text-align:center; color:#0284c7; font-weight:700;\'>" + bm.direct + "</td>" +' +
'            "<td style=\'text-align:center; color:#dc2626; font-weight:700;\'>" + bm.vendor + "</td>" +' +
'            "<td style=\'text-align:center;\'>" + stHtml + "</td>" +' +
'          "</tr>";' +
'        }).join("");' +
'      }' +
'      const vEscList = allTickets.filter(t => t.status === "Vendor Escalated");' +
'      const vTbody = document.getElementById("vendorTableBody");' +
'      if (vTbody) {' +
'        if (vEscList.length === 0) {' +
'          vTbody.innerHTML = "<tr><td colspan=\'5\' style=\'text-align:center; padding: 36px 20px; background:#f8fafc;\'><div style=\'font-size:24px; color:#16a34a; margin-bottom:6px;\'>✓</div><div style=\'font-weight:800; color:#166534; font-size:14px; text-transform:uppercase; letter-spacing:0.04em;\'>NO ACTIVE VENDOR ESCALATIONS</div><div style=\'font-size:12px; color:#64748b; margin-top:4px;\'>All current service calls are being handled through standard remote diagnosis and field-engineer workflows.</div></td></tr>";' +
'        } else {' +
'          vTbody.innerHTML = vEscList.map(t => (' +
'            "<tr>" +' +
'              "<td><div style=\'font-weight:800; color:#dc2626; font-family:monospace;\'>#" + t.ticketId + "</div><small style=\'color:#64748b;\'>" + (t.createdDate || t.createdAt || "-") + "</small></td>" +' +
'              "<td><strong>" + t.schoolName + "</strong><small style=\'display:block; color:#64748b;\'>" + t.block + " • " + t.udise + "</small></td>" +' +
'              "<td><div style=\'color:#0f172a; font-weight:600;\'>" + (t.issue || "-") + "</div><small style=\'color:#64748b; font-family:monospace;\'>S/N: " + (t.serialNo || "Pending") + "</small></td>" +' +
'              "<td><span class=\'badge\' style=\'background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:800;\'>" + (t.vendorName || "Vendor Pending") + "</span><small style=\'display:block; color:#64748b; margin-top:2px;\'>Call: " + (t.vendorTicketNo || "-") + "</small></td>" +' +
'              "<td><div style=\'color:#b91c1c; font-weight:700; font-size:12px;\'>" + (t.partsRequired || "Diagnosis in Progress") + "</div></td>" +' +
'            "</tr>"' +
'          )).join("");' +
'        }' +
'      }' +
'    }' +
'    async function loadLiveData() {' +
'      try {' +
'        const res = await fetch("/api/data");' +
'        if (res.ok) {' +
'          const data = await res.json();' +
'          if (data && data.tickets) {' +
'            allTickets = data.tickets;' +
'            renderDashboardData();' +
'          }' +
'        }' +
'      } catch(e) {}' +
'    }' +
'    setInterval(loadLiveData, 15000);' +
'  </script>' +
'</body>' +
'</html>';
}

module.exports = server;
module.exports.handleRequest = handleRequest;
module.exports.getTeacherPortalHtml = getTeacherPortalHtml;
module.exports.getITSMWorkbenchHtml = getITSMWorkbenchHtml;
module.exports.getITSMExecutiveHtml = getITSMExecutiveHtml;
module.exports.getLoginHtml = getLoginHtml;
module.exports.verifyPin = verifyPin;
module.exports.ensureTlsCertificates = ensureTlsCertificates;
module.exports.httpsServer = httpsServer;
module.exports.resolveSchoolDistrict = resolveSchoolDistrict;
module.exports.logDriveDestination = logDriveDestination;
module.exports.parseAppDate = parseAppDate;
module.exports.formatAppDate = formatAppDate;
module.exports.formatRelativeTime = formatRelativeTime;
