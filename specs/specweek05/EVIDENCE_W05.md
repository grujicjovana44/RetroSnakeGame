# W05 Evidence: AI Practice Plan

**Status:** Approval, W04 baseline, W05 fake-first verification, and the first
successful live development smoke are recorded below. Pair review and final
completion review remain pending.

## Index

- [Feature spec](SPEC.md)
- [Implementation plan and security checklist](PLAN.md)
- [Implementation tasks and test-ID mapping](TASKS.md)
- [Agent flow and stop reasons](AGENT_FLOW.md)
- [Tool contract](TOOL_CONTRACTS.md)
- [Agent evaluations](AGENT_EVALS.md)
- [AI usage ledger](AI_USAGE_LOG.md)
- [Live smoke runbook](LIVE_SMOKE_RUNBOOK.md)
- [Seven-minute demo script](DEMO_SCRIPT.md)

## Approval and W04 baseline

- Human approval of `SPEC.md` and its narrow constitution amendment: 2026-10-03.
- Exact amendment applied to `specs/CONSTITUTION.md`.
- `npm run typecheck`: passed (exit 0).
- `npm test`: passed, 4 files and 82 tests (exit 0).
- `npm run build`: passed (exit 0).
- `npm run test:e2e`: passed, 6 tests (exit 0); existing AI Advice browser flow passed.
- No product code had been edited when these baseline commands ran.

## Phase 2 verification

- `npm exec -- vitest run tests/agent.test.ts`: passed, 1 file and 61 tests.
- `npm run typecheck`: passed after T006-T009 changes.
- `npm test`: passed, 5 files and 143 tests, including W04 regressions.
- `npm run build`: passed after T006-T009 changes.
- `npm run test:e2e`: passed, 11 tests including existing W03/W04 browser tests; AI Advice still passes.
- No live Gemini requests were made during Phase 2; provider transport tests used injected fake `fetch`.

## Phase 3 verification

- Fixed two-goal controls are hidden outside game over; Playwright verifies both options and visibility.
- Both goal values are posted as exactly `{ sessionId, goal }`; both use the same created session ID.
- Success target is rendered from `plan`; metrics are rendered from `evaluation`.
- Realistic/non-realistic incomplete results display rating-specific fixed copy and evaluator metrics, never model summary/recommendation prose.
- `goal_unavailable` displays fixed plan text and no metrics; HTTP failure displays the generic safe message.
- Loading disables the button; a forced second click produces no duplicate request.
- The existing W04 Advice scenario passed in the same 11-test E2E suite.

## Phase 4 preparation and corrections

- Duration correction: `src/main.ts` records game-over time at the terminal
  transition, accumulates paused intervals, and sends
  `round((gameEndedAt - gameStartedAt - pausedMs) / 1000)`. This is important
  because duration is the `survive_longer` baseline; paused time and waiting
  before requesting Advice/Practice Plan are not active play.
- E31: `npm run test:e2e -- --grep "excludes pause and game-over wait"` passed
  (1 test). The fake clock advanced 5,000 ms paused and another 5,000 ms after
  game-over; the session request still contained 2 active seconds.
- E32: `npm run test:e2e -- --grep "fixed Practice Plan goal controls"` passed
  (1 test); both visible option labels are Serbian Latin.
- Gemini adapter: `npm exec -- vitest run tests/agent.test.ts` passed (1 file,
  61 tests). Step 1 instructions/request contain no rating names or thresholds;
  Step 2/3 are step-specific. The final schema has no `anyOf`, keeps only
  `kind` required, and applies SDK-supported `maxLength` values. `finding` is
  model-authored Serbian Latin prose, at most 300 characters; the evaluator
  contract remains unchanged and the prose is not truth-validated.
- Backend entrypoint: `PORT=4317 npm run dev:backend` from this workspace
  printed `RetroSnake backend listening on http://127.0.0.1:4317`. A local
  `curl -i -sS -X POST http://127.0.0.1:4317/api/game/session` with valid
  session facts returned `HTTP/1.1 201 Created`; no provider route was called.
- Request-body bound: `readJson` consumes `maxBodyBytes`; no server change was
  needed. Entry-point path handling worked from the workspace path containing
  spaces, so no launcher-specific rewrite was needed.
- Security scans: built `dist/` had no API-key pattern or `GEMINI` matches;
  `git check-ignore -v server/.env` returned `.gitignore:6:.env`; `src/main.ts`
  had no `innerHTML`; browser `src/` had no server-module or `@google/genai`
  imports.
- No live Gemini calls were made during Phase 4 preparation.

## Architecture

```text
Game-over UI
  -> POST /api/ai/practice-plan
  -> input/session preflight
  -> backend orchestrator and bounded run state
  -> provider-neutral model boundary
  -> Gemini adapter (server-side, existing model allowlist)
  -> proposal validation
  -> allowlisted evaluate_practice_goal
  -> tool-result validation and normalization
  -> model final or one revision, within limits
  -> Zod + same-run evidence validation
  -> UI result or generic safe failure
```

## Agent flow

Link: [`AGENT_FLOW.md`](AGENT_FLOW.md). Confirm actual implementation matches
the flow; document deviations here before claiming acceptance.

## Provider/model

| Run class | Provider | Model | Date | Result | Source/evidence |
|---|---|---|---|---|---|
| Fake tests | Scripted fake | Not applicable | 2026-10-03 | E01 normal 2-step path passed; 61 focused agent tests passed | `npm exec -- vitest run tests/agent.test.ts --reporter=verbose` |
| Live development | Gemini | `gemini-3.1-flash-lite` | 2026-10-03 | E07 revision path completed in 3 steps; 3 provider attempts, 0 retries, 2 tool calls; 25,678 ms; `goal_completed` | E07; `AI_USAGE_LOG.md`; sanitized run ID `aa364b5b-8054-4f29-9fee-eb100f2d8f79` |
| Final demo | Gemini configured server-side | Record exact model only after call | Pending | Pending | Pending sanitized run record |

Keep live development runs at or below 15 and final demo runs at or below 3.
Do not record API keys, raw prompts/responses, session IDs, game statistics or
provider error bodies.

## Tool registry and contract

- Allowlisted tool: `evaluate_practice_goal` only.
- Mode: read-only, deterministic local evaluator.
- Full input, output, scope, timeout and size contract:
  [`TOOL_CONTRACTS.md`](TOOL_CONTRACTS.md).
- Collision metric: deliberately excluded; W04 stores only terminal `0/1`
  collision indication, not an event count.
- Implementation: `server/agentTools.ts`; the concrete phase-two test bindings
  are recorded in `AGENT_EVALS.md`.
- Contract review result: input/session scope, goal range, integer rating,
  normalized evidence, collision exclusion, immutability and output byte bound
  are covered by passing focused tests.

## Success run traces

Use a synthetic/fake or approved non-private live example. Never paste raw
prompt, raw model response or private session data.

```text
Eval ID: E01
Run class: FAKE automated test; the normal 2-step E01 flow has not been run on a live provider.
Test: `completes a normal run with step-one context free of rating criteria`
Result: HTTP 200, completed, 2 steps, 2 provider attempts, 0 retries, 1 tool call, `goal_completed`.
Candidate values and session facts are test fixtures, not live evidence.
```

```text
Eval ID: E07 (one-time revision)
Run ID: aa364b5b-8054-4f29-9fee-eb100f2d8f79
Run class: LIVE development smoke
Provider/model: gemini / gemini-3.1-flash-lite
Step 1: tool_request; 8,407 ms; tool_result_valid
Step 2: tool_request revision; 8,352 ms; tool_result_valid
Step 3: final; 8,908 ms; final_valid
Provider attempts/retries/tool calls: 3 / 0 / 2; elapsed 25,678 ms
HTTP 200; status completed; stop reason `goal_completed`; providerHttpStatus null.
The record has no candidate values or evaluator ratings. Because the orchestrator permits a Step-2 tool request only when the previous rating is not `realistic`, the accepted second tool call implies that the first candidate was rated non-realistic. This is an inference from the gate rule, not a rating recorded in the log.
This live trace demonstrates Candidate → Evaluate → Revise on the live provider. E01's normal 2-step flow remains untested live.
```

```text
Eval ID: E08c/E27 incomplete UI checks
Run class: FAKE automated backend tests and mocked UI tests.
E08c backend test: `maps Step-1 refusal to failure and Step-2/3 refusal to rating-specific partials`.
Step-2 refusal: HTTP 200, `model_refusal`, 2 provider attempts, 0 retries, 1 tool call; both realistic and non-realistic branches return fixed copy.
Step-3 refusal: HTTP 200, `model_refusal`, 3 provider attempts, 0 retries, 2 tool calls; final partial binds to the latest validated result.
E08c UI test: `renders realistic and non-realistic incomplete results without model prose` passed in Playwright; two mocked endpoint responses; provider/tool counters and backend stop reason are not applicable to this UI mock.
E27 backend test: `accepts a non-realistic incomplete final with HTTP 200 and normalized evaluation`; HTTP 200, `plan_incomplete`, 2 provider attempts, 0 retries, 1 tool call.
E27 UI assertion is included in `renders realistic and non-realistic incomplete results without model prose`; mocked endpoint, backend counters not applicable. The test confirms fixed status copy, validated metrics rendering and suppression of model prose.
```

## Rejected-tool evidence

```text
Eval ID: E02
Run class: fake (automated test; not a live provider run)
Test: `rejects unknown-tool before tool execution`
Proposal class: unknown tool
Result: HTTP 502; `unknown_tool`; providerAttemptCount 1; toolCallCount 0; rejected before executor.
```

```text
Eval ID: E03
Run class: fake (automated test; not a live provider run)
Test: `rejects invalid-arguments before tool execution`
Proposal class: invalid/out-of-range tool args
Result: HTTP 502; `invalid_tool_args`; providerAttemptCount 1; toolCallCount 0; rejected before executor.
```

```text
Eval ID: E06
Run class: fake (automated test; not a live provider run)
Test: `rejects repeated calls before the Step-2 justification gate`
Result: HTTP 502; `repeated_call`; 2 provider attempts; toolCallCount 1 (one execution; duplicate not executed); 0 retries.
The test fixture uses a repeated proposal; no live candidate value or rating is claimed.
```

```text
Eval ID: E05
Run class: fake (automated test; not a live provider run)
Test: `stops a third tool proposal at max_steps before the executor`
Result: HTTP 502; `max_steps`; providerAttemptCount 3; toolCallCount 2; third proposal not executed; 0 retries.
```

The test must instrument the actual tool executor, not infer rejection only
from the HTTP status.

## Failure run and stop reason

No live failure was observed in the first smoke. The following failure traces
are fake/test evidence only.

```text
Run class: fake (automated test)
Eval IDs: E04a, E04b, E11a, E11b, E11c, E14; no live failure observed.
See the per-scenario results below; tests use scripted fake models or mocked transport.
```

```text
Eval ID: E04a/E04b/E11a-E11c
Run class: fake (automated tests; not live provider failures)
E04a test `does not replay a throwing tool and returns no internal error details`: HTTP 502; `tool_error`; providerAttemptCount 1; toolCallCount 1; no retry or model replay.
E04b test `retries transient provider failures once per step and preserves safe status mapping`: recovery branch HTTP 200 / `goal_completed`, providerAttemptCount 3, retryCount 1, toolCallCount 1; exhausted branch HTTP 502 / `provider_unavailable`, providerAttemptCount 2, retryCount 1, toolCallCount 0.
E11a same transient recovery test: HTTP 200 / `goal_completed`; providerAttemptCount 3, retryCount 1, toolCallCount 1; fake delay 200 ms.
E11b tests `marks provider error classes with the SPEC retry policy` and `maps provider 429 Retry-After and does not retry auth or non-retryable errors`: auth case makes 1 fake provider attempt, no retry, no tool, public HTTP 502 / `provider_auth_or_quota`; adapter fake transport maps HTTP 403 to that class. No provider response body is used.
E11c test `honors provider Retry-After values and maps 429 to 503`: too-long Retry-After stops at providerAttemptCount 1, retryCount 0, toolCallCount 0, HTTP 503 / `rate_limit`; retry-eligible fake 429 recovery returns HTTP 200. `enforces the 10-request client limiter and returns a safe 429 response` confirms the separate app limiter returns HTTP 429 before an 11th model attempt (0 attempts, 0 tools for that limited request).
E14 test `aborts an active provider at total deadline and on client cancellation`, deadline branch: HTTP 502; `deadline`; providerAttemptCount 1; toolCallCount 0; active fake request aborted; no retry.
```

```text
Eval ID: E14
Run class: fake
Elapsed/deadline: [ ] / 30,000 ms
Provider request aborted: [ ]
No later model/tool call: [ ]
Stop reason: deadline
Test name/output: [pending]
```

## Test results

| Gate | Command | Result/date | Evidence reference |
|---|---|---|---|
| Focused agent tests | `npm exec -- vitest run tests/agent.test.ts --reporter=verbose` | Passed 2026-10-03: 1 file, 61 tests | T003-T009 backend coverage; exact names in `AGENT_EVALS.md` |
| Full unit tests incl. W04 regression | `npm test` (`vitest run tests`, per `package.json`) | Passed 2026-10-03: 5 files, 143 tests | Current W05 and W04 |
| Typecheck | `npm run typecheck` | Passed 2026-10-03 after A1-A5 | W05 corrections and T013 |
| Build | `npm run build` | Passed 2026-10-03 after A1-A5 | W05 corrections and T013 |
| Playwright | `npm run test:e2e` (`playwright test`, per `package.json`) | Passed 2026-10-03: 12 tests | W03/W04 regression and W05 UI, duration, and Serbian labels |
| Focused Playwright corrections | `npm run test:e2e -- --grep "excludes pause and game-over wait"`; `npm run test:e2e -- --grep "fixed Practice Plan goal controls"` | Passed 2026-10-03: 1 test each | E31/E32 |
| Security checklist | Review in `PLAN.md` | Mapping complete; all four gates passed 2026-10-03 | T013 security matrix |

## Known limitations

- Collision count is not available: W04 records only a terminal 0/1 marker;
  W03 ends on the first collision. W05 excludes it and cannot make movement or
  collision-frequency claims.
- Anonymous session UUID existence/equality is not authenticated ownership.
- Application validates evidence references and scalar values but cannot
  prove free-form prose truth.
- Live availability/latency is provider-dependent; fake tests do not prove it.
- The live development smoke completed in 25,678 ms of the 30,000 ms deadline
  (about 8.5 seconds per step on `gemini-3.1-flash-lite`). One retry or a slower
  step may use the remaining budget and end in a `deadline` stop with the
  generic safe error. A possible later proposal is a larger deadline or faster
  model, only with approval and corresponding updates to `SPEC.md`,
  `AGENT_FLOW.md`, and tests; no such change is made here.
- Synchronous tool work cannot be preempted mid-execution; an output returned
  after the 250 ms watchdog is discarded and the run stops as `tool_timeout`.
- A valid positive W04 duration can be too small for a finite `foodPerMinute`;
  the approved SPEC clarification normalizes only that unrepresentable rate to `null`.
- `tool_limit` is tested by injecting an exhausted count at the dispatcher;
  public Step 3 rejects a tool proposal as `max_steps` first.
- SDK-internal retry behavior depends on the Gemini adapter/SDK configuration;
  the adapter fake-transport test must count actual outbound HTTP requests.
- Add any further observed limitations here; do not convert an assumption into
  evidence.

## Driver/Reviewer rotation and understanding check

| Iteration | Driver | Reviewer | Concrete contribution by Driver | Concrete contribution by Reviewer | Tasks reviewed | Date/evidence |
|---|---|---|---|---|---|---|
| 1 | Pending team confirmation | Pending team confirmation | Pending | Pending | Pending | Pending |
| 2 (roles swapped) | Pending team confirmation | Pending team confirmation | Pending | Pending | Pending | Pending |

Both members must independently answer and reviewer must verify:

1. Why is `evaluate_practice_goal` the right tool, and why is it the only
   allowed tool?
2. Why are there exactly 3 agent steps, 2 tool calls and 6 provider attempts?
3. Where are tool name, arguments, session scope and budget validated?
4. Where does the run stop for repeated calls, max steps, tool limit and
   deadline?
5. How does the test prove a rejected proposal did not execute the tool?

Record each member's concise answers and the test/source evidence after review;
do not mark understanding complete before both can explain it.

## Completion review

- [x] Success flow evidence present (one live development run; E01/E07).
- [ ] Rejected-tool evidence proves zero execution for rejected proposal.
- [ ] Failure trace and stop reason present.
- [x] Fake and live results clearly separated.
- [x] All required validation commands actually passed.
- [ ] Pair rotation and five-question review completed.
- [ ] Known limitations retained; no unsupported claims.
- [ ] Human review/approval recorded.

## Optional 7-minute demo outline

| Time | Demo segment | Evidence |
|---|---|---|
| 0:00–0:45 | Player selects one of the two goals after game over; explain user value | UI/E01 |
| 0:45–1:30 | Show frontend → endpoint → orchestrator → provider-neutral adapter → tool registry | Architecture and `AGENT_FLOW.md` |
| 1:30–3:00 | Normal run: candidate, deterministic evaluation, structured final target/evidence | E01 block |
| 3:00–4:00 | Safety: goal/args validation, tool allowlist, 3 steps, 2 tools, 6 attempts, 30-second deadline | E02/E03/E13 + `PLAN.md` checklist |
| 4:00–5:00 | Negative path: repeated call or step limit; prove executor count does not increase | E06/E05 blocks |
| 5:00–6:00 | Fake-first tests and bounded provider/deadline failure | Test results + E04/E14 blocks |
| 6:00–7:00 | Evidence, live/fake distinction, known limitations and pair contributions | This file + `AI_USAGE_LOG.md` |