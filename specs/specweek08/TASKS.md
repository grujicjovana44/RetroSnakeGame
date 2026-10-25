# W08 Tasks: Secure the Arcade

## Status and rules

Tasks are ordered and not complete. A task is complete only after its
acceptance evidence exists in `EVIDENCE_W08.md`. Human approval is required
before application-code implementation begins.

## T08-00 — Preserve baseline checkpoint

Dependencies: none. Evidence only.

Acceptance:

- record branch, commit and working-tree state;
- record game/W05 scope and commands;
- human runs baseline typecheck, unit tests, build and applicable browser tests;
- record one normal fake-provider W05 input and expected output;
- record current invalid JSON, oversized body, rate-limit and provider-error
  behavior.
- collect the invalid/oversized baseline, the schema-valid cross-run evidence
  baseline, and three independent valid delayed concurrency requests before
  any application-code change;
- if a fixture is missing, prepare it against the unmodified application
  before implementing the corresponding protection.

Results remain blank until the human team executes the checks.

## T08-01 — Finalize W08 contracts

Dependencies: T08-00. Documentation only.

Acceptance:

- I1-I8 map to controls and tests;
- all nine risks have the same required fields;
- exactly R1-R3 are priority risks;
- data inventory, CORS/CSRF decision and T00-T17 matrix agree;
- no W05 document is modified.

## T08-02 — HTTP preflight and status mapping

Dependencies: T08-01. Expected files: `server/server.ts`, focused tests.

Acceptance:

- invalid JSON/schema is 400;
- oversized body is 413 before JSON parsing completes;
- forbidden origin is 403 and unsupported method is 405;
- rejected initial requests call neither provider nor tool;
- internal errors map to approved generic 500/502/503 responses;
- valid boundary input still succeeds.
- unknown `gameSummary` fields are rejected consistently, including
  `ownerId`, `role`, `provider`, `model`, `maxSteps` and `timeoutMs`;
- a privileged field cannot change server-side policy or stored session data.

Validation: T01 and T02.

## T08-03 — Security event contract and recorder

Dependencies: T08-01. Expected files: small server helper,
`server/server.ts`, tests.

Acceptance:

- events cover allowed decision, allowed tool, completed execution, rejection,
  limits, deadline, provider failure and unexpected error;
- correlation ID is server-generated;
- counters are numeric and safe;
- raw payloads, secrets, session IDs and stacks are absent;
- retention and schema are bounded;
- log injection cannot create a second event.

Validation: T06, T07 and T14.

## T08-04 — Independent rate and concurrency limits

Dependencies: T08-02, T08-03. Expected files: server limiter/helper and tests.

Acceptance:

- rate tests use one client key and do not call the provider after rejection;
- concurrency uses three independent valid requests and distinct sessions/keys;
- active executions never exceed two;
- the third request is rejected before provider invocation;
- timeout does not release a slot while work continues;
- real cleanup permits the next valid request;
- release is idempotent.

Validation: T11, T12 and separate T13 fixtures.

## T08-05 — Cancellation and late-operation cleanup

Dependencies: T08-04. Expected files: `server/agent.ts` and limiter/helper.

Acceptance:

- per-attempt timeout is distinct from total deadline;
- supported operations receive cancellation;
- late results are discarded;
- non-cooperative work keeps a quarantined lease until settlement;
- no duplicate tool execution or slot release occurs.

Validation: T12 active-count and cleanup assertions.

## T08-06 — Agent and evidence integrity regression

Dependencies: T08-01. Tests first; application code only if a missing control
is demonstrated.

Acceptance:

- unknown/inherited tools cannot execute;
- invalid arguments and scope are rejected;
- forged, oversized and unknown-field tool results are rejected;
- same-run evidence is required;
- cross-run/session evidence is rejected;
- read-only session facts remain unchanged.

Validation: T07, T08, T09, T10, T15 and T17.

## T08-07 — Browser output and production security profile

Dependencies: T08-02 and T08-03. Expected files: `e2e/game.spec.ts` and the
approved existing production serving/header path.

Acceptance:

- XSS marker is safe text with a safe DOM;
- HTML/Markdown/javascript URL content is not executable;
- normal Serbian text, apostrophes and `a < b` remain usable;
- production responses contain approved headers;
- an actually available forbidden resource is blocked by CSP;
- game, assets, controls, API and AI output still work.

Validation: T04, T05 and T16.

## T08-08 — Secret, error, CORS/CSRF and dependency checks

Dependencies: T08-02, T08-03. Expected files: tests/evidence unless a missing
control is demonstrated.

Acceptance:

- synthetic sentinel is absent from bundle, source maps, responses, model
  context, usage logs and security events;
- the test first verifies that the server-only setup actually loaded the
  synthetic sentinel;
- provider errors are generic and stacks are absent;
- a tool result containing an unexpected additional field is rejected and is
  absent from forwarding and logs;
- allowed origins work and unknown origins fail;
- credentials remain disabled and CSRF applicability is documented;
- audit results are recorded without changing dependencies.

Validation: T14, T16, `npm audit` and `npm audit --omit=dev`.

## T08-09 — Complete automated test matrix

Dependencies: T08-02 through T08-08 as applicable.

Acceptance:

- T00-T15 and T17 are automated where applicable;
- T04/T05 use real browser rendering;
- T16 includes automated header/resource checks and manual steps;
- each important control has positive and negative cases;
- no result is fabricated.

## T08-10 — Evidence and review handoff

Dependencies: all previous tasks.

Acceptance:

- baseline and three isolated comparisons are recorded;
- architecture, data inventory, nine risks, R1-R3, I1-I8 and T00-T17 are complete;
- actual commands/results are recorded;
- both team members' contributions and AI assistance are documented;
- each team member is credited with at least one security control and at least
  one negative test;
- residual limitations and stable final checkpoint are recorded;
- no post-W08 work starts without approval.

## Task-to-requirement mapping

| Requirement | Tasks | Tests |
|---|---|---|
| FR-01/02 | T08-02 | T01, T02, T03 |
| FR-03/04/05 | T08-06 | T06-T10, T15, T17 |
| FR-06/10 | T08-07 | T04, T05, T16 |
| FR-07 | T08-04, T08-05 | T11-T13 |
| FR-08 | T08-03, T08-08 | T06, T07, T13, T14 |
| FR-09 | T08-08 | T03, T13, T16 |
| Baseline/evidence | T08-00, T08-09, T08-10 | T00-T17 |

## Team contribution requirement

Before T08-10 can be accepted, both team members must each contribute to at
least one security control and at least one negative test. Evidence must name
the control/test and describe the human review performed by each member.

