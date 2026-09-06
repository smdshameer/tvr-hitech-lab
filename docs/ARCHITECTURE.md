# ARCHITECTURE — actual, evidence-based (2026-09-05)

Monolith: one Node.js codebase serves HTTP(S), embeds all frontends, and integrates Drive/Sheets via GAS.

```
Browser (Teacher / Engineer / Leadership / Login portals, embedded HTML in server.js)
  ↓ HTTPS
Vercel serverless → api/index.js + api/[...all].js (thin wrappers → handleRequest in server.js)
  OR standalone Node (server.listen + self-signed HTTPS via selfsigned, local/LAN use)
  ↓
server.js (~12k lines: routing by pathname, PIN auth, ticket logic, EXIF GPS injector)
  ├── db.js (~2.8k lines: persistence layer)
  │     ├── DATABASE_URL set → pg Pool → Neon/PostgreSQL (tables: tickets, audit_log,
  │     │   tickets_backup_history, deleted_ticket_tombstones)
  │     └── unset → local JSON (data/*.json; bundled data/ locally, os.tmpdir()/tvr_data serverless)
  └── Google Apps Script (/exec, env GOOGLE_APPS_SCRIPT_ENDPOINT)
        ├── Google Sheets (ticket rows, completion IDs/URLs, status cols)
        └── Google Drive (District root → School [UDISE] → Evidence/ + Completion Photos/)
```

## Key routes (server.js pathname dispatch)

- `GET /`, `/login`, `/engineer` (+ portals, embedded HTML: `getTeacherPortalHtml`, `getITSMWorkbenchHtml`, `getITSMExecutiveHtml`, `getLoginHtml`)
- `GET /api/version`, `/api/diag`, `GET /api/data`, `POST /api/login`
- `POST /api/tickets` (intake, 4 evidence photos) · `POST /api/tickets/completion-evidence` (Slot 1 HM + Slot 2 GPS)
- `POST /api/tickets/delete-completion-evidence` (slot-isolated) · `POST /api/tickets/delete` (tombstoned)
- `GET /api/admin/db-status` (auth) · `GET|POST /api/admin/drive-drain` (CRON_SECRET via Bearer/`x-cron-secret`/`?secret=`; rejects anonymous as JSON)

## Subsystems

- Auth: role PINs (`ENGINEER_PIN`, `LEADERSHIP_PIN`), `htl_session` HttpOnly cookie, `SESSION_SECRET`.
- Uploads/durability: PG byte persistence first, Drive upload second, persistent retry queue, daily cron drain `0 2 * * *` (Hobby-compatible; sub-daily breaks Hobby deploys).
- GPS: in-browser Web GPS Camera only (no APK): rear camera + `watchPosition(highAccuracy)`, shutter gated on accuracy ≤50 m + fresh; canvas watermark burned into pixels; server injects TIFF/EXIF GPS IFD (`injectGpsExif`). Slot 1 (HM report) independent of GPS.
- Schools: `data/master_schools.json` (+ `master_schools_182.json`); 262 schools protected per `AGENTS.md`.
- GAS (`google_apps_script_code.js`, reference copy): `doPost` routes create/update/completion/delete/inspect actions; `updateTicketRow` handles both completion slots with slot isolation; `saveAndVerifyBase64Image`; `inspectDriveStructure`.
- Verification framework (`scripts/verify-production.js`, uncommitted): SAFE read-only default; `--acceptance` single-probe lifecycle; `--with-deletes` gated destructive matrix; `--browser-auth` headed throwaway-profile Engineer login (no cookie extraction, auto cleanup); `--self-test` offline classifier proofs.
- Tests: `tests/` (~40 suites: GPS/camera, persistence, drain, retry/id-gate, deletion, routing) + root `test_phase*.js` acceptance scripts; `npm test` = `web-gps-camera.test.js` + `test_comprehensive_e2e.js`.
