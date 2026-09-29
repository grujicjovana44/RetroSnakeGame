# AI Usage Log — Week 3 / Session 003

## W04 provider usage

The W04 implementation uses a fake provider for automated tests. Two limited
live Gemini attempts were made during development; the latest returned a safe
HTTP 502 response with internal status `provider_error`. No API key, raw
provider response, or secret appears in this document.

| Provider | Model | Purpose | Result |
| --- | --- | --- | --- |
| fake | test | Automated AI Advice reliability suite | PASS — 13 tests |
| Gemini | gemini-3.8-flash| Limited live integration confirmation | Safe 502; not confirmed |

## Current W04 status — 2026-09-27

The team subsequently selected `gemini-3.8-flash`, and the backend is
configured to use it. The two failed live attempts in the table belong to an
earlier model selection. Two later `gemini-3.8-flash` requests
returned safe HTTP 502 (`provider_error`, one attempt each, 758 ms and 836 ms)
before the tool-calling configuration correction. No post-correction live
success has been recorded. Do not treat fake-provider tests as live proof.

The backend now records timestamp, provider, model, status, attempts, latency,
and token metadata returned by each Gemini response. Prompt, candidate/output,
and total token counts are summed across the tool-call and final-response
round-trip when metadata is available. Usage is stored in the Git-ignored local
file `server/ai-usage.local.json`, capped at 500 recent records, and loaded
again after backend restart. It is not displayed in the game UI or exposed over
HTTP. The file excludes session IDs and provider content.

The selected model's comparative pricing has not been recorded. The project
does not claim that `gemini-3.8-flash` is the cheapest suitable model until the
team verifies current provider pricing.

## Diagnostic update — 2026-09-28

- `npm exec -- vitest run tests/ai.test.ts`: PASS, 13/13. `npm test`: PASS,
	62/62. `npm run typecheck` and `npm run build`: PASS. These use fake/local
	code and do not prove live Gemini availability.
- The tests initially exposed a configuration drift: service retry count was
	one and its default timeout was 60 seconds while W04 specifies two attempts
	and 15 seconds. The service and backend route are now configured for two
	attempts within 15 seconds; the tests passed afterward.
- A direct `generateContent` request to configured `gemini-3.8-flash` returned
	HTTP 503 `UNAVAILABLE`; Google reported high demand for that model. The
	account's `models.list` request succeeded, so the API key authenticated.
- The account's model list did not include `gemini-1.5-flash`. It did include
	`gemini-3.1-flash-lite`; an exploratory advice-flow test with that candidate
	still returned provider HTTP 503 during `initial_tool_call`, so it was not
	selected.
- Official pricing currently lists `gemini-3.1-flash-lite` below
	`gemini-3.8-flash` in per-token cost. Per-project request/token limits are
	tier-specific and must be checked in AI Studio. No successful live advice
	call has been recorded.

## Reliability follow-up — 2026-09-28

The approved mentor-feedback follow-up added the ordered backend model
allowlist `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` →
`gemini-3.5-flash`, bounded retry/fallback under the existing 15-second
deadline, a 256-token response cap, and sanitized per-attempt telemetry.
Automated fake-provider coverage proves the fallback routing and safe failure
policy only; it does not prove any listed model is available to this API
account. A controlled live two-step tool-call smoke result must be recorded
separately in `EVIDENCE_W04.md` before naming a live-success model.

The bounded live capability probe on 2026-09-28 authenticated `models.list`
and found all four IDs in the account listing, but single minimal generation
attempts returned 503 for 3.8/3.7, an empty/unusable response for 3.6, and a
network/timeout result for 3.5. The same two-step tool flow was therefore not
run. Live advice and live fallback remain unverified; no raw prompt, response,
secret, session ID, or stack trace was retained.

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

## Week 04 update — 2026-09-29

This addendum records the latest W04 review and live check. It is a concise
summary, not a verbatim chat transcript; no credential, session ID, prompt or
raw provider response is retained.

| Work item | Human instruction summary | AI contribution | Result / evidence |
| --- | --- | --- | --- |
| Recheck mentor review | Verify whether the attached findings still match current code; do not change code. | Compared model selection, fallback eligibility, tests and logging against `server/server.ts`, `server/provider.ts`, `server/service.ts`, and `tests/ai.test.ts`. | The no-chain and unsafe-logging claims are stale. Fallback tests exist. A dedicated 404/network-fallback test does not. Details are in `docs/EVIDENCE_W04.md`. |
| Live Gemini confirmation | Use the existing key for one live request; no local model. | Started the backend, created one synthetic session, and sent one AI Advice request with the configured single model. | `gemini-3.1-flash-lite` returned schema-valid advice in 3833 ms, one attempt, no fallback. Sanitized token counts: 445/154/599. |
| Timeout diagnosis | Classify the prior 3.1 live timeout instead of calling it a 503. | Preserved the attempt phases, duration and usage totals from the sanitized backend log. | Two local timeout attempts in 15002 ms; no provider HTTP status was present. |
| Documentation reconciliation | Bring W04 documents up to date while leaving code unchanged. | Updated current spec/contract/evals/evidence, usage log, plan/tasks and README with the verified state and explicit evidence limits. | Typecheck, 82 tests and build passed on 2026-09-29. E2E was not rerun. |
| Gemma option | Clarified that the immediate goal was a live call through the existing key, not local inference. | Recorded Gemma as considered but not implemented or used. | The successful live provider is Gemini; no Gemma API capability is claimed. |
