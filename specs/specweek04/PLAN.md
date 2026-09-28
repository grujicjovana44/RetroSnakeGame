# W04 Implementation Plan - Reliable AI Advice and Private Usage Report

## Status

Approved for implementation on 2026-09-27. `docs/AI_FEATURE_SPEC.md` is the
feature specification and `docs/AI_PROVIDER_CONTRACT.md` is the provider
contract. `docs/GAME_SPEC.md` remains authoritative for W03 gameplay behavior.

## Scope

Harden the existing post-game AI Advice flow and write a private local report
for backend-recorded provider token usage. Use the fixed backend-only Gemini
allowlist `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` →
`gemini-3.5-flash`, retain the read-only game-stats tool, existing TypeScript
stack, and fake-provider approach. Do not add dependencies. Live availability
is unverified until the exact two-step flow succeeds for a model.

## Decisions and constraints

- AI Advice is user-triggered only after game over, never in the game loop.
- The provider key stays in backend environment configuration.
- The full advice flow has a 15-second deadline and at most two attempts per
  model, executed sequentially.
- Transient failures may retry once within the remaining deadline. 429 retries
  on the same model only; fallback is reserved for 408/500/502/503, timeout,
  and network failures. Auth, invalid request, quota, policy, malformed output,
  and tool/session errors do not trigger fallback.
- Model selection comes only from the fixed ordered server allowlist. Output
  budget is 256 tokens per Gemini response.
- The SDK abort signal is propagated when the deadline expires or all HTTP
  clients for a shared in-flight request disconnect. One disconnected waiter
  does not cancel work still awaited by another client. Client-side abort may
  not prevent provider billing after a request has reached the service.
- Provider output must be one complete JSON object; code fences and
  surrounding prose are malformed output.
- The backend allows only the configured local frontend origins and bounds
  in-memory sessions and usage history.
- Usage values are aggregated into a Git-ignored local file, not shown in the
  game UI or exposed through an HTTP endpoint; session IDs and provider content
  are excluded.
- Console telemetry contains only model, attempt kind, phase, status, provider
  status, latency, fallback flag, and token metadata; no raw content or stack.
- Token totals include both Gemini responses when usage metadata is returned;
  unavailable metadata is shown as unavailable, not as zero usage.
- A successful advice result is reused for the same game session so repeat
  clicks do not issue another paid request.

## Implementation map

| Area | Files | Verification |
| --- | --- | --- |
| API reliability and provider contract | `server/service.ts`, `server/provider.ts`, `server/server.ts`, `server/api.ts` | Unit tests for deadline, cancellation, per-model retry/fallback, malformed output, safe failures, and origin policy |
| Private usage report and request reuse | `server/usage.ts`, `server/server.ts`, `src/main.ts` | Aggregation, persistence privacy, and AI request reuse tests |
| W04 specification and traceability | `docs/AI_FEATURE_SPEC.md`, `docs/AI_PROVIDER_CONTRACT.md`, `docs/AI_EVALS.md`, `docs/AI_USAGE_LOG.md`, `docs/EVIDENCE_W04.md`, `specs/CONSTITUTION.md`, this plan and tasks | Claims match current code and observed results |
| Setup instructions | `README.md` | Document frontend/backend startup and the backend-only key configuration |

## Acceptance gates

1. `npm run typecheck`, `npm test`, and `npm run build` pass.
2. Tests cover valid advice, zero provider calls for invalid input, bounded
  retries, actual timeout/cancellation, malformed output, token aggregation,
  and local report privacy.
3. `server/ai-usage.local.json` reports request counts, success/failure,
   average latency, model, and input/output/total tokens when Gemini returns
   metadata; it is Git-ignored and has no public UI/API.
4. CORS is restricted to configured origins; backend errors remain generic.
5. Evidence distinguishes fake-provider results from live provider results.
  A successful live two-step tool flow remains unclaimed until observed for
  the exact model named in evidence.
6. No dependency, package script, API key, database, or cloud storage is added.
  The Git-ignored `server/ai-usage.local.json` file is the explicitly allowed
  local usage report; it must remain private, bounded, and free of session
  IDs and provider content.

## Risks and known limits

Game sessions remain in memory and reset when the backend restarts. The local
usage report persists its latest 500 entries. Gemini may omit usage metadata
on failures. Client-side cancellation cannot guarantee that an accepted
provider request will not be billed. Live provider validation requires a
locally configured key and is not part of automated tests. On 2026-09-28 the
API returned 503 high-demand for a direct `gemini-3.8-flash` request;
`gemini-3.1-flash-lite` was listed but its exploratory advice-flow call also
returned provider 503. Automated tests do not establish live service
availability. Provider logging is now limited to sanitized attempt metadata.