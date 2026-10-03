# W05 Evidence: AI Practice Plan

**Status:** Evidence skeleton — intentionally unfilled until implementation,
tests and any live run have actually occurred. No pass or runtime result is
claimed here.

## Index

- [Feature spec](SPEC.md)
- [Implementation plan and security checklist](PLAN.md)
- [Implementation tasks and test-ID mapping](TASKS.md)
- [Agent flow and stop reasons](AGENT_FLOW.md)
- [Tool contract](TOOL_CONTRACTS.md)
- [Agent evaluations](AGENT_EVALS.md)
- [AI usage ledger](AI_USAGE_LOG.md)

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
| Fake tests | Scripted fake | Not applicable | Pending | Pending | Pending test output |
| Live development | Gemini configured server-side | Record exact model only after call | Pending | Pending; no live success claimed | Pending sanitized run record |
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
- Record implementation file, test names, and actual contract review result:
  **Pending**.

## Success run traces

Use a synthetic/fake or approved non-private live example. Never paste raw
prompt, raw model response or private session data.

```text
Eval ID: E01
Run ID: [sanitized ID]
Goal: [survive_longer | collect_more_food; no numeric private stats]
Run class: [fake | live]
Status: [pending]
Steps: [steps[] trace pending]
Step count: [ ] (expected 2)
Provider/model per step: [ ]
Decision/validation per step: [ ]
Step-1 prompt/context contains candidate range but no rating enum, thresholds or formula: [ ]
Tool: evaluate_practice_goal, calls [ ] (expected 1), result validation [ ]
Final goal/targetValue matched latest evaluated candidate: [ ]
UI target displayed from validated final fields: [ ]
UI metrics displayed from normalized API evaluation: [ ]
Provider attempts: [ ] (maximum 6)
Tool calls: [ ] (maximum 2)
Stop reason: [ ]
Elapsed: [ ] ms (maximum deadline 30,000 ms)
Evidence field IDs/values verified against tool output: [ ]
Test names/output proving trace: [ ]
```

```text
Eval ID: E07 (one-time revision)
Run ID: [sanitized ID]
Run class: [fake | live]
Step 1: prompt omits rating criteria; proposed candidate tool-rated too_ambitious [ ]
Step 2: model receives tool rating; distinct revised candidate rates realistic [ ]
Step 3: final references latest candidate/evidence exactly [ ]
Agent steps/provider attempts/tool calls: [ ] / [ ] / [ ]
Stop reason: [goal_completed]
Test names/output: [pending]
```

```text
Eval ID: E08c/E27 incomplete UI checks
Latest tool rating: [realistic | too_easy | too_ambitious]
Fixed UI status text: [matches rating-specific constant]
Metrics source: normalized validated `evaluation` in API response
Rendered fields: [score, duration, food, derived rates, target ratio, rating]
Model recommendation prose suppressed: [ ]
For realistic rating, no “not recommended” wording: [ ]
For non-realistic rating, fixed not-recommended wording: [ ]
For E08a goal_unavailable, evaluation is null and no tool metrics render: [ ]
Test names/output: [pending]
```

## Rejected-tool evidence

```text
Eval ID: E02
Run ID: [sanitized ID]
Run class: fake
Proposal class: unknown tool
Validation outcome: [rejected before dispatch]
toolCallCount: [must be 0 for this proposal]
Provider attempts: [ ]
Stop reason: [unknown_tool]
Test name/output: [pending]
```

```text
Eval ID: E03
Proposal class: invalid/out-of-range tool args
Validation outcome: rejected before dispatch
toolCallCount: [must be 0]
Stop reason: invalid_tool_args
Test name/output: [pending]
```

```text
Eval ID: E06
Step 1 evaluated candidate rating: too_ambitious
Step 2 proposal: same canonical tool + arguments
Validation order outcome: repeated_call before justification/tool-limit checks
Tool executions: [must remain 1; duplicate is not executed]
Stop reason: repeated_call
Test name/output: [pending]
```

```text
Eval ID: E05
Step 1 evaluated candidate rating: too_ambitious
Step 2 revised candidate evaluated: [ ]
Step 3 decision: tool_request rejected before execution
toolCallCount: [must remain <=2]
Stop reason: max_steps
Test name/output: [pending]
```

The test must instrument the actual tool executor, not infer rejection only
from the HTTP status.

## Failure run and stop reason

```text
Run ID: [sanitized ID]
Run class: [fake | live]
Failure category: [ ]
Step/attempt/tool counts: [ ]
Stop reason: [ ]
Was active provider aborted when required: [ ]
Public response generic and free of internal details: [ ]
Test name/output: [pending]
```

```text
Eval ID: E04a/E04b/E11a-E11c
Failure class: [tool error | provider unavailable | transient | auth/quota | provider 429]
Provider attempts/retries/tool calls: [ ] / [ ] / [ ]
Actual outbound HTTP request count (adapter fake transport where applicable): [ ]
HTTP status/body class: [ ] (provider 429 => 503; app rate limit => 429)
Stop reason: [ ]
Test name/output: [pending]
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
| Focused agent tests | `npm exec -- vitest run tests/agent.test.ts` | Pending | Pending |
| Full unit tests incl. W04 regression | `npm test` (`vitest run tests`, per `package.json`) | Pending | Pending |
| Typecheck | `npm run typecheck` | Pending | Pending |
| Build | `npm run build` | Pending | Pending |
| Playwright | `npm run test:e2e` (`playwright test`, per `package.json`) | Pending | Pending |
| Security checklist | Review in `PLAN.md` | Pending | Pending |

## Known limitations

- Collision count is not available: W04 records only a terminal 0/1 marker;
  W03 ends on the first collision. W05 excludes it and cannot make movement or
  collision-frequency claims.
- Anonymous session UUID existence/equality is not authenticated ownership.
- Application validates evidence references and scalar values but cannot
  prove free-form prose truth.
- Live availability/latency is provider-dependent; fake tests do not prove it.
- Synchronous tool work cannot be preempted mid-execution; an output returned
  after the 250 ms watchdog is discarded and the run stops as `tool_timeout`.
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

- [ ] Success flow evidence present.
- [ ] Rejected-tool evidence proves zero execution for rejected proposal.
- [ ] Failure trace and stop reason present.
- [ ] Fake and live results clearly separated.
- [ ] All required validation commands actually passed.
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