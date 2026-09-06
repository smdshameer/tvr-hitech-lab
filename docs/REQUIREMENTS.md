# REQUIREMENTS

## 1. Functional

- Teacher intake with 4 evidence photos; ticket lifecycle New → Review → Resolve.
- Two-slot completion evidence: Slot 1 HM signed report (no GPS needed), Slot 2 UPS completion photo (GPS-gated).
- Engineer/leadership portals, dashboards, track-by-ID, slot-isolated deletion with Drive trash verification.
- Sheets + Drive mirroring of every ticket and completion file.

## 2. Non-functional

- Mobile-first teacher portal over HTTPS; Hobby-plan deployable (daily cron only).
- Durability over speed: never silently lose photos — persist bytes, queue honestly, drain daily.

## 3. Protected behavior — MUST NOT CHANGE (without explicit authorization)

UI/UX, workflows, navigation, app behavior · database architecture · Drive/Sheets architecture · GPS gating/watermark/EXIF behavior · deletion semantics · production APIs · GAS code · 262 master schools + ticket lifecycles · `AGENTS.md` Phase-37 directives.

CAN CHANGE (with tests): verification framework (`scripts/`, `package.json` scripts), repo docs, continuity tooling, non-prod diagnostics.

## 4. Production safety

- Local-first development. No commit/push/deploy unless explicitly authorized.
- No probes, deletes, or cleanup on production unless the current task explicitly requires it AND safety gates pass.
- Never fabricate Drive/Sheets/DB state. Never log or store cookies, passwords, `DATABASE_URL`, auth headers, tokens, photo/base64.
- Destructive acceptance only via verifier Phase-8 gate (acceptance + `--with-deletes` + live session + PASS baseline).

## 5. Verification

- After any change: `node tests/web-gps-camera.test.js`, `npm test`, zero `server.js` syntax errors (`AGENTS.md` pipeline).
- Production checks are read-only by default; verdicts PASS/FAIL/BLOCKED/PENDING/SKIP/NOT RUN are never collapsed.

## 6. Durability

- Completion bytes hit PostgreSQL before Drive is attempted; Drive failures queue with `pendingRetry` (honest PENDING, never pseudo-success); cron drain recovers them.
- ID gating: server persists what GAS returns; never invent Drive IDs.

## 7. Integration

- GAS `/exec` is the only Drive/Sheets writer path; contracts: create/update/completion/delete/inspect actions.
- `DATABASE_URL` (Neon) required in Vercel Production; `CRON_SECRET` guards the drain route.
