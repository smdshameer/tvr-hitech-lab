# TEST STATUS

Legend: PASS / FAIL / BLOCKED / NOT RUN / SKIPPED (gated production path, not a failure).
`npm test` = `node tests/web-gps-camera.test.js && node test_comprehensive_e2e.js` (SAFE by default).
`npm run test:live` = explicit opt-in (`PRODUCTION_TESTS=1`) for production-mutating suites. Never default.

## Test-safety classification (evidence-based, 2026-09-05 audit)

Gate: `tests/production-gate.js` — fail-closed, only exact `PRODUCTION_TESTS=1` enables
live paths; synthetic IDs (`HTL-TVR-99999-*`, `TVR-TEST-*`, `33200399999`, …) additionally
guarded by `assertSyntheticSafe`. No secrets in any test (no cookies/tokens/URLs).

1. LOCAL SAFE (no network, no production mutation):
   `web-gps-camera` (static assertions only) · `vercel-routing` (in-process mocks) ·
   `completion-retry-id-gate` (pure logic) · deletion suites (in-memory mocks + static) ·
   `dashboard-summary-cards-reconcile`, `test_canonical_call_count`, `test_dashboard_kpi_counting_logic`,
   `engineer-table-layout` (ephemeral/local GETs only) · remaining `tests/*` (static/in-process, no live POST).
2. READ-ONLY PRODUCTION (network reads, never writes — allowed in `npm test`):
   e2e Dim 7 (GAS `doGet`), any `db.getAllTickets()` (Sheets sync merges LOCALLY only),
   `verify-production.js` SAFE mode.
3. PRODUCTION-MUTATING (gated; SKIP without `PRODUCTION_TESTS=1`):
   e2e Dim 23 · `remarks-data-flow` · `two-slot-evidence-persistence` ·
   `complete-evidence-persistence-lifecycle` · `hm-report-google-drive-persistence` ·
   root `test_phase24/26/27/28*/29/30/31/33*.js` (standalone, historical — documented, not rewired) ·
   `completion-durable-drain` ONLY if retry queue non-empty (empty today; guarded).
4. DESTRUCTIVE (strongest gate, never in `npm test`):
   `verify-production --with-deletes` (flag + live session + PASS baseline) ·
   root `test_phase27` delete calls (standalone).
- No test writes production PostgreSQL (no `DATABASE_URL` in any test file; local JSON mode).
- No test deletes production data except the category-4 paths above.

## Last reported (prior session, 2026-09-05 — re-verify, do not assume)

- Verifier `--self-test`: PASS 24/24
- `npm test`: PASS
- durable-drain 16/16 PASS · retry-id-gate 8/8 PASS · delete-persistence 11/11 PASS · deletion 8/8 PASS · routing 11/11 PASS
- Phase H acceptance probe: FAIL (baseline 4/6; see KI-001) — PG unauthenticated that run

## Current session (2026-09-05, evidence from this-session runs)

- `node tests/web-gps-camera.test.js`: PASS 52/52
- `npm test` (gate OFF): PASS — web-gps-camera 52/52 + e2e 30 pass / 0 fail / 1 SKIPPED (Dim 23 live POST). Reporter shows `SAFE TESTS: PASS / PRODUCTION MUTATION TESTS: SKIPPED`.
- Gated suites, gate OFF (each: safe assertions PASS, live paths SKIPPED, zero prod writes):
  `remarks-data-flow` (local-create fallback keeps downstream coverage) ·
  `two-slot-evidence-persistence` (static watermark PASS + live SKIP) ·
  `hm-report-google-drive-persistence` 14/14 PASS + 9 SKIPPED ·
  `complete-evidence-persistence-lifecycle` 20 PASS + 9 SKIPPED + 3 FAIL (pre-existing stale PHASE 8.1–8.3 static assertions — proven against untouched `server.js`, see KI-004; unrelated to gating) ·
  `completion-durable-drain` 16/16 PASS (queue empty, `processed=0`; non-empty-queue guard verified in code, not triggered).
- `verify-production --self-test`: PASS 24/24
- `gas-forensics --self-test`: PASS 8/8 (no cookie/storage APIs, arg parsing, redaction, profile-destroy proof)
- `gas-processes --self-test`: PASS 7/7 (arg parsing, Sep-5 IST→UTC window math, redaction, fail-closed refusal); live `--query` correctly BLOCKED without token (exit 2, zero network).
- `tests/completion-drive-verification.test.js`: PASS 30/30 (A–J mocked: verify classifier, opId, folder-ID parse, timeout→false, GPS guards intact, track/manage paths, DB passthrough).
- Cloud Logging capability test (read-only Project Settings): BLOCKED — default GCP project only, no accessible project to query.
- `npm test` re-verified 2026-09-05 SAFE (52/52 + 30 pass / 0 fail / 1 SKIPPED); local `data/*.json` residue restored.
- `verify-project-state`: PASS (incl. new gate checks)
- `server.js` syntax: PASS
- Destructive suites (`--with-deletes`, delete matrix): NOT RUN (gated; require explicit authorization)
- `npm run test:live`: NOT RUN (would mutate production — forbidden in this task).
- Prod-write evidence this task: zero `[DRIVE]` uploads, zero `[TICKET_SUBMIT]`/`[EVIDENCE_UPLOAD]`, zero new synthetic tickets in any output; only prod READS (`[CLOUD SYNC]`, Sheets `doGet`). Local `data/*.json` residue + empty `drive_retry_queue.json` restored/removed via `git checkout`.
- Known orphans (OUT OF SCOPE, owner manual purge only): `HTL-TVR-99999-42` 4 Evidence files from the pre-gate run; automation must NOT delete them.

## Inventory (existence only — NOT RUN until executed)

- `tests/`: gps/camera (watermark, mandate, integration, architecture-guard), persistence (evidence, hm-report, slots, idempotent, restart, sync-preservation), drain/retry/delete suites, routing, dashboard reconcile, remarks/phone/date suites.
- Root `test_phase21–34*.js` + `test_comprehensive_e2e.js`: phase acceptance scripts (historical).
- `scripts/verify-production.js` modes: default SAFE (read-only), `--acceptance`, `--with-deletes`, `--with-regression`, `--self-test`, `--browser-auth`.
