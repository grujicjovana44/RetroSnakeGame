# W05 Tasks: AI Practice Plan

**Status:** APPROVED — human approval recorded 2026-10-03. `SPEC.md` and the narrow constitution
amendment are approved; T001 records that decision. A task is complete only
with its acceptance evidence.

**Progress:** T001–T013 complete; T014 complete (one development live smoke
is recorded; 1 of 15 development runs used, with no final-demo run claimed).
T015 complete: evaluation cases and test bindings, pair roles and contributions,
both members' answers, and reciprocal review are recorded. T016 complete:
human final review and acceptance recorded on 2026-10-03. `PLAN.md` contains
the security-control mapping and recorded validation evidence for T013.

| ID | Task | Depends on | Planned files | Acceptance evidence |
|---|---|---|---|---|
| W05-T001 | Record approval of scenario, goal ranges, limits, anonymous-session boundary and constitution amendment | Human approval | `SPEC.md`, `specs/CONSTITUTION.md` | Approval dated 2026-10-03 recorded; exact approved amendment applied |
| W05-T002 | Capture fresh W04 baseline and confirm clean regression surface | T001 | Existing W04 docs/tests; no product edits | Typecheck, unit, build and E2E baseline outcomes recorded; `/api/ai/advice` behavior unchanged |
| W05-T003 | Add agent request/decision/tool/result/final Zod schemas and stable evidence IDs | T001 | `server/agentContracts.ts`, `tests/agent.test.ts` | Enum, shapes, bounds, unknown fields and evidence value types tested |
| W05-T004 | Implement `evaluate_practice_goal` contract and deterministic evaluator | T003 | `server/agentTools.ts`, `tests/agent.test.ts`, `TOOL_CONTRACTS.md` | Goal ranges, ratios, ratings, null denominators, read-only behavior, session scope, collision exclusion and output bounds tested |
| W05-T005 | Define provider-neutral model-step interface and scripted fake | T003 | `server/agentModel.ts`, `tests/agent.test.ts` | Fake covers tool proposal, invalid tool/args, final/refusal, malformed output, timeout, provider error and repetition |
| W05-T006 | Inspect transport injection, then add Gemini model adapter behind existing backend config/allowlist | T005 | `server/geminiAgentModel.ts`, limited adapter tests | First verify installed Gemini SDK transport-injection support. If supported, inject fake transport; otherwise mock global `fetch`. Count actual outbound HTTP requests and prove no hidden retries; adapter returns normalized decisions, credentials remain server-side, Advice contract unchanged |
| W05-T007 | Implement bounded orchestrator state machine and safe stop taxonomy | T004, T005 | `server/agent.ts`, `tests/agent.test.ts`, `AGENT_FLOW.md` | 3 steps, 2 tools, 6 attempts, per-step 1 retry, 30s deadline, repeated-call and step-kind restrictions asserted |
| W05-T008 | Validate and normalize tool output; enforce final evidence references | T004, T007 | `server/agentTools.ts`, `server/agent.ts`, `tests/agent.test.ts` | Bad shape/size/fields rejected; forged or mismatched source/field/value never returns completed success |
| W05-T009 | Add separate Practice Plan HTTP endpoint and sanitized run observability | T007, T008 | `server/server.ts`, `server/agentContracts.ts`, `tests/agent.test.ts` | New route works; configured CORS, bounded body and 10/minute/client rate limit apply; Advice route untouched; abort propagation, safe status/error and log privacy tested |
| W05-T010 | Add game-over target controls and Practice Plan UI states | T009 | `index.html`, `src/main.ts` | Only fixed enum goals; disabled/in-progress/result/incomplete/failure states; incomplete UI chooses fixed copy by rating and renders metrics only from normalized API evaluation; preflight unavailable has no metrics; no model/tool loop in browser |
| W05-T011 | Complete W05 fake-first unit and API test matrix | T003-T010 | `tests/agent.test.ts`, `specs/specweek05/AGENT_EVALS.md` | Every assignment §32 row represented; rejected tool/args assert `toolCallCount === 0`; W04 suite remains green |
| W05-T012 | Add browser coverage for Practice Plan and W04 regression | T010 | `e2e/game.spec.ts` | Game-over visibility, both goal payloads, success/incomplete/error display, realistic/non-realistic fixed message and validated metrics display, preflight no-metrics state, W04 Advice still works |
| W05-T013 | Run security review and full required validation gates | T011, T012 | `PLAN.md`, `EVIDENCE_W05.md` | All §41 controls mapped to code and test; typecheck/test/build/E2E pass; no dependency/package changes |
| W05-T014 | Run limited live smoke only after fake suite passes | T013 | `AI_USAGE_LOG.md`, `EVIDENCE_W05.md` | One development live run is recorded within the 15-run cap with exact provider/model/status/steps/attempts/tools; no secret or raw prompt. Final-demo runs remain unclaimed and capped at 3. |
| W05-T015 | Complete evaluation/evidence and rotate pair roles for review | T013; T014 when live available | `AGENT_EVALS.md`, `EVIDENCE_W05.md`, `AI_USAGE_LOG.md` | At least 5 evals, fake/live separated, success/rejected/failure traces and both members' answers to five questions recorded |
| W05-T016 | Final diff review and completion decision | T015 | W05 docs and changed source/test files | No out-of-scope changes; required gates and evidence present; human accepts completion |

## Required test names/intent

The implementation should use focused tests, preferably in
`tests/agent.test.ts`; this table is the task-level acceptance list.

| Test ID | Priority | Scenario | Required assertion |
|---|---|---|---|
| W05-A01 | Mandatory core | Normal run | Step 1 context excludes rating enum/thresholds/formula; tool evaluates candidate; 2 model steps, exactly 1 tool, <=3 provider attempts, HTTP 200 completed response; UI target comes from fields |
| W05-A02 | Mandatory core | Invalid initial input/session | Provider attempts `0`; tool calls `0`; invalid UUID and missing session same HTTP 400/body |
| W05-A03 | Mandatory core | Unknown tool | Rejected; executor count `0`; HTTP 502 |
| W05-A04 | Mandatory core | Invalid tool arguments | Rejected before dispatch; executor count `0`; HTTP 502 |
| W05-A05 | Mandatory assignment extension | Tool throws | `tool_error`; no retry or replay; safe HTTP 502 |
| W05-A06 | Mandatory assignment extension | Invalid tool result | Rejected and never sent to another model step; HTTP 502 |
| W05-A07 | Mandatory core | Provider timeout | At most one retry per step; abort propagated; exhausted retry returns HTTP 502 |
| W05-A08 | Mandatory assignment extension | Provider failure classes | Transient retry, auth/quota no retry => HTTP 502; provider 429 => HTTP 503; app limiter => HTTP 429 |
| W05-A09 | Mandatory core | Repeated proposal | First candidate `too_ambitious`; identical Step-2 proposal stops before duplicate execution; HTTP 502 |
| W05-A10 | Mandatory core | Max steps | First candidate `too_ambitious`; after second evaluation, Step-3 tool request stops as `max_steps`, HTTP 502 |
| W05-A11 | Mandatory core | Tool-limit guard | Inject exhausted count at dispatcher; `tool_limit` before executor, HTTP 502. Public Step-3 proposal stops as `max_steps` first. |
| W05-A12 | Mandatory assignment extension | Malformed model decision | Invalid schema/unknown decision rejected; no tool call; HTTP 502 |
| W05-A13 | Mandatory core | Total deadline | Abort active provider; no new attempt/tool after expiry; HTTP 502 if response remains available |
| W05-A14 | Mandatory core | Invalid final output | Invalid schema/evidence/goal/target/rating never appears as completed success; HTTP 502 |
| W05-A15 | Mandatory core | Safe failure | Public body omits provider text, stack trace, secret and internal diagnostics; status follows Flow taxonomy |
| W05-A16 | Supplementary | Candidate revision | First target `too_ambitious`, distinct revised target `realistic`, final matches latest result; HTTP 200 |
| W05-A17 | Supplementary | Refusal matrix | Step-1 failure HTTP 502; Step-2/3 partial HTTP 200; fixed copy varies by rating and validated tool metrics render |
| W05-A18 | Supplementary | Corrupted stored metric | `session_data_invalid`, preflight 0 calls, same public HTTP 400/body as missing session |
| W05-A19 | Supplementary | Goal unavailable | Fixed incomplete HTTP 200 response, target null, no provider/tool/evaluation metrics |
| W05-A20 | Supplementary | Collision metric excluded | W04 terminal 0/1 flag absent from W05 context/tool output |
| W05-A21 | Supplementary | Cancellation | Abort active provider; terminal `cancelled`; no subsequent step/tool |
| W05-A22 | Supplementary | Realistic reachable | For each baseline 0..50 and both goals, baseline+1 is in range and rates realistic |
| W05-A23 | Supplementary | Step-1 final rejected | `invalid_model_proposal`; safe HTTP 502; no tool |
| W05-A24 | Supplementary | Extra/session arguments | Model-supplied sessionId or unknown key rejected; executor count `0` |
| W05-A25 | Supplementary | Goal mismatch | Proposed goal differs from selected enum; reject before tool |
| W05-A26 | Supplementary | Candidate range boundaries | Inclusive endpoints accepted; just-outside values rejected |
| W05-A27 | Supplementary | Final target mismatch | Final target differs from latest evaluated candidate; reject |
| W05-A28 | Supplementary | Non-realistic final | `too_easy`/`too_ambitious` requires `completed:false`, confidence not high; HTTP 200 incomplete, UI shows fixed non-realistic message plus validated tool metrics and suppresses model recommendation prose |
| W05-A29 | Supplementary | Unknown evidence field | Explicit invented field ID rejected |
| W05-A30 | Mandatory assignment extension | Gemini adapter outbound request count | First test SDK transport injection; use injected fake transport if supported, otherwise mock global `fetch`; count HTTP requests and prove no hidden SDK retry |
| W05-A31 | Mandatory assignment extension | Six-attempt budget | Each of 3 steps gets one immediate transient failure then one successful retry; run completes at exactly 6 outbound attempts and cannot issue a seventh; no timeout delays |
| W05-A32 | Supplementary | Unjustified Step-2 tool request | Prior evaluation is `realistic`; reject `tool_not_justified` before dispatch, keep tool executor count at 1, HTTP 502 |
| W05-A33 | Supplementary | Session duration excludes pause and post-game wait | E31 Playwright scenario confirms only active duration is submitted |
| W05-A34 | Supplementary | Serbian fixed-goal labels | E32 Playwright scenario confirms both fixed goal labels |

## E-ID to task-test map (reverse direction)

| Task test ID | Eval ID(s) |
|---|---|
| W05-A01 | E01 |
| W05-A02 | E17 |
| W05-A03 | E02 |
| W05-A04 | E03 |
| W05-A05 | E04a |
| W05-A06 | E09 |
| W05-A07 | E10a |
| W05-A08 | E04b, E11a, E11b, E11c |
| W05-A09 | E06 |
| W05-A10 | E05 |
| W05-A11 | E13 |
| W05-A12 | E12 |
| W05-A13 | E14 |
| W05-A14 | E15, E26 |
| W05-A15 | E16 |
| W05-A16 | E07 |
| W05-A17 | E08b, E08c |
| W05-A18 | E18 |
| W05-A19 | E08a |
| W05-A20 | E20 |
| W05-A21 | E21 |
| W05-A22 | E19 |
| W05-A23 | E22 |
| W05-A24 | E23 |
| W05-A25 | E24 |
| W05-A26 | E25 |
| W05-A27 | E26 |
| W05-A28 | E27 |
| W05-A29 | E28 |
| W05-A30 | E10b |
| W05-A31 | E29 |
| W05-A32 | E30 |
| W05-A33 | E31 |
| W05-A34 | E32 |

## Pair rotation and review

Driver owns spec-to-code traceability and initially implements/contracts;
Reviewer checks tool boundary, stop conditions, limits, security and evidence.
Then switch roles for the second implementation/review slice. Record names,
tasks and review date only after the pair confirms them in `EVIDENCE_W05.md`.
Both members must answer the five questions listed in the evidence skeleton.

## AI usage discipline

`AI_USAGE_LOG.md` must distinguish logical agent runs, provider model calls,
provider retries/fallback attempts and tool executions; mark every result as
fake or live. Development live runs are capped at 15 and final demo runs at 3.
The expected flow is 2–3 model steps per run; no uncontrolled retry loops.