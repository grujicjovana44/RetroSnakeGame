# W04 Tasks - Reliable AI Advice and Private Usage Report

Tasks are checked only after their acceptance evidence is available.

- [x] W04-T001 Align the approved AI Advice and usage report contracts with the
  selected `gemini-3.8-flash` model and explicit reliability limits.
- [x] W04-T002 Enforce the 15-second whole-flow deadline, propagate provider
  cancellation, keep retries bounded, and avoid duplicate successful advice
  requests for the same game session.
- [x] W04-T003 Restrict backend CORS to configured frontend origins and bound
  in-memory sessions and usage records.
- [x] W04-T004 Capture token metadata from each Gemini response and persist a
  privacy-preserving local usage report outside the public UI/API.
- [x] W04-T005 Keep token usage out of the game UI and write aggregates to the
  Git-ignored local project report.
- [x] W04-T006 Add tests for real timeout behavior, abort propagation, retry
  bounds, malformed output, token aggregation, CORS, and report privacy.
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

Live status remains unverified: direct `gemini-3.8-flash` returned provider
503 high-demand; an exploratory `gemini-3.1-flash-lite` advice-flow call also
returned provider 503. `models.list` authenticated successfully. Provider
debug console logging of session IDs, game data, raw response/error details
remains an open privacy deviation from the contract.