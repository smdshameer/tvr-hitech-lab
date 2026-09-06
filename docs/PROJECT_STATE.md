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

- Current task: KI-001 GAS durability forensics → `docs/NEXT_TASK.md`.
- Current blocker: KI-001 PARKED UNPROVEN — UI filter, API route, and Cloud Logging all gated/closed; close track by authorization.
- Current risk: acting on Drive-state assumptions without execution evidence.
- Protected areas: UI/workflow/behavior · DB · Drive/Sheets · GPS · deletion · APIs · GAS · 262 schools + lifecycles · prod data · deployments.

## Status

- Prod/DB/Drive/Sheets live state: UNKNOWN until read-only re-verify. Framework present (`scripts/verify-production.js`, uncommitted). GAS Executions access BLOCKED.

## Protected areas (MUST NOT CHANGE without explicit authorization)

UI/workflow/behavior · DB · Drive/Sheets · GPS · deletion · APIs · GAS · 262 schools + lifecycles · prod data · deployments.

## Last handoff (auto, do not edit by hand)
