# DECISIONS — established, evidence-backed only

| Decision | Reason | Status | Affects |
|---|---|---|---|
| PostgreSQL (Neon) as production durability layer; local JSON fallback | Survive restarts/serverless-ephemeral FS; bytes-first durability | Active; gate PASS last reported (4/4 tables, 31 rows) | `db.js`, `server.js`, Vercel env |
| Google Drive file storage, District → School[UDISE] → Evidence/Completion Photos | Human-browsable hierarchy, matches Sheets | Active | GAS, verifier inspection |
| Google Sheets as ticket mirror | Ops visibility, completion ID/URL ledger | Active | GAS `updateTicketRow` |
| Vercel serverless via `handleRequest` (`api/` thin wrappers) | Single codebase for serverless + standalone | Active (`api/index.js`, `api/[...all].js`, `vercel.json` rewrites) | deploy, routing |
| Daily cron `0 2 * * *` for drive-drain | Sub-daily crons break Hobby deployments (commit `2c17f72`) | Active | `vercel.json`, drain route |
| Web GPS Camera as primary/only capture; no APK | Managed-device reality; protected by `AGENTS.md` Phase 37 | Active | teacher portal, `injectGpsExif` |
| Slot isolation (HM vs GPS) incl. delete paths | Cross-slot trash/recovery bugs observed historically | Active | server + GAS + tests |
| Verification framework confined to `scripts/`, `package.json`, `package-lock.json` | Zero application-behavior drift from verification work | Active (uncommitted) | `scripts/verify-production.js` |
| Self-healing/recovery reads in GAS (`updateTicketRow`, `inspectDriveStructure`) | Survive partial failures, misplaced files | Active in `google_apps_script_code.js` | Drive layout |
| Tombstoned deletes (`deleted_ticket_tombstones`, verified trash, refetch UX) | Prevent resurrect-on-refetch | Active | delete routes, tests |
| Fail-closed `PRODUCTION_TESTS=1` gate for mutating tests; `npm test` safe by default | e2e Dim 23 wrote 4 synthetic files to real Drive on every `npm test` run | Active 2026-09-05 | `tests/production-gate.js`, 5 gated suites, `test:live`, `TEST_STATUS.md` classification |
| Reusable read-only GAS forensics runner (headed Chromium, OS-temp profile, user-mediated login, always destroyed) | KI-001 needs Executions evidence without secret handling or prod writes | Active 2026-09-05 | `scripts/gas-forensics.js`, `npm run gas:forensics`, `docs/forensics/KI-001-report.md` |
| Auth diagnosis: real Chrome also served marketing/404, never login → one-time persistent-profile sign-in, then reuse | 4×30-min temp waits showed dead-end pages, not logins | Decided 2026-09-05 | `scripts/gas-auth-check.js` (`BROWSER_OPENED/LOGIN_PAGE/AUTH/...`), `--persistent-profile` in runner |
| API route for executions: `processes.list` + `gas-processes.js` tooling, stop at owner OAuth consent; Process fields prove timing only, never file IDs | UI filter un-automatable; need evidence-grade timing/overlap data | Decided 2026-09-06 | `scripts/gas-processes.js`, `npm run gas:processes`, scope `script.processes` |
| Cloud Logging CLOSED: script uses default GCP project (no accessible project to query); migration would be an unauthorized config change | Logger output was the last possible ticket/file-ID evidence source | Decided 2026-09-06 | Project Settings (read-only inspection), KI-001 report |
| Verify-after-create: read-back via existing inspect action before any Drive success is reported; opId + verified op record persisted | System reported success on returned IDs without confirming files (KI-001 shape) | Active 2026-09-06 | `server.js` completion handler + `tests/completion-drive-verification.test.js` 30/30 |
