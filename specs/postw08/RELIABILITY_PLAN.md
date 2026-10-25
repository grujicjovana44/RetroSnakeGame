# Post-W08 Reliability and Quality Improvements

This document is separate from the historical W03-W08 specifications.

## Scope

- Add a bounded, backend-only Gemini fallback for W05 Practice Plan.
- Preserve the W04 AI Advice model chain and retry policy.
- Keep W05 agent limits, evaluator scope, evidence validation and W08 HTTP,
  security-event, CSP, rate, concurrency and cleanup controls.
- Improve explanation safety, session-boundary regression coverage and browser
  presentation only where compatibility is demonstrated.

## Ordered work

1. Implement and test Practice Plan multi-model fallback.
2. Tighten deterministic validation of model explanations without a second LLM.
3. Review session lifetime and isolation without adding accounts, cookies or a DB.
4. Add deterministic failure/recovery demonstrations and metrics.
5. Improve user-facing status/attribution text without changing existing API
   response contracts unless compatibility tests justify it.
6. Run the complete regression and record fake-provider versus live-test scope.

## Fallback contract

Practice Plan uses `gemini-3.1-flash-lite` as primary and
`gemini-3.5-flash` as fallback. Fallback is allowed only for transient
408/500/502/503, network and timeout failures, within the existing 3-step,
2-tool, 6-attempt, 2-attempt-per-step and 30-second budgets. It is not used
for 429, 400, 401/403, 404, malformed output, refusal, invalid tool calls or
session mismatch. W04 Advice configuration is unchanged.

## Validation boundary

All automated provider scenarios use deterministic fake/scripted models. No
automated test invokes live Gemini; live smoke observations are recorded
separately below. No `.env` modification, dependency change or historical
W03-W08 document rewrite is part of this phase.

## Observed validation

- `npm.cmd run typecheck` — passed.
- `W08_TEST_SYNTHETIC_SECRET='w08-synthetic-secret-7d2c' npm.cmd test` — 5
  files, 162/162 tests passed. Provider scenarios used fake/scripted models;
  the live Gemini API was not called.
- `npm.cmd run build` — passed with Vite 8.3.3.
- `$env:CI='1'; npm.cmd run test:e2e` — 14/14 browser tests reported `ok`,
  including production-preview security headers/CSP, inert provider text and
  normal game flow. The wrapper retained the preview process after all tests,
  so that local process was stopped manually after the results were complete.
- Automated tests did not invoke live Gemini. The separately approved live
  smoke results are recorded below; they do not constitute statistical
  reliability evidence.

## Live smoke results

- `gemini-3.1-flash-lite`: completed successfully; `stopReason` was
  `goal_completed`, `providerAttemptCount` was 3, the evaluator executed, and
  the final response was valid.
- `gemini-3.6-flash`: two controlled runs failed during the second agent step;
  the latest recorded provider status was HTTP 503. The evaluator executed,
  but no valid final response was produced.
- `gemini-3.5-flash`: completed successfully with `statusCode` 200,
  `stopReason` `goal_completed`, `providerAttemptCount` 3, `retryCount` 1,
  `providerHttpStatus` 503 for the preceding failed attempt, evaluator
  executed, final response valid, and `elapsedMs` 15570.

These are controlled smoke observations, not a statistical reliability claim.
The HTTP 503 observation occurred for both the unsuccessful 3.6 run and a
preceding attempt in the successful 3.5 run.
