# AGENT RULES — permanent contract for every coding agent on this repo

1. Read `AGENT_RULES.md` first.
2. Read `docs/PROJECT_STATE.md`.
3. Read `docs/NEXT_TASK.md`.
4. Read `docs/ARCHITECTURE.md` before any architecture change.
5. Never rely on previous chat context. The repo docs are the persistent project memory.
6. Never invent missing state. Mark unknown information `UNKNOWN`.
7. Preserve protected UI/workflow behavior (`docs/REQUIREMENTS.md`, `AGENTS.md`).
8. Make the smallest safe change that completes the current task. Nothing more.
9. Do not fix unrelated issues during a task. Record them in `docs/KNOWN_ISSUES.md` instead.
10. Run appropriate tests after changes (`AGENTS.md` pipeline + `npm test`).
11. Never skip regression verification.
12. Never modify production data during normal development. No probes, no deletes, no cleanup without explicit authorization and passing safety gates.
13. Production destructive tests require explicit acceptance gates (see `scripts/verify-production.js` Phase 8 gate).
14. Never expose secrets. Never log cookies, passwords, `DATABASE_URL`, auth headers, tokens, or photo/base64 contents.
15. Never store cookies/tokens/passwords/browser storage in the repo. Auth profiles live in OS temp only, outside the repo.
16. Never deploy without explicit deployment authorization.
17. Never commit/push unless explicitly authorized.
18. Update project state after meaningful work (`npm run project:handoff`).
19. Update `docs/NEXT_TASK.md` after every completed task.
20. Record important architectural decisions in `docs/DECISIONS.md`.
21. Record unresolved issues in `docs/KNOWN_ISSUES.md`. Do not restart completed investigations.
22. Before ending a session (or context exhaustion), run `npm run project:handoff` to create a durable checkpoint.
23. A brand-new session with zero chat history must be able to continue from these docs alone. If it cannot, the docs are incomplete — fix them.
24. Normal `npm test` must never mutate production (Drive, Sheets, tickets, database). Production-mutating test paths require the fail-closed `PRODUCTION_TESTS=1` gate (`tests/production-gate.js`, opt-in via `npm run test:live`); without it they report SKIPPED, never PASS-by-omission and never FAIL.
25. Never store or log test credentials, cookies, tokens, or production URLs with secrets; tests run in local JSON mode (no `DATABASE_URL`).

## Layered context model (read only what the task needs)

- LEVEL 1 — ALWAYS READ: `AGENT_RULES.md`, `docs/PROJECT_STATE.md`, `docs/NEXT_TASK.md`
- LEVEL 2 — READ WHEN NEEDED: `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`, `docs/KNOWN_ISSUES.md`
- LEVEL 3 — TASK-SPECIFIC: `tests/`, `scripts/`, source files, deployment/integration docs

## Session protocol

START: `npm run agent:start` → read ONLY the docs it points to (brief is the source of truth; historical docs load on demand) → WORK → TEST → VERIFY → BEFORE END: `npm run project:handoff`
