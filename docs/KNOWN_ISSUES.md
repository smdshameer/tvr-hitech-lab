# KNOWN ISSUES

## KI-005 — intake Evidence IDs lost after Drive creation (CONFIRMED, FIX IMPLEMENTED UNDEPLOYED)

- HTL-TVR-05301-11 (real, Sep 6): 4/4 files in Drive, zero IDs persisted — GAS success
  response never processed (transport/timeout loss inside 55s budget vs 1.4MB payload).
- HTL-TVR-05303 (Sep 5): folderUrl recorded but all photo URLs/IDs empty — `success:true`
  with empty per-file results accepted, retry dropped (intake had no ID gate).
- Photos safe in PG + Drive in both cases; retry/self-heal recovers. Fix implemented
  2026-09-06 (ID gate + hintless verify/adopt + no phantom IDs), suite 27/27 → extended
  36/36 with nothing-to-confirm guard + URL backfill. NOT deployed. No manual repair
  performed on either ticket.

## KI-001 — GAS completion durability: files absent despite success claim (OPEN, UNPROVEN)

- Observed: acceptance probe `HTL-TVR-43172 / 33209843172 / PROBE AUTOMATION MTOBQMR4` — intake PASS; evidence 4/4 present; completion GAS response claimed success but 0 HM + 0 GPS files in Completion Photos; Sheets row held returned IDs; retry/drain recovered nothing; later the probe's Evidence files also disappeared (0/0). No known app path auto-deletes Evidence.
- Evidence: hardened verifier forensic bundle (byte lengths only: HM 103, GPS 431 chars), 3-attempt Drive inspection, Sheets readback, ID-gating held. PostgreSQL was NOT independently authenticated that run — do not cite it as PG failure.
- Tested: intake, evidence persist, 6-file baseline (4/6 FAIL), Sheets sync, retry/drain honesty, ID gating, warm-read survival. Not re-run: destructive delete matrix.
- Proven: server persists what GAS returns; nothing recovered via retry/drain; no pseudo-success recorded.
- Unknown: which GAS functions ran, timestamps, folder/file IDs used, errors, overlap, why Evidence later vanished.
- Blocker: Apps Script Executions evidence not yet retrieved (4 user-mediated headed attempts
  timed out at the login gate, latest 2026-09-05 30-min run; temp profiles always destroyed).
  Reusable runner now in repo: `scripts/gas-forensics.js` (`npm run gas:forensics -- --ticket …`).
  Report: `docs/forensics/KI-001-report.md`.
- Auth diagnosis 2026-09-05 (`npm run gas:forensics:auth-check`, new): headed browser opens
  reliably (bundled Chromium AND real Chrome), but Google serves automation-flagged contexts only
  the public marketing page (`developers.google.com`) or a 404 for `/home/projects` — never the
  ServiceLogin flow. So the 30-min waits showed the user a dead end with no sign-in affordance.
  No credential/cookie/storage extraction is permitted, and normal-Chrome attach is forbidden, so
  automation cannot obtain the session by itself. Recommended mechanism: ONE-TIME human sign-in in
  a persistent dedicated profile (`--persistent-profile`, user-local outside repo, never read by
  automation), solving any bot challenge manually; all later sweeps reuse it unattended.
- 2026-09-06 sweep: user signed in (persistent profile); project FOUND
  (Thiruvarur HTL Service Desk Webhook); correct route `/home/projects/<id>/executions`;
  visible ~60 rows all doGet/Completed, zero failures/doPost; probe-window rows unreached —
  Start Time preset resists programmatic clicks. Next: human sets the time filter, automation
  continues. Dedicated browser left RUNNING. Report: `docs/forensics/KI-001-report.md`.
- 2026-09-06 later: filter declared UN-AUTOMATABLE (~20 attempts: selection never applies,
  no APPLY/pagination control). Track PARKED UNPROVEN — close by authorization or pursue
  OAuth executions-API reader as separate task. No probe created; nothing modified.
- 2026-09-06 preventive fix IMPLEMENTED (approved, not deployed): verify-after-create +
  opId/op-record in `server.js` completion flow. This does NOT retro-explain the historical
  probe (mechanism stays UNPROVEN) — it closes the hole prospectively, and any future
  failure will carry its own forensic record instead of needing GAS history.
- 2026-09-06 API track: `processes.list` confirmed (scope `script.processes`; filters incl.
  startTime/functionName; fields = timing/status only — NO ticket/file IDs/logs, so C/D/E
  unprovable via this API; logs need Cloud Logging + linked GCP project, linkage UNKNOWN).
  Tooling `scripts/gas-processes.js` built (self-test 7/7, fail-closed proven, zero network
  without token). Repo has no OAuth client/service account. Stopped at owner consent gate.
- 2026-09-06 Logging track: Project Settings shows GCP DEFAULT project only — NO standard
  linked project, no usable ID/number. Cloud Logging API has no accessible project: CLOSED
  (would need migration = unauthorized config change). No session reaches logs without a
  new ceremony. C/D/E unprovable by any available route. Track PARKED UNPROVEN.
- Next: user-mediated Executions sweep (recipe below). Do NOT create another probe. Do NOT "fix" app code. Do NOT pick mechanism A–J without execution evidence.
- Candidate mechanisms (UNDECIDED): A single-normal / B overlapping executions / C different folder IDs / D different file IDs / E failure-after-IDs / F idempotency / G Drive-Sheets error / H timeout / I moved-deleted / J other.

### Forensics runner recipe (rebuild in OS temp, never in repo)

1. `chromium.launchPersistentContext` (Playwright) with `fs.mkdtempSync(os.tmpdir())` profile, `headless:false`.
2. `goto https://script.google.com/home/projects`; poll ≤30 min for authenticated dashboard (URL/title/body markers only).
3. Click project link `Thiruvur HTL Service Desk W…`; open Executions; scroll + "Load more" pagination; harvest visible row texts; click candidate `doPost`/`updateTicketRow`/completion/failed rows for detail text.
4. Correlate: counts, timestamps, IDs, statuses, overlap. Lengths only; no photo contents.
5. FORBIDDEN in runner code: cookie/storage APIs, `document.cookie`, `localStorage`, storage-state files, secret logging. Profile stays in OS temp; report path; delete on user request.

## KI-004 — lifecycle suite PHASE 8.1–8.3 stale assertions + pre-gate orphan files (TRACKED)

- Stale: `tests/complete-evidence-persistence-lifecycle.test.js` PHASE 8.1–8.3 assert exact
  client-JS expressions absent from current `server.js` (proven via direct `node -e` includes-check
  against untouched `server.js`). Pre-existing, unrelated to test-safety gating. Do NOT "fix" by
  weakening expectations without explicit authorization; record here instead.
- Orphans: `HTL-TVR-99999-42` 4 Evidence files in real Drive from the pre-gate `npm test` run.
  OUT OF SCOPE for automation. Owner manual purge only. No deletes by any agent run.

## KI-002 — Verification framework uncommitted (TRACKED)

- `scripts/` untracked, `package.json`/`package-lock.json` modified. Risk: losing hardened verifier. Next: commit only when explicitly authorized. Do not rebuild it.

## KI-003 — 262 vs 182 schools discrepancy (UNCONFIRMED)

- `AGENTS.md` protects 262 schools; `data/master_schools_182.json` exists alongside `master_schools.json`. Verify count from `db.masterSchools` before citing either number.
