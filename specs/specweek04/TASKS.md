# W04 Tasks - Reliable AI Advice and Private Usage Report

Tasks are checked only after their acceptance evidence is available.

- [x] W04-T001 Align the approved AI Advice and usage report contracts with the
  selected `gemini-3.8-flash` model and explicit reliability limits.
- [x] W04-T002 Enforce the 15-second whole-flow deadline, propagate provider
  cancellation on timeout or when all HTTP clients disconnect, keep retries
  bounded, and avoid duplicate successful advice requests for one session.
- [x] W04-T003 Restrict backend CORS to configured frontend origins and bound
  in-memory sessions and usage records.
- [x] W04-T004 Capture token metadata from each Gemini response and persist a
  privacy-preserving local usage report outside the public UI/API.
- [x] W04-T005 Keep token usage out of the game UI and write aggregates to the
  Git-ignored local project report.
- [x] W04-T006 Add tests for timeout and client-disconnect cancellation, shared
  in-flight requests, retry bounds, strict JSON output, token aggregation,
  CORS, and report privacy.
- [x] W04-T007 Reconcile W04 evaluation, evidence, usage log, project scope,
  and README instructions with observed implementation and validation results.
- [x] W04-T008 Run `npm run typecheck`, `npm test`, and `npm run build`; record
  outcomes and retain live-provider status as unverified unless a successful
  call with the selected model is observed.

Verification rerun on 2026-09-28: `npm exec -- vitest run tests/ai.test.ts`
passed (13 tests), `npm test` passed (62 tests), and typecheck/build passed.
The rerun exposed and fixed a code/spec mismatch: service retry count was one
and default timeout was 60 seconds; service and backend route now use at most
two attempts within 15 seconds. The 5 Playwright E2E tests were not rerun on
this date; their previous 2026-09-27 PASS remains historical evidence.

At the pre-follow-up checkpoint, live status was unverified and provider debug
logging still exposed session/game/provider details. W04-T010 below closes the
logging deviation. The new live smoke result is recorded in `docs/EVIDENCE_W04.md`.

## Approved reliability follow-up

- [x] W04-T009 Add backend-only ordered Gemini model allowlist and bounded
  per-model retry/fallback under the 15-second whole-flow deadline.
- [x] W04-T010 Record sanitized per-attempt telemetry and `fallbackUsed`; remove
  session/game/prompt/raw-response/error-stack output from provider logging;
  cap each Gemini response at 256 output tokens.
- [x] W04-T011 Add fake-provider coverage for 3.8→3.7, 3.8→3.7→3.6, chain
  exhaustion, auth/quota/policy no-fallback, malformed output, and tool
  session mismatch. Live model availability remains a separate evidence gate.

Follow-up verification on 2026-09-28: `tests/ai.test.ts` passed 22/22;
`npm test` passed 71/71; `npm run typecheck` and `npm run build` passed.
The limited live capability probe is documented separately and did not produce
a model suitable for the two-step advice flow; live integration remains
unverified.

Cancellation and strict-JSON verification on 2026-09-28: `tests/ai.test.ts`
passed 32/32, `npm test` passed 81/81, and `npm run typecheck` plus
`npm run build` passed. These local tests do not change the unverified live
provider status.

Timeout-phase telemetry and backoff-contract follow-up on 2026-09-28:
`tests/ai.test.ts` passed 33/33, `npm test` passed 82/82, and
`npm run typecheck` plus `npm run build` passed.

## Model smoke and documentation reconciliation checkpoint — 2026-09-29

- [x] W04-T012 Allow explicit single-model selection of
  `gemini-3.1-flash-lite` without changing the default 3.8 → 3.7 → 3.6 → 3.5
  chain; add parser coverage for that one-model configuration.
- [x] W04-T013 Run bounded live Advice flows with the configured single
  model. Five requests completed the real stats-tool round-trip and returned
  schema-valid results; three other attempts timed out. This verifies repeated
  use of 3.1 Flash Lite, not availability of the other models or a successful
  live fallback response.
- [x] W04-T014 Reconcile the W04 spec, provider contract, evals, evidence,
  usage log, plan, tasks and README with current code, test coverage and live
  results. No code or secret configuration was changed during this task.

Verification checkpoint on 2026-09-29: `npm exec -- vitest run
tests/ai.test.ts` passed 33 tests; `npm run typecheck` passed; `npm test`
passed 82 tests across 4 files; `npm run build` passed; `npm run test:e2e`
passed 5/5 Playwright tests after configuring Playwright to start the Vite
server automatically. All currently defined repository validation commands
pass. The fake fallback tests exercise 503 transitions; they do not
individually cover provider 404, network-error fallback, or each 500/502
status.

## Subsequent verification update — 2026-09-29

The later browser run passed all 6/6 Playwright tests, including the AI Advice
browser flow with mocked API routes. One bounded live request recorded an actual
3.8 → 3.1 fallback transition; both 3.1 attempts returned 503, so no successful
fallback response is confirmed. This supersedes the earlier 5/5 E2E count and
the then-current statement that no live fallback transition had been observed;
the dated results above remain accurate for their checkpoint.