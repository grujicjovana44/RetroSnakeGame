# W05 Implementation Plan: AI Practice Plan

## Status

**PROPOSED — awaiting approval of `SPEC.md` and its narrow constitution
amendment. No implementation is authorized yet.** This plan covers only the
new W05 feature. Existing W04 Advice remains stable.

## Decision record

- **Chosen:** post-game Practice Plan with fixed goals `survive_longer` and
  `collect_more_food`; candidate target → deterministic evaluation → optional
  one-time revision → validated final plan.
- **Rejected:** repurposing AI Advice, sending arbitrary user prose as goals,
  running tools in the browser, adding game events, using collision flag as a
  performance metric, or adding write actions.
- **Why this is bounded and useful:** both goals map directly to already
  collected session metrics; the local evaluator has real work (candidate
  range, derived rates, target ratio and fixed rating); one revision is enough
  to correct a poor candidate without an open-ended plan loop.
- **Approval boundary:** confirm this specification and the proposed
  constitution amendment before code changes. Feature documentation in
  `docs/` is not part of this scope; W05 artifacts live under
  `specs/specweek05/`.

## Current implementation facts

- `server/service.ts` owns W04 session validation, provider retry/fallback,
  cancellation, response validation, caching and usage capture.
- `server/provider.ts` contains the W04 provider interface and Gemini SDK
  implementation. The W05 orchestrator must not depend on Gemini SDK types.
- `server/api.ts` contains Zod schemas for W04 session/advice contracts.
- `server/server.ts` is the Node HTTP router and owns CORS/rate limiting and
  provider configuration.
- `src/main.ts` sends session metrics only when the current AI Advice flow
  starts; `index.html` contains the existing game-over controls/panel.
- W04 stores score, duration, collisions and food count. The frontend sets
  collisions to `state.collision ? 1 : 0`; it is a terminal collision flag, not
  a frequency. W03 ends after the first obstacle/self collision. W05 excludes
  collisions from its context and tool.
- The W04 frontend rounds `durationSeconds` with `Math.round` before sending,
  but `server/api.ts` validates it with finite/min/max only and no `.int()`.
  Therefore API-created sessions can contain decimal seconds; W05 rounds the
  validated value for integer target baseline/rating and keeps raw duration
  separately for derived rates.
- W04 exposes no authenticated account/session owner. The W05 tool can verify
  session existence and exact equality with the server-bound original request
  ID only; it must not claim identity-based ownership.
- No `specs/specweek05/` artifacts currently exist. No dependency, build tool,
  package script, W03 rule, or W04 API contract needs to change.

## Architecture and proposed file map

| Layer | Proposed file(s) | Responsibility | Primary proof |
|---|---|---|---|
| Contracts | `server/agentContracts.ts` | Zod request/model-step/tool/final-result/run-evidence schemas and inferred TS types | Schema unit tests in `tests/agent.test.ts` |
| Tool | `server/agentTools.ts` | Fixed `evaluate_practice_goal` registry, pure evaluator, argument/scope/output/size validation | Tool contract tests and invalid-result tests |
| Provider-neutral boundary | `server/agentModel.ts` | Internal request/decision interface; no SDK imports | Fake implements interface; typecheck |
| Gemini adapter | `server/geminiAgentModel.ts` | Existing server-only Gemini SDK/config/model allowlist translated to normalized model steps; no hidden uncounted retries | First verify whether installed Gemini SDK supports injecting a transport; use it if available, otherwise mock global `fetch`; count actual HTTP requests; no W04 API changes |
| Orchestrator | `server/agent.ts` | Explicit bounded state machine, run counters, repeated-call guard, deadline, stop taxonomy, final evidence validation | Focused orchestrator test matrix |
| HTTP integration | `server/server.ts` | New `POST /api/ai/practice-plan`, request-body bound, cancellation, safe status mapping, sanitized per-run log | Route tests or existing HTTP integration tests |
| UI | `index.html`, `src/main.ts` | Goal selector and Practice Plan action visible only after game over; progress/result/partial/safe failure state | Playwright scenarios |
| Unit tests | `tests/agent.test.ts` | Fake-first contract, tool, loop, retry, error and evidence cases | `npm test` |
| Browser tests | `e2e/game.spec.ts` | Game-over availability, both goals/API request, result/error rendering, W04 Advice regression | `npm run test:e2e` |
| W05 artifacts | `specs/specweek05/*.md` | Spec, plan, tasks, flow, tool contracts, evals, evidence skeleton, usage ledger | Document checklist/review |

The W05 Gemini adapter may reuse the existing fixed Gemini model allowlist and
credentials, but it must have its own bounded per-step attempt accounting. It
must not call `requestAdvice` or route through `/api/ai/advice`: those APIs
implement the W04 Advice workflow and its per-model retry policy, which does
not equal W05's global six-attempt budget. Provider-specific request/response
translation stays in the adapter; the orchestrator sees only normalized
`tool_request | final | refusal` decisions.
Disable SDK-internal automatic retries or count each outbound request against
the same W05 global attempt budget.

### Request and run boundary

The UI first creates/reuses the existing game session and then posts
`{ sessionId, goal }` to the new endpoint. The server validates the UUID,
session existence, and fixed goal before any provider or tool invocation. The
orchestrator binds this canonical session ID; the model cannot choose it. The
tool receives `{ sessionId, goal, targetValue }` and independently looks up
the session in the server-owned in-memory map.
The backend also runtime-validates stored session metrics at preflight;
corrupted or missing fields stop before provider/tool execution.

Every endpoint call creates exactly one logical run ID. Retry/fallback attempts
belong to a step; a completed tool is never rerun because a later model request
failed. Cancellation propagates to the active provider request and makes the
run terminal. No browser-controlled model/provider, tool, timeout, or budget is
accepted.

## Implementation sequence

1. **Approval and baseline.** Approve `SPEC.md` and the narrow amendment text;
   confirm target ranges and anonymous-session limitation. Run the current
   required checks before code work and preserve the W04 baseline.
2. **Contracts first.** Implement exact Zod schemas/types and stable evidence
   IDs. Test goal enum, range boundaries, tool decision variants, final string
   bounds, unknown keys, and evidence scalar types.
3. **Deterministic tool.** Implement and test candidate range calculations,
   derived metrics, null denominators, rating thresholds, session lookup,
   normalized result and 4 KiB result cap. The function is pure/read-only and
   has no filesystem/network imports.
4. **Fake model and adapter boundary.** Define provider-neutral request and
  response. Add a scripted fake for success, invalid tool, malformed args,
  malformed model output, refusal, timeout, provider error and repeated
  proposal. Before adapter test implementation, inspect the installed Gemini
  SDK for supported transport injection. Use that hook if available; otherwise
  mock global `fetch`. In both cases count actual outbound requests and assert
  SDK retries are disabled/accounted. Add the server-only Gemini adapter.
5. **Orchestrator.** Implement one run state machine with 3 steps, 2 tools,
   6 provider attempts, at most 2 attempts per step, 30-second total deadline,
   per-call timeout `min(configured, remaining)`, ordered proposal gates,
   repeated-call key, Step-2 justification only after non-realistic rating,
   step-3 final/refusal-only rule, final goal/target/evidence checks, stop
   reason and safe failure mapping. Only a `realistic` candidate can be
   completed/recommended; other candidates use fixed incomplete presentation.
6. **Endpoint and observability.** Add only `POST /api/ai/practice-plan`.
  Preserve configured CORS and request-body bounds, apply the existing
  10-requests-per-minute-per-client rate-limit policy, bind request abort to
  run cancellation, and emit one sanitized run record with `steps[]` without
  prompt, raw output, arguments, session ID, metric values, secrets or reasoning.
7. **Game-over UI.** Add fixed goal selection and Practice Plan action on the
   existing game-over UI. Reuse session creation without changing Advice's
  endpoint/contract. Render loading, completed plan, validated incomplete
  response and generic safe failure; for incomplete results with an evaluation,
  show the rating-specific fixed status message plus normalized tool metrics.
  For `goal_unavailable`, show its separate fixed message without metrics
  because no tool ran. Never show chain-of-thought.
8. **Fake-first verification.** Complete all W05 unit tests, all W04 regression
  tests, E2E mocks and eval scenarios. Check zero provider/tool calls on
  invalid initial input, and zero tool execution on rejected proposals. Test
  six-attempt exhaustion with fast fake errors (not six timeouts), and count
  actual Gemini HTTP requests with a fake transport.
9. **Full gates and security review.** Run typecheck, full unit suite, build
   and Playwright. Map each security requirement below to its module and test.
   Review the diff and confirm no package/dependency, W03, W04 or secret change.
10. **Limited live smoke and evidence.** Only after all fake tests are green,
    use the already configured Gemini path for the smallest safe test. Track
    no more than 15 development runs and 3 final demo runs. Record actual
    model/attempt counts and sanitized outcomes; never infer live success from
    fake tests. Complete evidence and Driver/Reviewer rotation after human
    review.

## Error and retry policy

The complete taxonomy is in `AGENT_FLOW.md`. Invalid input, forbidden/unknown
tool, invalid arguments/result, malformed output, invalid final output,
repeated call, limit exhaustion, refusal, and cancellation are not retried.
Transient provider timeout/unavailable/rate-limit behavior may use at most one
secondary attempt for that same logical step when the error class and
remaining deadline permit it. Auth/configuration, quota/policy, malformed
output and tool failures are not blindly retried. A same-provider model
fallback, if explicitly enabled for a transient error, consumes the one
secondary attempt and the global budget. No cross-provider fallback.

## Security checklist: implementation guarantee and evidence

| Assignment §41 control | Planned enforcement | Planned proof |
|---|---|---|
| Provider key server-side only | `server/geminiAgentModel.ts`; reuse backend environment only; no Vite exposure | Source/config review and built-asset secret scan; no secret is included in test fixtures |
| Model cannot select arbitrary tools | `server/agentTools.ts` fixed registry; `server/agent.ts` exact name dispatch | Unknown-tool test asserts tool counter stays zero |
| Arguments validated | `server/agentContracts.ts` + scope/range validation in `server/agent.ts` before dispatch | Unknown goal, malformed shape, out-of-range and wrong goal tests; zero tool calls |
| Tool output validated | `server/agentTools.ts` output parser, allowed enums/fields, size cap and normalized projection | Malformed/oversize/secret-like/unexpected-field result tests; no second model step |
| No arbitrary filesystem/network access | Adapter only accesses Gemini provider; pure evaluator imports no IO; no generic URL/file/shell executor | Source review; tool tests use no transport; no such tool in registry |
| Core does not change canonical game state | Evaluator reads `SessionStore`, returns derived object, never mutates session/game | Snapshot immutability test and repeated state equality assertion |
| Secrets absent from tool result | Strict output schema rejects unknown fields; normalized projection emits fixed allowlisted scalar fields only | Injected extra field is rejected and never forwarded; serialized normalized result is checked |
| Maximum steps | `server/agent.ts` `MAX_AGENT_STEPS=3` and step-kind gate | Separate `max_steps` test: step 3 tool proposal never executes |
| Total deadline | Orchestrator deadline and abort propagation | Fake-clock/deferred provider deadline test, bounded duration and aborted signal |
| Bounded retries | One secondary attempt per step, SDK retries disabled/accounted, and global `MAX_PROVIDER_ATTEMPTS=6` | Gemini fake-transport test counts actual outbound HTTP requests; six-attempt budget test uses immediate fake errors |
| Logs contain no key/private contents | Sanitized completion log fields only; omit prompt, output, session, goal target values and arguments | Log serialization privacy test with secret/private sentinel values |
| Final output validated | Zod schema plus same-run evidence lookup in `server/agent.ts` | Schema-invalid and forged evidence tests; response never reports completed success |
| Safe user-facing error | HTTP mapper returns stable generic message; internal taxonomy remains server-side | Assert failure HTTP body excludes raw provider error, stack and sentinel secret |

## Acceptance/evidence map

| Requirement | Implementation owner | Required evidence |
|---|---|---|
| Fixed user goal and measurable targets | `SPEC.md`, contracts, UI | Boundary tests for both enums/ranges; E2E sends each fixed goal |
| Candidate → Evaluate → optional Revise | model adapter + orchestrator + tool | 2-step success and 3-step revision trace; 1 or 2 actual tool calls |
| Allowlist and all validation layers | contracts, tools, orchestrator | Unknown tool/args/result/final negative tests with zero invalid execution |
| Explicit state and stop reasons | orchestrator | Distinct repeated-call, max-step, tool-limit, deadline and cancellation tests |
| Retry/deadline/call budget | orchestrator/adapter | Calls/attempts asserted under fake timeout and transient errors |
| W04 remains stable | Existing code/API | Existing AI tests/E2E pass unchanged; no `/api/ai/advice` contract change |
| User workflow | UI/API | Playwright game-over, target selection, loading/result/failure cases; incomplete UI copy varies by rating and metrics come from validated evaluation |
| Privacy/observability | sanitized run logger | Log schema and sentinel-leak test; no raw traces |
| Pair understanding | evidence/review | Both members answer five review questions and record rotation |

## Risks and assumptions

- Gemini structured output/function-calling capabilities may differ across
  allowlisted models. The adapter must normalize and validate, and all fake
  tests must pass before a live smoke. Live model availability is not assumed.
- A synchronous deterministic tool cannot be forcibly interrupted mid-CPU
  execution by JavaScript timers. Its input is constant-size and operation
  count is bounded; the 250 ms watchdog detects unexpected elapsed time after
  return, and no IO/loop over external data is allowed.
- W04 session IDs are anonymous bearer-like IDs; no authenticated ownership is
  available without an out-of-scope account feature.
- A complete W05 run can have two tool calls when the model asks to revise;
  the ordinary success test uses one tool. Agent steps and provider attempts
  remain distinct counters.
- The assignment's limited live demo is environment-dependent and cannot be
  claimed before the locally configured provider actually completes the W05
  flow.

## Required final verification

Before completion, all must pass and be reported:

```text
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`package.json` confirms `npm test` runs `vitest run tests` and
`npm run test:e2e` runs `playwright test`; both runners are existing declared
dependencies. The focused agent test command is
`npm exec -- vitest run tests/agent.test.ts`. No dependency or script changes
are proposed.

Also review W04 regressions, `toolCallCount === 0` rejected paths, live/fake
evidence separation, diff scope, security checklist, and docs. If a required
command is unavailable or fails, do not report W05 as complete.