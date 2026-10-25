# W08 Implementation Plan: Secure the Arcade

## Status

Implementation completed for the approved change set. Final evidence and human
sign-off remain pending. This plan maps `specs/specweek08/SPEC.md` to the
smallest safe change set and validation evidence.

## Existing controls to preserve

- `server/agent.ts`: W05 state machine, three steps, two tools, six provider
  attempts, deadline and cancellation;
- `server/agentContracts.ts`: strict request, decision, result and final schemas;
- `server/agentTools.ts`: deterministic read-only evaluator and range checks;
- `server/server.ts`: HTTP router, body limit, CORS, rate limit and safe error
  boundary;
- `src/main.ts`: text-only AI rendering;
- existing tests in `tests/agent.test.ts`, `tests/ai.test.ts` and
  `e2e/game.spec.ts`.

These are controls to test and preserve, not assumed W08 completion.

## Baseline gate before application-code changes

T08-00 is a hard gate. Before any application-code change, the human team
must run the baseline commands and collect all three comparable fixtures:

1. invalid/oversized request with privileged fields, recording status,
   provider/tool counts and existing events/logs;
2. schema-valid cross-run evidence forgery, recording whether the existing
   final validator rejects it, provider/tool counts, state and response;
3. three independent valid delayed requests from distinct sessions, recording
   active maximum, each admission result, provider calls, cleanup timing and a
   subsequent request after cleanup.

If a fixture or test does not exist, prepare the smallest test harness before
changing the protection it is intended to measure. Run that fixture against
the unmodified application. A missing baseline is recorded as `not yet
collected`, never inferred from the new implementation.

## Proposed change areas

| Area | Existing state | W08 action | Files |
|---|---|---|---|
| HTTP statuses | Mostly mapped; oversized-body behavior needs explicit contract review | Align 400/413/429/500/502/503 and test | `server/server.ts` |
| Game-summary unknown fields | Existing behavior needs an explicit contract decision | Reject unknown fields and prove policy fields have no effect | `server/api.ts`, `server/server.ts`, tests |
| Body limit | 16 KiB read-time bound exists | Verify pre-parse behavior and error path | `server/server.ts` |
| CORS | Explicit allowlist exists | Add positive/negative evidence | `server/httpSecurity.ts`, `server/server.ts` |
| CSRF | No cookies/credentials/login; session creation consumes resources | Document applicability; do not add login/token | W08 docs, tests/evidence |
| Rate limit | 10 requests/minute per remote address exists | Test independently from concurrency | `server/httpSecurity.ts`, tests |
| Concurrency | No global Practice Plan limiter | Add two-slot limiter with cleanup/quarantine | `server/server.ts` or small helper |
| Cancellation | Abort is propagated, but timeout must not imply physical completion | Track operation completion and test late work | `server/agent.ts`, helper |
| Security events | Usage telemetry exists; separate stream absent | Add bounded typed recorder and allowed/completed plus preflight/error events | `server/server.ts`, helper |
| Browser output | `textContent` is used | Add browser XSS/DOM regression tests | `e2e/game.spec.ts` |
| CSP/headers | No production header proof | Add minimal production serving/header path | Existing serving path, integration/browser tests |
| Secrets/logs | Safe usage/provider error paths exist | Add sentinel/log injection/bundle evidence | tests and production checks |

## Boundary and data-flow decisions

1. Browser game metrics are bounded but untrusted and non-authoritative.
2. The model cannot choose session identity, provider, limits or tool registry.
3. The tool receives a canonical server-bound session ID and returns a
   normalized deterministic projection.
4. Security events use a server-generated correlation ID and safe numeric
   counters; they never contain payload content.
5. A concurrency lease remains held until controlled work and cleanup settle.
   A timeout can make a request terminal without making its slot reusable.
6. Rate-limit tests use one client key; concurrency tests use distinct valid
   sessions and distinct keys/limiter setup.

## CORS/CSRF decision record

The current system has no cookie-based authentication or credentials and no
Practice Plan state mutation. `POST /api/game/session` creates an anonymous,
server-held record from bounded browser data and can consume memory. Practice
Plan can consume provider/tool resources. These consequences justify CORS,
body, rate and concurrency controls even though classic credentialed CSRF is
not currently applicable.

W08 verifies explicit origins, rejects unknown origins, keeps credentials
disabled, and documents that adding cookies, accounts or state-changing routes
requires a new CSRF decision. No login or CSRF mechanism is added now.

## Concurrency design

The limiter owns a lease per active Practice Plan execution. A lease has a
correlation ID, state (`active`, `terminal-waiting-cleanup`, `released`) and a
set of registered operation completions.

- Admission fails before provider invocation when two leases are active.
- Agent terminal status alone does not release the lease.
- Provider/tool adapters register completion and honor abort where supported.
- If an operation ignores abort, the lease remains quarantined until its
  promise settles.
- Cleanup is idempotent and releases exactly once.
- Tests expose active maximum and post-timeout active count.

The implementation remains in-memory and process-local.

## Security event design

Implement a small typed recorder with bounded retention. Events include
timestamp, correlation ID, fixed event/reason enums, route, HTTP status and
provider/tool counters. The recorder rejects unknown shapes and strips all
free-form content. It is separate from the existing usage report.

Events cover request admission/rejection, allowed agent decision/tool dispatch,
completed execution, rate/concurrency/body/origin rejection, tool/final
rejection, deadline, provider failure and unexpected error.

## Test strategy and verification mapping

- Unit: schemas, event validation, limiter state machine and cleanup.
- Integration: HTTP parsing/statuses, CORS, rate/concurrency separation,
  agent/provider/tool rejection and secret/log behavior.
- Browser: XSS/unsafe DOM and production CSP/header/resource checks.
- Manual: local production server, real response headers and normal game/assets/
  AI operation.

T12 uses separate fixtures for per-attempt timeout, total deadline and late
result. T13 uses separate rate and concurrency fixtures. T16 uses a resource
that is actually available without CSP and then demonstrably blocked by CSP.

T14/T16 first verify that the server-only test setup actually loaded
`W08_SERVER_SECRET_DO_NOT_EXPOSE`. Only then do they search the frontend
bundle/source maps, responses, model context, usage log, security events and
errors for absence of the sentinel. T10/T14 also include a tool result with
an unexpected extra field; it must be rejected and must not be forwarded or
logged.

## Dependency audit

No dependency changes are planned. The human team will run and record:

```bash
npm audit
npm audit --omit=dev
```

No `npm audit fix`, forced upgrade or lockfile edit is authorized.

## Verification commands to run later

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
```

No results are recorded here.

## Risks and rollback

Highest implementation risks are incorrect lease cleanup, CSP breaking
legitimate assets/API connections, and public status changes breaking W05
regressions. Changes must be split by task and reviewed before the next task.

