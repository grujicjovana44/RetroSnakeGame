# W08 Feature Specification: Secure the Arcade

## Status and source of truth

Status: implemented; final evidence and human sign-off remain pending.

This specification defines the Week 08 security-hardening scope for the
existing RetroSnake W05 Practice Plan agent. It supplements, but does not
modify, the approved W05 documents. W05 remains the source of truth for the
existing agent protocol and limits unless this specification explicitly adds a
W08 boundary.

The required lifecycle is:

`specification -> plan -> tasks -> tests -> implementation -> evidence`

No result in this document is evidence of a passing check. Results are to be
entered only after the human team runs the commands and browser checks.

## User value

The game and its useful W05 agent flow remain available when browser input,
model output, HTTP traffic, provider behavior, or concurrent requests are
malicious, malformed, stale, or excessively expensive.

The existing flow must still perform at least two model decision steps and one
real execution of the allowed deterministic read-only evaluator on its normal
success path.

## Scope and constraints

In scope:

- HTTP input, body-size, status, CORS, rate, concurrency, timeout and deadline
  controls;
- runtime validation of request, model decision, tool arguments, tool result
  and final response;
- same-run evidence integrity and anonymous session scope;
- browser text rendering, CSP and security headers for a local production
  build;
- minimal structured security events in addition to usage telemetry;
- tests T00-T17 and an evidence record.

Out of scope:

- login, accounts, cookies, bearer sessions or stronger ownership;
- a new provider, model, provider fallback, database or new agent tool;
- AI Hint, rich-text/Markdown rendering, deployment and optional challenges;
- dependency upgrades or package-script changes without separate approval.

The session model remains anonymous/demo. A UUID identifies a server-held
session record and binds one agent execution to that record; it does not prove
authenticated ownership. Browser-provided game statistics are untrusted,
bounded input and are not a confirmed leaderboard or privilege source.

## Functional requirements

### FR-01 Request preflight

The server must bound the request body before JSON parsing, validate the JSON
shape and reject unknown or privileged policy fields according to the endpoint
contract. Invalid JSON/schema, an invalid UUID, a missing session and an
invalid goal must not call a provider or tool.

Observable acceptance: T01 and T02 show provider/tool call counts of zero and
safe public responses.

### FR-02 Status and failure contract

The API must use the following public status classes: 400 invalid input or
JSON, 403 forbidden origin, 405 unsupported method, 413 oversized body, 429
application rate/concurrency rejection, 500 unexpected internal error, 502
provider/agent failure and 503 unconfigured provider. Public errors are safe
fixed messages and never expose raw exceptions, stacks, prompts, arguments,
session identifiers or secrets.

### FR-03 Server-owned policy

The browser and model must not select identity, authorization, provider/model,
step/tool/attempt limits, timeout values or security configuration. The server
binds the canonical session ID from the original validated request.

### FR-04 Closed tool boundary

Only `evaluate_practice_goal` may execute. Unknown names, including inherited
property names such as `constructor` and `toString`, are rejected. Valid tool
names still require valid arguments, goal matching, canonical session scope,
domain range checks and result validation.

### FR-05 Read-only integrity

The evaluator is deterministic and read-only. It must not modify canonical
game state, session facts, score, difficulty, rules or persistence. A final
response may reference only evidence from the latest validated tool result of
the same execution.

### FR-06 Browser output safety

AI and user-controlled values are rendered as text. No untrusted value becomes
HTML, a script, an event handler or an unsafe external resource. Production
browser checks must verify both safe DOM behavior and CSP enforcement.

### FR-07 Resource boundaries

The W05 limits remain: three decision steps, two tool executions, six provider
attempts, two attempts per step, 30-second total deadline, 10-second provider
attempt timeout and 250 ms tool watchdog. W08 adds a global maximum of two
active Practice Plan executions per local server process.

Rate limiting and concurrency limiting are independent controls. The
concurrency test uses distinct valid sessions and distinct valid requests so
rate limiting, same-session coalescing or cache deduplication cannot hide the
concurrency boundary.

An active execution includes provider attempts, retry waits, tool work,
validation and cleanup. A timeout does not release a slot while a provider or
tool promise is still running. A slot is released only after the agent is
terminal and all registered operations have completed or been confirmed
cancelled. Non-cooperative work remains quarantined and cannot be replaced by
new work.

### Server-limit inventory

Values marked `existing` come from the current code/specification and must be
confirmed by baseline evidence. `W08 decision` is an approved target not yet
implemented. `To confirm` is deliberately unresolved and is not a claimed
limit.

| Boundary | Limit | Status/source | Evidence |
|---|---:|---|---|
| HTTP request body | 16 KiB | existing, `server/server.ts` | T02 |
| In-memory game sessions | 500 | existing, `server/service.ts` | T03 |
| Usage log entries | 500 | existing, `server/usage.ts` | T14 |
| Advice requests | 10/60 s/address | existing, `server/server.ts` | T13 |
| Practice Plan requests | 10/60 s/address | existing, `server/server.ts` | T13 |
| Active Practice Plan executions | 2/process | W08 decision | T13 |
| Agent steps | 3/execution | existing, `server/agent.ts` | T00/T11 |
| Tool executions | 2/execution | existing, `server/agent.ts` | T11 |
| Provider attempts | 6/execution | existing, `server/agent.ts` | T11 |
| Provider attempts per step | 2 | existing, `server/agent.ts` | T11 |
| Total deadline | 30,000 ms | existing, `server/agent.ts` | T12 |
| Provider attempt timeout | 10,000 ms | existing, `server/agent.ts` | T12 |
| Tool watchdog | 250 ms | existing, `server/agent.ts` | T12 |
| Serialized tool result | 4,096 bytes | existing, `server/agentTools.ts` | T10 |
| Final summary/recommendation | 500 chars each | existing, `server/agentContracts.ts` | T06 |
| Final evidence items | 0–5 | existing, `server/agentContracts.ts` | T06/T17 |
| Survival target maximum | 86,400 | existing, `server/agentTools.ts` | T08 |
| Food target maximum | 10,000 | existing, `server/agentTools.ts` | T08 |
| HTTP response size | No explicit byte limit | current implementation has no separate response-byte cap | T02/T16; residual limitation |
| Model token cap | 2,048 output tokens per Gemini adapter request | `server/geminiAgentModel.ts` | T09/T12 |
| Security event retention | 500 events | `server/securityEvents.ts` | T14 |

### FR-07a Unknown game-summary fields

The W08 target contract is to **reject unknown fields** in
`POST /api/game/session`, rather than silently merge or accept policy-bearing
fields. The accepted shape remains the bounded summary fields: `score`,
`durationSeconds`, `collisions` and `foodCollected`.

Fields such as `ownerId`, `role`, `provider`, `model`, `maxSteps`, `maxTools`
and `timeoutMs` must receive HTTP 400 and must not alter server policy,
authorization, provider selection or stored session data. If compatibility
review shows that rejection breaks an approved W04 contract, implementation
must stop for human review; silent policy merging is not permitted.

### FR-08 Structured security events

Usage telemetry remains separate from security events. Security events cover
allowed decisions, successful completion, rejected operations, limits,
timeouts, provider failures and unexpected errors.

Every Practice Plan execution receives a server-generated correlation ID.
Events contain only fixed event/reason codes, route, status, timestamp,
correlation ID and safe provider/tool counters. They contain no session ID,
request content, model content, arguments, results, token, secret or stack
trace. Event fields are runtime-validated and bounded.

Required event names include:

- `request_allowed`, `agent_decision_allowed`, `tool_allowed`;
- `execution_completed`;
- `request_rejected`, `body_rejected`, `origin_rejected`;
- `rate_limited`, `concurrency_rejected`;
- `agent_decision_rejected`, `tool_rejected`, `tool_result_rejected`;
- `deadline_reached`, `provider_failure`, `unexpected_error`.

### FR-09 CORS and CSRF applicability

The current application has no cookie authentication, browser credentials,
login, or state-changing game operation exposed through the Practice Plan
route. Creating a game session stores bounded, browser-submitted summary data
in an in-memory server map; it consumes memory and later AI/provider/tool
resources but does not authenticate the caller or grant ownership.

Therefore a credentialed cookie-CSRF attack is not currently applicable in the
same way as for a cookie-authenticated state-changing API. This does not make
the endpoints consequence-free. W08 must verify origin policy, body/rate/
concurrency limits, safe session creation, and that untrusted summaries do not
create privileges or confirmed scores.

No login, CSRF token or new credential mechanism is introduced. If cookies,
credentials, accounts or state-changing endpoints are added later, CSRF must
be reassessed before that change.

### FR-10 Production security profile

The local production build must be served with an active CSP and, where
applicable, `X-Content-Type-Options: nosniff`, explicit `Referrer-Policy`,
`object-src 'none'`, `base-uri 'none'` and `frame-ancestors 'none'`. The final
policy must match actual scripts, API connections and assets. T16 must verify
real response headers, a resource blocked by the intended directive, and
normal game/AI operation.

## Data inventory

| Data | Source | Control and validation | Model forwarding | Retention |
|---|---|---|---|---|
| `goal` | Browser request | Fixed enum and strict request schema | Yes, fixed context | Not persisted |
| `sessionId` | Server session response, then browser request | UUID, existence and canonical server binding | Not model-selectable | In-memory session map |
| Score/duration/food | Browser game summary | Bounded game-summary schema; untrusted/unconfirmed | Projected numeric facts only | In-memory session map |
| `targetValue` | Model proposal | Strict arguments and session-derived range | Through validated tool result | Not persisted |
| Model decision | Fake/Gemini provider | Discriminated runtime schema | N/A | Not persisted |
| Tool result | Server evaluator | Recomputed, strict, size-limited | Normalized result only | Not persisted |
| Final plan/evidence | Provider output | Strict schema and same-run evidence comparison | N/A | Browser response only |
| Provider configuration/key | Server environment | Server-only configuration | Never | Runtime only |
| Usage telemetry | Server | Sanitized schema, no session ID | Never | Local usage file |
| Security event | Server | Fixed enums, bounded counters and correlation ID | Never | Bounded local event sink/log |
| High score | Browser `localStorage` key `snake_highscore` | `getHighScore`/`saveHighScore`; numeric local-only display state | Never | Browser localStorage; not server authority or privilege |

## Threat model: nine risks

Each risk uses the same required fields: preconditions, resource, likelihood,
impact and rationale, existing control, and planned test.

### R1 — Direct policy/input bypass (priority 1)

- Preconditions: attacker sends HTTP directly with extra fields, invalid body,
  oversized input, or attempted provider/limit overrides.
- Resource: HTTP parser, agent budget, provider/tool capacity and session map.
- Likelihood: medium; the endpoint is directly reachable locally.
- Impact: high; bypass could consume resources or change execution policy.
- Rationale: browser validation is not a security boundary.
- Existing control: bounded body reader, Zod schemas, server-side constants,
  generic errors and preflight checks.
- Planned test: T01, T02 and positive boundary input in T00/T08.

### R2 — Unknown or unauthorized tool execution (priority 1)

- Preconditions: provider returns an unknown name, inherited property name,
  mismatched goal/session or invalid target.
- Resource: evaluator, session data and any future tool registry.
- Likelihood: medium; provider output is untrusted.
- Impact: high; arbitrary execution or data access would cross the tool boundary.
- Rationale: model instructions cannot enforce runtime authorization.
- Existing control: explicit allowlist, strict argument schema, canonical
  session binding and domain checks.
- Planned test: T07 and T08, with T09 malicious provider behavior.

### R3 — Cross-run evidence or session confusion (priority 1)

- Preconditions: provider returns schema-valid evidence copied from another run
  or session.
- Resource: evidence integrity and session data confidentiality.
- Likelihood: low-to-medium; requires crafted provider output.
- Impact: high; stale/foreign facts could appear as a trusted recommendation.
- Rationale: schema validity alone does not prove provenance.
- Existing control: latest-tool-result comparison and canonical session lookup.
- Planned test: T10 and T17.

### R4 — XSS or unsafe browser resource

- Preconditions: AI output or another untrusted value reaches a markup, URL or
  event-handler sink.
- Resource: player browser and game origin.
- Likelihood: medium; provider output is untrusted.
- Impact: high; script execution or data exfiltration could follow.
- Rationale: absence of a rich-text feature does not replace testing actual DOM
  paths.
- Existing control: `textContent` rendering and no known `innerHTML` path.
- Planned test: T04, T05 and T16.

### R5 — Resource exhaustion by repeated work

- Preconditions: attacker sends repeated requests, retries or delayed provider
  responses.
- Resource: provider cost, CPU, memory and local server availability.
- Likelihood: medium.
- Impact: high; legitimate game requests may be denied and provider cost rises.
- Rationale: per-run limits do not alone bound multiple concurrent runs.
- Existing control: per-run budgets, deadline, rate limiter and body limit.
- Planned test: T11, T12 and T13.

### R6 — Concurrency slot released before work ends

- Preconditions: timeout returns an HTTP result while a non-cooperative provider
  or tool operation continues.
- Resource: concurrency accounting and process capacity.
- Likelihood: medium; `Promise.race` does not cancel work by itself.
- Impact: high; more than two real jobs could run despite the configured cap.
- Rationale: logical completion and physical operation completion can differ.
- Existing control: AbortSignal propagation and W05 deadline/watchdog.
- Planned test: T12 and T13 with delayed operations and cleanup assertions.

### R7 — Manipulated browser statistics

- Preconditions: player modifies score, duration or food values before session
  creation.
- Resource: recommendation integrity and any future ranking/privilege logic.
- Likelihood: high; values originate in the browser.
- Impact: medium; recommendations can be misleading, but no privilege should
  follow.
- Rationale: valid numeric shape is not proof that a game occurred.
- Existing control: bounded schema and no leaderboard/privilege use.
- Planned test: T03 and T15.

### R8 — Secret, error or log injection disclosure

- Preconditions: provider error, sentinel value or newline/prefix payload reaches
  response or logging code.
- Resource: server secret, operational logs, frontend bundle and model context.
- Likelihood: medium.
- Impact: high.
- Rationale: schema validation does not prevent secrets in free text or unsafe
  logging by itself.
- Existing control: server-only environment access, safe errors and sanitized
  usage logs.
- Planned test: T14 and T16.

### R9 — CORS/CSRF policy drift

- Preconditions: an origin is accidentally allowed, credentials are introduced,
  or a future state-changing route reuses current assumptions.
- Resource: session creation, AI resource consumption and future authenticated
  state.
- Likelihood: low currently, medium after credential changes.
- Impact: medium-to-high depending on future state mutation.
- Rationale: no cookie auth reduces classic CSRF applicability but does not
  remove origin or resource-consumption consequences.
- Existing control: explicit origin allowlist, no credentials and no login.
- Planned test: T13, T16 and documented CORS/CSRF review.

## Acceptance and test matrix

Every important protection has a positive and negative case.

| ID | Scenario | Test type | Positive case | Negative case | Evidence |
|---|---|---|---|---|---|
| T00 | Normal game and W05 flow | Unit/integration/browser | Two model steps and one evaluator call succeed | Safe provider failure remains bounded | Passed; `EVIDENCE_W08.md` §6 |
| T01 | Invalid HTTP request | Integration | Valid request succeeds | Invalid JSON/schema gives 400, no provider/tool | Passed; `EVIDENCE_W08.md` §6 |
| T02 | Oversized and privileged fields | Integration | Boundary-size valid request succeeds | 413/invalid policy fields, no provider/tool | Passed; `EVIDENCE_W08.md` §6-7 |
| T03 | Unknown/unavailable resource | Integration | Own existing anonymous session works | Missing/unknown session gives generic 400 | Passed; `EVIDENCE_W08.md` §6 |
| T04 | XSS final response | Browser | Normal text renders as text | Marker is not executable and DOM is safe | Passed on AI Advice and W05 Practice Plan; `EVIDENCE_W08.md` §6 |
| T05 | HTML/Markdown/link content | Browser | Apostrophe, Serbian text and `a < b` remain usable | HTML/event/javascript URL is not executable | Passed; `EVIDENCE_W08.md` §6 |
| T06 | Invalid model/final output | Unit/integration | Valid decision completes | Malformed/forged final is rejected | Passed; `EVIDENCE_W08.md` §6 |
| T07 | Unknown/inherited tool names | Unit/integration | Allowlisted evaluator runs | `constructor`, `toString` and unknown name do not execute | Passed; `EVIDENCE_W08.md` §6 |
| T08 | Invalid tool args/scope | Unit/integration | Inclusive valid range succeeds | Invalid type, goal, session or range is rejected | Passed; `EVIDENCE_W08.md` §6 |
| T09 | Prompt/provider injection | Unit/integration | Normal fake provider succeeds | Real numeric browser channel stays bounded; malicious provider proposal is rejected | Passed with numeric-only channel limitation; `EVIDENCE_W08.md` §6, §10 |
| T10 | Invalid/oversized tool result | Unit/integration | Normal result is forwarded | Unknown fields, forged values or oversized result are rejected | Passed; `EVIDENCE_W08.md` §6 |
| T11 | Repeated calls/budget exhaustion | Unit/integration | One allowed revision works | Repeated call/step/tool/attempt limits stop work | Passed; `EVIDENCE_W08.md` §6 |
| T12 | Per-attempt timeout/deadline/cancellation | Unit/integration | In-budget provider completes | Per-attempt timeout, total deadline and late result are separate failures | Passed; `EVIDENCE_W08.md` §6 |
| T13 | Rate and concurrency | Integration | One request and two distinct concurrent requests succeed | Rate excess and third distinct concurrent request are independently rejected | Passed; `EVIDENCE_W08.md` §6-7 |
| T14 | Secret/log injection | Integration/build | Safe event/error contains fixed metadata | Sentinel/raw error/newline marker is absent or sanitized | Passed; `EVIDENCE_W08.md` §6, §8 |
| T15 | Manipulated browser state | Integration | Bounded summary remains usable as untrusted data | Manipulation gives no privilege or confirmed rank | Passed; `EVIDENCE_W08.md` §6 |
| T16 | Production CSP/headers | Browser/integration | Game, assets, API and AI work | Available forbidden resource is blocked by actual CSP | Passed; `EVIDENCE_W08.md` §6, §8 |
| T17 | Cross-run evidence | Integration | Same-run evidence final succeeds | Schema-valid foreign/stale evidence is rejected | Passed; `EVIDENCE_W08.md` §6-7 |

T09 deliberately does not invent a free-text browser-to-model channel. The
current model context contains projected numeric session facts; the malicious
provider response is the executable injection/control test.

## Baseline and evidence requirements

Before application-code changes, the team must record:

- current branch/commit and working-tree state;
- game and W05 scope;
- available commands;
- baseline results for typecheck, unit tests, build and applicable browser
  tests;
- one normal fake-provider W05 flow with input and expected output;
- current status behavior for invalid JSON, oversized body, rate limit and
  internal/provider error.

Before any application-code change, the team must also collect the three
before/after baseline fixtures: the invalid/oversized request, the
schema-valid cross-run evidence forgery, and three independent valid delayed
requests from distinct sessions. If a fixture is missing, T08-00 must prepare
and run it against the unmodified application before the related protection
is implemented. A missing baseline is recorded as `not yet collected`, never
inferred from the new implementation.

The human team runs these checks. This specification contains no claimed
baseline result.

Three comparable before/after inputs are required:

1. one invalid/oversized HTTP request, measuring status, provider/tool counts
   and sanitized events;
2. one schema-valid cross-run evidence forgery, measuring response, calls,
   state and event outcome;
3. three independent valid delayed requests from distinct sessions, measuring
   active maximum, admission statuses, cleanup and the next request after
   cleanup.

Existing controls may produce the same result before and after. In that case,
the evidence must call it a regression proof, not claim a new fix.

## Known limitations

- Anonymous session UUID binding is not authenticated ownership.
- Browser game metrics are not anti-cheat evidence.
- Abort cannot prove that a remote provider stopped processing or billing.
- A non-cooperative local operation may require slot quarantine until it really
  settles.
- Free-form provider `finding` prose is structurally bounded, not fully
  semantically verified.
- Local in-memory limits apply to one server process only.

