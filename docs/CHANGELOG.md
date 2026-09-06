# CHANGELOG — meaningful milestones (see `git log` for full history)

- 2026-09-06 — INTAKE RELIABILITY (approved): ID-gate + verify/adopt in intake sync
  (05301-11 response-loss class, 05303 empty-ID pseudo-success class); suite 27/27;
  npm test SAFE PASS. No GAS/schema/UI change. NOT deployed/committed.

- 2026-09-06 — DEPLOYED (pending dashboard confirm): committed + pushed `f442c8b` to `origin/main`
  (forensic-safe uploads, gated tests, continuity). Post-push routing checks PASS
  (`/`, `/api/version`, `/api/diag`). Running-commit identity needs dashboard/token confirm.

- 2026-09-06 — FORENSIC-SAFE UPLOADS (approved): per-attempt opId, verify-after-create via
  existing inspect action, `driveUploadConfirmed`/`driveVerified` gated on read-back, op record
  persisted (capped), adopted IDs. GPS/auth/lifecycle/UI untouched. Suite 30/30, npm test SAFE
  PASS. No GAS change. NOT deployed/committed. KI-001 historical mechanism stays UNPROVEN.

- `2c17f72` — Hobby-compatible daily cron for Drive drain. Reason: sub-daily cron breaks Hobby deploys. Status: last reported Production READY.
- `22e14c1` — Durable completion uploads (PG bytes first, sync-first, cron drain).
- `0caf10a` — Redeploy to pick up `DATABASE_URL` in Production.
- `8133b6a` — No completion retry pseudo-success when payload/Drive ID missing.
- `5b8ea1b` — Vercel API pathname routing restore.
- `8d7c373` — Completion-evidence delete persistence (slot IDs, verified trash, refetch UX).
- `4072290` — 55s upload timeouts + persistent retry queue.
- Phase 37 (`AGENTS.md`) — Web GPS Camera as primary/only capture + server EXIF injection.
- 2026-09-05 — DATABASE GATE PASS (postgres, 4/4 tables, 31 rows); verifier hardened; Phase-H probe FAIL recorded as KI-001; forensics automation attempted twice, removed at user request (all in OS temp, repo untouched).
- 2026-09-05 — AUTH DIAGNOSIS: `npm run gas:forensics:auth-check` proves headed automation
  (bundled Chromium AND real Chrome) is served marketing/404, never the login flow — explains 4
  silent timeouts; runner updated (canonical entry chain, real-Chrome-first, `--persistent-profile`).
  Recommended: one-time human sign-in in persistent dedicated profile, then reuse. No app change.
- 2026-09-06 — KI-001 FILTER VERDICT: Start Time preset un-automatable (~20 read-only
  attempts); track PARKED UNPROVEN; report final. No app/GAS/prod changes.
- 2026-09-06 — LOGGING TRACK: Project Settings (read-only) shows GCP DEFAULT project only;
  Cloud Logging CLOSED (no accessible project; migration unauthorized). C/D/E unprovable by
  any available route. KI-001 PARKED UNPROVEN pending close authorization. No changes.
- 2026-09-06 — API TRACK: `processes.list` verified (scope/filters/fields); `gas-processes.js`
  built (self-test 7/7, fail-closed proven); stopped at owner OAuth consent gate. Capability
  limit recorded: no ticket/file IDs in Process resources (C/D/E need Cloud Logging).
- 2026-09-06 — KI-001 SWEEP: authed access works; project found; recent ~60 rows clean doGet;
  probe window unreached (time-filter resists automation); dedicated browser left open for
  filter assist; report rewritten UNPROVEN. No app/GAS/prod changes.
- 2026-09-05 — CONTINUITY OPTIMIZATION: `agent:start` rewritten as ≤30-line brief with
  task-scoped READ pointers; NEXT_TASK/PROJECT_STATE trimmed to actionable minimum;
  `verify-project-state` enforces compactness budgets. No app change.
- 2026-09-05 — KI-001 forensics automation: reusable `scripts/gas-forensics.js`
  (`npm run gas:forensics -- --ticket …`; self-test 8/8); headed run timed out at login gate,
  profile destroyed, zero prod writes; `docs/forensics/KI-001-report.md` (UNPROVEN). No app/GAS change.
- 2026-09-05 — TEST SAFETY HARDENING: fail-closed `PRODUCTION_TESTS` gate; e2e Dim 23 + 4 live
  `tests/` suites SKIP live POSTs by default (`npm test`: 52/52 + 30 pass/0 fail/1 SKIP); `test:live`
  opt-in runner (not run); drain non-empty-queue guard; classification in `TEST_STATUS.md`. No app/GAS change.
  Pre-existing issues recorded: lifecycle PHASE 8.1–8.3 stale assertions (KI-004), `HTL-TVR-99999-42` orphans.
- 2026-09-05 — PHASE 0 continuity system created (this docs set + 3 scripts). No app behavior change.
