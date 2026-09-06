# PROJECT STATE — compact snapshot (evidence-based; UNKNOWN = not verifiable here)

## Identity

- Project: Thiruvarur Hi-Tech Lab ITSM service-desk (`thiruvarur-hitech-lab-service-desk`, v1.0.1)
- Repo: `smdshameer/tvr-hitech-lab`, branch `main`, HEAD `2c17f72` (daily-cron drain fix)
- Production: `https://hitech-lab.vercel.app/` (last reported READY; live status UNKNOWN)
- Database: last reported postgres 4/4 tables 31 rows (GATE: PASS); live UNKNOWN
- Drive/Sheets: KI-001 probe showed completion-absent-despite-success; live UNKNOWN
- `npm test`: PASS 2026-09-05 SAFE (52/52 + 30/0/1 SKIP) · self-test 24/24 · `test:live` NOT RUN
- Current phase: KI-001 forensics (continuity + test-safety hardening COMPLETE)

## Objective / tasks

- Current task: review intake reliability fix (implemented, uncommitted) → `docs/NEXT_TASK.md`.
- Last completed: INTAKE GUARD+BACKFILL (approved scope) — nothing-to-confirm guard + URL backfill; suite 36/36; full SAFE PASS; NOT deployed.
- Current blocker: none on deployment (push done, routing healthy); Vercel dashboard confirmation of running commit pending; KI-001 stays UNPROVEN.
- Current risk: acting on Drive-state assumptions without execution evidence.
- Protected areas: UI/workflow/behavior · DB · Drive/Sheets · GPS · deletion · APIs · GAS · 262 schools + lifecycles · prod data · deployments.

## Status

- Prod/DB/Drive/Sheets live state: UNKNOWN until read-only re-verify. Framework present (`scripts/verify-production.js`, uncommitted). GAS Executions access BLOCKED.

## Protected areas (MUST NOT CHANGE without explicit authorization)

UI/workflow/behavior · DB · Drive/Sheets · GPS · deletion · APIs · GAS · 262 schools + lifecycles · prod data · deployments.

## Last handoff (auto, do not edit by hand)
