# DEPLOYMENT STATUS

- Production URL: `https://hitech-lab.vercel.app/`
- Platform/plan: Vercel (Hobby — daily cron only; sub-daily schedules break deployment)
- Routing: `vercel.json` rewrites `/(.*)` → `/api/index.js`; functions: `api/index.js` (+`data/**`, `maxDuration` 60)
- Cron: `/api/admin/drive-drain` on `0 2 * * *` (commit `2c17f72`)
- Last known deployment: commit `2c17f72`, READY (last reported; live status UNKNOWN — re-verify read-only)
- Pending deployment: `f442c8b` pushed to `origin/main` 2026-09-06 (forensic-safe uploads + gated tests + continuity).
  Vercel auto-build expected via Git integration. Post-push routing checks PASS (`/`, `/api/version`,
  `/api/diag` 200). Running-commit identity unproven without dashboard/token (no safe endpoint
  exposes it; the code delta is write-path-only by design). Confirm in Vercel Dashboard
  (Deployments → production → commit `f442c8b`) or provide `VERCEL_TOKEN` for automated check.
- Environment (names only — never values): `DATABASE_URL` (Neon/PostgreSQL, required in Production), `ENGINEER_PIN`, `LEADERSHIP_PIN`, `SESSION_SECRET`, `GOOGLE_APPS_SCRIPT_ENDPOINT` (default = production `/exec` deployment), `CRON_SECRET`, `RESET_PASSWORD`
- Limitations: serverless ephemeral FS (JSON fallback uses `os.tmpdir()/tvr_data` when serverless); 60s function cap (uploads use small payloads + retry queue + drain)
- Current status: UNKNOWN until re-verified. No deployment authorized in this phase.
