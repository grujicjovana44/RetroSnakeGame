# AI Usage Log — Week 3 / Session 003

## Record scope

This log records the AI-assisted follow-up work reflected in commit
`01d13c7` (`Complete Week 3 evidence and verification`, 2026-09-23). The table
below contains concise summaries reconstructed from the project record; it is
not a verbatim transcript. Original chat prompts and full model responses were
not archived, so no exact wording is claimed.

| Work item | Human instruction / prompt summary | AI contribution | Resulting artifact | Human review / evidence |
| --- | --- | --- | --- | --- |
| Review prior state | Compare the repository with the tutor's review and identify gaps. | Compared the baseline state and identified verification, test, dependency and evidence follow-ups. | Review notes; baseline is recorded in `specs/specweek03/EVIDENCE.md`. | Team reviewed the proposed follow-up. Baseline commit: `844ccdba`. |
| Controlled code change | Improve verification reliability and make High Score persistence directly testable. | Proposed and implemented a `highScore.ts` helper, tests for storage behavior, and Vite/Vitest updates; locked versions changed from 5.4.21/2.1.9 to 8.3.0/5.0.1. | `src/highScore.ts`, `tests/highScore.test.ts`, `package.json`, `package-lock.json`. | The documented reason was to remove the five baseline audit findings. Afterward, typecheck, 49/49 tests, build and audit (0 findings) passed; details and compatibility evidence are in `specs/specweek03/EVIDENCE.md`. The log records team authorization for the dependency update. |
| Evaluation and traceability | Close documentation gaps and document representative evaluations. | Added/updated evaluation cases, task traceability and evidence notes. | `docs/EVALS.md`, `specs/specweek03/TASKS.md`, `specs/specweek03/EVIDENCE.md`. | Claims should be checked against the referenced tests and browser artifact; the evidence table states the limits of the recording. |
| Browser artifact | Capture and retain runtime evidence for the game. | Captured the initial Edge screenshot; documented the participant-supplied video and its reported scenarios. | `specs/specweek03/evidence/initial-game.png`, `specs/specweek03/evidence/test.mp4`. | The participant supplied and confirmed the scenario timestamps listed in `specs/specweek03/EVIDENCE.md`. |

## Prompt and change traceability

`docs/BUILD_PROMPT_V1.md` is the archived implementation prompt. It is not a
transcript of the later review-fix prompts. The summaries above identify the
intended work and its resulting files, while `git show 01d13c7` provides the
commit-level change record. Keep future original prompts, model/tool name,
date, accepted or rejected suggestions, and human review notes alongside the
change when those details are available; do not reconstruct exact quotes from
memory.

## Human responsibility

Jovana Grujić and Jelena Kantarević remain responsible for reviewing AI-assisted
code and documentation, confirming that descriptions match the implementation,
and accepting the submitted result. In particular, verify the dependency update
and inspect the interactive scenarios claimed for `test.mp4` before
relying on them as acceptance evidence.
