# KI-001 FORENSIC REPORT — Apps Script Executions sweep

## Probe

- Ticket: `HTL-TVR-43172`
- UDISE: `33209843172`
- School: `PROBE AUTOMATION MTOBQMR4`

## Submission window

UNKNOWN (still). Bounded only indirectly: repo commits Sep 4–5 2026 and the
acceptance run post-date them, so the probe most likely ran **Sep 5, 2026** —
inside the Executions 7-day retention. Unconfirmed; needs the Start Time filter
or an explicit timestamp to verify.

## Authentication / access (verified 2026-09-06, read-only)

- Dedicated forensic browser (own profile on CDP 127.0.0.1:9333; normal Chrome untouched).
- User signed in normally → dashboard, project, and Executions all reachable.
- AUTHENTICATION: PASS. EXECUTIONS ACCESS: PASS (list view).

## Project / route findings (fixes applied to `scripts/gas-forensics.js`)

- Actual title: **Thiruvarur HTL Service Desk Webhook** (prior prefix had a typo; fixed).
- Correct route: `/home/projects/<id>/executions` — NOT `/edit/executions` (404) and NOT
  `/home/projects` (404 unauthenticated). Entry chain + text-click fallback added.

## Executions discovered

- Visible window: ~60 most-recent rows, all `doGet` / Web App / Completed, zero failures.
  Traffic ≈ 1 doGet/min (continuous polling reads — incidental observation, not the target).
- doPost: 0 in visible window. updateTicketRow: 0. Completion: 0.
- DIRECT_TARGET_HITS (ticket/UDISE/school text): 0 — the list view shows
  function/type/time/duration/status only, never ticket IDs, so correlation needs
  either row-detail opens or the probe timestamp.
- RELEVANT EXECUTIONS (probe-linked): 0 retrieved.

## Blocker (precise, final 2026-09-06)

Reaching Sep-5 rows needs the list's Start Time preset. After ~20 read-only automation
attempts: preset selection sets `aria-selected` but NEVER applies — no APPLY/pagination
control exists in DOM; close/outside-click/Enter/double-click/radio-click all leave
"Start Time: undefined"; the list stays capped at the recent window. Older rows are
therefore UNREACHABLE via UI automation. Automation verdict: the Start Time filter
cannot be set programmatically. Root cause stays UNPROVEN by rule.

## Errors / concurrency

None observed (visible window is clean doGet traffic). No overlap evidence either way.

## Root-cause classification

UNPROVEN (A/B/C/D/E/F/G/H all undecided — no probe-linked execution evidence).

## Confidence

UNPROVEN.

## Evidence supporting classification

- Server-side facts only (verifier bundle lengths, Sheets readback, ID gating) — see KI-001.
- Tonight: authenticated access path proven end-to-end; list schema understood;
  recent window clean. None of this identifies the probe mechanism.

## Evidence that remains missing

Probe submission timestamp; every `doPost`/`updateTicketRow`/completion row in that
window; folder/file IDs used; statuses/errors/overlap for those rows.

## Hygiene note

One automation probe dumped page-embedded config containing account identifiers
into tool output. Excluded from all records by rule (never collected, never stored).

## Recommended next action

Minimal human assist (NOT row copying): in the still-open dedicated window, set the
Executions Start Time preset covering Sep 5, 2026 — then automation continues alone
(harvest → details → correlate). Alternatively, supply the probe's exact date/time
and automation keeps attempting the filter targeting. Dedicated browser left RUNNING
for this; shut down afterwards via `gas-forensics.js --shutdown`.

## API track (2026-09-06, separate authorized investigation)

- Method: `GET https://script.googleapis.com/v1/processes` (processes.list;
  per-script variant available). Scope: `https://www.googleapis.com/auth/script.processes`.
  per-script variant available). Scope: `https://www.googleapis.com/auth/script.processes`.
  Filters: scriptId/deploymentId/projectName/functionName/startTime/endTime/types/statuses.
- Repo has NO OAuth client, NO service account, NO GCP linkage (verified by search).
- Tooling built: `scripts/gas-processes.js` (`npm run gas:processes -- --describe |
  --self-test | --query --script-id <ID> [--date …]`), GET-only, token from env only,
  fail-closed without token (proven: refusal, exit 2, zero network).
- Authorization: BLOCKED at the unavoidable human ceremony (Cloud Console OAuth client
  + owner consent). No token exists, none requested, none stored.
- Sep-5 executions retrieved: 0. Probe-linked executions: 0.
- Decisive capability limit (official reference): Process resources carry
  timestamps/function/status/duration ONLY — no ticket IDs, no Drive IDs, no arguments,
  no logs. The API can prove timing/count/overlap/status (A/B/G/F-partial) but CANNOT
  prove folder/file-ID mechanisms (C/D/E) or ticket linkage. Logger output would need
  Cloud Logging API + linked GCP project (linkage UNKNOWN) — second gate, not attempted.
- Correlation vs this report: no new execution evidence; UNPROVEN stands.

## Cloud Logging track (2026-09-06, read-only Project Settings inspection)

- GCP linkage: DEFAULT Google-managed project only ("GCP Default / Change project").
  NO standard (user-accessible) GCP project is linked. No project ID/number is displayed.
- Consequence: Cloud Logging API has no accessible project to query — BLOCKED by
  architecture, not just by missing token. Enabling it would require migrating the
  script to a standard GCP project (a config change — NOT authorized, NOT attempted).
- Existing sessions: the dedicated browser session can view the Executions UI but
  cannot reach the Sep-5 window (filter verdict stands) and carries no OAuth token
  for the Logging API. No session can access logs without a new authorization ceremony.
- Sep-5 probe logs retrieved: NO. New evidence: the GCP-Default finding itself (closes
  the Logging route; also devalues the OAuth API path, which could never prove C/D/E).

## Automation safety record

Probes 0 · Drive writes 0 · Sheets writes 0 · Deletes 0 · GAS changes 0 ·
App changes 0 · Commits 0 · Pushes 0 · Deploys 0 · Secrets collected 0 ·
Cookies/storage/credentials accessed 0 · Normal Chrome untouched.
