# W05 Agent Evaluations

**Status:** Planned cases; none are marked passed until implementation and
actual test evidence exist. Most cases use a scripted fake model/tool.

| ID | Scenario | Scripted path | Expected outcome and evidence |
|---|---|---|---|
| E01 | Normal success | Step 1 receives goal, stats and allowed candidate range only (no rating enum/thresholds/formula); tool rates candidate `realistic`; Step 2 final matches latest `goal`/`targetValue` and evidence | HTTP 200 `completed:true`; 2 steps; 1 tool; 2 outbound provider attempts; UI renders numeric target from fields |
| E02 | Unknown tool | Step 1 asks for `delete_database` | `unknown_tool`; executor count `0`; safe HTTP 502 |
| E03 | Invalid arguments | Malformed/out-of-range target | `invalid_tool_args`; executor count `0`; safe HTTP 502 |
| E04a | Tool throws | Deterministic tool fake throws | `tool_error`; no retry/re-execution; safe HTTP 502 |
| E04b | Provider unavailable | Provider unavailable through its eligible bounded attempt(s) | `provider_unavailable`; stops at attempt/deadline bound; generic HTTP 502 |
| E05 | Max steps | Step 1 candidate is `too_ambitious`; Step 2 revised candidate is evaluated; Step 3 requests tool | `max_steps` by step-kind gate; no Step-3 execution; safe HTTP 502 |
| E06 | Repeated call | Step 1 `too_ambitious` candidate executes; Step 2 repeats exact normalized tool+args | `repeated_call` precedes justification/tool-limit; executor count remains 1; safe HTTP 502 |
| E07 | Candidate → Evaluate → Revise | Step 1 sees no rating thresholds and proposes a `too_ambitious` candidate; tool returns that rating; Step 2 sees the tool rating and proposes a distinct realistic target; Step 3 final matches latest result | HTTP 200; 3 steps, 2 tools, 3 actual calls without retry; final target/evidence match second evaluation |
| E08a | Goal unavailable preflight | Baseline at schema maximum | Fixed app-authored incomplete payload, HTTP 200, target null; provider/tool counts 0 |
| E08b | Refusal at Step 1 | Model returns `{kind:"refusal", reasonCode:"insufficient_evidence"}` | `model_refusal`, HTTP 502 safe failure; no target/tool evidence |
| E08c | Refusal at Step 2/3 | Refusal after at least one valid tool result, once with `realistic` rating and once with non-realistic rating | App-synthesized partial HTTP 200; correct fixed text; latest evaluated target/evidence and normalized metrics rendered; completed false, low confidence; realistic copy does not say “not recommended” |
| E09 | Invalid tool result | Missing/extra field, wrong rating, oversized or secret sentinel | `invalid_tool_result`; result not forwarded; safe HTTP 502 |
| E10a | Provider timeout | Step attempt times out; at most one retry | At most 2 actual requests for that step; abort propagated; deadline respected; exhausted timeout is HTTP 502 |
| E10b | Gemini adapter outbound count | Gemini adapter uses fake transport that counts actual outbound HTTP requests | Count equals adapter attempt accounting; proves SDK creates no hidden retry requests under configured adapter options |
| E11a | Transient provider error | Fast 503 then success on same logical step | One retry after fixed 200 ms; retry consumes global attempt budget; eventual HTTP 200 |
| E11b | Auth/quota/policy | 401/403/quota/policy response | No retry/fallback; generic HTTP 502 provider failure |
| E11c | Provider 429 | `Retry-After` missing, <=2 s, and >2 s cases | Missing waits 200 ms; <=2 s waits exact value; >2 s does not retry; provider 429 maps to HTTP 503, distinct from app limiter HTTP 429; eventual retry success is HTTP 200 |
| E12 | Malformed model decision | Invalid JSON, unknown decision or schema | `malformed_model_output`; no tool call; safe HTTP 502 |
| E13 | Tool limit | Inject `toolCallCount === MAX_TOOL_CALLS` at dispatcher guard | `tool_limit` before executor; safe HTTP 502; this is a guard-unit test, not naturally reachable through the fixed step-3 protocol |
| E14 | Total deadline | Deferred model attempt crosses 30 seconds | `deadline`; active provider aborted; no further attempt/tool; safe HTTP 502 |
| E15 | Invalid final output | Wrong fields, invalid enum, forged value | `invalid_final_output`; HTTP 502, never completed success |
| E16 | Safe failure response | Provider throws sentinel secret/text/stack | HTTP 502 public body/log has no sentinel or internal detail |
| E17 | Invalid initial input/session | Invalid UUID or missing session | Same HTTP 400/body; provider/tool counts 0 |
| E18 | Invalid stored session data | Corrupted/missing session metric | `session_data_invalid`; same public HTTP 400/body as missing session; provider/tool counts 0 |
| E19 | Realistic rating reachable | For each baseline 0..50, evaluate `baseline + 1` for both goals | Candidate is in range and rates `realistic` using integer comparisons |
| E20 | Collision data discipline | Inspect normalized context/result for a session with terminal collision flag | No `collisions` field or frequency claim; no new events |
| E21 | Cancellation | Client disconnects/aborts during deferred provider request | Active request aborted; terminal `cancelled`; no later step/tool; disconnected client receives no HTTP response |
| E22 | Step-1 final rejected | Model returns `kind:"final"` before tool result | `invalid_model_proposal`; HTTP 502; tool count 0 |
| E23 | Extra/session arguments rejected | Tool args include model-supplied `sessionId` or unknown key | Strict schema rejection before dispatch; executor count 0; HTTP 502 |
| E24 | Wrong selected goal | Proposal goal differs from user-selected goal | `invalid_tool_args`; executor count 0; HTTP 502 |
| E25 | Candidate range boundaries | Test lower/upper inclusive and just-outside values for each goal | Endpoints accepted; out-of-range rejected before tool call with HTTP 502 |
| E26 | Final target mismatch | Final `targetValue` differs from latest tool-evaluated candidate | `invalid_final_output`; HTTP 502, no success |
| E27 | Non-realistic final | Last rating is too_easy/too_ambitious | Accepted partial HTTP 200 only with `completed:false`, confidence not high; UI shows fixed non-realistic message and validated tool metrics, suppresses model recommendation prose |
| E28 | Unknown evidence field | Final invents a field ID not present in stable evidence allowlist | `invalid_final_output`; exact evidence validation rejects it with HTTP 502 |
| E29 | Six-attempt budget | In each of 3 model steps, first request gets an immediate transient failure and the one retry succeeds | Run completes HTTP 200 at exactly 6 actual outbound attempts; assert a seventh is impossible; no timeouts, so within the 30 s deadline |
| E30 | Unjustified Step-2 tool request | Step 1 proposal is evaluated `realistic`; Step 2 requests another tool anyway | `tool_not_justified`; executor count remains 1; HTTP 502 |

## Required assignment §32 coverage

| Required row | Evaluation |
|---|---|
| normal agent run | E01 |
| invalid initial input | E17 |
| unknown tool | E02 |
| invalid tool arguments | E03 |
| tool failure | E04 |
| provider timeout | E10 |
| malformed model output | E12 |
| repeated call | E06 |
| max steps reached | E05 |
| final invalid output | E15 |
| explicit rejected proposal proof | E02 and E03 assert `toolCallCount === 0` |

## E-ID ↔ W05-A-ID mapping

| Eval ID | Task test ID |
|---|---|
| E01 | W05-A01 |
| E02 | W05-A03 |
| E03 | W05-A04 |
| E04a | W05-A05 |
| E04b | W05-A08 |
| E05 | W05-A10 |
| E06 | W05-A09 |
| E07 | W05-A16 |
| E08a | W05-A19 |
| E08b, E08c | W05-A17 |
| E09 | W05-A06 |
| E10a | W05-A07 |
| E10b | W05-A30 |
| E11a, E11b, E11c | W05-A08 |
| E12 | W05-A12 |
| E13 | W05-A11 |
| E14 | W05-A13 |
| E15 | W05-A14 |
| E16 | W05-A15 |
| E17 | W05-A02 |
| E18 | W05-A18 |
| E19 | W05-A22 |
| E20 | W05-A20 |
| E21 | W05-A21 |
| E22 | W05-A23 |
| E23 | W05-A24 |
| E24 | W05-A25 |
| E25 | W05-A26 |
| E26 | W05-A27 |
| E27 | W05-A28 |
| E28 | W05-A29 |
| E29 | W05-A31 |
| E30 | W05-A32 |

## Fake-first gate

Before any live request, all fake model, tool-contract, loop, timeout, deadline,
validation, safe-error, W04 regression and mocked browser tests must pass. The
fake must be able to emit valid proposals, unknown tools, malformed arguments,
final/refusal responses, timeout, provider errors, malformed output and
repeated-call sequences. Live outcomes are recorded only after real W05
provider calls; fake passes never count as live evidence.

## Quality evaluation: evidence discipline

For every final response in E01/E07/E08c/E15/E26/E28, assert that evidence
`source`, `field`, and `value` correspond to a normalized tool output from the
same run and the final goal/target match the latest evaluation. E28 explicitly
checks an unknown field ID; E26 checks a mismatched target. E08b/E08c verify
step-specific refusal handling without overlapping E18's corrupted-session
preflight case. The application does not verify free-form prose truth; record
that residual limitation.