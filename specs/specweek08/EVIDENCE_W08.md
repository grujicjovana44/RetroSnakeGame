# W08 Evidence: Secure the Arcade

Status: implementation/test evidence recorded; human contribution and final sign-off fields remain open.

## 1. Checkpoint

- Date/time:
- Branch:
- Commit:
- Working tree:
- Game/W05 scope:
- Human operator:

## 2. Baseline commands and results

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run typecheck` | Passed | `tsc --noEmit`; no TypeScript errors reported |
| `W08_TEST_SYNTHETIC_SECRET=...; npm.cmd test` | Passed | 5 test files, 153 tests passed on Vitest 5.0.3; sentinel value was synthetic and not printed |
| `npm.cmd run build` | Passed | TypeScript check and Vite production build; `dist/assets/index-Dab2l5uZ.js`, 19.11 kB |
| `$env:CI='1'; npm.cmd run test:e2e` | Observed 14 passed | Chromium production preview reported all 14 tests `ok`, including T04/T05 and T16; wrapper did not print its final summary and was stopped after all 14 tests completed |
| `npm.cmd audit --audit-level=moderate` (before) | 5 vulnerabilities | Human baseline: 2 moderate and 3 high, including zod/vite/source-map-js/vitest findings |
| `npm.cmd audit --omit=dev --audit-level=moderate` (before) | 1 high vulnerability | Human baseline: runtime `zod` finding |
| `npm.cmd audit --audit-level=moderate` (after) | Passed | `found 0 vulnerabilities` |
| `npm.cmd audit --omit=dev --audit-level=moderate` (after) | Passed | `found 0 vulnerabilities` |

Latest human PowerShell rerun (date not recorded) confirmed both audit modes:

```text
npm.cmd audit --audit-level=moderate
found 0 vulnerabilities

npm.cmd audit --omit=dev --audit-level=moderate
found 0 vulnerabilities
```

These results replace the earlier temporary `audit endpoint unavailable`
observation for the final dependency-audit status. No dependency or lockfile
changes were made during this rerun.

Baseline fake-provider W05 input/expected output: the full unit/integration suite
and existing E2E suite passed. A separately archived full request/response
fixture was not saved in the terminal output.

All observed test runs used fake/scripted providers or browser route mocks. No
live Gemini call was made. Vitest reported that two values were loaded from
`server\\.env`; their values were not printed or recorded here.

Dependency remediation: direct `zod` changed `4.6.5 → 4.6.6`, direct `vite`
changed `8.3.0 → 8.3.3`, direct `vitest` changed `5.0.1 → 5.0.3`, and
transitive `@vitest/mocker` resolved to `5.0.3`. The transitive
`source-map-js` path through Vite/PostCSS is pinned via npm `overrides` to
`1.2.2`. No major upgrade, application feature, `.env` or live provider call
was introduced.

## 3. Architecture and data inventory

Reference: `SPEC.md`, sections “Data inventory” and “Threat model”.

Observed architecture/evidence: HTTP validation remains in `server/api.ts`/`server/server.ts`; agent validation and same-run evidence checks remain in `server/agent.ts` and `server/agentContracts.ts`; security events are bounded in `server/securityEvents.ts`; process-local concurrency is in `server/concurrency.ts`; browser headers are configured in `vite.config.ts`.

## 4. Threat model

Nine risks and priority risks R1-R3 are defined in `SPEC.md`.

Observed controls and test results: T08-02, T08-03, T08-04, T08-05, T08-08, the full unit/integration suite, and T16 passed. Dependency audits were available and both recorded 0 vulnerabilities; no separate provider audit was required.

## 5. Invariants and configuration

| Invariant | Control location | Test | Result |
|---|---|---|---|
| I1 | `server/api.ts`, `server/server.ts` | T08-02 | Passed: strict summary, malformed JSON and oversized body mapping tested |
| I2 | `server/agent.ts`, `server/agentTools.ts` | agent regression tests | Passed in `npm.cmd test`: tool and final schemas reject unknown/forged data |
| I3 | `server/agent.ts` | cross-run fixture | Passed: schema-valid foreign evidence rejected |
| I4 | `server/agent.ts` | cross-run fixture | Passed: second session state unchanged |
| I5 | `vite.config.ts`, E2E | T16 | Passed: headers present, cross-origin script blocked, game canvas visible |
| I6 | `server/concurrency.ts`, `server/server.ts` | T08-04/T08-05 | Passed: max two admissions, late work holds slots, cleanup permits next request |
| I7 | `server/securityEvents.ts`, `server/server.ts` | T08-03/T08-08 | Passed for bounded event shape and secret-free response/log assertions covered by tests |
| I8 | `tests/agent.test.ts` | baseline/T08-02 | Passed: valid W05 path remains operational in full suite |

Configured limits and observed values: 16 KiB HTTP body; 10 requests per 60 seconds per remote key for advice and Practice Plan; 2 active Practice Plan executions per process; 3 agent steps; 2 tool calls; 6 provider attempts total; 2 attempts per step; 10,000 ms provider-attempt timeout; 250 ms tool timeout; 15,000 ms advice timeout; 4 KiB validated tool-result payload; 2,000 ms maximum provider retry-after. These values were read from the current source. Actual provider billing/cancellation remains unobservable.

## 6. Test matrix T00-T17

| Test | Applicable? | Concrete fixture/input | Expected result | Observed result | Test location | Evidence reference |
|---|---|---|---|---|---|---|
| T00 | Yes | Existing full unit/integration and E2E W05 coverage | Normal game and existing fake W05 paths pass | Passed in baseline suites | `tests/agent.test.ts`, `tests/ai.test.ts`, `e2e/game.spec.ts` | Baseline command results above |
| T01 | Yes | T08-02 malformed JSON and invalid strict request | 400; no provider/tool | Passed: malformed JSON 400; invalid requests do not invoke provider/tool | `tests/agent.test.ts` | T08-02 targeted run |
| T02 | Yes | `T08-00 baseline: records game-summary privileged fields separately from oversized body`; valid summary plus `ownerId`, `role`, `provider`, `model`, `maxSteps`, `timeoutMs`, then separate oversized summary | Privileged-field request returned 201 and stored only bounded summary; Practice Plan returned 200; separate oversized request returned 400 under current behavior | Passed. Provider model call count was 2 for the valid Practice Plan; one validated tool result was observed. Oversized-specific provider/tool counts were not independently emitted; the model count remained 2. Logs did not contain attacker-controlled owner/model values. This is baseline behavior, not the W08 target contract. | `tests/agent.test.ts` | `npm.cmd test -- -t "T08-00 baseline: records game-summary privileged fields separately from oversized body"` |
| T03 | Yes | Valid session and unavailable session | Valid session works; unavailable session is generic failure | Passed in full suite; exact per-case provider count not separately recorded | `tests/agent.test.ts` | Full unit/integration run |
| T04 | Yes | `T04/T05 render provider HTML, event and URL markers as inert text` in Playwright | Safe DOM and no script/event execution | Passed 1/1; marker rendered via `textContent`, no `img/script` child and execution sentinel stayed false | `e2e/game.spec.ts:70` | `$env:CI='1'; npm.cmd run test:e2e -- --grep 'T04/T05'` |
| T05 | Yes | Same Playwright fixture with HTML, event attribute, `javascript:` URL and `a < b` | Dangerous content inert; normal text preserved | Passed 1/1; exact marker remained visible as text | `e2e/game.spec.ts:70` | `$env:CI='1'; npm.cmd run test:e2e -- --grep 'T04/T05'` |
| T06 | Yes | Malformed decision, invalid final, valid final | Valid final accepted; malformed/forged final rejected | Passed in full unit/integration run | `tests/agent.test.ts` | Full unit/integration run |
| T07 | Yes | Unknown/inherited tool names and allowlisted tool | Only allowlisted tool executes | Passed in full unit/integration run | `tests/agent.test.ts` | Full unit/integration run |
| T08 | Yes | Invalid type/goal/session/range and valid inclusive range | Valid boundary accepted; invalid args rejected | Passed in full unit/integration run | `tests/agent.test.ts` | Full unit/integration run |
| T09 | Yes, with channel limitation documented | `repeats the previous normalized proposal and keeps step-one context bounded`; numeric session facts plus fake-provider proposal | Numeric channel bounded; proposal validated/rejected | Passed in full unit/integration run; provider is fake and no live channel was used | `tests/agent.test.ts:525`, `server/agent.ts` | `$env:W08_TEST_SYNTHETIC_SECRET=...; npm.cmd test` |
| T10 | Yes | Existing forged-result coverage plus cross-run baseline fixture | Valid result forwarded; foreign evidence rejected | Existing same-run/forged-result protections passed in baseline suite; cross-run result recorded below | `tests/agent.test.ts` | Baseline suite and cross-run command below |
| T11 | Yes | Repeated call and exhausted step/tool/provider budgets | Allowed revision works; repeated/budget work stops | Passed in full unit/integration run | `tests/agent.test.ts` | Full unit/integration run |
| T12 | Yes | `T08-05 keeps HTTP concurrency slots occupied until late provider work settles`; separate per-attempt timeout and deadline tests | Timeout returns 502; late work holds lease; cleanup reaches 0 | Passed: `[429,502,502]`, 4 provider calls, active count 0 after controlled settlement, next request 200; independent timeout/deadline tests passed in full suite | `tests/agent.test.ts:1254,1266,1619` | `npm.cmd test -- tests/agent.test.ts -t T08-05`; full suite |
| T13 | Yes | `T08-00 baseline: measures three independent concurrent Practice Plan HTTP executions`; three distinct valid sessions, delayed fake model, limiter always allows | All three initial HTTP requests returned 200; each completed with 2 provider attempts and 1 tool call. Next request after cleanup returned 200. Current safety boundary failed: `maxActiveExecutions >= 3`, so the W08 limit of 2 is not present. | Passed as a baseline measurement; not a passing W08 concurrency-control test. Exact maximum was not printed; only `>= 3` was asserted. Cleanup reached 0 active executions. | `tests/agent.test.ts` | `npm.cmd test -- -t "T08-00 baseline: measures three independent concurrent Practice Plan HTTP executions"` |
| T14 | Yes | `T08-14 loads only the synthetic test secret and keeps it out of server surfaces`; provider error and unexpected tool field fixtures | Synthetic secret loaded, then absent from HTTP response, model context, logs, bundle and source maps | Passed 1/1 with `W08_TEST_SYNTHETIC_SECRET`; provider/tool sentinel and extra-field tests also passed. Existing `.env` was not changed or used as the synthetic source | `tests/agent.test.ts` | `$env:W08_TEST_SYNTHETIC_SECRET='w08-synthetic-secret-7d2c'; npm.cmd test -- tests/agent.test.ts -t T08-14` |
| T15 | Yes | `T15 keeps browser-supplied extreme metrics bounded and non-privileged`; HTTP session with max bounded score/duration/collisions/food | Bounded data gives no privilege or confirmed rank; read-only state unchanged | Passed 1/1: session 201, no role/rank fields, session unchanged; Practice Plan returned safe `goal_unavailable` 200 with 0 provider calls | `tests/agent.test.ts:1511` | `$env:W08_TEST_SYNTHETIC_SECRET=...; npm.cmd test -- tests/agent.test.ts -t T15` |
| T16 | Yes | Vite-served page; same intercepted cross-origin script with and without CSP | Headers present; resource executes without CSP and is blocked with CSP; game still renders | Passed 1/1; full E2E run reported 14/14 `ok` | `vite.config.ts`, `e2e/game.spec.ts:25` | `$env:CI='1'; npm.cmd run test:e2e -- --grep T16`; full E2E run |
| T17 | Yes | `T08-00 baseline: rejects a schema-valid final with evidence from another run`; two independent sessions, second final uses `session.score` evidence from first run | Final is structurally valid, then rejected by same-run validation; HTTP-equivalent agent result is 502, provider attempts 2, tool calls 1, second session unchanged | Passed. This confirms an existing regression protection; no new W08 fix was made. | `tests/agent.test.ts` | `npm.cmd test -- -t "T08-00 baseline: rejects a schema-valid final with evidence from another run"` |

## 7. Before/after comparisons

### A — Invalid/oversized request

- Main input: same invalid/oversized request with privileged fields, captured
  before application-code changes.
- Before status/provider/tool counts/events: privileged-field session request
  returned 201; subsequent valid Practice Plan returned 200 with 2 provider
  model calls and 1 tool result; separate oversized session request returned
  400. Oversized-specific provider/tool counts were not independently emitted.
- Before logs: attacker-controlled owner/model values were absent from mocked
  `console.info` output.
- After status/provider/tool counts/events: privileged/unknown summary fields return 400; oversized body returns 413; malformed JSON returns 400. Invalid requests do not reach provider/tool. Valid summary and Practice Plan requests remain successful. Exact per-request provider/tool counts for every rejection were not separately printed.
- Existing control or implemented change: strict summary schema and typed HTTP parsing/status mapping in T08-02. Historical before values remain above and are not overwritten.

### B — Cross-run evidence

- Main input: schema-valid final whose evidence value comes from a different
  run/session, captured before application-code changes.
- Before final status/calls/state/events: schema validation passed; final was
  rejected as `invalid_final_output`, with 2 provider attempts, 1 tool call and
  unchanged second-session data.
- After final status/calls/state/events: Existing protection still passes: schema-valid foreign evidence is rejected as `invalid_final_output`; 2 provider attempts, 1 tool call; second session unchanged. No separate W08 fix was needed.
- Existing control or implemented change: existing same-run evidence validator,
  confirmed by regression fixture; no new fix was introduced.

### C — Three independent concurrent requests

- Main input: three independent valid requests, distinct sessions and a
  delayed fake operation, captured before application-code changes.
- Before active maximum/admission/cleanup/next request: three initial HTTP
  responses were 200; each had 2 provider attempts and 1 tool call. The test
  confirmed `maxActiveExecutions >= 3`, cleanup to 0 active executions, and a
  subsequent successful HTTP request. Exact maximum was not printed.
- After active maximum/admission/cleanup/next request: 2 admitted, third rejected 429; late timeout fixture returned `[429,502,502]`, 4 provider calls; after 80 ms controlled settlement active count was 0 and the next request returned 200.
- Existing control or implemented change: `createConcurrencyLimiter(2)` and late-operation tracking now hold leases until provider/tool settlement. The before result remains a failed W08 boundary and is not rewritten.

## 8. Security events, CORS/CSRF and production checks

- Correlation ID behavior: T08-03 passed schema validation for server-generated UUID correlation IDs and separated request runs.
- Allowed/rejected/completed events: T08-03 passed bounded events for allowed decision, tool, completion and rejection; counters were 2 provider attempts and 1 tool call for the completed fake run.
- CORS positive/negative checks: passed in agent HTTP regression; allowed origin succeeds, unknown origin returns 403, and credentials are not enabled.
- CSRF applicability review: no cookie authentication or credentialed cross-origin requests exist; sessions are anonymous UUIDs supplied in JSON and AI resource use is protected by origin checks, rate limit and process-local concurrency. No CSRF token was introduced; this remains a residual ownership/resource-consumption risk.
- Production response headers: passed in T16 for CSP, `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`.
- CSP blocked-resource proof: passed with an intercepted cross-origin synthetic script resource; it did not execute.
- Normal production game/assets/AI proof: production-preview game canvas and all 14 E2E browser flows passed; backend AI calls were route-mocked in E2E.
- Secret sentinel and provider/tool leakage proof: T14 synthetic process-environment test passed without modifying `.env`; unexpected tool fields and raw provider/tool sentinels were not forwarded. Preflight security-event sanitization now has a regression test for malformed JSON and forbidden origin. A dedicated newline/prefix log-injection fixture remains open and is not claimed as passed. Dependency audit was completed separately and both audit modes recorded 0 vulnerabilities. A separate provider audit was not performed.

## 9. Team contributions and AI assistance

- Team member A contribution: Pending human completion.
- Team member B contribution: Pending human completion.
- Each member's security control contribution: Pending human completion.
- Each member's negative-test contribution: Pending human completion.
- AI assistance used: Pending human completion.
- Human review/decisions: Pending human completion.

## 10. Residual limitations

- Anonymous UUID session scope is not authenticated ownership.
- Browser game statistics are not confirmed anti-cheat evidence.
- Provider cancellation cannot prove remote billing/processing stopped.
- Non-cooperative work may hold a quarantined concurrency slot.
- Local concurrency limits apply to one server process.
- Free-form provider finding text is not fully semantically verified.

## 11. Final checkpoint

- Final branch/commit:
- Final working tree:
- Human sign-off:
- W08 complete decision: Pending human review; dependency audits now report 0 vulnerabilities and automated checks pass. Human contribution/sign-off fields remain open.
- Approval to begin post-W08 improvements: Not requested.
