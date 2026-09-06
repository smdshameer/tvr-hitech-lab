# NEXT TASK — actionable continuation point (keep compact; history lives in CHANGELOG/KNOWN_ISSUES)

> New session: run `npm run agent:start`, do EXACT NEXT ACTION, nothing else.

## CURRENT OBJECTIVE

Monitor production (`dd2fa9d` live pending dashboard confirm) — pending→confirmed conversion on real uploads. Decide fate of parked scalability work (db.js + server.js hunks + suite, uncommitted).

## EXACT NEXT ACTION

Confirm Vercel Dashboard shows production on `dd2fa9d`. Then observe only.
Do NOT run test:live. Do NOT touch HTL-TVR-05301-11/-05303/-02401. KI-001 stays UNPROVEN.

## ACCEPTANCE

Report at `docs/forensics/KI-001-report.md` with timestamps, counts, IDs, statuses, overlap, classification + confidence + supporting evidence — or documented UNPROVEN with precise unknowns.

## SAFETY RESTRICTIONS

Read-only forensics. No probes, deletes, Drive/Sheets/DB/GAS/production changes, no commit/push/deploy, no secret collection. See `docs/REQUIREMENTS.md` §4.

## DO NOT REPEAT

DATABASE_URL setup · verifier hardening · passed suites (re-run, don't rebuild) · completed Phase-H probe · forensics login attempts (rerun runner, don't re-litigate).

## DO NOT CHANGE

Protected areas in `docs/PROJECT_STATE.md`. No UI, workflow, API, GPS, deletion, Drive/Sheets/DB/GAS, or deployment changes.

## COMPLETED (do not redo)

- PHASE 0 continuity system + TEST SAFETY HARDENING (`PRODUCTION_TESTS` gate; `npm test` safe) — see `docs/CHANGELOG.md`.
- DATABASE GATE: PASS — do not reconfigure `DATABASE_URL` without new evidence.
- KI-001 forensics runner built (`npm run gas:forensics`); auth diagnosis complete
  (Google serves automation contexts marketing/404 — see KI-001); persistent-profile
  sweep ran authed; time-filter un-automatable; API + Logging routes gated/closed.
  Report UNPROVEN at `docs/forensics/KI-001-report.md`.
- Forensic-safe completion fix IMPLEMENTED + DEPLOYED (`f442c8b`, Vercel Ready).
- Intake reliability fix IMPLEMENTED 2026-09-06 (ID-gate + verify/adopt;
  suite `tests/intake-evidence-verification.test.js` 27/27; npm test SAFE PASS).
  Awaiting review/authorization. NOT committed, NOT deployed.
