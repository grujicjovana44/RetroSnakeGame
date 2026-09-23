# AI Usage Log — Week 3 / Session 003

## Session record

| Field | Record |
| --- | --- |
| Date | 2026-09-23 |
| AI tool | OpenAI Codex coding assistant |
| Human reviewers | Jovana Grujić and Jelena Kantarević |
| Scope | Respond to the tutor review for the existing Session 003 submission |

## Calls and decisions

| Purpose / prompt summary | AI output | Human decision | Checks / evidence |
| --- | --- | --- | --- |
| Compare the repository with the tutor's review and report remaining issues. | Found stale evidence claims, missing eval clarity, 45 passing tests, passing typecheck/build, and five dependency advisories. | Team asked Codex to address the review items. | Local inspection and baseline checks at commit `844ccdba`. |
| Make the verification pipeline and evidence more reliable. | Proposed a controlled Vite/Vitest upgrade and an isolated High Score persistence helper with tests. | Team authorized the implementation and dependency update. | After changes: typecheck PASS, 49/49 tests PASS, build PASS, npm audit reported zero vulnerabilities. |
| Close the documentation gaps and document evals. | Updated scope, prompt/context descriptions, evaluation cases, traceability, and task status; added this usage log. | Team requested the remaining review work and a list of their own follow-up tasks. | Docs reviewed against current source and test results. |
| Produce browser evidence. | Captured the initial Edge screenshot; the user supplied a recording showing keyboard movement, refresh, pause, Game Over, wrap-around and restart. | The recording was added as runtime evidence and referenced in the evidence documents. | `specs/specweek03/evidence/initial-game.png`, `specs/specweek03/evidence/browser_checks.mp4`. |

## Human responsibility

AI-generated changes and descriptions require review by the student team before
submission. The team should confirm the dependency upgrade, inspect the diff,
and review the recorded interactive browser checks listed in
`specs/specweek03/TASKS.md` before submission.
